package tungson

import (
	"context"
	"encoding/json"
	"fmt"
)

// PTZ + lens capabilities. Docs:
//
//   - 298031316: lens_init / focus_assist / align_curve
//   - 298031664: preset get / goto / set
//   - 298031944: special preset IDs (226 cruise start, 227 stop, …)
//
// TungSon HTTP has no joystick-style pan/tilt — all direction-like
// control goes through goto_preset with an ID. The documented special
// IDs below are exposed as named helpers so callers don't have to
// remember magic numbers.

// Special preset IDs from the vendor "球机特殊预置点" page. Stay aligned
// with the "new version" table (298031944) — the old-style numbering
// (298031341) is being phased out from 2025-11-01.
const (
	PresetGuardPosition   = 0   // 看守位 — home / guard position
	PresetStartCruise     = 226 // 启动巡航
	PresetStopCruise      = 227 // 停止巡航 (also stops tracking)
	PresetLineScanStart   = 228 // 调用 = start scan; set = configure start edge
	PresetLineScanEnd     = 229 // 调用 = stop scan;  set = configure end edge
	PresetGuardTracking   = 232 // per-model
	PresetCruiseTracking  = 233 // per-model
	PresetStopTracking    = 234 // per-model
	PresetRefocus         = 240
	PresetLensSelfCheck   = 241
	PresetPTZSelfCheck    = 242
	PresetUpdateFocusPos  = 243
	PresetAlignCurveNoLim = 244 // calibrate without travel limits
	PresetFactoryReset    = 246 // wipes presets + PTZ self-check
	PresetClearPresets    = 248 // wipes presets only (no PTZ check)
	PresetAlignCurve      = 251 // calibrate with limits (old preset 200)
)

// GetPresets — page 298031664 §1 (cfg_get&name=preset).
// Returns `{max_num: N, id_list: [ids…]}` so callers can confirm a
// preset ID is within range before calling GotoPreset.
func (c *Client) GetPresets(ctx context.Context) (json.RawMessage, error) {
	return c.GetConfig(ctx, "preset")
}

// GotoPreset — page 298031664 §2 (cfg_goto_preset).
// The single command behind all PTZ actions on TungSon HTTP: guard
// position, start/stop cruise, line scan, self-checks, factory wipe.
// Valid range: 1-224 for user presets; special IDs as constants above.
func (c *Client) GotoPreset(ctx context.Context, id int) (json.RawMessage, error) {
	return c.SetConfig(ctx, "goto_preset", map[string]int{"id": id})
}

// SetPreset — page 298031664 §3 (cfg_set_preset).
// Saves the camera's CURRENT PTZ position under the given preset ID so
// a future GotoPreset(id) returns to it. Non-destructive: cam merges,
// does not wipe other presets.
func (c *Client) SetPreset(ctx context.Context, id int) (json.RawMessage, error) {
	return c.SetConfig(ctx, "set_preset", map[string]int{"id": id})
}

// PTZAction is a small enum of high-level intents the agent exposes
// upward. A caller says "start cruise" instead of "goto preset 226".
type PTZAction string

const (
	PTZGuard          PTZAction = "guard"
	PTZCruiseStart    PTZAction = "cruise_start"
	PTZCruiseStop     PTZAction = "cruise_stop"
	PTZLineScanStart  PTZAction = "line_scan_start"
	PTZLineScanStop   PTZAction = "line_scan_stop"
	PTZRefocus        PTZAction = "refocus"
	PTZLensSelfCheck  PTZAction = "lens_self_check"
	PTZPTZSelfCheck   PTZAction = "ptz_self_check"
	PTZStopTracking   PTZAction = "stop_tracking"
	PTZClearPresets   PTZAction = "clear_presets"
)

// DoPTZAction maps a symbolic action to the underlying preset ID and
// calls the cam. Returns an error for unknown actions so the dispatcher
// surfaces typos instead of silently dropping them.
func (c *Client) DoPTZAction(ctx context.Context, action PTZAction) (json.RawMessage, error) {
	id, ok := ptzActionPreset[action]
	if !ok {
		return nil, fmt.Errorf("unknown ptz action %q", action)
	}
	return c.GotoPreset(ctx, id)
}

var ptzActionPreset = map[PTZAction]int{
	PTZGuard:         PresetGuardPosition,
	PTZCruiseStart:   PresetStartCruise,
	PTZCruiseStop:    PresetStopCruise,
	PTZLineScanStart: PresetLineScanStart,
	PTZLineScanStop:  PresetLineScanEnd,
	PTZRefocus:       PresetRefocus,
	PTZLensSelfCheck: PresetLensSelfCheck,
	PTZPTZSelfCheck:  PresetPTZSelfCheck,
	PTZStopTracking:  PresetStopTracking,
	PTZClearPresets:  PresetClearPresets,
}

// AlignZoomCurve — page 298031316 §1 (cfg_align_curve). Recalibrates
// the zoom travel curve; use after mechanical shocks or if autofocus
// starts misbehaving.
func (c *Client) AlignZoomCurve(ctx context.Context) (json.RawMessage, error) {
	return c.Action(ctx, "cfg_align_curve")
}

// FocusAssist — page 298031316 §2 (cfg_focus_assist). One-shot focus
// helper that shows a sharpness indicator on the live view.
func (c *Client) FocusAssist(ctx context.Context) (json.RawMessage, error) {
	return c.Action(ctx, "cfg_focus_assist")
}

// LensInit — page 298031316 §3 (cfg_lens_init). Resets lens motors to
// their zero position; usually run once after an install.
func (c *Client) LensInit(ctx context.Context) (json.RawMessage, error) {
	return c.Action(ctx, "cfg_lens_init")
}
