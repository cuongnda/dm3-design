// Package commands is the fan-out layer: one request → one adapter call.
//
// Request shape matches both the HTTP API (httpapi package) and the
// future MQTT transport, so the same Dispatcher.Dispatch method serves
// both. Each command is identified by its `type` string; the list of
// supported types is the single source of truth for what the agent
// can do.
package commands

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/duali/cctv-agent/internal/adapters/onvif"
	"github.com/duali/cctv-agent/internal/adapters/tungson"
)

// Request is the input envelope. Username/Password are per-camera so
// the agent itself stays stateless — credentials live with whoever
// issued the command. Params is type-specific and opaque here.
type Request struct {
	Type     string          `json:"type"`     // set_time, reboot, get_device_info, ptz_action, ...
	Protocol string          `json:"protocol"` // viid_tungson | ... (adapter picker)
	CameraIP string          `json:"camera_ip"`
	Username string          `json:"username"`
	Password string          `json:"password"`
	Params   json.RawMessage `json:"params"`
}

// Response is what we return to the caller (HTTP JSON body or MQTT
// publish later).
type Response struct {
	Success    bool            `json:"success"`
	Error      string          `json:"error,omitempty"`
	Data       json.RawMessage `json:"data,omitempty"`
	DurationMs int64           `json:"duration_ms"`
}

// Dispatcher owns the routing table. Zero-value is ready to use.
type Dispatcher struct{}

func NewDispatcher() *Dispatcher { return &Dispatcher{} }

// Dispatch executes a single command and returns a populated Response.
// Never panics, always returns — callers can pass the result straight
// to JSON encoders.
func (d *Dispatcher) Dispatch(ctx context.Context, req Request) Response {
	// Discovery commands probe the network, not a single cam — they
	// need a longer timeout because UDP multicast collection waits
	// for a window, and CIDR scans fan out over whole /24s.
	timeout := 20 * time.Second
	if req.Type == "scan" || req.Type == "discover" {
		timeout = 60 * time.Second
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	switch req.Protocol {
	case "viid_tungson":
		data, err := d.dispatchTungson(ctx, req)
		if err != nil {
			return Response{Success: false, Error: err.Error()}
		}
		return Response{Success: true, Data: data}
	case "onvif":
		data, err := d.dispatchONVIF(ctx, req)
		if err != nil {
			return Response{Success: false, Error: err.Error()}
		}
		return Response{Success: true, Data: data}
	default:
		return Response{Success: false, Error: fmt.Sprintf("unsupported protocol %q", req.Protocol)}
	}
}

// dispatchONVIF routes standard-protocol commands: network discovery
// and ONVIF PTZ. For PTZ, the cam must already have been discovered
// so we know its device_service URL; we ship it via `params.xaddr`
// to avoid forcing a fresh discover on every joystick tap.
func (d *Dispatcher) dispatchONVIF(ctx context.Context, req Request) (json.RawMessage, error) {
	switch req.Type {
	case "discover":
		return handleONVIFDiscover(ctx, req.Params)
	case "ptz_move":
		return handleONVIFPtzMove(ctx, req)
	case "ptz_stop":
		return handleONVIFPtzStop(ctx, req)
	}
	return nil, fmt.Errorf("onvif: unknown command type %q", req.Type)
}

func handleONVIFDiscover(ctx context.Context, raw json.RawMessage) (json.RawMessage, error) {
	var p struct {
		TimeoutMs int    `json:"timeout_ms"`
		Interface string `json:"interface"`
	}
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &p); err != nil {
			return nil, fmt.Errorf("parse discover params: %w", err)
		}
	}
	opts := onvif.DiscoverOptions{Interface: p.Interface}
	if p.TimeoutMs > 0 {
		opts.Timeout = time.Duration(p.TimeoutMs) * time.Millisecond
	}
	devices, err := onvif.Discover(ctx, opts)
	if err != nil {
		return nil, err
	}
	return json.Marshal(map[string]any{"devices": devices, "count": len(devices)})
}

