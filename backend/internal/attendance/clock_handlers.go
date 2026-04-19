package attendance

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/pkg/httputil"
)

// This file hosts the read-and-adjust surface on attendance_records. Clock-in
// and clock-out timestamps themselves are not ingested here — they arrive via
// device access events on the DEVICES NATS stream and are materialised by
// consumer.go. Managers can only GET records or PATCH them for manual fixes.

type adjustRequest struct {
	ClockIn          *string `json:"clock_in"`  // RFC3339 or "" to clear
	ClockOut         *string `json:"clock_out"` // RFC3339 or "" to clear
	Status           *string `json:"status"`    // override status
	ShiftID          *string `json:"shift_id"`  // reassign shift
	LeaveType        *string `json:"leave_type"`
	Notes            *string `json:"notes"`
	AdjustmentReason string  `json:"adjustment_reason"` // required
	Recalc           *bool   `json:"recalc"`            // default true
}

// ─── GetRecord ──────────────────────────────────────────────────────────────

// GetRecord returns one attendance record by id with user/shift joins.
//
// GET /api/v1/attendance/records/{id}
func (h *AttendanceHandlers) GetRecord(w http.ResponseWriter, r *http.Request) {
	tenantID := authsvc.CompanyIDFromContext(r.Context())
	if tenantID == "" {
		httputil.Error(w, http.StatusUnauthorized, "missing tenant context")
		return
	}
	id := chi.URLParam(r, "id")
	if id == "" {
		httputil.Error(w, http.StatusBadRequest, "record id required")
		return
	}
	rec, err := h.loadRecord(r.Context(), tenantID, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httputil.Error(w, http.StatusNotFound, "record not found")
			return
		}
		slog.Error("get record", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "failed to load record")
		return
	}
	httputil.JSON(w, http.StatusOK, rec)
}

// ─── AdjustRecord ───────────────────────────────────────────────────────────

// AdjustRecord lets managers manually edit clock_in/out, status, or shift on a
// record that was created from an access event. The rule engine re-runs
// unless `recalc=false` is explicitly set; manual_adjustment, adjusted_by,
// adjustment_reason are stamped.
//
// PATCH /api/v1/attendance/records/{id}
func (h *AttendanceHandlers) AdjustRecord(w http.ResponseWriter, r *http.Request) {
	tenantID := authsvc.CompanyIDFromContext(r.Context())
	if tenantID == "" {
		httputil.Error(w, http.StatusUnauthorized, "missing tenant context")
		return
	}
	claims := authsvc.ClaimsFromContext(r.Context())
	if claims == nil || claims.Sub == "" {
		httputil.Error(w, http.StatusUnauthorized, "missing user context")
		return
	}
	id := chi.URLParam(r, "id")
	if id == "" {
		httputil.Error(w, http.StatusBadRequest, "record id required")
		return
	}

	var req adjustRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if strings.TrimSpace(req.AdjustmentReason) == "" {
		httputil.Error(w, http.StatusBadRequest, "adjustment_reason is required")
		return
	}

	existing, err := h.loadRecord(r.Context(), tenantID, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httputil.Error(w, http.StatusNotFound, "record not found")
			return
		}
		slog.Error("adjust lookup", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "failed to load record")
		return
	}

	clockIn := existing.ClockIn
	clockOut := existing.ClockOut
	if req.ClockIn != nil {
		if *req.ClockIn == "" {
			clockIn = nil
		} else {
			t, err := time.Parse(time.RFC3339, *req.ClockIn)
			if err != nil {
				httputil.Error(w, http.StatusBadRequest, "clock_in must be RFC3339")
				return
			}
			clockIn = &t
		}
	}
	if req.ClockOut != nil {
		if *req.ClockOut == "" {
			clockOut = nil
		} else {
			t, err := time.Parse(time.RFC3339, *req.ClockOut)
			if err != nil {
				httputil.Error(w, http.StatusBadRequest, "clock_out must be RFC3339")
				return
			}
			clockOut = &t
		}
	}

	shiftID := existing.ShiftID
	if req.ShiftID != nil {
		if *req.ShiftID == "" {
			shiftID = nil
		} else {
			v := *req.ShiftID
			shiftID = &v
		}
	}

	shift, err := h.resolveShift(r.Context(), tenantID, shiftID)
	if err != nil {
		slog.Error("adjust: resolve shift", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "failed to resolve shift")
		return
	}

	recalc := true
	if req.Recalc != nil {
		recalc = *req.Recalc
	}

	status := existing.Status
	late := existing.LateMinutes
	early := existing.EarlyLeaveMinutes
	var total, reg, ot *float64 = existing.TotalHours, existing.RegularHours, existing.OvertimeHours
	var breakMin *int = existing.BreakMinutes

	if recalc {
		calc := computeRecord(clockIn, clockOut, shift)
		status = calc.Status
		late = calc.LateMinutes
		early = calc.EarlyLeaveMinutes
		t, rg, o := calc.TotalHours, calc.RegularHours, calc.OvertimeHours
		total, reg, ot = &t, &rg, &o
		bm := calc.BreakMinutes
		breakMin = &bm
	}
	if req.Status != nil && *req.Status != "" {
		status = *req.Status
	}

	update := `
		UPDATE dm3_attendance.attendance_records SET
			clock_in             = $1,
			clock_out            = $2,
			shift_id             = $3,
			status               = $4,
			late_minutes         = $5,
			early_leave_minutes  = $6,
			total_hours          = $7,
			regular_hours        = $8,
			overtime_hours       = $9,
			break_minutes        = $10,
			leave_type           = COALESCE($11, leave_type),
			notes                = COALESCE($12, notes),
			manual_adjustment    = true,
			adjusted_by          = $13::uuid,
			adjustment_reason    = $14,
			updated_at           = now()
		 WHERE id = $15::uuid AND tenant_id = $16::uuid
	`
	if _, err := h.db.Pool.Exec(r.Context(), update,
		clockIn, clockOut, strPtr(shiftID),
		status, late, early,
		total, reg, ot, breakMin,
		strPtr(req.LeaveType), strPtr(req.Notes),
		claims.Sub, req.AdjustmentReason,
		id, tenantID,
	); err != nil {
		slog.Error("adjust update", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "failed to adjust record")
		return
	}

	rec, err := h.loadRecord(r.Context(), tenantID, id)
	if err != nil {
		slog.Error("adjust reload", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "failed to reload record")
		return
	}
	h.audit.LogFromRequest(r, "attendance.record_adjusted", "attendance_record", id,
		existing.UserName, "success",
		map[string]any{
			"clock_in":  existing.ClockIn,
			"clock_out": existing.ClockOut,
			"status":    existing.Status,
			"shift_id":  existing.ShiftID,
		},
		map[string]any{
			"clock_in":          clockIn,
			"clock_out":         clockOut,
			"status":            status,
			"shift_id":          shiftID,
			"adjustment_reason": req.AdjustmentReason,
			"recalc":            recalc,
		})
	httputil.JSON(w, http.StatusOK, rec)
}

