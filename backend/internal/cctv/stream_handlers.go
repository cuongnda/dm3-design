package cctv

import (
	"net/http"
	"os"
	"strings"

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

// envOrDefault returns the value of an environment variable or the default.
func envOrDefault(key, defaultVal string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultVal
}
