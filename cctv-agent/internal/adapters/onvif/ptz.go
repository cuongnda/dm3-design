package onvif

import (
	"bytes"
	"context"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

// ONVIF PTZ, just enough of the service to drive a joystick:
// ContinuousMove (direction + velocity) and Stop. That covers pan,
// tilt, and zoom — all three are ranges [-1, 1].
//
// To issue a move we need the PTZ service endpoint (ONVIF publishes
// it via the device Capabilities or GetServices call) AND a valid
// Media profile token. We resolve both lazily the first time a cam
// is addressed and cache the result in memory. Credentials live in
// the request envelope and aren't cached — each request rebuilds the
// WS-Security header with a fresh nonce.

// Move encodes a single ContinuousMove command. Pan/Tilt/Zoom are
// normalized velocities in [-1, 1]; durationMs is how long to apply
// the motion before auto-stopping. Set durationMs to 0 to let the
// motion run until a later Stop is sent (useful for held-down joystick).
type Move struct {
	Pan         float64
	Tilt        float64
	Zoom        float64
	DurationMs  int
}

// ContinuousMove fires a directional command against the cam's ONVIF
// PTZ service. Resolves the PTZ service URL and the first Media
// profile token on first call per camera; those are cached in the
// package-level cache below.
//
// xAddrBase is the device_service URL discovered via WS-Discovery
// (e.g. http://192.168.1.222:8091/onvif/device_service). The PTZ
// service lives on the same host+port at /onvif/ptz_service on every
// vendor we've tested.
func ContinuousMove(ctx context.Context, xAddrBase, user, pass string, m Move) (json.RawMessage, error) {
	info, err := resolveServiceInfo(ctx, xAddrBase, user, pass)
	if err != nil {
		return nil, err
	}
	if err := sendContinuousMove(ctx, info, user, pass, m); err != nil {
		return nil, err
	}
	// Fire-and-forget auto-stop keeps callers from having to remember
	// to stop. Blocking for durationMs keeps the HTTP response tied
	// to the real motion duration, which makes the UX feel direct.
	if m.DurationMs > 0 {
		select {
		case <-ctx.Done():
		case <-time.After(time.Duration(m.DurationMs) * time.Millisecond):
		}
		if err := sendStop(ctx, info, user, pass, true, m.Zoom != 0); err != nil {
			return nil, err
		}
	}
	return json.Marshal(map[string]any{
		"ptz_service_url": info.PTZServiceURL,
		"profile_token":   info.ProfileToken,
		"pan":             m.Pan,
		"tilt":            m.Tilt,
		"zoom":            m.Zoom,
		"duration_ms":     m.DurationMs,
	})
}

// Stop cancels any in-flight continuous move. stopPanTilt / stopZoom
// lets a caller stop just one axis; true/true is the common case.
func Stop(ctx context.Context, xAddrBase, user, pass string, stopPanTilt, stopZoom bool) (json.RawMessage, error) {
	info, err := resolveServiceInfo(ctx, xAddrBase, user, pass)
	if err != nil {
		return nil, err
	}
	if err := sendStop(ctx, info, user, pass, stopPanTilt, stopZoom); err != nil {
		return nil, err
	}
	return json.Marshal(map[string]any{"stopped": true, "pan_tilt": stopPanTilt, "zoom": stopZoom})
}

// serviceInfo is the per-camera state we cache after the first call:
// PTZ service URL + a valid media profile token.
type serviceInfo struct {
	PTZServiceURL string
	ProfileToken  string
}

var (
	serviceCache   = map[string]serviceInfo{}
	serviceCacheMu sync.RWMutex
)

// resolveServiceInfo returns the PTZ service URL + profile token for
// this camera, hitting the cam only on cache miss. Derives the PTZ
// URL from the device_service URL by swapping the path — more
// reliable than GetServices for budget cams that don't report their
// own endpoints correctly.
func resolveServiceInfo(ctx context.Context, xAddrBase, user, pass string) (serviceInfo, error) {
	key := xAddrBase
	serviceCacheMu.RLock()
	if cached, ok := serviceCache[key]; ok {
		serviceCacheMu.RUnlock()
		return cached, nil
	}
	serviceCacheMu.RUnlock()

	ptzURL := strings.Replace(xAddrBase, "/device_service", "/ptz_service", 1)
	mediaURL := strings.Replace(xAddrBase, "/device_service", "/media_service", 1)
	if ptzURL == xAddrBase {
		// Fallback when the incoming URL doesn't follow the
		// /onvif/device_service convention (some vendors prefix with
		// /onvif/Services/… etc). Fail loudly rather than guess.
		return serviceInfo{}, fmt.Errorf("could not derive ptz_service URL from %q", xAddrBase)
	}

	token, err := fetchFirstProfileToken(ctx, mediaURL, user, pass)
	if err != nil {
		return serviceInfo{}, fmt.Errorf("get profile token: %w", err)
	}
	info := serviceInfo{PTZServiceURL: ptzURL, ProfileToken: token}
	serviceCacheMu.Lock()
	serviceCache[key] = info
	serviceCacheMu.Unlock()
	return info, nil
}

// fetchFirstProfileToken hits the Media service with GetProfiles and
// returns the first profile's token (usually "MediaProfile_Channel1_
// Stream0" or similar). We don't care which profile drives PTZ
// because on all tested cams they share the same PTZ node.
func fetchFirstProfileToken(ctx context.Context, mediaURL, user, pass string) (string, error) {
	const body = `<trt:GetProfiles xmlns:trt="http://www.onvif.org/ver10/media/wsdl"/>`
	resp, err := postSOAP(ctx, mediaURL, user, pass, body, "http://www.onvif.org/ver10/media/wsdl/GetProfiles")
	if err != nil {
		return "", err
	}
	// Minimal struct: first Profile's @token attribute.
	type profile struct {
		Token string `xml:"token,attr"`
	}
	type env struct {
		Body struct {
			GetProfilesResponse struct {
				Profiles []profile `xml:"Profiles"`
			} `xml:"GetProfilesResponse"`
		} `xml:"Body"`
	}
	var e env
	if err := xml.Unmarshal(resp, &e); err != nil {
		return "", fmt.Errorf("parse GetProfilesResponse: %w (body=%s)", err, truncate(resp, 200))
	}
	if len(e.Body.GetProfilesResponse.Profiles) == 0 {
		return "", fmt.Errorf("no profiles returned by media service")
	}
	return e.Body.GetProfilesResponse.Profiles[0].Token, nil
}

func sendContinuousMove(ctx context.Context, info serviceInfo, user, pass string, m Move) error {
	body := fmt.Sprintf(`<tptz:ContinuousMove xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl" xmlns:tt="http://www.onvif.org/ver10/schema">
  <tptz:ProfileToken>%s</tptz:ProfileToken>
  <tptz:Velocity>
    <tt:PanTilt x="%g" y="%g" xmlns:tt="http://www.onvif.org/ver10/schema"/>
    <tt:Zoom x="%g" xmlns:tt="http://www.onvif.org/ver10/schema"/>
  </tptz:Velocity>
</tptz:ContinuousMove>`, xmlEscape(info.ProfileToken), m.Pan, m.Tilt, m.Zoom)
	_, err := postSOAP(ctx, info.PTZServiceURL, user, pass, body, "http://www.onvif.org/ver20/ptz/wsdl/ContinuousMove")
	return err
}

func sendStop(ctx context.Context, info serviceInfo, user, pass string, panTilt, zoom bool) error {
	body := fmt.Sprintf(`<tptz:Stop xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl">
  <tptz:ProfileToken>%s</tptz:ProfileToken>
  <tptz:PanTilt>%t</tptz:PanTilt>
  <tptz:Zoom>%t</tptz:Zoom>
</tptz:Stop>`, xmlEscape(info.ProfileToken), panTilt, zoom)
	_, err := postSOAP(ctx, info.PTZServiceURL, user, pass, body, "http://www.onvif.org/ver20/ptz/wsdl/Stop")
	return err
}

// postSOAP sends a SOAP 1.2 envelope wrapping the given body. Returns
// the raw response bytes on success, wrapping SOAP Fault as error
// when present.
func postSOAP(ctx context.Context, url, user, pass, body, action string) ([]byte, error) {
	sec, err := newWSSecurity(user, pass)
	if err != nil {
		return nil, err
	}
	envelope := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope">
  <s:Header>%s</s:Header>
  <s:Body>%s</s:Body>
</s:Envelope>`, sec.headerXML(), body)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader([]byte(envelope)))
	if err != nil {
		return nil, err
	}
	// application/soap+xml is the SOAP 1.2 MIME; action goes as a
	// parameter per RFC 2045. Vendor cams are usually forgiving but
	// some (older Hik, Uniview) reject plain text/xml.
	req.Header.Set("Content-Type", fmt.Sprintf(`application/soap+xml; charset=utf-8; action="%s"`, action))
	req.Header.Set("Accept", "application/soap+xml, text/xml")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("POST %s: %w", url, err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
	if resp.StatusCode >= 300 {
		return raw, fmt.Errorf("%s returned HTTP %d: %s", url, resp.StatusCode, truncate(raw, 400))
	}
	// Flag SOAP faults as errors so the dispatcher surfaces them;
	// HTTP 200 with a <s:Fault> body is how ONVIF reports logical
	// errors (auth failure, bad token, etc).
	if bytes.Contains(raw, []byte(":Fault>")) || bytes.Contains(raw, []byte("<Fault>")) {
		return raw, fmt.Errorf("SOAP fault: %s", extractFaultReason(raw))
	}
	return raw, nil
}

func extractFaultReason(body []byte) string {
	// Minimal pull: <s:Reason><s:Text>Sender not authorized</s:Text></s:Reason>
	// Fall back to a truncated body so the operator at least sees what happened.
	marker := []byte("<s:Text")
	if idx := bytes.Index(body, marker); idx >= 0 {
		rest := body[idx:]
		if start := bytes.IndexByte(rest, '>'); start >= 0 {
			rest = rest[start+1:]
			if end := bytes.Index(rest, []byte("</s:Text>")); end >= 0 {
				return string(rest[:end])
			}
		}
	}
	return truncate(body, 200)
}

func truncate(b []byte, n int) string {
	if len(b) <= n {
		return string(b)
	}
	return string(b[:n]) + "…"
}
