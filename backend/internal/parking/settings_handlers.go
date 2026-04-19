package parking

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/pkg/httputil"
)

// ParkingSettings stores per-tenant parking configuration.
type ParkingSettings struct {
	ID                          string    `json:"id"`
	TenantID                    string    `json:"tenant_id"`
	AutoOpenBarrierOnPass       bool      `json:"auto_open_barrier_on_pass"`
	ConfidenceThreshold         float64   `json:"confidence_threshold"`
	RequirePaymentBeforeExit    bool      `json:"require_payment_before_exit"`
	FreeMinutesGlobal           int       `json:"free_minutes_global"`
	MaxSessionHours             int       `json:"max_session_hours"`
	AllowUnregisteredEntry      bool      `json:"allow_unregistered_entry"`
	PlateRecognitionEnabled     bool      `json:"plate_recognition_enabled"`
	DefaultFeeCurrency          string    `json:"default_fee_currency"`
	NotifyOnDisputed            bool      `json:"notify_on_disputed"`
	CapacityAlertThreshold      int       `json:"capacity_alert_threshold"`
	EnforceAccessRules          bool      `json:"enforce_access_rules"`
	CreatedAt                   time.Time `json:"created_at"`
	UpdatedAt                   time.Time `json:"updated_at"`
}

// GetSettings retrieves or creates default parking settings for the tenant.
func (h *ParkingHandlers) GetSettings(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}

	settings, err := h.getOrCreateSettings(r.Context(), cid)
	if err != nil {
		slog.Error("get parking settings error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	httputil.JSON(w, http.StatusOK, settings)
}

// UpdateSettings updates parking settings for the tenant.
func (h *ParkingHandlers) UpdateSettings(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}

	var req struct {
		AutoOpenBarrierOnPass    *bool    `json:"auto_open_barrier_on_pass"`
		ConfidenceThreshold      *float64 `json:"confidence_threshold"`
		RequirePaymentBeforeExit *bool    `json:"require_payment_before_exit"`
		FreeMinutesGlobal        *int     `json:"free_minutes_global"`
		MaxSessionHours          *int     `json:"max_session_hours"`
		AllowUnregisteredEntry   *bool    `json:"allow_unregistered_entry"`
		PlateRecognitionEnabled  *bool    `json:"plate_recognition_enabled"`
		DefaultFeeCurrency       *string  `json:"default_fee_currency"`
		NotifyOnDisputed         *bool    `json:"notify_on_disputed"`
		CapacityAlertThreshold   *int     `json:"capacity_alert_threshold"`
		EnforceAccessRules       *bool    `json:"enforce_access_rules"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Ensure the default row exists; getOrCreateSettings is a no-op insert
	// once the row is present. Then merge partial updates with RETURNING so
	// we avoid a second SELECT after the UPDATE.
	if _, err := h.ensureSettingsRow(r.Context(), cid); err != nil {
		slog.Error("ensure parking settings error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	var s ParkingSettings
	err := h.db.Pool.QueryRow(r.Context(), `UPDATE dm3_parking.parking_settings SET
		auto_open_barrier_on_pass = COALESCE($2, auto_open_barrier_on_pass),
		confidence_threshold = COALESCE($3, confidence_threshold),
		require_payment_before_exit = COALESCE($4, require_payment_before_exit),
		free_minutes_global = COALESCE($5, free_minutes_global),
		max_session_hours = COALESCE($6, max_session_hours),
		allow_unregistered_entry = COALESCE($7, allow_unregistered_entry),
		plate_recognition_enabled = COALESCE($8, plate_recognition_enabled),
		default_fee_currency = COALESCE($9, default_fee_currency),
		notify_on_disputed = COALESCE($10, notify_on_disputed),
		capacity_alert_threshold = COALESCE($11, capacity_alert_threshold),
		enforce_access_rules = COALESCE($12, enforce_access_rules),
		updated_at = now()
		WHERE tenant_id = $1::uuid
		RETURNING id, tenant_id, auto_open_barrier_on_pass, confidence_threshold, require_payment_before_exit,
		    free_minutes_global, max_session_hours, allow_unregistered_entry, plate_recognition_enabled,
		    default_fee_currency, notify_on_disputed, capacity_alert_threshold, enforce_access_rules, created_at, updated_at`,
		cid, req.AutoOpenBarrierOnPass, req.ConfidenceThreshold, req.RequirePaymentBeforeExit,
		req.FreeMinutesGlobal, req.MaxSessionHours, req.AllowUnregisteredEntry, req.PlateRecognitionEnabled,
		req.DefaultFeeCurrency, req.NotifyOnDisputed, req.CapacityAlertThreshold, req.EnforceAccessRules,
	).Scan(&s.ID, &s.TenantID, &s.AutoOpenBarrierOnPass, &s.ConfidenceThreshold, &s.RequirePaymentBeforeExit,
		&s.FreeMinutesGlobal, &s.MaxSessionHours, &s.AllowUnregisteredEntry, &s.PlateRecognitionEnabled,
		&s.DefaultFeeCurrency, &s.NotifyOnDisputed, &s.CapacityAlertThreshold, &s.EnforceAccessRules, &s.CreatedAt, &s.UpdatedAt)
	if err != nil {
		slog.Error("update parking settings error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	h.audit.LogFromRequest(r, "parking.settings.update", "parking_settings", s.ID, "", "success", nil, s)
	httputil.JSON(w, http.StatusOK, s)
}

// ensureSettingsRow seeds defaults for a tenant with a single INSERT. Used by
// UpdateSettings to avoid the 2-3 round-trip select/insert/select dance in
// getOrCreateSettings when we already plan to follow up with UPDATE ... RETURNING.
func (h *ParkingHandlers) ensureSettingsRow(ctx context.Context, cid string) (bool, error) {
	tag, err := h.db.Pool.Exec(ctx, `INSERT INTO dm3_parking.parking_settings
		(tenant_id, auto_open_barrier_on_pass, confidence_threshold, require_payment_before_exit,
		 free_minutes_global, max_session_hours, allow_unregistered_entry, plate_recognition_enabled,
		 default_fee_currency, notify_on_disputed, capacity_alert_threshold, enforce_access_rules)
		VALUES ($1::uuid, true, 0.85, true, 0, 24, true, true, 'VND', true, 80, false)
		ON CONFLICT (tenant_id) DO NOTHING`, cid)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

func (h *ParkingHandlers) getOrCreateSettings(ctx context.Context, cid string) (ParkingSettings, error) {
	var s ParkingSettings
	err := h.db.Pool.QueryRow(ctx, `SELECT id, tenant_id, auto_open_barrier_on_pass, confidence_threshold,
		require_payment_before_exit, free_minutes_global, max_session_hours, allow_unregistered_entry,
		plate_recognition_enabled, default_fee_currency, notify_on_disputed, capacity_alert_threshold,
		enforce_access_rules, created_at, updated_at
		FROM dm3_parking.parking_settings WHERE tenant_id = $1::uuid`, cid,
	).Scan(&s.ID, &s.TenantID, &s.AutoOpenBarrierOnPass, &s.ConfidenceThreshold, &s.RequirePaymentBeforeExit,
		&s.FreeMinutesGlobal, &s.MaxSessionHours, &s.AllowUnregisteredEntry, &s.PlateRecognitionEnabled,
		&s.DefaultFeeCurrency, &s.NotifyOnDisputed, &s.CapacityAlertThreshold, &s.EnforceAccessRules,
		&s.CreatedAt, &s.UpdatedAt)
	if err == nil {
		return s, nil
	}

	// Insert default settings
	err = h.db.Pool.QueryRow(ctx, `INSERT INTO dm3_parking.parking_settings
		(tenant_id, auto_open_barrier_on_pass, confidence_threshold, require_payment_before_exit,
		 free_minutes_global, max_session_hours, allow_unregistered_entry, plate_recognition_enabled,
		 default_fee_currency, notify_on_disputed, capacity_alert_threshold, enforce_access_rules)
		VALUES ($1::uuid, true, 0.85, true, 0, 24, true, true, 'VND', true, 80, false)
		ON CONFLICT (tenant_id) DO NOTHING
		RETURNING id, tenant_id, auto_open_barrier_on_pass, confidence_threshold, require_payment_before_exit,
		    free_minutes_global, max_session_hours, allow_unregistered_entry, plate_recognition_enabled,
		    default_fee_currency, notify_on_disputed, capacity_alert_threshold, enforce_access_rules, created_at, updated_at`, cid,
	).Scan(&s.ID, &s.TenantID, &s.AutoOpenBarrierOnPass, &s.ConfidenceThreshold, &s.RequirePaymentBeforeExit,
		&s.FreeMinutesGlobal, &s.MaxSessionHours, &s.AllowUnregisteredEntry, &s.PlateRecognitionEnabled,
		&s.DefaultFeeCurrency, &s.NotifyOnDisputed, &s.CapacityAlertThreshold, &s.EnforceAccessRules,
		&s.CreatedAt, &s.UpdatedAt)
	if err != nil {
		// ON CONFLICT might have fired; re-query
		err = h.db.Pool.QueryRow(ctx, `SELECT id, tenant_id, auto_open_barrier_on_pass, confidence_threshold,
			require_payment_before_exit, free_minutes_global, max_session_hours, allow_unregistered_entry,
			plate_recognition_enabled, default_fee_currency, notify_on_disputed, capacity_alert_threshold,
			enforce_access_rules, created_at, updated_at
			FROM dm3_parking.parking_settings WHERE tenant_id = $1::uuid`, cid,
		).Scan(&s.ID, &s.TenantID, &s.AutoOpenBarrierOnPass, &s.ConfidenceThreshold, &s.RequirePaymentBeforeExit,
			&s.FreeMinutesGlobal, &s.MaxSessionHours, &s.AllowUnregisteredEntry, &s.PlateRecognitionEnabled,
			&s.DefaultFeeCurrency, &s.NotifyOnDisputed, &s.CapacityAlertThreshold, &s.EnforceAccessRules,
			&s.CreatedAt, &s.UpdatedAt)
	}
	return s, err
}
