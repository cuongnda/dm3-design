package attendance

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/pkg/httputil"
)

// AttendanceSummary mirrors dm3_attendance.attendance_summary.
//
// One row per (tenant, user, year, month). The rollup is recomputed
// daily by the cron job so late adjustments (manual corrections,
// back-dated leave approvals) propagate without manual intervention.
type AttendanceSummary struct {
	ID                    string    `json:"id"`
	TenantID              string    `json:"tenant_id"`
	UserID                string    `json:"user_id"`
	Year                  int       `json:"year"`
	Month                 int       `json:"month"`
	Workdays              int       `json:"workdays"`
	OnTimeCount           int       `json:"on_time_count"`
	LateCount             int       `json:"late_count"`
	AbsentCount           int       `json:"absent_count"`
	OnLeaveCount          int       `json:"on_leave_count"`
	HalfDayCount          int       `json:"half_day_count"`
	HolidayCount          int       `json:"holiday_count"`
	PendingCount          int       `json:"pending_count"`
	TotalHours            float64   `json:"total_hours"`
	RegularHours          float64   `json:"regular_hours"`
	OvertimeHours         float64   `json:"overtime_hours"`
	ApprovedOvertimeHours float64   `json:"approved_overtime_hours"`
	LateMinutes           int       `json:"late_minutes"`
	EarlyLeaveMinutes     int       `json:"early_leave_minutes"`
	GeneratedAt           time.Time `json:"generated_at"`

	// Join fields populated by the list endpoint.
	UserName  string `json:"user_name,omitempty"`
	UserEmail string `json:"user_email,omitempty"`
}

// rebuildMonthlySummary recomputes attendance_summary rows for (year, month)
// across all tenants. Uses one INSERT...SELECT with ON CONFLICT so the
// rollup is idempotent — safe to re-run hourly.
//
// Scope: one month at a time. Callers usually invoke it for the current
// month and the previous month so late corrections land without manual
// intervention.
func (h *AttendanceHandlers) rebuildMonthlySummary(ctx context.Context, year, month int) error {
	const sql = `
		INSERT INTO dm3_attendance.attendance_summary AS s (
			tenant_id, user_id, year, month,
			workdays, on_time_count, late_count, absent_count,
			on_leave_count, half_day_count, holiday_count, pending_count,
			total_hours, regular_hours, overtime_hours, approved_overtime_hours,
			late_minutes, early_leave_minutes, generated_at
		)
		SELECT
			tenant_id, user_id, $1::int AS year, $2::int AS month,
			COUNT(*) FILTER (WHERE status <> 'holiday')                   AS workdays,
			COUNT(*) FILTER (WHERE status = 'on_time')                    AS on_time_count,
			COUNT(*) FILTER (WHERE status = 'late')                       AS late_count,
			COUNT(*) FILTER (WHERE status = 'absent')                     AS absent_count,
			COUNT(*) FILTER (WHERE status = 'on_leave')                   AS on_leave_count,
			COUNT(*) FILTER (WHERE status = 'half_day')                   AS half_day_count,
			COUNT(*) FILTER (WHERE status = 'holiday')                    AS holiday_count,
			COUNT(*) FILTER (WHERE status = 'pending')                    AS pending_count,
			COALESCE(SUM(total_hours), 0),
			COALESCE(SUM(regular_hours), 0),
			COALESCE(SUM(overtime_hours), 0),
			COALESCE(SUM(CASE WHEN overtime_approved THEN overtime_hours ELSE 0 END), 0),
			COALESCE(SUM(late_minutes), 0),
			COALESCE(SUM(early_leave_minutes), 0),
			now()
		  FROM dm3_attendance.attendance_records
		 WHERE EXTRACT(YEAR  FROM date)::int = $1::int
		   AND EXTRACT(MONTH FROM date)::int = $2::int
		 GROUP BY tenant_id, user_id
		ON CONFLICT (tenant_id, user_id, year, month) DO UPDATE SET
			workdays                = EXCLUDED.workdays,
			on_time_count           = EXCLUDED.on_time_count,
			late_count              = EXCLUDED.late_count,
			absent_count            = EXCLUDED.absent_count,
			on_leave_count          = EXCLUDED.on_leave_count,
			half_day_count          = EXCLUDED.half_day_count,
			holiday_count           = EXCLUDED.holiday_count,
			pending_count           = EXCLUDED.pending_count,
			total_hours             = EXCLUDED.total_hours,
			regular_hours           = EXCLUDED.regular_hours,
			overtime_hours          = EXCLUDED.overtime_hours,
			approved_overtime_hours = EXCLUDED.approved_overtime_hours,
			late_minutes            = EXCLUDED.late_minutes,
			early_leave_minutes     = EXCLUDED.early_leave_minutes,
			generated_at            = EXCLUDED.generated_at
	`
	tag, err := h.db.Pool.Exec(ctx, sql, year, month)
	if err != nil {
		return fmt.Errorf("rebuild monthly summary %d-%02d: %w", year, month, err)
	}
	if tag.RowsAffected() > 0 {
		slog.Info("attendance: monthly summary rebuilt",
			"year", year, "month", month, "rows", tag.RowsAffected())
	}
	return nil
}

