package attendance

import (
	"net/http"
	"time"

	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/pkg/httputil"
)

// me_handlers.go implements self-service endpoints that report the authenticated
// user's own attendance and leave state. All queries are tenant-scoped *and*
// user-scoped via claims.Sub so an employee can only see their own data.
//
// The window defaults to the last 30 days when from/to are not supplied so a
// dashboard card can just GET /me/attendance with no params.

// MeAttendanceSummary is the count/aggregate strip rendered above the record list.
type MeAttendanceSummary struct {
	From         string  `json:"from"`
	To           string  `json:"to"`
	OnTime       int     `json:"on_time"`
	Late         int     `json:"late"`
	Absent       int     `json:"absent"`
	OnLeave      int     `json:"on_leave"`
	HalfDay      int     `json:"half_day"`
	Holiday      int     `json:"holiday"`
	Pending      int     `json:"pending"`
	TotalHours   float64 `json:"total_hours"`
	RegularHours float64 `json:"regular_hours"`
	OTHours      float64 `json:"ot_hours"`
	LateMinutes  int     `json:"late_minutes"`
}

// MeAttendanceToday snapshots today's record so the UI can show a clock card.
// Nil when the user has no record for today yet.
type MeAttendanceToday struct {
	Date      string     `json:"date"`
	Status    string     `json:"status"`
	ClockIn   *time.Time `json:"clock_in,omitempty"`
	ClockOut  *time.Time `json:"clock_out,omitempty"`
	ShiftName string     `json:"shift_name,omitempty"`
	ShiftStart string    `json:"shift_start,omitempty"`
	ShiftEnd   string    `json:"shift_end,omitempty"`
	TotalHours *float64  `json:"total_hours,omitempty"`
}

// MeAttendanceResponse is the envelope returned by GET /me/attendance.
type MeAttendanceResponse struct {
	UserID  string              `json:"user_id"`
	Today   *MeAttendanceToday  `json:"today,omitempty"`
	Summary MeAttendanceSummary `json:"summary"`
	Records []AttendanceRecord  `json:"records"`
}

// MeAttendance returns the authenticated user's attendance over a date window.
//
// @Summary      My attendance
// @Description  Plugin-gated (attendance). Returns the caller's own attendance records over the requested window.
// @Tags         Attendance
// @Produce      json
// @Param        from  query  string  false  "ISO date (YYYY-MM-DD) start of window. Defaults to first day of current month."
// @Param        to    query  string  false  "ISO date (YYYY-MM-DD) end of window. Defaults to today."
// @Success      200  {object}  map[string]interface{}
// @Failure      401  {object}  httputil.ErrorResponse
// @Router       /attendance/me/attendance [get]
// @Security     BearerAuth
func (h *AttendanceHandlers) MeAttendance(w http.ResponseWriter, r *http.Request) {
	tenantID := authsvc.CompanyIDFromContext(r.Context())
	claims := authsvc.ClaimsFromContext(r.Context())
	if tenantID == "" || claims == nil || claims.Sub == "" {
		httputil.Error(w, http.StatusUnauthorized, "missing auth context")
		return
	}

	q := r.URL.Query()
	fromStr := q.Get("from")
	toStr := q.Get("to")
	if toStr == "" {
		toStr = time.Now().UTC().Format("2006-01-02")
	}
	if fromStr == "" {
		from, _ := time.Parse("2006-01-02", toStr)
		fromStr = from.AddDate(0, 0, -29).Format("2006-01-02")
	}
	if _, err := time.Parse("2006-01-02", fromStr); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid from (expected YYYY-MM-DD)")
		return
	}
	if _, err := time.Parse("2006-01-02", toStr); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid to (expected YYYY-MM-DD)")
		return
	}

	records, err := h.fetchMeRecords(r, tenantID, claims.Sub, fromStr, toStr)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to list attendance: "+err.Error())
		return
	}

	summary := MeAttendanceSummary{From: fromStr, To: toStr}
	for _, rec := range records {
		switch rec.Status {
		case "on_time":
			summary.OnTime++
		case "late":
			summary.Late++
		case "absent":
			summary.Absent++
		case "on_leave":
			summary.OnLeave++
		case "half_day":
			summary.HalfDay++
		case "holiday":
			summary.Holiday++
		case "pending":
			summary.Pending++
		}
		if rec.TotalHours != nil {
			summary.TotalHours += *rec.TotalHours
		}
		if rec.RegularHours != nil {
			summary.RegularHours += *rec.RegularHours
		}
		if rec.OvertimeHours != nil {
			summary.OTHours += *rec.OvertimeHours
		}
		summary.LateMinutes += rec.LateMinutes
	}

	today := time.Now().UTC().Format("2006-01-02")
	var todaySnap *MeAttendanceToday
	for i := range records {
		rec := records[i]
		if rec.Date.Format("2006-01-02") == today {
			snap := MeAttendanceToday{
				Date:       today,
				Status:     rec.Status,
				ClockIn:    rec.ClockIn,
				ClockOut:   rec.ClockOut,
				ShiftName:  rec.ShiftName,
				ShiftStart: rec.ShiftStart,
				ShiftEnd:   rec.ShiftEnd,
				TotalHours: rec.TotalHours,
			}
			todaySnap = &snap
			break
		}
	}

	httputil.JSON(w, http.StatusOK, MeAttendanceResponse{
		UserID:  claims.Sub,
		Today:   todaySnap,
		Summary: summary,
		Records: records,
	})
}

// fetchMeRecords returns the caller's attendance rows in [from,to] sorted by
// date DESC. Mirrors the shape ListRecords produces (shift + user joins) so
// the frontend can reuse AttendanceRecordDTO.
func (h *AttendanceHandlers) fetchMeRecords(
	r *http.Request,
	tenantID, userID, from, to string,
) ([]AttendanceRecord, error) {
	const listSQL = `
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
		 WHERE ar.tenant_id = $1::uuid AND ar.user_id = $2::uuid
		   AND ar.date >= $3::date AND ar.date <= $4::date
		 ORDER BY ar.date DESC, ar.clock_in NULLS LAST
		 LIMIT 200`

	rows, err := h.db.Pool.Query(r.Context(), listSQL, tenantID, userID, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	records := make([]AttendanceRecord, 0, 32)
	for rows.Next() {
		var rec AttendanceRecord
		var siteIDStr, shiftIDStr, clockInDev, clockOutDev, otApprBy, adjBy *string
		if err := rows.Scan(
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
		); err != nil {
			return nil, err
		}
		rec.SiteID = siteIDStr
		rec.ShiftID = shiftIDStr
		rec.ClockInDeviceID = clockInDev
		rec.ClockOutDeviceID = clockOutDev
		rec.OvertimeApprovedBy = otApprBy
		rec.AdjustedBy = adjBy
		records = append(records, rec)
	}
	if rows.Err() != nil {
		return nil, rows.Err()
	}
	return records, nil
}
