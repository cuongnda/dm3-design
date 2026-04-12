package cctv

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/duali/dm3-backend/pkg/httputil"
)

// GetSettings handles GET /settings
// Returns CCTVSettings for the tenant, lazily creating default row if missing.
func (h *CCTVHandlers) GetSettings(w http.ResponseWriter, r *http.Request) {
	cid := h.getTenantID(r)
	if !requireTenant(w, cid) {
		return
	}

	settings, err := h.getOrCreateSettings(r.Context(), cid)
	if err != nil {
		slog.Error("get cctv settings error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	httputil.JSON(w, http.StatusOK, settings)
}

// UpdateSettings handles PUT /settings
// Manager-only; validates retention_days <= retention_days_max.
func (h *CCTVHandlers) UpdateSettings(w http.ResponseWriter, r *http.Request) {
	cid := h.getTenantID(r)
	if !requireTenant(w, cid) {
		return
	}

	var req struct {
		RetentionDays      *int `json:"retention_days"`
		RetentionDaysMax   *int `json:"retention_days_max"`
		PreRollSecDefault  *int `json:"pre_roll_sec_default"`
		PostRollSecDefault *int `json:"post_roll_sec_default"`
		StorageQuotaGB     *int `json:"storage_quota_gb"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.PreRollSecDefault != nil && (*req.PreRollSecDefault < 0 || *req.PreRollSecDefault > 60) {
		httputil.Error(w, http.StatusBadRequest, "pre_roll_sec_default must be between 0 and 60")
		return
	}
	if req.PostRollSecDefault != nil && (*req.PostRollSecDefault < 0 || *req.PostRollSecDefault > 120) {
		httputil.Error(w, http.StatusBadRequest, "post_roll_sec_default must be between 0 and 120")
		return
	}

	// Ensure settings row exists first
	current, err := h.getOrCreateSettings(r.Context(), cid)
	if err != nil {
		slog.Error("ensure cctv settings error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	// Validate retention_days <= retention_days_max
	effectiveMax := current.RetentionDaysMax
	if req.RetentionDaysMax != nil {
		effectiveMax = *req.RetentionDaysMax
	}
	if req.RetentionDays != nil && *req.RetentionDays > effectiveMax {
		httputil.Error(w, http.StatusBadRequest, "retention_days must not exceed retention_days_max")
		return
	}

	var s CCTVSettings
	err = h.db.Pool.QueryRow(r.Context(), `
		UPDATE dm3_cctv.cctv_settings SET
			retention_days      = COALESCE($2, retention_days),
			retention_days_max  = COALESCE($3, retention_days_max),
			pre_roll_sec_default  = COALESCE($4, pre_roll_sec_default),
			post_roll_sec_default = COALESCE($5, post_roll_sec_default),
			storage_quota_gb    = COALESCE($6, storage_quota_gb),
			updated_at          = now()
		WHERE tenant_id = $1::uuid
		RETURNING tenant_id, retention_days, retention_days_max, pre_roll_sec_default, post_roll_sec_default, storage_quota_gb, created_at, updated_at`,
		cid, req.RetentionDays, req.RetentionDaysMax, req.PreRollSecDefault, req.PostRollSecDefault, req.StorageQuotaGB,
	).Scan(&s.TenantID, &s.RetentionDays, &s.RetentionDaysMax, &s.PreRollSecDefault, &s.PostRollSecDefault, &s.StorageQuotaGB, &s.CreatedAt, &s.UpdatedAt)
	if err != nil {
		slog.Error("update cctv settings error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	h.audit.LogFromRequest(r, "cctv.settings.update", "cctv_settings", s.TenantID, "", "success", current, s)
	httputil.JSON(w, http.StatusOK, s)
}
