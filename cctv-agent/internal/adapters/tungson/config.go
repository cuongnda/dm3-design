package tungson

import (
	"context"
	"encoding/json"
)

// Typed wrappers for every documented TungSon config page we care
// about today. Each returns the raw envelope data the cam sent back
// so callers / logs see exactly the vendor shape (don't normalise —
// the raw fields are the only way to debug firmware quirks).
//
// For anything NOT in this file, use Client.GetConfig(name) and
// Client.SetConfig(suffix, body) directly — that's the generic
// fallback the dispatcher exposes as `cfg_get` / `cfg_set`. Every
// typed method here ultimately calls those two primitives.
//
// Page citations refer to the book at
// http://yctx.vs98.com:1381/web/#/601874687.

// --- password / firmware / upgrade — page 298031306 -------------------------

// SetPasswordParams: vendor wants BOTH fields per doc §2 — the cam
// rejects the call when either is omitted even though our server
// schema lets us encode that.
type SetPasswordParams struct {
	User string `json:"user"` // required — must equal current user
	Pass string `json:"pass"` // required — new password, len < 64
}

func (c *Client) SetPassword(ctx context.Context, p SetPasswordParams) (json.RawMessage, error) {
	return c.SetConfig(ctx, "user", p)
}

// --- wired network — page 298031293 -----------------------------------------

type SetNetworkParams struct {
	DHCP    *int    `json:"dhcp,omitempty"`    // 0 static, 1 dhcp
	IP      *string `json:"ip,omitempty"`
	Netmask *string `json:"netmask,omitempty"`
	Gateway *string `json:"gateway,omitempty"`
	DNS     *string `json:"dns,omitempty"` // ";"-separated: "114.114.114.114;8.8.8.8;"
}

func (c *Client) GetNetwork(ctx context.Context) (json.RawMessage, error) {
	return c.GetConfig(ctx, "network")
}

func (c *Client) SetNetwork(ctx context.Context, p SetNetworkParams) (json.RawMessage, error) {
	return c.SetConfig(ctx, "network", p)
}

// --- GAT/T 1400 — page 298031311 --------------------------------------------

type SetGAT1400Params struct {
	Enable          *int    `json:"enable,omitempty"`
	ChannelID       *string `json:"channel_id,omitempty"`
	GAT1400Addr     *string `json:"gat_1400_addr,omitempty"`
	User            *string `json:"user,omitempty"`
	Password        *string `json:"password,omitempty"`
	HartTime        *int    `json:"hart_time,omitempty"`       // 5-300
	HartNum         *int    `json:"hart_num,omitempty"`        // 2-10
	ReUpload        int     `json:"re_upload"`                 // required: 0/1
	ReportImageMode *int    `json:"report_image_mode,omitempty"` // 1/2/3
	DeviceID        *string `json:"device_id,omitempty"`
}

func (c *Client) GetGAT1400(ctx context.Context) (json.RawMessage, error) {
	return c.GetConfig(ctx, "gat1400")
}

func (c *Client) SetGAT1400(ctx context.Context, p SetGAT1400Params) (json.RawMessage, error) {
	return c.SetConfig(ctx, "gat1400", p)
}

// --- GB/T 28181 — page 298031310 --------------------------------------------

type SetGB28181Params struct {
	Enable          *int    `json:"enable,omitempty"`
	ServerID        *string `json:"server_id,omitempty"`
	ServerAddr      *string `json:"server_addr,omitempty"`
	ServerDomain    *string `json:"server_domain,omitempty"`
	ServerPort      *int    `json:"server_port,omitempty"`
	ServerPass      *string `json:"server_pass,omitempty"`
	DevPort         *int    `json:"dev_port,omitempty"`
	DeviceID        *string `json:"device_id,omitempty"`
	AlarmID         *string `json:"alarm_id,omitempty"`
	ChannelID       *string `json:"channel_id,omitempty"`
	ExpireTime      *int    `json:"expire_time,omitempty"` // 1-86400
	HartTime        *int    `json:"hart_time,omitempty"`   // 1-86400
	HartNum         *int    `json:"hart_num,omitempty"`    // 2-30
	ProtoType       *int    `json:"proto_type,omitempty"`  // 0 udp / 1 tcp
	GB35114Level    *int    `json:"gb35114_level,omitempty"`
	ProtocolVersion *int    `json:"protocol_version,omitempty"` // 0 2016 / 1 2022
	StreamNum       *int    `json:"stream_num,omitempty"`       // 0 main / 1 sub
	Latitude        *string `json:"latitude,omitempty"`
	Longitude       *string `json:"longitude,omitempty"`
}

func (c *Client) GetGB28181(ctx context.Context, secondary bool) (json.RawMessage, error) {
	name := "gb28181"
	if secondary {
		name = "gb28181_1"
	}
	return c.GetConfig(ctx, name)
}

