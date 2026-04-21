package cctv

import (
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/duali/dm3-backend/pkg/httputil"
)

// GetWHEPEndpoint handles GET /cameras/{id}/whep
// Returns the WHEP and HLS endpoint URLs for the camera stream.
// Base URLs come from env MEDIAMTX_WHEP_BASE and MEDIAMTX_HLS_BASE;
// they default to /cctv/whep and /cctv/hls for same-origin nginx proxying.
func (h *CCTVHandlers) GetWHEPEndpoint(w http.ResponseWriter, r *http.Request) {
	cid := h.getTenantID(r)
	if !requireTenant(w, cid) {
		return
	}
	id := chi.URLParam(r, "id")

	// Verify camera belongs to tenant
	var deviceID string
	err := h.db.Pool.QueryRow(r.Context(), `
		SELECT device_id FROM dm3_devices.devices
		WHERE id = $1::uuid AND tenant_id = $2::uuid AND type = 'camera'`,
		id, cid,
	).Scan(&deviceID)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "camera not found")
		return
	}

	whepBase := strings.TrimRight(envOrDefault("MEDIAMTX_WHEP_BASE", "/cctv/whep"), "/")
	hlsBase := strings.TrimRight(envOrDefault("MEDIAMTX_HLS_BASE", "/cctv/hls"), "/")

	h.audit.LogFromRequest(r, "cctv.stream.view", "camera", id, deviceID, "success", nil, map[string]any{
		"stream_type": "whep+hls",
	})

	httputil.JSON(w, http.StatusOK, map[string]string{
		"whep_url": whepBase + "/" + id + "/whep",
		"hls_url":  hlsBase + "/" + id + "/index.m3u8",
	})
}

// ProxyWHEP handles POST /cctv/whep/{id}/whep
// Proxies the browser WHEP request to MediaMTX with stream credentials.
// This keeps MediaMTX auth-protected — browsers never talk to MediaMTX directly.
func (h *CCTVHandlers) ProxyWHEP(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	cid := h.getTenantID(r)
	if !requireTenant(w, cid) {
		return
	}

	// Verify camera belongs to tenant
	var exists bool
	_ = h.db.Pool.QueryRow(r.Context(),
		`SELECT EXISTS(SELECT 1 FROM dm3_devices.devices WHERE id = $1::uuid AND tenant_id = $2::uuid AND type = 'camera')`,
		id, cid,
	).Scan(&exists)
	if !exists {
		httputil.Error(w, http.StatusNotFound, "camera not found")
		return
	}

	// Build MediaMTX WHEP URL
	mediamtxWHEP := strings.TrimRight(envOrDefault("MEDIAMTX_WHEP_INTERNAL", envOrDefault("MEDIAMTX_WHEP_BASE", "http://localhost:8889")), "/")
	targetURL := fmt.Sprintf("%s/%s/whep", mediamtxWHEP, id)

	proxyStreamRequest(w, r, targetURL)
}

// ProxyHLS handles GET /cctv/hls/{id}/*
// Proxies HLS requests to MediaMTX with stream credentials.
func (h *CCTVHandlers) ProxyHLS(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	cid := h.getTenantID(r)
	if !requireTenant(w, cid) {
		return
	}

	var exists bool
	_ = h.db.Pool.QueryRow(r.Context(),
		`SELECT EXISTS(SELECT 1 FROM dm3_devices.devices WHERE id = $1::uuid AND tenant_id = $2::uuid AND type = 'camera')`,
		id, cid,
	).Scan(&exists)
	if !exists {
		httputil.Error(w, http.StatusNotFound, "camera not found")
		return
	}

	// Extract the rest of the path after /cctv/hls/{id}/
	rest := chi.URLParam(r, "*")
	mediamtxHLS := strings.TrimRight(envOrDefault("MEDIAMTX_HLS_INTERNAL", envOrDefault("MEDIAMTX_HLS_BASE", "http://localhost:8888")), "/")
	targetURL := fmt.Sprintf("%s/%s/%s", mediamtxHLS, id, rest)

	proxyStreamRequest(w, r, targetURL)
}

// proxyStreamRequest forwards an HTTP request to MediaMTX with stream user credentials.
func proxyStreamRequest(w http.ResponseWriter, r *http.Request, targetURL string) {
	streamUser := envOrDefault("MEDIAMTX_STREAM_USER", "")
	streamPass := envOrDefault("MEDIAMTX_STREAM_PASS", "")

	client := &http.Client{Timeout: 30 * time.Second}

	proxyReq, err := http.NewRequestWithContext(r.Context(), r.Method, targetURL, r.Body)
	if err != nil {
		slog.Error("cctv: proxy stream request failed", "error", err, "url", targetURL)
		httputil.Error(w, http.StatusInternalServerError, "proxy error")
		return
	}

	// Copy all request headers (Content-Type, Accept, If-Match, etc.)
	for k, vs := range r.Header {
		for _, v := range vs {
			proxyReq.Header.Add(k, v)
		}
	}
	// Override auth with stream credentials
	proxyReq.Header.Del("Authorization")
	if streamUser != "" {
		proxyReq.SetBasicAuth(streamUser, streamPass)
	}

	resp, err := client.Do(proxyReq)
	if err != nil {
		slog.Error("cctv: proxy stream request failed", "error", err, "url", targetURL)
		httputil.Error(w, http.StatusBadGateway, "mediamtx unavailable")
		return
	}
	defer resp.Body.Close()

	// Copy response headers
	for k, vs := range resp.Header {
		for _, v := range vs {
			w.Header().Add(k, v)
		}
	}
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body)
}

// envOrDefault returns the value of an environment variable or the default.
func envOrDefault(key, defaultVal string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultVal
}