// rebuildMonthlySummaryCurrentAndPrev refreshes the current calendar month
// plus the previous one. Prev is included so back-dated approvals and
// manager adjustments eventually reconcile into the frozen rollup.
func (h *AttendanceHandlers) rebuildMonthlySummaryCurrentAndPrev(ctx context.Context) error {
	now := time.Now().UTC()
	if err := h.rebuildMonthlySummary(ctx, now.Year(), int(now.Month())); err != nil {
		return err
	}
	prev := now.AddDate(0, -1, 0)
	return h.rebuildMonthlySummary(ctx, prev.Year(), int(prev.Month()))
}

// ListAttendanceSummary serves GET /api/v1/attendance/summary/monthly.
// Query params:
//
//	year    int (required)
//	month   int 1..12 (required)
//	user_id optional UUID filter
//
// The endpoint reads the pre-aggregated rollup table. If the month has
// not been rolled up yet (e.g. attend-svc just started), the caller
// will receive an empty list; the cron refreshes the current + previous
// month every hour.
func (h *AttendanceHandlers) ListAttendanceSummary(w http.ResponseWriter, r *http.Request) {
	tenantID := authsvc.CompanyIDFromContext(r.Context())
	if tenantID == "" {
		httputil.Error(w, http.StatusUnauthorized, "missing tenant context")
		return
	}

	year, err := strconv.Atoi(r.URL.Query().Get("year"))
	if err != nil || year < 2000 || year > 2100 {
		httputil.Error(w, http.StatusBadRequest, "year is required (2000..2100)")
		return
	}
	month, err := strconv.Atoi(r.URL.Query().Get("month"))
	if err != nil || month < 1 || month > 12 {
		httputil.Error(w, http.StatusBadRequest, "month is required (1..12)")
		return
	}

	args := []any{tenantID, year, month}
	where := "s.tenant_id = $1::uuid AND s.year = $2::int AND s.month = $3::int"
	if userID := r.URL.Query().Get("user_id"); userID != "" {
		where += " AND s.user_id = $4::uuid"
		args = append(args, userID)
	}

	rows, err := h.db.Pool.Query(r.Context(), `
		SELECT s.id::text, s.tenant_id::text, s.user_id::text, s.year, s.month,
		       s.workdays, s.on_time_count, s.late_count, s.absent_count,
		       s.on_leave_count, s.half_day_count, s.holiday_count, s.pending_count,
		       s.total_hours, s.regular_hours, s.overtime_hours,
		       s.approved_overtime_hours, s.late_minutes, s.early_leave_minutes,
		       s.generated_at,
		       COALESCE(NULLIF(TRIM(u.first_name || ' ' || u.last_name), ''), ''),
		       COALESCE(u.email, '')
		  FROM dm3_attendance.attendance_summary s
		  LEFT JOIN dm3_identity.users u ON u.id = s.user_id AND u.tenant_id = s.tenant_id
		 WHERE `+where+`
		 ORDER BY COALESCE(NULLIF(TRIM(u.first_name || ' ' || u.last_name), ''), u.email::text) ASC
		 LIMIT 2000
	`, args...)
	if err != nil {
		slog.Error("list attendance summary", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "failed to list summary")
		return
	}
	defer rows.Close()

	result := make([]AttendanceSummary, 0)
	for rows.Next() {
		var s AttendanceSummary
		if err := rows.Scan(
			&s.ID, &s.TenantID, &s.UserID, &s.Year, &s.Month,
			&s.Workdays, &s.OnTimeCount, &s.LateCount, &s.AbsentCount,
			&s.OnLeaveCount, &s.HalfDayCount, &s.HolidayCount, &s.PendingCount,
			&s.TotalHours, &s.RegularHours, &s.OvertimeHours,
			&s.ApprovedOvertimeHours, &s.LateMinutes, &s.EarlyLeaveMinutes,
			&s.GeneratedAt,
			&s.UserName, &s.UserEmail,
		); err != nil {
			slog.Error("scan attendance summary", "error", err)
			httputil.Error(w, http.StatusInternalServerError, "failed to scan summary")
			return
		}
		result = append(result, s)
	}

	httputil.JSON(w, http.StatusOK, result)
}

// RebuildMonthlySummary is an admin trigger to force a re-roll for a
// specific (year, month). Useful after bulk edits or migrations when
// waiting for the hourly cron is too slow.
//
// POST /api/v1/attendance/summary/monthly/rebuild?year=YYYY&month=M
func (h *AttendanceHandlers) RebuildMonthlySummary(w http.ResponseWriter, r *http.Request) {
	tenantID := authsvc.CompanyIDFromContext(r.Context())
	if tenantID == "" {
		httputil.Error(w, http.StatusUnauthorized, "missing tenant context")
		return
	}

	year, err := strconv.Atoi(r.URL.Query().Get("year"))
	if err != nil || year < 2000 || year > 2100 {
		httputil.Error(w, http.StatusBadRequest, "year is required (2000..2100)")
		return
	}
	month, err := strconv.Atoi(r.URL.Query().Get("month"))
	if err != nil || month < 1 || month > 12 {
		httputil.Error(w, http.StatusBadRequest, "month is required (1..12)")
		return
	}

	if err := h.rebuildMonthlySummary(r.Context(), year, month); err != nil {
		slog.Error("manual rebuild summary", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "rebuild failed")
		return
	}

	h.audit.LogFromRequest(r, "attendance.summary_rebuilt", "attendance_summary",
		fmt.Sprintf("%d-%02d", year, month), "", "success", nil, map[string]any{
			"year":  year,
			"month": month,
		})

	httputil.JSON(w, http.StatusOK, map[string]any{
		"year":  year,
		"month": month,
		"ok":    true,
	})
}