func (c *Client) SetGB28181(ctx context.Context, secondary bool, p SetGB28181Params) (json.RawMessage, error) {
	suffix := "gb28181"
	if secondary {
		suffix = "gb28181_1"
	}
	return c.SetConfig(ctx, suffix, p)
}

// --- work mode (ISP+light schedule) — page 298031320 ------------------------

// SetWorkModeParams combines ISP tunables + the day/night light
// schedule in one POST because the cam exposes them under the same
// cfg_light_work endpoint. `LightMode` / `LightPeriod` control the
// auto-vs-timed light switch even though the GET returns them under
// a nested `light_work` object.
type SetWorkModeParams struct {
	AntiFlicker *int    `json:"antiflicker,omitempty"` // 0/50/60 (Hz)
	WDR         *int    `json:"wdr,omitempty"`
	Flip        *int    `json:"flip,omitempty"`
	Mirror      *int    `json:"mirror,omitempty"`
	AIISPMode   *int    `json:"ai_isp_mode,omitempty"` // 0..3
	AFMode      *int    `json:"af_mode,omitempty"`     // 0 auto / 1 manual
	LightLevel  *int    `json:"light_level,omitempty"` // -1 off / 0 auto / >0 level
	LightMode   *int    `json:"light_mode,omitempty"`  // 0 auto / 1 scheduled
	LightPeriod *string `json:"light_period,omitempty"` // "1:0-20:0"
}

func (c *Client) GetWorkMode(ctx context.Context) (json.RawMessage, error) {
	return c.GetConfig(ctx, "light_work")
}

func (c *Client) SetWorkMode(ctx context.Context, p SetWorkModeParams) (json.RawMessage, error) {
	return c.SetConfig(ctx, "light_work", p)
}

// --- light mode (brightness + IR/colour) — page 298031309 -------------------

type SetLightModeParams struct {
	LightLevel  *int `json:"light_level,omitempty"`  // 0-100
	LightWkMode *int `json:"light_wkmode,omitempty"` // 1 IR / 2 full colour / 3 smart
}

func (c *Client) GetLightMode(ctx context.Context) (json.RawMessage, error) {
	return c.GetConfig(ctx, "light_mode")
}

func (c *Client) SetLightMode(ctx context.Context, p SetLightModeParams) (json.RawMessage, error) {
	return c.SetConfig(ctx, "light_mode", p)
}

// --- main/sub stream — page 298031291 ---------------------------------------

type SetStreamParams struct {
	BMType      int  `json:"bm_type"`                // 0 h264 / 1 h265
	Frame       int  `json:"frame"`                  // 2..max_fps
	FBL         int  `json:"fbl"`                    // resolution index (from dev.stream0/1)
	Bitrate     int  `json:"bitrate"`                // 50..max_kbps
	IInterval   *int `json:"I_interval,omitempty"`   // 1000..5000
	Quality     *int `json:"quality,omitempty"`      // 0..2
	RCMode      *int `json:"rc_mode,omitempty"`      // 0 AVBR / 1 VBR / 2 CBR
	SmartEncode *int `json:"smart_encode,omitempty"` // 0/1
}

// GetStream / SetStream: `sub` chooses the sub-stream cfg (name `video1`
// / action `video_1`) vs main (`video` / `video`).
func (c *Client) GetStream(ctx context.Context, sub bool) (json.RawMessage, error) {
	name := "video"
	if sub {
		name = "video1"
	}
	return c.GetConfig(ctx, name)
}

func (c *Client) SetStream(ctx context.Context, sub bool, p SetStreamParams) (json.RawMessage, error) {
	suffix := "video"
	if sub {
		suffix = "video_1"
	}
	return c.SetConfig(ctx, suffix, p)
}

// --- RTMP push — page 298031307 ---------------------------------------------

type SetRTMPParams struct {
	Enable   int    `json:"enable"`    // 0/1
	Audio    int    `json:"audio"`     // 0/1
	Addr     string `json:"addr"`      // rtmp://...
	StreamNo int    `json:"stream_no"` // 0 main / 1 sub
}

func (c *Client) GetRTMP(ctx context.Context) (json.RawMessage, error) {
	return c.GetConfig(ctx, "rtmp")
}

func (c *Client) SetRTMP(ctx context.Context, p SetRTMPParams) (json.RawMessage, error) {
	return c.SetConfig(ctx, "rtmp", p)
}

// --- OSD — page 298031308 ---------------------------------------------------
// Body shape is complex (list of 8 OSD lines + format indices); we
// don't define a typed struct. Use the generic cfg_set with raw JSON
// for set; expose a convenience getter for the common case.

