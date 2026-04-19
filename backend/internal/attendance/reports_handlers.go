package attendance

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/pkg/httputil"
)

// ReportSummary is the tenant-level roll-up for a date range.
type ReportSummary struct {
	From                 string  `json:"from"`
	To                   string  `json:"to"`
	TotalUsers           int64   `json:"total_users"`
	TotalRecords         int64   `json:"total_records"`
	OnTimeCount          int64   `json:"on_time_count"`
	LateCount            int64   `json:"late_count"`
	AbsentCount          int64   `json:"absent_count"`
	OnLeaveCount         int64   `json:"on_leave_count"`
	HalfDayCount         int64   `json:"half_day_count"`
	HolidayCount         int64   `json:"holiday_count"`
	TotalHours           float64 `json:"total_hours"`
	RegularHours         float64 `json:"regular_hours"`
	OvertimeHours        float64 `json:"overtime_hours"`
	ApprovedOvertimeHours float64 `json:"approved_overtime_hours"`
	PendingOvertimeCount int64   `json:"pending_overtime_count"`
}

// ReportUserRow is one row per user in the date-range summary table.
type ReportUserRow struct {
	UserID                string  `json:"user_id"`
	UserName              string  `json:"user_name"`
	UserEmail             string  `json:"user_email"`
	RecordCount           int64   `json:"record_count"`
	OnTimeCount           int64   `json:"on_time_count"`
	LateCount             int64   `json:"late_count"`
	AbsentCount           int64   `json:"absent_count"`
	OnLeaveCount          int64   `json:"on_leave_count"`
	TotalHours            float64 `json:"total_hours"`
	RegularHours          float64 `json:"regular_hours"`
	OvertimeHours         float64 `json:"overtime_hours"`
	ApprovedOvertimeHours float64 `json:"approved_overtime_hours"`
	LateMinutes           int64   `json:"late_minutes"`
}

// LaborLawAdvisory is a BR-ATT-007 labor-law warning attached to a user
// row. Code is a stable identifier ("weekly_cap", "monthly_ot",
// "annual_ot") so the UI can i18n the message. Severity is "warning"
// (approaching) or "violation" (exceeded).
//
// Thresholds follow Vietnamese labor law (Bộ luật Lao động 2019):
//   - Regular hours: max 48h/week averaged over the report window
//   - Overtime: max 40h/month pro-rated across the window
//   - Overtime: max 200h/year cumulative
type LaborLawAdvisory struct {
	Code      string  `json:"code"`      // weekly_cap | monthly_ot | annual_ot
	Severity  string  `json:"severity"`  // warning | violation
	Message   string  `json:"message"`   // human-readable explanation
	Threshold float64 `json:"threshold"` // the cap the value is compared against
	Value     float64 `json:"value"`     // the user's computed value
}

// ReportResponse bundles summary + per-user rows so the UI loads in one call.
// Advisories keyed by user_id surface BR-ATT-007 warnings without bloating
// every ReportUserRow when most users have none.
type ReportResponse struct {
	Summary    ReportSummary                 `json:"summary"`
	Users      []ReportUserRow               `json:"users"`
	Advisories map[string][]LaborLawAdvisory `json:"advisories,omitempty"`
}

// Labor-law thresholds (Vietnamese Labor Code 2019 / BR-ATT-007).
const (
	maxRegularHoursPerWeek = 48.0
	maxOvertimeHoursMonth  = 40.0
	maxOvertimeHoursYear   = 200.0
	// Warning band: start flagging when 80% of the threshold is reached.
	laborLawWarningRatio = 0.8
)

