package attendance

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/pkg/httputil"
)

// ─── Request shapes ─────────────────────────────────────────────────────────

type shiftRequest struct {
	Name                     string   `json:"name"`
	Code                     *string  `json:"code"`
	SiteID                   *string  `json:"site_id"`
	StartTime                string   `json:"start_time"` // HH:MM or HH:MM:SS
	EndTime                  string   `json:"end_time"`
	GracePeriodMinutes       *int     `json:"grace_period_minutes"`
	EarlyLeaveThreshold      *int     `json:"early_leave_threshold"`
	BreakStart               *string  `json:"break_start"`
	BreakEnd                 *string  `json:"break_end"`
	BreakDeducted            *bool    `json:"break_deducted"`
	OvertimeThresholdMinutes *int     `json:"overtime_threshold_minutes"`
	MaxOvertimeHours         *float64 `json:"max_overtime_hours"`
	WorkingDays              []int32  `json:"working_days"`
	Color                    *string  `json:"color"`
	IsDefault                *bool    `json:"is_default"`
	Status                   *string  `json:"status"`
}

func (req *shiftRequest) validate(forUpdate bool) error {
	if !forUpdate {
		if strings.TrimSpace(req.Name) == "" {
			return httpError{http.StatusBadRequest, "name is required"}
		}
		if req.StartTime == "" || req.EndTime == "" {
			return httpError{http.StatusBadRequest, "start_time and end_time are required"}
		}
	}
	if req.Status != nil {
		s := *req.Status
		if s != "active" && s != "archived" {
			return httpError{http.StatusBadRequest, "status must be 'active' or 'archived'"}
		}
	}
	for _, d := range req.WorkingDays {
		if d < 1 || d > 7 {
			return httpError{http.StatusBadRequest, "working_days must be in 1..7 (Mon..Sun)"}
		}
	}
	return nil
}

// httpError carries a status code next to a message so handlers can centralise
// error-response writing without building their own error type per request.
type httpError struct {
	code int
	msg  string
}

func (e httpError) Error() string { return e.msg }

// ─── List ───────────────────────────────────────────────────────────────────

// ListShifts returns shifts for the caller's tenant. Default is active only
// unless `?status=archived` or `?status=all` is passed.
func (h *AttendanceHandlers) ListShifts(w http.ResponseWriter, r *http.Request) {
	tenantID := authsvc.CompanyIDFromContext(r.Context())
	if tenantID == "" {
		httputil.Error(w, http.StatusUnauthorized, "missing tenant context")
		return
	}

	statusFilter := r.URL.Query().Get("status")
	siteID := r.URL.Query().Get("site_id")
	search := r.URL.Query().Get("search")
	page, limit := parsePagination(r)
	offset := (page - 1) * limit

	args := []any{tenantID}
	where := `tenant_id = $1::uuid`
	idx := 2
	switch statusFilter {
	case "", "active":
		where += " AND status = 'active'"
	case "archived":
		where += " AND status = 'archived'"
	case "all":
		// no filter
	default:
		httputil.Error(w, http.StatusBadRequest, "invalid status filter")
		return
	}
	if siteID != "" {
		where += " AND site_id = $" + strconv.Itoa(idx) + "::uuid"
		args = append(args, siteID)
		idx++
	}
	if search != "" {
		where += " AND (name ILIKE $" + strconv.Itoa(idx) + " OR COALESCE(code,'') ILIKE $" + strconv.Itoa(idx) + ")"
		args = append(args, "%"+search+"%")
		idx++
	}

	var total int64
	if err := h.db.Pool.QueryRow(r.Context(),
		`SELECT COUNT(*) FROM dm3_attendance.shifts WHERE `+where, args...).Scan(&total); err != nil {
		slog.Error("count shifts", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "failed to count shifts")
		return
	}

	listArgs := append(append([]any{}, args...), limit, offset)
	rows, err := h.db.Pool.Query(r.Context(), `
		SELECT id::text, tenant_id::text, site_id::text, name, code,
		       to_char(start_time, 'HH24:MI:SS'), to_char(end_time, 'HH24:MI:SS'),
		       grace_period_minutes, early_leave_threshold,
		       to_char(break_start, 'HH24:MI:SS'), to_char(break_end, 'HH24:MI:SS'),
		       break_deducted, overtime_threshold_minutes, max_overtime_hours,
		       working_days, color, is_default, status, created_at, updated_at
		  FROM dm3_attendance.shifts
		 WHERE `+where+`
		 ORDER BY is_default DESC, name ASC
		 LIMIT $`+strconv.Itoa(idx)+` OFFSET $`+strconv.Itoa(idx+1), listArgs...)
	if err != nil {
		slog.Error("list shifts", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "failed to list shifts")
		return
	}
	defer rows.Close()

	shifts := make([]Shift, 0)
	for rows.Next() {
		var s Shift
		var siteIDStr, code, breakStart, breakEnd *string
		if err := rows.Scan(
			&s.ID, &s.TenantID, &siteIDStr, &s.Name, &code,
			&s.StartTime, &s.EndTime,
			&s.GracePeriodMinutes, &s.EarlyLeaveThreshold,
			&breakStart, &breakEnd,
			&s.BreakDeducted, &s.OvertimeThresholdMinutes, &s.MaxOvertimeHours,
			&s.WorkingDays, &s.Color, &s.IsDefault, &s.Status, &s.CreatedAt, &s.UpdatedAt,
		); err != nil {
			slog.Error("scan shift", "error", err)
			httputil.Error(w, http.StatusInternalServerError, "failed to scan shift")
			return
		}
		s.SiteID = siteIDStr
		s.Code = code
		s.BreakStart = breakStart
		s.BreakEnd = breakEnd
		shifts = append(shifts, s)
	}
	if rows.Err() != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to iterate shifts")
		return
	}

	httputil.Paginated(w, shifts, total, page, limit)
}