// onvifXAddr resolves the device_service URL for a cam. Prefer the
// explicit `params.xaddr` from the caller (stable across requests);
// fall back to the conventional http://{ip}:80/onvif/device_service
// when the caller only supplied camera_ip.
func onvifXAddr(req Request, params onvifPTZParams) string {
	if params.XAddr != "" {
		return params.XAddr
	}
	if req.CameraIP == "" {
		return ""
	}
	return "http://" + req.CameraIP + "/onvif/device_service"
}

type onvifPTZParams struct {
	XAddr      string  `json:"xaddr"`       // full device_service URL (from discover)
	Pan        float64 `json:"pan"`         // -1..1
	Tilt       float64 `json:"tilt"`        // -1..1
	Zoom       float64 `json:"zoom"`        // -1..1
	DurationMs int     `json:"duration_ms"` // 0 = run until ptz_stop
	StopPanTilt bool   `json:"stop_pan_tilt"`
	StopZoom   bool    `json:"stop_zoom"`
}

func handleONVIFPtzMove(ctx context.Context, req Request) (json.RawMessage, error) {
	var p onvifPTZParams
	if len(req.Params) > 0 {
		if err := json.Unmarshal(req.Params, &p); err != nil {
			return nil, fmt.Errorf("parse ptz_move params: %w", err)
		}
	}
	url := onvifXAddr(req, p)
	if url == "" {
		return nil, fmt.Errorf("ptz_move needs either params.xaddr or request.camera_ip")
	}
	return onvif.ContinuousMove(ctx, url, req.Username, req.Password, onvif.Move{
		Pan:        p.Pan,
		Tilt:       p.Tilt,
		Zoom:       p.Zoom,
		DurationMs: p.DurationMs,
	})
}

func handleONVIFPtzStop(ctx context.Context, req Request) (json.RawMessage, error) {
	var p onvifPTZParams
	if len(req.Params) > 0 {
		if err := json.Unmarshal(req.Params, &p); err != nil {
			return nil, fmt.Errorf("parse ptz_stop params: %w", err)
		}
	}
	url := onvifXAddr(req, p)
	if url == "" {
		return nil, fmt.Errorf("ptz_stop needs either params.xaddr or request.camera_ip")
	}
	// Default: stop both axes when the caller didn't specify.
	stopPT := p.StopPanTilt || (!p.StopPanTilt && !p.StopZoom)
	stopZm := p.StopZoom || (!p.StopPanTilt && !p.StopZoom)
	return onvif.Stop(ctx, url, req.Username, req.Password, stopPT, stopZm)
}

