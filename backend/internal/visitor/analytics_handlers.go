package visitor

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/pkg/httputil"
)

type visitorAnalytics struct {
	Period         string         `json:"period"`
	TotalVisits    int            `json:"total_visits"`
	UniqueVisitors int            `json:"unique_visitors"`
	CheckedIn      int            `json:"checked_in"`
	NoShows        int            `json:"no_shows"`
	AvgDurationMin *float64       `json:"avg_duration_minutes"`
	ByPurpose      map[string]int `json:"by_purpose"`
	ByStatus       map[string]int `json:"by_status"`
	PeakHour       *int           `json:"peak_hour"`
	DailyTrend     []dailyCount   `json:"daily_trend,omitempty"`
}

type dailyCount struct {
	Date  string `json:"date"`
	Count int    `json:"count"`
}

// GetVisitorAnalytics returns visitor statistics for the tenant.
// GET /api/v1/visitors/analytics?period=7d|30d|90d
func (h *VisitorHandlers) GetVisitorAnalytics(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}
	if !requireVisitorRead(r) {
		httputil.Error(w, http.StatusForbidden, "insufficient permissions")
		return
	}

	period := r.URL.Query().Get("period")
	days := 7
	switch period {
	case "30d":
		days = 30
	case "90d":
		days = 90
	default:
		period = "7d"
	}

	since := time.Now().AddDate(0, 0, -days)

	analytics := visitorAnalytics{
		Period:    period,
		ByPurpose: make(map[string]int),
		ByStatus:  make(map[string]int),
	}

	// Total visits and unique visitors
	_ = h.db.Pool.QueryRow(r.Context(), `
		SELECT COUNT(*), COUNT(DISTINCT visitor_id)
		FROM dm3_identity.visits
		WHERE tenant_id = $1::uuid AND created_at >= $2`,
		cid, since).Scan(&analytics.TotalVisits, &analytics.UniqueVisitors)

	// Currently checked in
	_ = h.db.Pool.QueryRow(r.Context(), `
		SELECT COUNT(*) FROM dm3_identity.visits
		WHERE tenant_id = $1::uuid AND status = 'checked_in'`,
		cid).Scan(&analytics.CheckedIn)

	// No-shows in period
	_ = h.db.Pool.QueryRow(r.Context(), `
		SELECT COUNT(*) FROM dm3_identity.visits
		WHERE tenant_id = $1::uuid AND status = 'no_show' AND updated_at >= $2`,
		cid, since).Scan(&analytics.NoShows)

	// Average visit duration (minutes) for completed visits
	_ = h.db.Pool.QueryRow(r.Context(), `
		SELECT AVG(EXTRACT(EPOCH FROM (actual_checkout - actual_checkin)) / 60)
		FROM dm3_identity.visits
		WHERE tenant_id = $1::uuid AND actual_checkin IS NOT NULL AND actual_checkout IS NOT NULL
		  AND created_at >= $2`,
		cid, since).Scan(&analytics.AvgDurationMin)

	// Visits by purpose
	purposeRows, err := h.db.Pool.Query(r.Context(), `
		SELECT purpose, COUNT(*) FROM dm3_identity.visits
		WHERE tenant_id = $1::uuid AND created_at >= $2
		GROUP BY purpose ORDER BY COUNT(*) DESC`,
		cid, since)
	if err == nil {
		defer purposeRows.Close()
		for purposeRows.Next() {
			var purpose string
			var count int
			if err := purposeRows.Scan(&purpose, &count); err == nil {
				analytics.ByPurpose[purpose] = count
			}
		}
	}

	// Visits by status
	statusRows, err := h.db.Pool.Query(r.Context(), `
		SELECT status, COUNT(*) FROM dm3_identity.visits
		WHERE tenant_id = $1::uuid AND created_at >= $2
		GROUP BY status ORDER BY COUNT(*) DESC`,
		cid, since)
	if err == nil {
		defer statusRows.Close()
		for statusRows.Next() {
			var status string
			var count int
			if err := statusRows.Scan(&status, &count); err == nil {
				analytics.ByStatus[status] = count
			}
		}
	}

	// Peak hour (most check-ins)
	_ = h.db.Pool.QueryRow(r.Context(), `
		SELECT EXTRACT(HOUR FROM actual_checkin)::int
		FROM dm3_identity.visits
		WHERE tenant_id = $1::uuid AND actual_checkin IS NOT NULL AND created_at >= $2
		GROUP BY EXTRACT(HOUR FROM actual_checkin)
		ORDER BY COUNT(*) DESC
		LIMIT 1`,
		cid, since).Scan(&analytics.PeakHour)

	// Daily trend
	trendRows, err := h.db.Pool.Query(r.Context(), `
		SELECT expected_arrival::date::text, COUNT(*)
		FROM dm3_identity.visits
		WHERE tenant_id = $1::uuid AND created_at >= $2
		GROUP BY expected_arrival::date
		ORDER BY expected_arrival::date`,
		cid, since)
	if err == nil {
		defer trendRows.Close()
		for trendRows.Next() {
			var d dailyCount
			if err := trendRows.Scan(&d.Date, &d.Count); err == nil {
				analytics.DailyTrend = append(analytics.DailyTrend, d)
			}
		}
	}

	httputil.JSON(w, http.StatusOK, analytics)
}

// GetTopVisitors returns the most frequent visitors for the tenant.
// GET /api/v1/visitors/analytics/top-visitors?limit=10
func (h *VisitorHandlers) GetTopVisitors(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}
	if !requireVisitorRead(r) {
		httputil.Error(w, http.StatusForbidden, "insufficient permissions")
		return
	}

	_, limit := parsePagination(r)
	if limit > 50 {
		limit = 50
	}

	type topVisitor struct {
		VisitorID   string     `json:"visitor_id"`
		Name        string     `json:"name"`
		Company     *string    `json:"company,omitempty"`
		VisitCount  int        `json:"visit_count"`
		LastVisitAt *time.Time `json:"last_visit_at,omitempty"`
	}

	rows, err := h.db.Pool.Query(r.Context(), `
		SELECT vis.id, vis.first_name || ' ' || vis.last_name, vis.company,
		       vis.visit_count, vis.last_visit_at
		FROM dm3_identity.visitors vis
		WHERE vis.tenant_id = $1::uuid AND vis.visit_count > 0
		ORDER BY vis.visit_count DESC, vis.last_visit_at DESC NULLS LAST
		LIMIT $2`, cid, limit)
	if err != nil {
		slog.Error("top visitors error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer rows.Close()

	visitors := []topVisitor{}
	for rows.Next() {
		var v topVisitor
		if err := rows.Scan(&v.VisitorID, &v.Name, &v.Company, &v.VisitCount, &v.LastVisitAt); err != nil {
			slog.Error("scan top visitor error", "error", err)
			continue
		}
		visitors = append(visitors, v)
	}
	if err := rows.Err(); err != nil {
		slog.Error("top visitors rows error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	httputil.JSON(w, http.StatusOK, visitors)
}
