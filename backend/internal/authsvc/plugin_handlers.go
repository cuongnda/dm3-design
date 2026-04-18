package authsvc

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/duali/dm3-backend/pkg/audit"
	"github.com/duali/dm3-backend/pkg/httputil"
)

// ─── Plugin Admin API ────────────────────────────────────────────────────────

// ListAvailablePlugins returns all plugins in the registry.
// GET /api/v1/auth/system/plugins
func (h *AuthHandlers) ListAvailablePlugins(w http.ResponseWriter, r *http.Request) {
	httputil.JSON(w, http.StatusOK, AvailablePlugins)
}

type tenantPluginsResponse struct {
	TenantID         string       `json:"tenant_id"`
	EnabledPlugins   []string     `json:"enabled_plugins"`
	AvailablePlugins []PluginInfo `json:"available_plugins"`
}

// GetTenantPlugins returns the plugins enabled for a specific tenant.
// GET /api/v1/auth/system/companies/{id}/plugins
func (h *AuthHandlers) GetTenantPlugins(w http.ResponseWriter, r *http.Request) {
	tenantID := chi.URLParam(r, "id")
	if tenantID == "" {
		httputil.Error(w, http.StatusBadRequest, "missing tenant id")
		return
	}

	plugins, err := h.fetchEnabledPlugins(r.Context(), tenantID)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "tenant not found")
		return
	}

	httputil.JSON(w, http.StatusOK, tenantPluginsResponse{
		TenantID:         tenantID,
		EnabledPlugins:   plugins,
		AvailablePlugins: AvailablePlugins,
	})
}

type updatePluginsRequest struct {
	EnabledPlugins []string `json:"enabled_plugins"`
}

// UpdateTenantPlugins replaces the plugins enabled for a tenant.
// PUT /api/v1/auth/system/companies/{id}/plugins
func (h *AuthHandlers) UpdateTenantPlugins(w http.ResponseWriter, r *http.Request) {
	tenantID := chi.URLParam(r, "id")
	if tenantID == "" {
		httputil.Error(w, http.StatusBadRequest, "missing tenant id")
		return
	}

	var req updatePluginsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Validate all plugin IDs
	for _, id := range req.EnabledPlugins {
		if !IsValidPlugin(id) {
			httputil.Error(w, http.StatusBadRequest, "invalid plugin: "+id)
			return
		}
	}

	// Ensure "core" is always present
	hasCore := false
	for _, id := range req.EnabledPlugins {
		if id == "core" {
			hasCore = true
			break
		}
	}
	if !hasCore {
		req.EnabledPlugins = append([]string{"core"}, req.EnabledPlugins...)
	}

	// Update database
	_, err := h.db.Pool.Exec(r.Context(),
		`UPDATE dm3_auth.tenants SET enabled_plugins = $1 WHERE id = $2::uuid`,
		req.EnabledPlugins, tenantID,
	)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to update plugins")
		return
	}

	// Audit log
	h.audit.Log(audit.Entry{
		TenantID:   tenantID,
		Action:     "tenant.plugins_updated",
		EntityType: "tenant",
		EntityID:   tenantID,
		Status:     "success",
		NewValues:  map[string]any{"enabled_plugins": req.EnabledPlugins},
	})

	httputil.JSON(w, http.StatusOK, tenantPluginsResponse{
		TenantID:         tenantID,
		EnabledPlugins:   req.EnabledPlugins,
		AvailablePlugins: AvailablePlugins,
	})
}
