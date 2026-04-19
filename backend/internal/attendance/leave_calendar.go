package attendance

import (
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/pkg/httputil"
)

// LeaveCalendarEntry is one row in the leave calendar view. Type is
// "leave" (pending/approved leave requests) or "holiday" (tenant-declared
// public holiday). The UI renders these as colored blocks on a month grid.
type LeaveCalendarEntry struct {
	Type       string  `json:"type"` // leave | holiday
	StartDate  string  `json:"start_date"`
	EndDate    string  `json:"end_date"`
	UserID     string  `json:"user_id,omitempty"`
	UserName   string  `json:"user_name,omitempty"`
	PolicyID   string  `json:"policy_id,omitempty"`
	PolicyCode string  `json:"policy_code,omitempty"`
	PolicyName string  `json:"policy_name,omitempty"`
	Color      string  `json:"color,omitempty"`
	Status     string  `json:"status,omitempty"` // pending | approved | holiday
	Title      string  `json:"title,omitempty"`  // holiday name
	Days       float64 `json:"days,omitempty"`
	HalfDay    bool    `json:"half_day,omitempty"`
}

// LeaveCalendar returns leave requests + holidays overlapping a date window.
// Query params:
//
//	from     YYYY-MM-DD (required)
//	to       YYYY-MM-DD (required, must be >= from)
//	user_id  optional UUID filter (one person's calendar)
//	status   optional: pending|approved|all (default approved)
//
// Overlap semantics: a leave entry is included if its interval intersects
// [from, to] — specifically start_date <= to AND end_date >= from.
func (h *AttendanceHandlers) LeaveCalendar(w http.ResponseWriter, r *http.Request) {
	tenantID := authsvc.CompanyIDFromContext(r.Context())
	if tenantID == "" {
		httputil.Error(w, http.StatusUnauthorized, "missing tenant context")
		return
	}

	fromStr := r.URL.Query().Get("from")
	toStr := r.URL.Query().Get("to")
	if fromStr == "" || toStr == "" {
		httputil.Error(w, http.StatusBadRequest, "from and to (YYYY-MM-DD) are required")
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
		httputil.Error(w, http.StatusBadRequest, "to must be on/after from")
		return
	}
	// Guard unbounded scans — a calendar view spanning more than ~13 months
	// is almost certainly a misuse.
	if to.Sub(from) > 400*24*time.Hour {
		httputil.Error(w, http.StatusBadRequest, "window cannot exceed 400 days")
		return
	}

	status := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("status")))
	if status == "" {
		status = "approved"
	}
	switch status {
	case "approved", "pending", "all":
	default:
		httputil.Error(w, http.StatusBadRequest, "status must be approved|pending|all")
		return
	}

	// Build the leave filter.
	args := []any{tenantID, from, to}
	where := "lr.tenant_id = $1::uuid AND lr.start_date <= $3::date AND lr.end_date >= $2::date"
	idx := 4
	if status != "all" {
		where += " AND lr.status = $4"
		args = append(args, status)
		idx++
	}
	if userID := r.URL.Query().Get("user_id"); userID != "" {
		where += " AND lr.user_id = $" + strconv.Itoa(idx) + "::uuid"
		args = append(args, userID)
	}

	entries := make([]LeaveCalendarEntry, 0)

	rows, err := h.db.Pool.Query(r.Context(), `
		SELECT lr.user_id::text, lr.policy_id::text,
		       lr.start_date, lr.end_date, lr.days, lr.half_day, lr.status,
		       COALESCE(u.full_name, ''),
		       COALESCE(p.code, ''), COALESCE(p.name, ''), COALESCE(p.color, '')
		  FROM dm3_attendance.leave_requests lr
		  LEFT JOIN dm3_identity.users u ON u.id = lr.user_id
		  LEFT JOIN dm3_attendance.leave_policies p ON p.id = lr.policy_id
		 WHERE `+where+`
		 ORDER BY lr.start_date ASC`, args...)
	if err != nil {
		slog.Error("leave calendar: query leaves", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "failed to load leave calendar")
		return
	}
	defer rows.Close()

	for rows.Next() {
		var e LeaveCalendarEntry
		var start, end time.Time
		if err := rows.Scan(
			&e.UserID, &e.PolicyID, &start, &end, &e.Days, &e.HalfDay, &e.Status,
			&e.UserName, &e.PolicyCode, &e.PolicyName, &e.Color,
		); err != nil {
			slog.Error("leave calendar: scan leave", "error", err)
			httputil.Error(w, http.StatusInternalServerError, "failed to scan leave entry")
			return
		}
		e.Type = "leave"
		e.StartDate = start.Format("2006-01-02")
		e.EndDate = end.Format("2006-01-02")
		entries = append(entries, e)
	}

	// Holidays. These are tenant-wide, so no user filter — even when the
	// caller is viewing one person, holidays are still context they need.
	holRows, err := h.db.Pool.Query(r.Context(), `
		SELECT date, name
		  FROM dm3_attendance.holidays
		 WHERE tenant_id = $1::uuid
		   AND date BETWEEN $2::date AND $3::date
		 ORDER BY date ASC`, tenantID, from, to)
	if err != nil {
		slog.Error("leave calendar: query holidays", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "failed to load holidays")
		return
	}
	defer holRows.Close()

	for holRows.Next() {
		var date time.Time
		var name string
		if err := holRows.Scan(&date, &name); err != nil {
			slog.Error("leave calendar: scan holiday", "error", err)
			httputil.Error(w, http.StatusInternalServerError, "failed to scan holiday")
			return
		}
		d := date.Format("2006-01-02")
		entries = append(entries, LeaveCalendarEntry{
			Type:      "holiday",
			StartDate: d,
			EndDate:   d,
			Status:    "holiday",
			Title:     name,
		})
	}

	httputil.JSON(w, http.StatusOK, entries)
}