// computeLaborLawAdvisories derives BR-ATT-007 advisories for one user over
// the report window. days is inclusive (to - from + 1).
//
// The monthly cap is pro-rated: for a 45-day window, the allowed OT is
// 40 * (45/30). This keeps short windows from triggering false positives
// while still catching sustained overwork.
func computeLaborLawAdvisories(u ReportUserRow, days int) []LaborLawAdvisory {
	if days <= 0 {
		return nil
	}
	advisories := make([]LaborLawAdvisory, 0)

	weeks := float64(days) / 7.0
	if weeks < 1 {
		weeks = 1
	}
	avgWeekly := (u.RegularHours + u.OvertimeHours) / weeks
	if avgWeekly > maxRegularHoursPerWeek {
		advisories = append(advisories, LaborLawAdvisory{
			Code:      "weekly_cap",
			Severity:  "violation",
			Message:   "Average weekly working hours exceed the 48h cap",
			Threshold: maxRegularHoursPerWeek,
			Value:     avgWeekly,
		})
	} else if avgWeekly > maxRegularHoursPerWeek*laborLawWarningRatio {
		advisories = append(advisories, LaborLawAdvisory{
			Code:      "weekly_cap",
			Severity:  "warning",
			Message:   "Average weekly working hours approaching the 48h cap",
			Threshold: maxRegularHoursPerWeek,
			Value:     avgWeekly,
		})
	}

	months := float64(days) / 30.0
	if months < 1 {
		months = 1
	}
	monthlyOTCap := maxOvertimeHoursMonth * months
	if u.OvertimeHours > monthlyOTCap {
		advisories = append(advisories, LaborLawAdvisory{
			Code:      "monthly_ot",
			Severity:  "violation",
			Message:   "Overtime exceeds the 40h/month cap over the window",
			Threshold: monthlyOTCap,
			Value:     u.OvertimeHours,
		})
	} else if u.OvertimeHours > monthlyOTCap*laborLawWarningRatio {
		advisories = append(advisories, LaborLawAdvisory{
			Code:      "monthly_ot",
			Severity:  "warning",
			Message:   "Overtime approaching the 40h/month cap over the window",
			Threshold: monthlyOTCap,
			Value:     u.OvertimeHours,
		})
	}

	if u.OvertimeHours > maxOvertimeHoursYear {
		advisories = append(advisories, LaborLawAdvisory{
			Code:      "annual_ot",
			Severity:  "violation",
			Message:   "Overtime exceeds the 200h/year statutory cap",
			Threshold: maxOvertimeHoursYear,
			Value:     u.OvertimeHours,
		})
	} else if u.OvertimeHours > maxOvertimeHoursYear*laborLawWarningRatio {
		advisories = append(advisories, LaborLawAdvisory{
			Code:      "annual_ot",
			Severity:  "warning",
			Message:   "Overtime approaching the 200h/year statutory cap",
			Threshold: maxOvertimeHoursYear,
			Value:     u.OvertimeHours,
		})
	}

	if len(advisories) == 0 {
		return nil
	}
	return advisories
}