// dispatchTungson logs the caller in once then routes by command type.
// A single Client instance per request keeps the cookie jar local to
// this call — no cross-command state and no cross-cam leakage.
func (d *Dispatcher) dispatchTungson(ctx context.Context, req Request) (json.RawMessage, error) {
	// Validate the command type BEFORE hitting the camera. Login over
	// the LAN can take several seconds on a slow link, and failing fast
	// on a typo like `type: "reboto"` is much nicer for the operator.
	if !tungsonKnownType(req.Type) {
		return nil, fmt.Errorf("unknown command type %q for protocol %q", req.Type, req.Protocol)
	}

	// `scan` is a network-level command — no target cam IP, no login.
	// Handle it before constructing the per-cam client so missing
	// camera_ip doesn't reject the request.
	if req.Type == "scan" {
		return handleScan(ctx, req.Params)
	}

	client, err := tungson.NewClient(req.CameraIP)
	if err != nil {
		return nil, fmt.Errorf("init tungson client: %w", err)
	}
	if err := client.Login(ctx, req.Username, req.Password); err != nil {
		return nil, fmt.Errorf("tungson login: %w", err)
	}

	switch req.Type {
	case "get_device_info":
		return client.GetDeviceInfo(ctx)
	case "get_run_status":
		return client.GetRunStatus(ctx)
	case "get_version":
		return client.GetVersion(ctx)
	case "get_user":
		return client.GetUser(ctx)
	case "get_timezone":
		return client.GetTimezone(ctx)
	case "get_network":
		return client.GetNetwork(ctx)
	case "get_gat1400":
		return client.GetGAT1400(ctx)
	case "get_gb28181":
		var p struct {
			Secondary bool `json:"secondary"`
		}
		_ = json.Unmarshal(req.Params, &p)
		return client.GetGB28181(ctx, p.Secondary)
	case "get_work_mode":
		return client.GetWorkMode(ctx)
	case "get_light_mode":
		return client.GetLightMode(ctx)
	case "get_stream":
		var p struct {
			Sub bool `json:"sub"`
		}
		_ = json.Unmarshal(req.Params, &p)
		return client.GetStream(ctx, p.Sub)
	case "get_rtmp":
		return client.GetRTMP(ctx)
	case "get_osd":
		return client.GetOSD(ctx)
	case "get_motion_detect":
		return client.GetMotionDetect(ctx)
	case "get_area_intrusion":
		return client.GetAreaIntrusion(ctx)
	case "get_recording":
		return client.GetRecording(ctx)
	case "get_timed_capture":
		return client.GetTimedCapture(ctx)
	case "get_alarm_out":
		return client.GetAlarmOut(ctx)
	case "get_alarm_in":
		return client.GetAlarmIn(ctx)
	case "get_audio":
		return client.GetAudio(ctx)
	case "get_tf_card":
		return client.GetTFCard(ctx)
	case "get_ip_conflict":
		return client.GetIPConflict(ctx)
	case "get_image_params":
		return client.GetImageParams(ctx)
	case "get_privacy_cover":
		return client.GetPrivacyCover(ctx)
	case "get_roi":
		return client.GetROI(ctx)
	case "get_occlusion":
		return client.GetOcclusion(ctx)
	case "get_silent":
		return client.GetSilent(ctx)
	case "get_presets":
		return client.GetPresets(ctx)
	case "get_ai_type":
		return client.GetAIType(ctx)

	// Generic cfg_get: covers ANY documented `cfg_get&name=<x>` in
	// one shot so future config pages don't need an agent rebuild.
	case "cfg_get":
		var p struct {
			Name string `json:"name"`
		}
		if err := json.Unmarshal(req.Params, &p); err != nil || p.Name == "" {
			return nil, fmt.Errorf("cfg_get requires params.name (e.g. \"dev\", \"timezone\", \"light_work\")")
		}
		return client.GetConfig(ctx, p.Name)

	// Generic cfg_set: operator supplies the vendor action suffix
	// (the part after `cfg_` in the URL, e.g. `timezone`, `gat1400`,
	// `light_work`, `network`, `video`, `video_1`) plus the raw JSON
	// body. Escape hatch for config pages we haven't written a typed
	// wrapper for yet — the operator reads the vendor doc and shapes
	// the body themselves.
	case "cfg_set":
		var p struct {
			Action string          `json:"action"`
			Body   json.RawMessage `json:"body"`
		}
		if err := json.Unmarshal(req.Params, &p); err != nil || p.Action == "" {
			return nil, fmt.Errorf("cfg_set requires params.action (e.g. \"timezone\") and optional params.body (JSON)")
		}
		return client.SetConfig(ctx, p.Action, p.Body)

	// Typed setters — schema-checked JSON so the UI can build a form.
	case "set_time":
		return handleSetTime(ctx, client, req.Params)
	case "set_password":
		var p tungson.SetPasswordParams
		if err := json.Unmarshal(req.Params, &p); err != nil {
			return nil, fmt.Errorf("parse set_password params: %w", err)
		}
		if p.User == "" || p.Pass == "" {
			return nil, fmt.Errorf("set_password requires params.user and params.pass")
		}
		return client.SetPassword(ctx, p)
	case "set_network":
		var p tungson.SetNetworkParams
		if err := json.Unmarshal(req.Params, &p); err != nil {
			return nil, fmt.Errorf("parse set_network params: %w", err)
		}
		return client.SetNetwork(ctx, p)
	case "set_gat1400":
		var p tungson.SetGAT1400Params
		if err := json.Unmarshal(req.Params, &p); err != nil {
			return nil, fmt.Errorf("parse set_gat1400 params: %w", err)
		}
		return client.SetGAT1400(ctx, p)
	case "set_gb28181":
		var p struct {
			Secondary bool `json:"secondary"`
			tungson.SetGB28181Params
		}
		if err := json.Unmarshal(req.Params, &p); err != nil {
			return nil, fmt.Errorf("parse set_gb28181 params: %w", err)
		}
		return client.SetGB28181(ctx, p.Secondary, p.SetGB28181Params)
	case "set_work_mode":
		var p tungson.SetWorkModeParams
		if err := json.Unmarshal(req.Params, &p); err != nil {
			return nil, fmt.Errorf("parse set_work_mode params: %w", err)
		}
		return client.SetWorkMode(ctx, p)
	case "set_light_mode":
		var p tungson.SetLightModeParams
		if err := json.Unmarshal(req.Params, &p); err != nil {
			return nil, fmt.Errorf("parse set_light_mode params: %w", err)
		}
		return client.SetLightMode(ctx, p)
	case "set_stream":
		var p struct {
			Sub bool `json:"sub"`
			tungson.SetStreamParams
		}
		if err := json.Unmarshal(req.Params, &p); err != nil {
			return nil, fmt.Errorf("parse set_stream params: %w", err)
		}
		return client.SetStream(ctx, p.Sub, p.SetStreamParams)
	case "set_rtmp":
		var p tungson.SetRTMPParams
		if err := json.Unmarshal(req.Params, &p); err != nil {
			return nil, fmt.Errorf("parse set_rtmp params: %w", err)
		}
		return client.SetRTMP(ctx, p)
	case "set_recording":
		var p tungson.SetRecordingParams
		if err := json.Unmarshal(req.Params, &p); err != nil {
			return nil, fmt.Errorf("parse set_recording params: %w", err)
		}
		return client.SetRecording(ctx, p)
	case "set_timed_capture":
		var p tungson.SetTimedCaptureParams
		if err := json.Unmarshal(req.Params, &p); err != nil {
			return nil, fmt.Errorf("parse set_timed_capture params: %w", err)
		}
		return client.SetTimedCapture(ctx, p)
	case "set_ai_type":
		var p tungson.SetAITypeParams
		if err := json.Unmarshal(req.Params, &p); err != nil {
			return nil, fmt.Errorf("parse set_ai_type params: %w", err)
		}
		return client.SetAIType(ctx, p)
	case "format_tf_card":
		return client.FormatTFCard(ctx)

	case "reboot":
		return client.Reboot(ctx)
	case "factory_reset":
		return client.FactoryReset(ctx)
	case "enable_file_list":
		var p struct {
			Enable bool `json:"enable"`
		}
		_ = json.Unmarshal(req.Params, &p) // empty params → enable=false, fine
		return client.EnableFileList(ctx, p.Enable)

	// PTZ / preset
	case "goto_preset":
		var p struct {
			ID int `json:"id"`
		}
		if err := json.Unmarshal(req.Params, &p); err != nil || p.ID == 0 {
			return nil, fmt.Errorf("goto_preset requires params.id (int, >=1)")
		}
		return client.GotoPreset(ctx, p.ID)
	case "set_preset":
		var p struct {
			ID int `json:"id"`
		}
		if err := json.Unmarshal(req.Params, &p); err != nil || p.ID == 0 {
			return nil, fmt.Errorf("set_preset requires params.id (int, >=1)")
		}
		return client.SetPreset(ctx, p.ID)
	case "ptz_action":
		var p struct {
			Action string `json:"action"`
		}
		if err := json.Unmarshal(req.Params, &p); err != nil || p.Action == "" {
			return nil, fmt.Errorf("ptz_action requires params.action (string)")
		}
		return client.DoPTZAction(ctx, tungson.PTZAction(p.Action))

	// Lens
	case "align_zoom_curve":
		return client.AlignZoomCurve(ctx)
	case "focus_assist":
		return client.FocusAssist(ctx)
	case "lens_init":
		return client.LensInit(ctx)
	}

	return nil, fmt.Errorf("unknown command type %q for protocol %q", req.Type, req.Protocol)
}

