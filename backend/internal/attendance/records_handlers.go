package attendance

import (
	"net/http"
	"strconv"
	"time"

	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/pkg/httputil"
)

// ListRecords serves GET /api/v1/attendance/records.
// Query params:
//
//	date        YYYY-MM-DD (default: today in UTC) — ignored if `from`/`to` set
//	from, to    YYYY-MM-DD window — when either is supplied the single-date
//	            branch is skipped and records in [from,to] are returned
//	user_id     UUID — narrow to one person (used by the person detail page)
//	site_id     UUID (optional)
//	status      one of status constants (optional; repeatable not supported)
//	search      substring match against users.name / users.email
//	page, limit pagination (defaults 1/20; limit cap 200)
//
// The response is the standard PaginatedResponse envelope, with each row
// joined against dm3_identity.users so the UI can render name/email without
// a second round trip. Shift columns come from shift_assignments → shifts.
func (h *AttendanceHandlers) ListRecords(w http.ResponseWriter, r *http.Request) {
	tenantID := authsvc.CompanyIDFromContext(r.Context())
	if tenantID == "" {
		httputil.Error(w, http.StatusUnauthorized, "missing tenant context")
		return
	}

	q := r.URL.Query()

	args := []any{tenantID}
	where := `ar.tenant_id = $1::uuid`
	idx := 2

	fromStr := q.Get("from")
	toStr := q.Get("to")
	if fromStr != "" || toStr != "" {
		if fromStr != "" {
			if _, err := time.Parse("2006-01-02", fromStr); err != nil {
				httputil.Error(w, http.StatusBadRequest, "invalid from (expected YYYY-MM-DD)")
				return
			}
			where += ` AND ar.date >= $` + strconv.Itoa(idx) + `::date`
			args = append(args, fromStr)
			idx++
		}
		if toStr != "" {
			if _, err := time.Parse("2006-01-02", toStr); err != nil {
				httputil.Error(w, http.StatusBadRequest, "invalid to (expected YYYY-MM-DD)")
				return
			}
			where += ` AND ar.date <= $` + strconv.Itoa(idx) + `::date`
			args = append(args, toStr)
			idx++
		}
	} else {
		dateStr := q.Get("date")
		if dateStr == "" {
			dateStr = time.Now().UTC().Format("2006-01-02")
		}
		date, err := time.Parse("2006-01-02", dateStr)
		if err != nil {
			httputil.Error(w, http.StatusBadRequest, "invalid date (expected YYYY-MM-DD)")
			return
		}
		where += ` AND ar.date = $` + strconv.Itoa(idx)
		args = append(args, date)
		idx++
	}

	siteID := q.Get("site_id")
	userID := q.Get("user_id")
	status := q.Get("status")
	search := q.Get("search")
	page, limit := parsePagination(r)
	offset := (page - 1) * limit

	if userID != "" {
		where += ` AND ar.user_id = $` + strconv.Itoa(idx) + `::uuid`
		args = append(args, userID)
		idx++
	}
	if siteID != "" {
		where += ` AND ar.site_id = $` + strconv.Itoa(idx) + `::uuid`
		args = append(args, siteID)
		idx++
	}
	if status != "" {
		where += ` AND ar.status = $` + strconv.Itoa(idx)
		args = append(args, status)
		idx++
	}
	if search != "" {
		where += ` AND (u.first_name ILIKE $` + strconv.Itoa(idx) + ` OR u.last_name ILIKE $` + strconv.Itoa(idx) + ` OR u.email ILIKE $` + strconv.Itoa(idx) + `)`
		args = append(args, "%"+search+"%")
		idx++
	}

	// Count query — cheaper to run separately than OVER() on the listing
	// because the join to users is lossless.
	var total int64
	countSQL := `
		SELECT COUNT(*)
		  FROM dm3_attendance.attendance_records ar
		  LEFT JOIN dm3_identity.users u ON u.id = ar.user_id AND u.tenant_id = ar.tenant_id
		 WHERE ` + where
	if err := h.db.Pool.QueryRow(r.Context(), countSQL, args...).Scan(&total); err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to count records")
		return
	}

	listArgs := append(append([]any{}, args...), limit, offset)
	listSQL := `
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
		 WHERE ` + where + `
		 ORDER BY ar.date DESC, ar.clock_in NULLS LAST, u.first_name NULLS LAST
		 LIMIT $` + strconv.Itoa(idx) + ` OFFSET $` + strconv.Itoa(idx+1)

	rows, err := h.db.Pool.Query(r.Context(), listSQL, listArgs...)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to list records")
		return
	}
	defer rows.Close()

	records := make([]AttendanceRecord, 0)
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
			httputil.Error(w, http.StatusInternalServerError, "failed to scan record")
			return
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
		httputil.Error(w, http.StatusInternalServerError, "failed to iterate records")
		return
	}

	httputil.Paginated(w, records, total, page, limit)
}

// DailySummary returns a single-day aggregation used by the status strip on
// the daily records page. Counts are tenant-scoped and honour the optional
// site filter.
func (h *AttendanceHandlers) DailySummary(w http.ResponseWriter, r *http.Request) {
	tenantID := authsvc.CompanyIDFromContext(r.Context())
	if tenantID == "" {
		httputil.Error(w, http.StatusUnauthorized, "missing tenant context")
		return
	}

	q := r.URL.Query()
	dateStr := q.Get("date")
	if dateStr == "" {
		dateStr = time.Now().UTC().Format("2006-01-02")
	}
	date, err := time.Parse("2006-01-02", dateStr)
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid date (expected YYYY-MM-DD)")
		return
	}
	siteID := q.Get("site_id")

	args := []any{tenantID, date}
	where := `tenant_id = $1::uuid AND date = $2`
	if siteID != "" {
		where += ` AND site_id = $3::uuid`
		args = append(args, siteID)
	}

	sql := `
		SELECT
			COUNT(*)                                                          AS total,
			COUNT(*) FILTER (WHERE status = 'on_time')                        AS on_time,
			COUNT(*) FILTER (WHERE status = 'late')                           AS late,
			COUNT(*) FILTER (WHERE status = 'absent')                         AS absent,
			COUNT(*) FILTER (WHERE status = 'on_leave')                       AS on_leave,
			COUNT(*) FILTER (WHERE status = 'half_day')                       AS half_day,
			COUNT(*) FILTER (WHERE status = 'holiday')                        AS holiday,
			COUNT(*) FILTER (WHERE status = 'pending')                        AS pending,
			COUNT(*) FILTER (WHERE clock_in IS NOT NULL AND clock_out IS NULL) AS clocked_in
		  FROM dm3_attendance.attendance_records
		 WHERE ` + where

	type summary struct {
		Total     int64 `json:"total"`
		OnTime    int64 `json:"on_time"`
		Late      int64 `json:"late"`
		Absent    int64 `json:"absent"`
		OnLeave   int64 `json:"on_leave"`
		HalfDay   int64 `json:"half_day"`
		Holiday   int64 `json:"holiday"`
		Pending   int64 `json:"pending"`
		ClockedIn int64 `json:"clocked_in"`
	}
	var s summary
	if err := h.db.Pool.QueryRow(r.Context(), sql, args...).Scan(
		&s.Total, &s.OnTime, &s.Late, &s.Absent,
		&s.OnLeave, &s.HalfDay, &s.Holiday, &s.Pending, &s.ClockedIn,
	); err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to fetch summary")
		return
	}

	httputil.JSON(w, http.StatusOK, s)
}