// GetReport serves GET /api/v1/attendance/reports/summary.
// Query params:
//
//	from YYYY-MM-DD (required)
//	to   YYYY-MM-DD (required, inclusive)
//
// Range is clamped to 366 days to bound query cost.
func (h *AttendanceHandlers) GetReport(w http.ResponseWriter, r *http.Request) {
	tenantID := authsvc.CompanyIDFromContext(r.Context())
	if tenantID == "" {
		httputil.Error(w, http.StatusUnauthorized, "missing tenant context")
		return
	}

	q := r.URL.Query()
	fromStr := q.Get("from")
	toStr := q.Get("to")
	if fromStr == "" || toStr == "" {
		httputil.Error(w, http.StatusBadRequest, "from and to are required (YYYY-MM-DD)")
		return
	}
	from, err := time.Parse("2006-01-02", fromStr)
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid from (expected YYYY-MM-DD)")
		return
	}
	to, err := time.Parse("2006-01-02", toStr)
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid to (expected YYYY-MM-DD)")
		return
	}
	if to.Before(from) {
		httputil.Error(w, http.StatusBadRequest, "to must be on or after from")
		return
	}
	if to.Sub(from) > 366*24*time.Hour {
		httputil.Error(w, http.StatusBadRequest, "date range exceeds 366 days")
		return
	}

	summarySQL := `
		SELECT
			COUNT(DISTINCT user_id)                                       AS total_users,
			COUNT(*)                                                      AS total_records,
			COUNT(*) FILTER (WHERE status = 'on_time')                    AS on_time,
			COUNT(*) FILTER (WHERE status = 'late')                       AS late,
			COUNT(*) FILTER (WHERE status = 'absent')                     AS absent,
			COUNT(*) FILTER (WHERE status = 'on_leave')                   AS on_leave,
			COUNT(*) FILTER (WHERE status = 'half_day')                   AS half_day,
			COUNT(*) FILTER (WHERE status = 'holiday')                    AS holiday,
			COALESCE(SUM(total_hours), 0)                                 AS total_hours,
			COALESCE(SUM(regular_hours), 0)                               AS regular_hours,
			COALESCE(SUM(overtime_hours), 0)                              AS overtime_hours,
			COALESCE(SUM(CASE WHEN overtime_approved THEN overtime_hours ELSE 0 END), 0) AS approved_overtime_hours,
			COUNT(*) FILTER (WHERE overtime_hours > 0 AND overtime_approved = false AND overtime_approved_by IS NULL) AS pending_overtime
		  FROM dm3_attendance.attendance_records
		 WHERE tenant_id = $1::uuid AND date >= $2::date AND date <= $3::date`

	var sum ReportSummary
	sum.From = fromStr
	sum.To = toStr
	if err := h.db.Pool.QueryRow(r.Context(), summarySQL, tenantID, fromStr, toStr).Scan(
		&sum.TotalUsers, &sum.TotalRecords,
		&sum.OnTimeCount, &sum.LateCount, &sum.AbsentCount,
		&sum.OnLeaveCount, &sum.HalfDayCount, &sum.HolidayCount,
		&sum.TotalHours, &sum.RegularHours, &sum.OvertimeHours,
		&sum.ApprovedOvertimeHours, &sum.PendingOvertimeCount,
	); err != nil {
		slog.Error("report summary", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "failed to build summary")
		return
	}

	usersSQL := `
		SELECT
			ar.user_id::text,
			COALESCE(NULLIF(TRIM(u.first_name || ' ' || u.last_name), ''), '') AS user_name,
			COALESCE(u.email, '')                                              AS user_email,
			COUNT(*)                                                           AS record_count,
			COUNT(*) FILTER (WHERE ar.status = 'on_time')                      AS on_time,
			COUNT(*) FILTER (WHERE ar.status = 'late')                         AS late,
			COUNT(*) FILTER (WHERE ar.status = 'absent')                       AS absent,
			COUNT(*) FILTER (WHERE ar.status = 'on_leave')                     AS on_leave,
			COALESCE(SUM(ar.total_hours), 0)                                   AS total_hours,
			COALESCE(SUM(ar.regular_hours), 0)                                 AS regular_hours,
			COALESCE(SUM(ar.overtime_hours), 0)                                AS overtime_hours,
			COALESCE(SUM(CASE WHEN ar.overtime_approved THEN ar.overtime_hours ELSE 0 END), 0) AS approved_overtime_hours,
			COALESCE(SUM(ar.late_minutes), 0)                                  AS late_minutes
		  FROM dm3_attendance.attendance_records ar
		  LEFT JOIN dm3_identity.users u ON u.id = ar.user_id AND u.tenant_id = ar.tenant_id
		 WHERE ar.tenant_id = $1::uuid AND ar.date >= $2::date AND ar.date <= $3::date
		 GROUP BY ar.user_id, u.first_name, u.last_name, u.email
		 ORDER BY user_name ASC
		 LIMIT 500`

	rows, err := h.db.Pool.Query(r.Context(), usersSQL, tenantID, fromStr, toStr)
	if err != nil {
		slog.Error("report users", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "failed to build per-user report")
		return
	}
	defer rows.Close()

	users := make([]ReportUserRow, 0)
	for rows.Next() {
		var u ReportUserRow
		if err := rows.Scan(
			&u.UserID, &u.UserName, &u.UserEmail,
			&u.RecordCount,
			&u.OnTimeCount, &u.LateCount, &u.AbsentCount, &u.OnLeaveCount,
			&u.TotalHours, &u.RegularHours, &u.OvertimeHours, &u.ApprovedOvertimeHours,
			&u.LateMinutes,
		); err != nil {
			slog.Error("scan report row", "error", err)
			httputil.Error(w, http.StatusInternalServerError, "failed to scan report row")
			return
		}
		users = append(users, u)
	}
	if rows.Err() != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to iterate report rows")
		return
	}

	// BR-ATT-007: attach labor-law advisories per user. Empty map means
	// everyone is within limits.
	windowDays := int(to.Sub(from).Hours()/24) + 1
	advisories := make(map[string][]LaborLawAdvisory)
	for _, u := range users {
		if a := computeLaborLawAdvisories(u, windowDays); len(a) > 0 {
			advisories[u.UserID] = a
		}
	}

	httputil.JSON(w, http.StatusOK, ReportResponse{
		Summary:    sum,
		Users:      users,
		Advisories: advisories,
	})
}
