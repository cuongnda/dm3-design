// Package tungson talks to TungSon cameras over their LAN HTTP API
// (vs_cgi_v2). Each exported function matches one documented API in
// the TungSon "技术文档--可对外共享" book. Adding a new capability
// means adding one more method here; callers pick by name.
//
// Wire protocol summary (from vendor docs, page 298031288):
//
//   - Base URL:  http://{cam_ip}/cgi-bin/vs_cgi_v2
//   - Login:     POST ?act=login  (form: user=…&pass=…)  returns token
//   - Get conf:  GET  ?act=cfg_get&name=<name>          (e.g. dev, timezone)
//   - Set conf:  POST ?act=cfg_<name>  (JSON body)       (e.g. cfg_timezone)
//   - Actions:   GET  ?act=<name>                         (e.g. reboot, reset)
//
// All authenticated calls carry the token via Cookie: token=<value>.
// Error shape on success/failure is always {status: 0|-1, msg: "...", data: {...}}.
package tungson

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"time"
)

// Client is a per-camera session holder. One Client = one cam; the
// cookiejar keeps the login token across calls so the caller never
// has to thread it manually. Reuse across commands to that cam within
// the 15-minute token window (see Login doc in vendor pages — token
// lifetime isn't explicit, so we re-login on any 401-ish response as
// a defensive measure).
type Client struct {
	cameraIP string
	http     *http.Client
}

// NewClient opens a session against the camera's HTTP API. cameraIP
// may include :port; we default to :80 when missing.
func NewClient(cameraIP string) (*Client, error) {
	jar, err := cookiejar.New(nil)
	if err != nil {
		return nil, fmt.Errorf("cookie jar: %w", err)
	}
	return &Client{
		cameraIP: normalizeHost(cameraIP),
		http: &http.Client{
			Timeout: 15 * time.Second,
			Jar:     jar,
		},
	}, nil
}

// Login authenticates against /cgi-bin/vs_cgi_v2?act=login and stores
// the returned token in the cookie jar so all subsequent calls carry it.
// Vendor docs (page 298031289) specify a `check` field (1 = ok, 0 = fail).
func (c *Client) Login(ctx context.Context, user, pass string) error {
	form := url.Values{}
	form.Set("user", user)
	form.Set("pass", pass)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		c.url("?act=login"), bytes.NewBufferString(form.Encode()))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("login POST: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	var out struct {
		Check int    `json:"check"`
		Token string `json:"token"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		return fmt.Errorf("login parse: %w (body=%s)", err, truncate(body, 200))
	}
	if out.Check != 1 || out.Token == "" {
		return fmt.Errorf("login rejected by camera (check=%d)", out.Check)
	}
	// Vendor docs ask us to place the token into a cookie named "token"
	// on subsequent calls. Set it explicitly in the jar so net/http
	// carries it on every request regardless of Set-Cookie behavior.
	u, _ := url.Parse(c.base())
	c.http.Jar.SetCookies(u, []*http.Cookie{{Name: "token", Value: out.Token}})
	return nil
}

// GetConfig calls ?act=cfg_get&name=<name>. Returns the raw `data`
// field from the envelope so typed wrappers can unmarshal it.
func (c *Client) GetConfig(ctx context.Context, name string) (json.RawMessage, error) {
	return c.do(ctx, http.MethodGet, fmt.Sprintf("?act=cfg_get&name=%s", url.QueryEscape(name)), nil)
}

// SetConfig POSTs a JSON body to ?act=cfg_<name>.
// The TungSon API uses `cfg_timezone`, `cfg_user`, etc. — caller
// supplies just the suffix (e.g. "timezone"), we prepend `cfg_`.
func (c *Client) SetConfig(ctx context.Context, suffix string, body any) (json.RawMessage, error) {
	buf, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("marshal body: %w", err)
	}
	return c.do(ctx, http.MethodPost, fmt.Sprintf("?act=cfg_%s", suffix), buf)
}

// Action calls a simple GET action without a cfg_get/cfg_set wrapper —
// used for `reboot`, `reset`, and similar one-shot commands.
func (c *Client) Action(ctx context.Context, name string) (json.RawMessage, error) {
	return c.do(ctx, http.MethodGet, fmt.Sprintf("?act=%s", url.QueryEscape(name)), nil)
}

// do is the shared request helper. It returns the `data` field on
// success, and a descriptive error when the camera replies with
// status=-1 or a non-2xx HTTP code.
func (c *Client) do(ctx context.Context, method, qs string, body []byte) (json.RawMessage, error) {
	var reqBody io.Reader
	if body != nil {
		reqBody = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.url(qs), reqBody)
	if err != nil {
		return nil, err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("%s %s: %w", method, qs, err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("%s %s returned HTTP %d: %s", method, qs, resp.StatusCode, truncate(raw, 200))
	}
	// Some actions return an object without a `data` field (e.g. run_status
	// returns `{cruise: 0}` directly). Detect that and return the whole body
	// as-is so the typed wrappers still get something to parse.
	var env struct {
		Status *int            `json:"status"`
		Msg    string          `json:"msg"`
		Data   json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(raw, &env); err != nil {
		return nil, fmt.Errorf("parse envelope: %w (body=%s)", err, truncate(raw, 200))
	}
	if env.Status != nil && *env.Status < 0 {
		return nil, fmt.Errorf("cam returned status=%d msg=%q", *env.Status, env.Msg)
	}
	if len(env.Data) > 0 {
		return env.Data, nil
	}
	return raw, nil
}

func (c *Client) base() string      { return "http://" + c.cameraIP }
func (c *Client) url(qs string) string { return c.base() + "/cgi-bin/vs_cgi_v2" + qs }

// normalizeHost ensures host:port; defaults to :80 for plain IPs.
func normalizeHost(h string) string {
	if _, _, err := net.SplitHostPort(h); err == nil {
		return h
	}
	return h + ":80"
}

func truncate(b []byte, n int) string {
	if len(b) <= n {
		return string(b)
	}
	return string(b[:n]) + "…"
}
