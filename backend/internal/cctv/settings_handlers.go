package cctv

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"

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

	// Nullable pointer types let us distinguish three intents per field:
	//   - absent from JSON body  -> keep the current DB value
	//   - empty string           -> clear the DB value (NULL)
	//   - non-empty string       -> replace
	//
	// For the Hanet secrets we encrypt before storing; a plaintext empty
	// string is the signal to NULL the encrypted column, not a request to
	// encrypt an empty token.
	var req struct {
		RetentionDays      *int `json:"retention_days"`
		RetentionDaysMax   *int `json:"retention_days_max"`
		PreRollSecDefault  *int `json:"pre_roll_sec_default"`
		PostRollSecDefault *int `json:"post_roll_sec_default"`
		StorageQuotaGB     *int `json:"storage_quota_gb"`

		// Event capture knobs — migration 000048
		RollingBufferSec         *int  `json:"rolling_buffer_sec"`
		MaxClipDurationSec       *int  `json:"max_clip_duration_sec"`
		MaxConcurrentExtractions *int  `json:"max_concurrent_extractions"`
		DefaultSnapshotEnabled   *bool `json:"default_snapshot_enabled"`
		DefaultRecordEnabled     *bool `json:"default_record_enabled"`

		HanetClientID     *string `json:"hanet_client_id"`
		HanetClientSecret *string `json:"hanet_client_secret"`
		HanetAccessToken  *string `json:"hanet_access_token"`
		HanetRefreshToken *string `json:"hanet_refresh_token"`
		HanetServerURL    *string `json:"hanet_server_url"`
		HanetPlaceID      *string `json:"hanet_place_id"`
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
	if req.RollingBufferSec != nil && (*req.RollingBufferSec < 0 || *req.RollingBufferSec > 300) {
		httputil.Error(w, http.StatusBadRequest, "rolling_buffer_sec must be between 0 and 300")
		return
	}
	if req.MaxClipDurationSec != nil && (*req.MaxClipDurationSec < 30 || *req.MaxClipDurationSec > 3600) {
		httputil.Error(w, http.StatusBadRequest, "max_clip_duration_sec must be between 30 and 3600")
		return
	}
	if req.MaxConcurrentExtractions != nil && (*req.MaxConcurrentExtractions < 1 || *req.MaxConcurrentExtractions > 64) {
		httputil.Error(w, http.StatusBadRequest, "max_concurrent_extractions must be between 1 and 64")
		return
	}
	if req.HanetServerURL != nil {
		trimmed := strings.TrimSpace(*req.HanetServerURL)
		if trimmed != "" && !strings.HasPrefix(trimmed, "http://") && !strings.HasPrefix(trimmed, "https://") {
			httputil.Error(w, http.StatusBadRequest, "hanet_server_url must start with http:// or https://")
			return
		}
		req.HanetServerURL = &trimmed
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

	// Encrypt Hanet secrets on the way in. A nil pointer means "don't touch";
	// a non-nil pointer to "" clears the column; a non-nil non-empty value
	// encrypts and replaces. We pass those via three-valued variables where
	// a nil []byte means "no change" and an empty []byte means "set NULL".
	var (
		clientSecretEnc *[]byte
		accessTokenEnc  *[]byte
		refreshTokenEnc *[]byte
	)
	encField := func(plain *string) (*[]byte, error) {
		if plain == nil {
			return nil, nil
		}
		if strings.TrimSpace(*plain) == "" {
			empty := []byte{}
			return &empty, nil
		}
		if h.cipher == nil {
			return nil, errHanetCipherMissing
		}
		ct, err := h.cipher.Encrypt(*plain)
		if err != nil {
			return nil, err
		}
		return &ct, nil
	}
	var encErr error
	if clientSecretEnc, encErr = encField(req.HanetClientSecret); encErr != nil {
		slog.Error("encrypt hanet client secret", "error", encErr)
		httputil.Error(w, http.StatusServiceUnavailable, "credential cipher unavailable")
		return
	}
	if accessTokenEnc, encErr = encField(req.HanetAccessToken); encErr != nil {
		slog.Error("encrypt hanet access token", "error", encErr)
		httputil.Error(w, http.StatusServiceUnavailable, "credential cipher unavailable")
		return
	}
	if refreshTokenEnc, encErr = encField(req.HanetRefreshToken); encErr != nil {
		slog.Error("encrypt hanet refresh token", "error", encErr)
		httputil.Error(w, http.StatusServiceUnavailable, "credential cipher unavailable")
		return
	}

	// COALESCE handles the "don't touch" leg. For the encrypted columns we
	// bind a *[]byte — nil pointer -> SQL NULL, which flips COALESCE to the
	// existing column value. Empty-byte pointer -> we translate to explicit
	// NULL so the COALESCE picks up the clearing intent. Postgres has no
	// native way to say "replace with NULL via COALESCE" otherwise.
	encOrNil := func(p *[]byte) any {
		if p == nil {
			return nil
		}
		if len(*p) == 0 {
			return nil
		}
		return *p
	}
	clearFlagSecret := clientSecretEnc != nil && len(*clientSecretEnc) == 0
	clearFlagAccess := accessTokenEnc != nil && len(*accessTokenEnc) == 0
	clearFlagRefresh := refreshTokenEnc != nil && len(*refreshTokenEnc) == 0

	_, err = h.db.Pool.Exec(r.Context(), `
		UPDATE dm3_cctv.cctv_settings SET
			retention_days              = COALESCE($2, retention_days),
			retention_days_max          = COALESCE($3, retention_days_max),
			pre_roll_sec_default        = COALESCE($4, pre_roll_sec_default),
			post_roll_sec_default       = COALESCE($5, post_roll_sec_default),
			storage_quota_gb            = COALESCE($6, storage_quota_gb),
			hanet_client_id             = COALESCE($7, hanet_client_id),
			hanet_server_url            = COALESCE($8, hanet_server_url),
			hanet_place_id              = COALESCE($9, hanet_place_id),
			hanet_client_secret_enc     = CASE WHEN $13 THEN NULL ELSE COALESCE($10, hanet_client_secret_enc) END,
			hanet_access_token_enc      = CASE WHEN $14 THEN NULL ELSE COALESCE($11, hanet_access_token_enc)  END,
			hanet_refresh_token_enc     = CASE WHEN $15 THEN NULL ELSE COALESCE($12, hanet_refresh_token_enc) END,
			rolling_buffer_sec          = COALESCE($16, rolling_buffer_sec),
			max_clip_duration_sec       = COALESCE($17, max_clip_duration_sec),
			max_concurrent_extractions  = COALESCE($18, max_concurrent_extractions),
			default_snapshot_enabled    = COALESCE($19, default_snapshot_enabled),
			default_record_enabled      = COALESCE($20, default_record_enabled),
			updated_at                  = now()
		WHERE tenant_id = $1::uuid`,
		cid,
		req.RetentionDays, req.RetentionDaysMax, req.PreRollSecDefault, req.PostRollSecDefault, req.StorageQuotaGB,
		req.HanetClientID, req.HanetServerURL, req.HanetPlaceID,
		encOrNil(clientSecretEnc), encOrNil(accessTokenEnc), encOrNil(refreshTokenEnc),
		clearFlagSecret, clearFlagAccess, clearFlagRefresh,
		req.RollingBufferSec, req.MaxClipDurationSec, req.MaxConcurrentExtractions,
		req.DefaultSnapshotEnabled, req.DefaultRecordEnabled,
	)
	if err != nil {
		slog.Error("update cctv settings error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	s, err := h.scanSettings(r.Context(), cid)
	if err != nil {
		slog.Error("read cctv settings after update", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	// Audit diff never includes raw token material — the struct serialized
	// here only has HasX flags, not the ciphertext or plaintext.
	h.audit.LogFromRequest(r, "cctv.settings.update", "cctv_settings", s.TenantID, "", "success", current, s)
	httputil.JSON(w, http.StatusOK, s)
}
