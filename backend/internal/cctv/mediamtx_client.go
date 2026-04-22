package cctv

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"
)

// MediaMTXClient manages path configurations on a MediaMTX server via its REST API.
// See: https://bluenviron.github.io/mediamtx/
type MediaMTXClient interface {
	UpsertPath(ctx context.Context, name string, cfg PathConfig) error
	DeletePath(ctx context.Context, name string) error
	PathExists(ctx context.Context, name string) (bool, error)
	ListPaths(ctx context.Context) ([]MediaMTXPathStatus, error)
}

// MediaMTXPathStatus is the subset of the /v3/paths/list response we care about
// for camera liveness tracking. Ready=true means MediaMTX currently has an
// active RTSP source publishing to the path.
type MediaMTXPathStatus struct {
	Name  string
	Ready bool
}

// PathConfig is the configuration sent to MediaMTX for a stream path.
type PathConfig struct {
	Source         string // rtsp://user:pass@host:port/path (composed by caller)
	SourceOnDemand bool   // true — start stream only when a client connects
}

// HTTPMediaMTXClient is an HTTP implementation of MediaMTXClient.
// baseURL, apiUser, and apiPass come from env vars:
//
//	MEDIAMTX_API_URL  — e.g. http://mediamtx:9997
//	MEDIAMTX_API_USER — basic auth username (empty = no auth)
//	MEDIAMTX_API_PASS — basic auth password
type HTTPMediaMTXClient struct {
	baseURL string
	user    string
	pass    string
	client  *http.Client
}

// NewHTTPMediaMTXClient creates an HTTPMediaMTXClient.
func NewHTTPMediaMTXClient(baseURL, user, pass string) *HTTPMediaMTXClient {
	return &HTTPMediaMTXClient{
		baseURL: baseURL,
		user:    user,
		pass:    pass,
		client:  &http.Client{Timeout: 10 * time.Second},
	}
}

type mediamtxPathBody struct {
	Source         string `json:"source"`
	SourceOnDemand bool   `json:"sourceOnDemand"`
}

// UpsertPath creates or updates a path configuration on MediaMTX.
// Tries POST /v3/config/paths/add/{name} first; if path already exists (400),
// falls back to PATCH /v3/config/paths/patch/{name}.
func (c *HTTPMediaMTXClient) UpsertPath(ctx context.Context, name string, cfg PathConfig) error {
	body, err := json.Marshal(mediamtxPathBody{
		Source:         cfg.Source,
		SourceOnDemand: cfg.SourceOnDemand,
	})
	if err != nil {
		return fmt.Errorf("mediamtx: marshal path config: %w", err)
	}

	// Try add first
	addURL := fmt.Sprintf("%s/v3/config/paths/add/%s", c.baseURL, name)
	addReq, err := http.NewRequestWithContext(ctx, http.MethodPost, addURL, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("mediamtx: create request: %w", err)
	}
	addReq.Header.Set("Content-Type", "application/json")
	if c.user != "" {
		addReq.SetBasicAuth(c.user, c.pass)
	}

	resp, err := c.client.Do(addReq)
	if err != nil {
		return fmt.Errorf("mediamtx: upsert path %q: %w", name, err)
	}
	resp.Body.Close()

	if resp.StatusCode < 400 {
		return nil // Created successfully
	}

	slog.Debug("mediamtx: POST add failed, deleting and re-adding", "path", name, "status", resp.StatusCode)

	// Path exists — delete first, then re-add
	delURL := fmt.Sprintf("%s/v3/config/paths/delete/%s", c.baseURL, name)
	delReq, err := http.NewRequestWithContext(ctx, http.MethodDelete, delURL, nil)
	if err != nil {
		return fmt.Errorf("mediamtx: create delete request: %w", err)
	}
	if c.user != "" {
		delReq.SetBasicAuth(c.user, c.pass)
	}
	delResp, err := c.client.Do(delReq)
	if err == nil {
		delResp.Body.Close()
	}

	// Re-add
	addReq2, err := http.NewRequestWithContext(ctx, http.MethodPost, addURL, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("mediamtx: create re-add request: %w", err)
	}
	addReq2.Header.Set("Content-Type", "application/json")
	if c.user != "" {
		addReq2.SetBasicAuth(c.user, c.pass)
	}

	resp2, err := c.client.Do(addReq2)
	if err != nil {
		return fmt.Errorf("mediamtx: patch path %q: %w", name, err)
	}
	defer resp2.Body.Close()

	if resp2.StatusCode >= 400 {
		return fmt.Errorf("mediamtx: patch path %q returned status %d", name, resp2.StatusCode)
	}
	return nil
}