// ─── Get ────────────────────────────────────────────────────────────────────

// GetShift returns a single shift by ID.
func (h *AttendanceHandlers) GetShift(w http.ResponseWriter, r *http.Request) {
	tenantID := authsvc.CompanyIDFromContext(r.Context())
	if tenantID == "" {
		httputil.Error(w, http.StatusUnauthorized, "missing tenant context")
		return
	}
	shiftID := chi.URLParam(r, "id")
	if shiftID == "" {
		httputil.Error(w, http.StatusBadRequest, "shift id required")
		return
	}

	var s Shift
	var siteIDStr, code, breakStart, breakEnd *string
	err := h.db.Pool.QueryRow(r.Context(), `
		SELECT id::text, tenant_id::text, site_id::text, name, code,
		       to_char(start_time, 'HH24:MI:SS'), to_char(end_time, 'HH24:MI:SS'),
		       grace_period_minutes, early_leave_threshold,
		       to_char(break_start, 'HH24:MI:SS'), to_char(break_end, 'HH24:MI:SS'),
		       break_deducted, overtime_threshold_minutes, max_overtime_hours,
		       working_days, color, is_default, status, created_at, updated_at
		  FROM dm3_attendance.shifts
		 WHERE id = $1::uuid AND tenant_id = $2::uuid`,
		shiftID, tenantID).Scan(
		&s.ID, &s.TenantID, &siteIDStr, &s.Name, &code,
		&s.StartTime, &s.EndTime,
		&s.GracePeriodMinutes, &s.EarlyLeaveThreshold,
		&breakStart, &breakEnd,
		&s.BreakDeducted, &s.OvertimeThresholdMinutes, &s.MaxOvertimeHours,
		&s.WorkingDays, &s.Color, &s.IsDefault, &s.Status, &s.CreatedAt, &s.UpdatedAt,
	)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "shift not found")
		return
	}
	s.SiteID = siteIDStr
	s.Code = code
	s.BreakStart = breakStart
	s.BreakEnd = breakEnd
	httputil.JSON(w, http.StatusOK, s)
}

// ─── Create ─────────────────────────────────────────────────────────────────