// tungsonKnownType is the allow-list used to short-circuit bad input
// before we burn a login round-trip. Keep it in sync with the switch
// in dispatchTungson — there's no test enforcing this yet, it's a
// small enough list to eyeball in review.
func tungsonKnownType(t string) bool {
	switch t {
	case "scan",
		// Identity / status
		"get_device_info", "get_run_status", "get_version", "get_user",
		// Network / platforms
		"get_network", "set_network",
		"get_gat1400", "set_gat1400",
		"get_gb28181", "set_gb28181",
		"get_rtmp", "set_rtmp",
		// Time
		"get_timezone", "set_time",
		// Stream / media / osd / recording / snapshot
		"get_stream", "set_stream",
		"get_osd",
		"get_audio",
		"get_recording", "set_recording",
		"get_timed_capture", "set_timed_capture",
		// Light / ISP / work mode
		"get_light_mode", "set_light_mode",
		"get_work_mode", "set_work_mode",
		"get_image_params",
		// AI
		"get_ai_type", "set_ai_type",
		// Privacy / ROI / occlusion / silent
		"get_privacy_cover", "get_roi", "get_occlusion", "get_silent",
		// Alarms / IO
		"get_alarm_out", "get_alarm_in",
		// Storage
		"get_tf_card", "format_tf_card",
		"get_ip_conflict",
		// Password / user
		"set_password",
		// Generic escape hatches
		"cfg_get", "cfg_set",
		// PTZ + lens + system (already existed)
		"get_presets", "goto_preset", "set_preset", "ptz_action",
		"align_zoom_curve", "focus_assist", "lens_init",
		"reboot", "factory_reset", "enable_file_list":
		return true
	}
	return false
}