// DeletePath removes a path configuration from MediaMTX.
// Uses DELETE /v3/config/paths/delete/{name}.
func (c *HTTPMediaMTXClient) DeletePath(ctx context.Context, name string) error {
	url := fmt.Sprintf("%s/v3/config/paths/delete/%s", c.baseURL, name)
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, url, nil)
	if err != nil {
		return fmt.Errorf("mediamtx: create request: %w", err)
	}
	if c.user != "" {
		req.SetBasicAuth(c.user, c.pass)
	}

	resp, err := c.client.Do(req)
	if err != nil {
		return fmt.Errorf("mediamtx: delete path %q: %w", name, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 && resp.StatusCode != http.StatusNotFound {
		return fmt.Errorf("mediamtx: delete path %q returned status %d", name, resp.StatusCode)
	}
	return nil
}

// PathExists checks whether a path is configured in MediaMTX.
// Uses GET /v3/config/paths/get/{name}.
func (c *HTTPMediaMTXClient) PathExists(ctx context.Context, name string) (bool, error) {
	url := fmt.Sprintf("%s/v3/config/paths/get/%s", c.baseURL, name)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return false, fmt.Errorf("mediamtx: create request: %w", err)
	}
	if c.user != "" {
		req.SetBasicAuth(c.user, c.pass)
	}

	resp, err := c.client.Do(req)
	if err != nil {
		return false, fmt.Errorf("mediamtx: get path %q: %w", name, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return false, nil
	}
	if resp.StatusCode >= 400 {
		return false, fmt.Errorf("mediamtx: get path %q returned status %d", name, resp.StatusCode)
	}
	return true, nil
}

// ListPaths fetches the runtime status of all paths from MediaMTX.
// Uses GET /v3/paths/list (paginated; we fetch with a large page size since
// path counts in practice are small).
func (c *HTTPMediaMTXClient) ListPaths(ctx context.Context) ([]MediaMTXPathStatus, error) {
	url := fmt.Sprintf("%s/v3/paths/list?itemsPerPage=1000", c.baseURL)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("mediamtx: create list request: %w", err)
	}
	if c.user != "" {
		req.SetBasicAuth(c.user, c.pass)
	}

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("mediamtx: list paths: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("mediamtx: list paths returned status %d", resp.StatusCode)
	}

	var body struct {
		Items []struct {
			Name  string `json:"name"`
			Ready bool   `json:"ready"`
		} `json:"items"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return nil, fmt.Errorf("mediamtx: decode list response: %w", err)
	}

	out := make([]MediaMTXPathStatus, 0, len(body.Items))
	for _, it := range body.Items {
		out = append(out, MediaMTXPathStatus{Name: it.Name, Ready: it.Ready})
	}
	return out, nil
}

// NoopMediaMTXClient is a no-op implementation for tests and dev environments
// where MediaMTX is not available. It logs and returns nil for all operations.
type NoopMediaMTXClient struct{}

func (NoopMediaMTXClient) UpsertPath(ctx context.Context, name string, cfg PathConfig) error {
	slog.Debug("mediamtx noop: UpsertPath", "name", name, "source", redactRTSPCredentials(cfg.Source))
	return nil
}

func (NoopMediaMTXClient) DeletePath(ctx context.Context, name string) error {
	slog.Debug("mediamtx noop: DeletePath", "name", name)
	return nil
}

func (NoopMediaMTXClient) PathExists(ctx context.Context, name string) (bool, error) {
	slog.Debug("mediamtx noop: PathExists", "name", name)
	return true, nil
}

func (NoopMediaMTXClient) ListPaths(ctx context.Context) ([]MediaMTXPathStatus, error) {
	return nil, nil
}