// ─── Shared helpers (also used by the consumer) ────────────────────────────

// loadRecord fetches one record with the joins ListRecords uses.
func (h *AttendanceHandlers) loadRecord(ctx context.Context, tenantID, id string) (*AttendanceRecord, error) {
	const sql = `
		SELECT
			ar.id::text, ar.tenant_id::text, ar.site_id::text, ar.user_id::text,
			ar.date, ar.shift_id::text,
			ar.clock_in, ar.clock_in_device_id::text, ar.clock_in_method, ar.clock_in_photo_ref,
			ar.clock_out, ar.clock_out_device_id::text, ar.clock_out_method, ar.clock_out_photo_ref,
			ar.status, ar.total_hours, ar.regular_hours, ar.overtime_hours,
			ar.late_minutes, ar.early_leave_minutes, ar.break_minutes,
			ar.overtime_approved, ar.overtime_approved_by::text,
			ar.manual_adjustment, ar.adjusted_by::text, ar.adjustment_reason,
			ar.leave_type, ar.leave_reference_id, ar.notes,
			ar.created_at, ar.updated_at,
			COALESCE(NULLIF(TRIM(u.first_name || ' ' || u.last_name), ''), '') AS user_name,
			COALESCE(u.email, '') AS user_email,
			COALESCE(s.name, '') AS shift_name,
			COALESCE(to_char(s.start_time, 'HH24:MI'), '') AS shift_start,
			COALESCE(to_char(s.end_time,   'HH24:MI'), '') AS shift_end
		  FROM dm3_attendance.attendance_records ar
		  LEFT JOIN dm3_identity.users u ON u.id = ar.user_id AND u.tenant_id = ar.tenant_id
		  LEFT JOIN dm3_attendance.shifts s ON s.id = ar.shift_id AND s.tenant_id = ar.tenant_id
		 WHERE ar.id = $1::uuid AND ar.tenant_id = $2::uuid
	`
	var rec AttendanceRecord
	var siteIDStr, shiftIDStr, clockInDev, clockOutDev, otApprBy, adjBy *string
	err := h.db.Pool.QueryRow(ctx, sql, id, tenantID).Scan(
		&rec.ID, &rec.TenantID, &siteIDStr, &rec.UserID,
		&rec.Date, &shiftIDStr,
		&rec.ClockIn, &clockInDev, &rec.ClockInMethod, &rec.ClockInPhotoRef,
		&rec.ClockOut, &clockOutDev, &rec.ClockOutMethod, &rec.ClockOutPhotoRef,
		&rec.Status, &rec.TotalHours, &rec.RegularHours, &rec.OvertimeHours,
		&rec.LateMinutes, &rec.EarlyLeaveMinutes, &rec.BreakMinutes,
		&rec.OvertimeApproved, &otApprBy,
		&rec.ManualAdjustment, &adjBy, &rec.AdjustmentReason,
		&rec.LeaveType, &rec.LeaveReferenceID, &rec.Notes,
		&rec.CreatedAt, &rec.UpdatedAt,
		&rec.UserName, &rec.UserEmail,
		&rec.ShiftName, &rec.ShiftStart, &rec.ShiftEnd,
	)
	if err != nil {
		return nil, err
	}
	rec.SiteID = siteIDStr
	rec.ShiftID = shiftIDStr
	rec.ClockInDeviceID = clockInDev
	rec.ClockOutDeviceID = clockOutDev
	rec.OvertimeApprovedBy = otApprBy
	rec.AdjustedBy = adjBy
	return &rec, nil
}

// resolveShift returns the explicit shift if provided, otherwise the tenant's
// default shift (status=active, is_default=true). Returns (nil, nil) when no
// shift matches — callers must tolerate that since small tenants run without
// shifts at all.
func (h *AttendanceHandlers) resolveShift(ctx context.Context, tenantID string, explicitID *string) (*Shift, error) {
	return loadShift(ctx, h.db.Pool, tenantID, explicitID)
}

func strPtr(p *string) any {
	if p == nil {
		return nil
	}
	return *p
}