func (c *Client) GetOSD(ctx context.Context) (json.RawMessage, error) {
	return c.GetConfig(ctx, "osd")
}

// --- motion detection — page 298031297 --------------------------------------

func (c *Client) GetMotionDetect(ctx context.Context) (json.RawMessage, error) {
	return c.GetConfig(ctx, "md")
}

// --- area intrusion — page 298031299 ----------------------------------------

func (c *Client) GetAreaIntrusion(ctx context.Context) (json.RawMessage, error) {
	return c.GetConfig(ctx, "invade")
}

// --- recording — page 298031302 ---------------------------------------------

type SetRecordingParams struct {
	Enable    *int       `json:"enable,omitempty"`
	AllTime   *int       `json:"all_time,omitempty"` // 0 schedule / 1 24x7
	Period    [][]string `json:"period,omitempty"`   // 7 days × 5 slots "H:M~H:M"
	PreRecord *int       `json:"pre_record,omitempty"` // 0..15 seconds
}

func (c *Client) GetRecording(ctx context.Context) (json.RawMessage, error) {
	return c.GetConfig(ctx, "record")
}

func (c *Client) SetRecording(ctx context.Context, p SetRecordingParams) (json.RawMessage, error) {
	return c.SetConfig(ctx, "record", p)
}

// --- timed snapshot — page 298031312 ----------------------------------------

type SetTimedCaptureParams struct {
	Enable       *int       `json:"enable,omitempty"`
	AllTime      *int       `json:"all_time,omitempty"`
	IntervalTime *int       `json:"interval_time,omitempty"` // seconds
	Period       [][]string `json:"period,omitempty"`
}

func (c *Client) GetTimedCapture(ctx context.Context) (json.RawMessage, error) {
	return c.GetConfig(ctx, "timedcapture")
}

func (c *Client) SetTimedCapture(ctx context.Context, p SetTimedCaptureParams) (json.RawMessage, error) {
	return c.SetConfig(ctx, "timedcapture", p)
}

// --- alarm output / input — pages 298031313, 298031314 ----------------------

func (c *Client) GetAlarmOut(ctx context.Context) (json.RawMessage, error) {
	return c.GetConfig(ctx, "alarm_out")
}

func (c *Client) GetAlarmIn(ctx context.Context) (json.RawMessage, error) {
	return c.GetConfig(ctx, "alarm_in")
}

// --- audio — page 298031303 -------------------------------------------------

func (c *Client) GetAudio(ctx context.Context) (json.RawMessage, error) {
	return c.GetConfig(ctx, "audio")
}

// --- TF card — page 298031304 -----------------------------------------------

// GetTFCard returns status + capacity; use FormatTFCard to wipe it.
func (c *Client) GetTFCard(ctx context.Context) (json.RawMessage, error) {
	return c.GetConfig(ctx, "tfcard")
}

func (c *Client) FormatTFCard(ctx context.Context) (json.RawMessage, error) {
	return c.Action(ctx, "tfcard_format")
}

// --- IP conflict check — page 298031315 -------------------------------------

func (c *Client) GetIPConflict(ctx context.Context) (json.RawMessage, error) {
	return c.GetConfig(ctx, "ip_conflict")
}

// --- image params (ISP) — page 298031457 ------------------------------------

func (c *Client) GetImageParams(ctx context.Context) (json.RawMessage, error) {
	return c.GetConfig(ctx, "image")
}

// --- privacy mask / ROI / occlusion / silent — pages 455/454/453/456 -------

func (c *Client) GetPrivacyCover(ctx context.Context) (json.RawMessage, error) {
	return c.GetConfig(ctx, "cover")
}

func (c *Client) GetROI(ctx context.Context) (json.RawMessage, error) {
	return c.GetConfig(ctx, "roi")
}

func (c *Client) GetOcclusion(ctx context.Context) (json.RawMessage, error) {
	return c.GetConfig(ctx, "od")
}

func (c *Client) GetSilent(ctx context.Context) (json.RawMessage, error) {
	return c.GetConfig(ctx, "silent")
}

// --- AI algorithm switch (capability: ai_choose in dev) ---------------------
// The vendor docs list the capability in `cfg_get&name=dev`
// (`ai_choose`, `ai_type`) but I didn't find a dedicated page for the
// setter in the catalog. Names below are the best guess based on
// the cam's naming conventions; if they're wrong the generic cfg_set
// command lets the operator try other suffixes without a rebuild.

func (c *Client) GetAIType(ctx context.Context) (json.RawMessage, error) {
	return c.GetConfig(ctx, "ai_type")
}

type SetAITypeParams struct {
	AIType int `json:"ai_type"`
}

func (c *Client) SetAIType(ctx context.Context, p SetAITypeParams) (json.RawMessage, error) {
	return c.SetConfig(ctx, "ai_type", p)
}