// handleScan is the entry point for `type: "scan"`. It probes a CIDR
// for TungSon cameras and returns the list as JSON-encoded data.
// Credentials in the envelope are ignored — the probe is unauth.
func handleScan(ctx context.Context, raw json.RawMessage) (json.RawMessage, error) {
	var p struct {
		CIDR          string `json:"cidr"`
		TimeoutMs     int    `json:"timeout_ms"`
		Concurrency   int    `json:"concurrency"`
	}
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &p); err != nil {
			return nil, fmt.Errorf("parse scan params: %w", err)
		}
	}
	if p.CIDR == "" {
		return nil, fmt.Errorf("scan requires params.cidr (e.g. \"192.168.1.0/24\")")
	}
	opts := tungson.ScanOptions{
		CIDR:        p.CIDR,
		Concurrency: p.Concurrency,
	}
	if p.TimeoutMs > 0 {
		opts.Timeout = time.Duration(p.TimeoutMs) * time.Millisecond
	}
	cams, err := tungson.Scan(ctx, opts)
	if err != nil {
		return nil, err
	}
	return json.Marshal(map[string]any{"cameras": cams, "count": len(cams)})
}

type setTimeParams struct {
	// Optional unix seconds to pin the cam clock to. Omit to use agent's
	// current time (the LAN box is the closest NTP-synced source).
	Time int64 `json:"time"`
	// Offset from UTC in minutes, e.g. 420 for UTC+07. Default 420.
	TimezoneMinutes int `json:"timezone_minutes"`
	// NTP server, required when Mode=1 (poll NTP).
	NTPServer string `json:"ntp_server"`
	// NTP poll interval in seconds, forwarded verbatim.
	NTPIntervalSec int `json:"ntp_interval_sec"`
	// 0 default (sync-from-agent), 1 NTP poll, 2 ONVIF, 3 GB, 4 GA/T1400.
	Mode int `json:"mode"`
}

func handleSetTime(ctx context.Context, client *tungson.Client, raw json.RawMessage) (json.RawMessage, error) {
	var p setTimeParams
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &p); err != nil {
			return nil, fmt.Errorf("parse set_time params: %w", err)
		}
	}
	if p.TimezoneMinutes == 0 {
		p.TimezoneMinutes = 420 // UTC+07 default for Vietnam installs
	}
	tz := p.TimezoneMinutes
	req := tungson.SetTimezoneParams{
		TimezoneMinutes: &tz,
		TimingMode:      p.Mode,
	}
	if p.NTPServer != "" {
		req.NTPServer = &p.NTPServer
	}
	if p.NTPIntervalSec > 0 {
		req.NTPIntervalSec = &p.NTPIntervalSec
	}
	if p.Time > 0 {
		req.Time = &p.Time
	}
	// Mode 0 + no explicit time → client library pins to now().
	return client.SetTimezone(ctx, req)
}
