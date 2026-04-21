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

	// Path exists — update via PATCH
	patchURL := fmt.Sprintf("%s/v3/config/paths/patch/%s", c.baseURL, name)
	patchReq, err := http.NewRequestWithContext(ctx, http.MethodPatch, patchURL, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("mediamtx: create patch request: %w", err)
	}
	patchReq.Header.Set("Content-Type", "application/json")
	if c.user != "" {
		patchReq.SetBasicAuth(c.user, c.pass)
	}

	resp2, err := c.client.Do(patchReq)
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
