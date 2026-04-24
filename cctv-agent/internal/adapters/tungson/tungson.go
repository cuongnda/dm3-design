package tungson

import (
	"context"
	"encoding/json"
	"fmt"
	"time"
)

// Typed wrappers around Client. Each function corresponds to one
// documented TungSon API. Return values carry the raw camera JSON so
// callers / logs see exactly what the cam said — don't silently drop
// fields, they're the only way to debug vendor quirks.

// GetDeviceInfo — page 298031290 (cfg_get&name=dev).
// Response includes resolution list, codecs, PTZ/WIFI/LTE capability flags.
func (c *Client) GetDeviceInfo(ctx context.Context) (json.RawMessage, error) {
	return c.GetConfig(ctx, "dev")
}

// GetRunStatus — page 298031934 (cfg_get&name=run_status).
// Tiny body — typically {cruise: 0|1}.
func (c *Client) GetRunStatus(ctx context.Context) (json.RawMessage, error) {
	return c.GetConfig(ctx, "run_status")
}

// GetVersion — firmware/kernel/model info (cfg_get&name=version,
// page 298031306 section describes the shape).
func (c *Client) GetVersion(ctx context.Context) (json.RawMessage, error) {
	return c.GetConfig(ctx, "version")
}

// GetUser — current admin username (cfg_get&name=user, page 298031306).
func (c *Client) GetUser(ctx context.Context) (json.RawMessage, error) {
	return c.GetConfig(ctx, "user")
}

// GetTimezone — current timezone + NTP config (cfg_get&name=timezone,
// page 298031305).
func (c *Client) GetTimezone(ctx context.Context) (json.RawMessage, error) {
	return c.GetConfig(ctx, "timezone")
}

// SetTimezoneParams mirrors the POST body shape on page 298031305.
// `TimingMode` is REQUIRED per vendor docs (is="是" in the param table).
// Common caller use cases:
//
//	Mode 0 (default): agent provides Time=unix seconds of its own clock
//	Mode 1: cam polls NtpSvr every NtpInterval seconds
//	Mode 2..4: onvif/GB/1400 platform pushes time
//
// Unset optional fields are omitted from the request so we don't clobber
// whatever the cam already has configured.
type SetTimezoneParams struct {
	TimezoneMinutes *int    `json:"timezone,omitempty"`    // -720..720
	NTPServer       *string `json:"ntp_svr,omitempty"`     // host/IP
	NTPIntervalSec  *int    `json:"ntp_interval,omitempty"` // 60 * minutes
	TimingMode      int     `json:"timing_mode"`           // 0..4 (required)
	Time            *int64  `json:"time,omitempty"`        // unix seconds; only for mode=0 sync-from-agent
}

// SetTimezone — POST ?act=cfg_timezone (page 298031305).
// When TimingMode is 0 and Time is nil, we pin it to the agent's
// current clock — the LAN agent is typically NTP-synced and is the
// best wall-clock proxy for the camera.
func (c *Client) SetTimezone(ctx context.Context, p SetTimezoneParams) (json.RawMessage, error) {
	if p.TimingMode == 0 && p.Time == nil {
		now := time.Now().Unix()
		p.Time = &now
	}
	return c.SetConfig(ctx, "timezone", p)
}

// SetTimeNow is a convenience: set the camera's wall clock to the
// agent's current time using mode=0 (sync from agent). Optional TZ in
// minutes offset from UTC (e.g. 420 for UTC+07 Vietnam).
func (c *Client) SetTimeNow(ctx context.Context, timezoneMinutes int) (json.RawMessage, error) {
	now := time.Now().Unix()
	tzMin := timezoneMinutes
	return c.SetTimezone(ctx, SetTimezoneParams{
		TimezoneMinutes: &tzMin,
		TimingMode:      0,
		Time:            &now,
	})
}

// Reboot — page 298031317, GET ?act=reboot.
// Cam responds BEFORE actually rebooting, so a 200 here means "accepted",
// not "finished". Expect ~30-60s of downtime after.
func (c *Client) Reboot(ctx context.Context) (json.RawMessage, error) {
	return c.Action(ctx, "reboot")
}

// FactoryReset — page 298031317, GET ?act=reset.
// DESTRUCTIVE: wipes users, faces, config. Caller should guard
// with confirmation at a higher layer.
func (c *Client) FactoryReset(ctx context.Context) (json.RawMessage, error) {
	return c.Action(ctx, "reset")
}

// EnableFileList — page 298031317 section 3. Toggles the /record/
// browsable file listing (enable=1 on, 0 off).
func (c *Client) EnableFileList(ctx context.Context, enable bool) (json.RawMessage, error) {
	v := "0"
	if enable {
		v = "1"
	}
	return c.Action(ctx, fmt.Sprintf("cfg_ftp&enable=%s", v))
}