// CreateShift inserts a new shift.
func (h *AttendanceHandlers) CreateShift(w http.ResponseWriter, r *http.Request) {
	tenantID := authsvc.CompanyIDFromContext(r.Context())
	if tenantID == "" {
		httputil.Error(w, http.StatusUnauthorized, "missing tenant context")
		return
	}
	var req shiftRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if err := req.validate(false); err != nil {
		if he, ok := err.(httpError); ok {
			httputil.Error(w, he.code, he.msg)
			return
		}
		httputil.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	// Defaults
	grace := 15
	if req.GracePeriodMinutes != nil {
		grace = *req.GracePeriodMinutes
	}
	earlyLeave := 15
	if req.EarlyLeaveThreshold != nil {
		earlyLeave = *req.EarlyLeaveThreshold
	}
	breakDeducted := true
	if req.BreakDeducted != nil {
		breakDeducted = *req.BreakDeducted
	}
	overtimeThreshold := 30
	if req.OvertimeThresholdMinutes != nil {
		overtimeThreshold = *req.OvertimeThresholdMinutes
	}
	maxOT := 4.0
	if req.MaxOvertimeHours != nil {
		maxOT = *req.MaxOvertimeHours
	}
	workingDays := []int32{1, 2, 3, 4, 5}
	if len(req.WorkingDays) > 0 {
		workingDays = req.WorkingDays
	}
	color := "#3B82F6"
	if req.Color != nil && *req.Color != "" {
		color = *req.Color
	}
	isDefault := false
	if req.IsDefault != nil {
		isDefault = *req.IsDefault
	}
	status := "active"
	if req.Status != nil && *req.Status != "" {
		status = *req.Status
	}

	// If isDefault=true, unset any existing default in the same tenant first.
	if isDefault {
		if _, err := h.db.Pool.Exec(r.Context(),
			`UPDATE dm3_attendance.shifts SET is_default = false
			  WHERE tenant_id = $1::uuid AND is_default = true`, tenantID); err != nil {
			slog.Error("clear default shift", "error", err)
			httputil.Error(w, http.StatusInternalServerError, "failed to create shift")
			return
		}
	}

	var id string
	err := h.db.Pool.QueryRow(r.Context(), `
		INSERT INTO dm3_attendance.shifts (
			tenant_id, site_id, name, code, start_time, end_time,
			grace_period_minutes, early_leave_threshold,
			break_start, break_end, break_deducted,
			overtime_threshold_minutes, max_overtime_hours,
			working_days, color, is_default, status
		) VALUES (
			$1::uuid, NULLIF($2,'')::uuid, $3, $4, $5::time, $6::time,
			$7, $8,
			NULLIF($9,'')::time, NULLIF($10,'')::time, $11,
			$12, $13,
			$14, $15, $16, $17
		) RETURNING id::text`,
		tenantID, nullStr(req.SiteID), req.Name, nullStr(req.Code), req.StartTime, req.EndTime,
		grace, earlyLeave,
		nullStr(req.BreakStart), nullStr(req.BreakEnd), breakDeducted,
		overtimeThreshold, maxOT,
		workingDays, color, isDefault, status,
	).Scan(&id)
	if err != nil {
		slog.Error("create shift", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "failed to create shift")
		return
	}

	h.audit.LogFromRequest(r, "attendance.shift_created", "shift", id,
		req.Name, "success", nil, map[string]any{
			"name":         req.Name,
			"code":         nullStr(req.Code),
			"site_id":      nullStr(req.SiteID),
			"start_time":   req.StartTime,
			"end_time":     req.EndTime,
			"working_days": workingDays,
			"is_default":   isDefault,
			"status":       status,
		})
	httputil.JSON(w, http.StatusCreated, map[string]string{"id": id})
}

// ─── Update ─────────────────────────────────────────────────────────────────

// UpdateShift edits an existing shift. All fields are optional; only supplied
// ones are written.
func (h *AttendanceHandlers) UpdateShift(w http.ResponseWriter, r *http.Request) {
	tenantID := authsvc.CompanyIDFromContext(r.Context())
	if tenantID == "" {
		httputil.Error(w, http.StatusUnauthorized, "missing tenant context")
		return
	}
	shiftID := chi.URLParam(r, "id")
	if shiftID == "" {
		httputil.Error(w, http.StatusBadRequest, "shift id required")
		return
	}

	var req shiftRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if err := req.validate(true); err != nil {
		if he, ok := err.(httpError); ok {
			httputil.Error(w, he.code, he.msg)
			return
		}
		httputil.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	// Build SET clause dynamically.
	sets := []string{}
	args := []any{}
	idx := 1
	add := func(expr string, v any) {
		sets = append(sets, expr+" = $"+strconv.Itoa(idx))
		args = append(args, v)
		idx++
	}
	if req.Name != "" {
		add("name", req.Name)
	}
	if req.Code != nil {
		add("code", nullStr(req.Code))
	}
	if req.SiteID != nil {
		if *req.SiteID == "" {
			sets = append(sets, "site_id = NULL")
		} else {
			add("site_id", *req.SiteID)
		}
	}
	if req.StartTime != "" {
		add("start_time", req.StartTime)
	}
	if req.EndTime != "" {
		add("end_time", req.EndTime)
	}
	if req.GracePeriodMinutes != nil {
		add("grace_period_minutes", *req.GracePeriodMinutes)
	}
	if req.EarlyLeaveThreshold != nil {
		add("early_leave_threshold", *req.EarlyLeaveThreshold)
	}
	if req.BreakStart != nil {
		add("break_start", nullStr(req.BreakStart))
	}
	if req.BreakEnd != nil {
		add("break_end", nullStr(req.BreakEnd))
	}
	if req.BreakDeducted != nil {
		add("break_deducted", *req.BreakDeducted)
	}
	if req.OvertimeThresholdMinutes != nil {
		add("overtime_threshold_minutes", *req.OvertimeThresholdMinutes)
	}
	if req.MaxOvertimeHours != nil {
		add("max_overtime_hours", *req.MaxOvertimeHours)
	}
	if req.WorkingDays != nil {
		add("working_days", req.WorkingDays)
	}
	if req.Color != nil && *req.Color != "" {
		add("color", *req.Color)
	}
	if req.Status != nil && *req.Status != "" {
		add("status", *req.Status)
	}
	if req.IsDefault != nil && *req.IsDefault {
		if _, err := h.db.Pool.Exec(r.Context(),
			`UPDATE dm3_attendance.shifts SET is_default = false
			  WHERE tenant_id = $1::uuid AND is_default = true AND id <> $2::uuid`,
			tenantID, shiftID); err != nil {
			slog.Error("clear default shift", "error", err)
			httputil.Error(w, http.StatusInternalServerError, "failed to update shift")
			return
		}
		add("is_default", true)
	} else if req.IsDefault != nil {
		add("is_default", false)
	}

	if len(sets) == 0 {
		httputil.Error(w, http.StatusBadRequest, "no fields to update")
		return
	}

	args = append(args, shiftID, tenantID)
	sql := "UPDATE dm3_attendance.shifts SET " +
		strings.Join(sets, ", ") +
		" WHERE id = $" + strconv.Itoa(idx) + "::uuid AND tenant_id = $" + strconv.Itoa(idx+1) + "::uuid"

	ct, err := h.db.Pool.Exec(r.Context(), sql, args...)
	if err != nil {
		slog.Error("update shift", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "failed to update shift")
		return
	}
	if ct.RowsAffected() == 0 {
		httputil.Error(w, http.StatusNotFound, "shift not found")
		return
	}

	h.audit.LogFromRequest(r, "attendance.shift_updated", "shift", shiftID,
		req.Name, "success", nil, req)
	httputil.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// ─── Archive / Delete ──────────────────────────────────────────────────────

// ArchiveShift soft-deletes a shift by flipping its status to 'archived'.
// We never hard-delete because shift_assignments / attendance_records may
// reference the shift row.
func (h *AttendanceHandlers) ArchiveShift(w http.ResponseWriter, r *http.Request) {
	tenantID := authsvc.CompanyIDFromContext(r.Context())
	if tenantID == "" {
		httputil.Error(w, http.StatusUnauthorized, "missing tenant context")
		return
	}
	shiftID := chi.URLParam(r, "id")
	ct, err := h.db.Pool.Exec(r.Context(),
		`UPDATE dm3_attendance.shifts
		    SET status = 'archived', is_default = false
		  WHERE id = $1::uuid AND tenant_id = $2::uuid AND status = 'active'`,
		shiftID, tenantID)
	if err != nil {
		slog.Error("archive shift", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "failed to archive shift")
		return
	}
	if ct.RowsAffected() == 0 {
		httputil.Error(w, http.StatusNotFound, "shift not found or already archived")
		return
	}
	h.audit.LogFromRequest(r, "attendance.shift_archived", "shift", shiftID,
		"", "success",
		map[string]any{"status": "active"},
		map[string]any{"status": "archived"})
	httputil.JSON(w, http.StatusOK, map[string]string{"status": "archived"})
}

// nullStr converts an empty-or-nil *string to "" for NULLIF-guarded columns.
func nullStr(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}
