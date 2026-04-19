package attendance

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/jackc/pgx/v5"

	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/pkg/httputil"
)

// settingsPayload mirrors AttendanceSettings for PUT requests. All fields are
// optional — the upsert merges partial input with stored defaults.
type settingsPayload struct {
	DefaultGraceMinutes        *int     `json:"default_grace_minutes"`
	DefaultEarlyLeaveThreshold *int     `json:"default_early_leave_threshold"`
	OvertimeThresholdMinutes   *int     `json:"overtime_threshold_minutes"`
	OvertimeRequiresApproval   *bool    `json:"overtime_requires_approval"`
	AutoClockoutHours          *int     `json:"auto_clockout_hours"`
	WorkweekStart              *int     `json:"workweek_start"`
	Timezone                   *string  `json:"timezone"`
	CarryoverEnabled           *bool    `json:"carryover_enabled"`
	CarryoverMaxDays           *float64 `json:"carryover_max_days"`
}

// GetSettings returns the tenant's attendance settings row, lazily creating
// a default row on first read so GET is always idempotent.
func (h *AttendanceHandlers) GetSettings(w http.ResponseWriter, r *http.Request) {
	tenantID := authsvc.CompanyIDFromContext(r.Context())
	if tenantID == "" {
		httputil.Error(w, http.StatusUnauthorized, "missing tenant context")
		return
	}

	s, err := h.loadSettings(r, tenantID)
	if err != nil {
		slog.Error("get attendance settings", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "failed to load settings")
		return
	}
	httputil.JSON(w, http.StatusOK, s)
}

// UpdateSettings upserts the tenant's settings row. Unknown/unset fields keep
// the existing value (or default on first write).
func (h *AttendanceHandlers) UpdateSettings(w http.ResponseWriter, r *http.Request) {
	tenantID := authsvc.CompanyIDFromContext(r.Context())
	if tenantID == "" {
		httputil.Error(w, http.StatusUnauthorized, "missing tenant context")
		return
	}

	var req settingsPayload
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if req.WorkweekStart != nil && (*req.WorkweekStart < 1 || *req.WorkweekStart > 7) {
		httputil.Error(w, http.StatusBadRequest, "workweek_start must be 1..7")
		return
	}
	if req.CarryoverMaxDays != nil && *req.CarryoverMaxDays < 0 {
		httputil.Error(w, http.StatusBadRequest, "carryover_max_days must be >= 0")
		return
	}

	// Ensure a base row exists, then apply partial updates.
	if _, err := h.loadSettings(r, tenantID); err != nil {
		slog.Error("load settings before update", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "failed to update settings")
		return
	}

	_, err := h.db.Pool.Exec(r.Context(), `
		UPDATE dm3_attendance.attendance_settings SET
			default_grace_minutes         = COALESCE($2, default_grace_minutes),
			default_early_leave_threshold = COALESCE($3, default_early_leave_threshold),
			overtime_threshold_minutes    = COALESCE($4, overtime_threshold_minutes),
			overtime_requires_approval    = COALESCE($5, overtime_requires_approval),
			auto_clockout_hours           = COALESCE($6, auto_clockout_hours),
			workweek_start                = COALESCE($7, workweek_start),
			timezone                      = COALESCE(NULLIF($8,''), timezone),
			carryover_enabled             = COALESCE($9, carryover_enabled),
			carryover_max_days            = COALESCE($10, carryover_max_days)
		WHERE tenant_id = $1::uuid`,
		tenantID,
		req.DefaultGraceMinutes,
		req.DefaultEarlyLeaveThreshold,
		req.OvertimeThresholdMinutes,
		req.OvertimeRequiresApproval,
		req.AutoClockoutHours,
		req.WorkweekStart,
		nullStr(req.Timezone),
		req.CarryoverEnabled,
		req.CarryoverMaxDays,
	)
	if err != nil {
		slog.Error("update attendance settings", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "failed to update settings")
		return
	}

	s, err := h.loadSettings(r, tenantID)
	if err != nil {
		slog.Error("reload settings after update", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "failed to reload settings")
		return
	}
	httputil.JSON(w, http.StatusOK, s)
}

// loadSettings fetches the tenant's row, inserting defaults if none exists.
func (h *AttendanceHandlers) loadSettings(r *http.Request, tenantID string) (*AttendanceSettings, error) {
	var s AttendanceSettings
	err := h.db.Pool.QueryRow(r.Context(), `
		SELECT tenant_id::text, default_grace_minutes, default_early_leave_threshold,
		       overtime_threshold_minutes, overtime_requires_approval, auto_clockout_hours,
		       workweek_start, timezone, carryover_enabled, carryover_max_days,
		       created_at, updated_at
		  FROM dm3_attendance.attendance_settings
		 WHERE tenant_id = $1::uuid`, tenantID).Scan(
		&s.TenantID, &s.DefaultGraceMinutes, &s.DefaultEarlyLeaveThreshold,
		&s.OvertimeThresholdMinutes, &s.OvertimeRequiresApproval, &s.AutoClockoutHours,
		&s.WorkweekStart, &s.Timezone, &s.CarryoverEnabled, &s.CarryoverMaxDays,
		&s.CreatedAt, &s.UpdatedAt,
	)
	if err == nil {
		return &s, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}

	// First-touch: insert defaults.
	_, err = h.db.Pool.Exec(r.Context(), `
		INSERT INTO dm3_attendance.attendance_settings (tenant_id)
		VALUES ($1::uuid)
		ON CONFLICT (tenant_id) DO NOTHING`, tenantID)
	if err != nil {
		return nil, err
	}

	err = h.db.Pool.QueryRow(r.Context(), `
		SELECT tenant_id::text, default_grace_minutes, default_early_leave_threshold,
		       overtime_threshold_minutes, overtime_requires_approval, auto_clockout_hours,
		       workweek_start, timezone, carryover_enabled, carryover_max_days,
		       created_at, updated_at
		  FROM dm3_attendance.attendance_settings
		 WHERE tenant_id = $1::uuid`, tenantID).Scan(
		&s.TenantID, &s.DefaultGraceMinutes, &s.DefaultEarlyLeaveThreshold,
		&s.OvertimeThresholdMinutes, &s.OvertimeRequiresApproval, &s.AutoClockoutHours,
		&s.WorkweekStart, &s.Timezone, &s.CarryoverEnabled, &s.CarryoverMaxDays,
		&s.CreatedAt, &s.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &s, nil
}
