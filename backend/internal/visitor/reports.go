package visitor

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"duall-master/pkg/httputil"

	"github.com/google/uuid"
)

// Report and statistics handlers

func (h *Handlers) ListHosts(w http.ResponseWriter, r *http.Request) {
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	hosts, err := h.getVisitorHosts(r.Context(), tenantID)
	if err != nil {
		slog.Error("failed to get visitor hosts", "error", err)
		httputil.Error(w, "failed to get visitor hosts", http.StatusInternalServerError)
		return
	}
	
	httputil.JSON(w, map[string]interface{}{
		"hosts": hosts,
		"count": len(hosts),
	})
}

func (h *Handlers) GetHostVisitors(w http.ResponseWriter, r *http.Request) {
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	hostID := r.URL.Query().Get("host_id")
	
	if hostID == "" {
		httputil.Error(w, "host_id required", http.StatusBadRequest)
		return
	}
	
	query := VisitorListQuery{
		HostID: &hostID,
		Limit:  100,
		Offset: 0,
	}
	
	visitors, total, err := h.getVisitors(r.Context(), tenantID, query)
	if err != nil {
		slog.Error("failed to get host visitors", "error", err)
		httputil.Error(w, "failed to get host visitors", http.StatusInternalServerError)
		return
	}
	
	httputil.JSON(w, map[string]interface{}{
		"visitors": visitors,
		"total":    total,
		"host_id":  hostID,
	})
}

func (h *Handlers) ApproveAllHostVisitors(w http.ResponseWriter, r *http.Request) {
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	hostID := r.URL.Query().Get("host_id")
	
	if hostID == "" {
		httputil.Error(w, "host_id required", http.StatusBadRequest)
		return
	}
	
	count, err := h.approveAllHostVisitors(r.Context(), tenantID, uuid.MustParse(hostID))
	if err != nil {
		slog.Error("failed to approve all host visitors", "error", err)
		httputil.Error(w, "failed to approve visitors", http.StatusInternalServerError)
		return
	}
	
	httputil.JSON(w, map[string]interface{}{
		"approved_count": count,
		"host_id":        hostID,
	})
}

func (h *Handlers) GetDailyReport(w http.ResponseWriter, r *http.Request) {
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	dateStr := r.URL.Query().Get("date")
	
	var date time.Time
	var err error
	
	if dateStr == "" {
		date = time.Now()
	} else {
		date, err = time.Parse("2006-01-02", dateStr)
		if err != nil {
			httputil.Error(w, "invalid date format, use YYYY-MM-DD", http.StatusBadRequest)
			return
		}
	}
	
	report, err := h.generateDailyReport(r.Context(), tenantID, date)
	if err != nil {
		slog.Error("failed to generate daily report", "error", err)
		httputil.Error(w, "failed to generate daily report", http.StatusInternalServerError)
		return
	}
	
	httputil.JSON(w, report)
}

func (h *Handlers) GetHostActivityReport(w http.ResponseWriter, r *http.Request) {
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	dateFrom := r.URL.Query().Get("date_from")
	dateTo := r.URL.Query().Get("date_to")
	
	if dateFrom == "" || dateTo == "" {
		httputil.Error(w, "date_from and date_to required", http.StatusBadRequest)
		return
	}
	
	report, err := h.generateHostActivityReport(r.Context(), tenantID, dateFrom, dateTo)
	if err != nil {
		slog.Error("failed to generate host activity report", "error", err)
		httputil.Error(w, "failed to generate host activity report", http.StatusInternalServerError)
		return
	}
	
	httputil.JSON(w, report)
}

func (h *Handlers) GetVisitorStats(w http.ResponseWriter, r *http.Request) {
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	stats, err := h.getVisitorStatistics(r.Context(), tenantID)
	if err != nil {
		slog.Error("failed to get visitor statistics", "error", err)
		httputil.Error(w, "failed to get visitor statistics", http.StatusInternalServerError)
		return
	}
	
	httputil.JSON(w, stats)
}

// Database operations for reports

func (h *Handlers) getVisitorHosts(ctx context.Context, tenantID uuid.UUID) ([]VisitorHost, error) {
	query := `
		SELECT id, tenant_id, person_id, name, email, phone, department, title,
		       max_visitors, can_approve, auto_approve, access_zones, active,
		       created_at, updated_at
		FROM dm3_visitor.visitor_hosts
		WHERE tenant_id = $1 AND active = true
		ORDER BY name
	`
	
	rows, err := h.db.Pool.Query(ctx, query, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	var hosts []VisitorHost
	for rows.Next() {
		var host VisitorHost
		var accessZonesJSON []byte
		
		err := rows.Scan(
			&host.ID, &host.TenantID, &host.PersonID, &host.Name, &host.Email,
			&host.Phone, &host.Department, &host.Title, &host.MaxVisitors,
			&host.CanApprove, &host.AutoApprove, &accessZonesJSON, &host.Active,
			&host.CreatedAt, &host.UpdatedAt,
		)
		if err != nil {
			continue
		}
		
		// Unmarshal access zones
		if len(accessZonesJSON) > 0 {
			json.Unmarshal(accessZonesJSON, &host.AccessZones)
		}
		
		hosts = append(hosts, host)
	}
	
	return hosts, nil
}

func (h *Handlers) approveAllHostVisitors(ctx context.Context, tenantID, hostID uuid.UUID) (int64, error) {
	query := `
		UPDATE dm3_visitor.visitors
		SET status = 'approved', updated_at = now()
		WHERE tenant_id = $1 AND host_id = $2 AND status = 'waiting' AND deleted_at IS NULL
	`
	
	result, err := h.db.Pool.Exec(ctx, query, tenantID, hostID)
	if err != nil {
		return 0, err
	}
	
	return result.RowsAffected(), nil
}

func (h *Handlers) generateDailyReport(ctx context.Context, tenantID uuid.UUID, date time.Time) (*DailyReportResponse, error) {
	startOfDay := time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, date.Location())
	endOfDay := startOfDay.Add(24 * time.Hour)
	
	report := &DailyReportResponse{
		Date:          date.Format("2006-01-02"),
		ByVisitorType: make(map[string]int64),
		ByStatus:      make(map[string]int64),
	}
	
	// Total visitors for the day
	err := h.db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM dm3_visitor.visitors 
		 WHERE tenant_id = $1 AND created_at >= $2 AND created_at < $3 AND deleted_at IS NULL`,
		tenantID, startOfDay, endOfDay).Scan(&report.TotalVisitors)
	if err != nil {
		return nil, err
	}
	
	// Checked in visitors
	err = h.db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM dm3_visitor.visitors 
		 WHERE tenant_id = $1 AND checked_in_at >= $2 AND checked_in_at < $3 AND deleted_at IS NULL`,
		tenantID, startOfDay, endOfDay).Scan(&report.CheckedIn)
	if err != nil {
		return nil, err
	}
	
	// Checked out visitors
	err = h.db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM dm3_visitor.visitors 
		 WHERE tenant_id = $1 AND checked_out_at >= $2 AND checked_out_at < $3 AND deleted_at IS NULL`,
		tenantID, startOfDay, endOfDay).Scan(&report.CheckedOut)
	if err != nil {
		return nil, err
	}
	
	// Currently inside (checked in but not checked out)
	err = h.db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM dm3_visitor.visitors 
		 WHERE tenant_id = $1 AND status = 'checked_in' AND deleted_at IS NULL`,
		tenantID).Scan(&report.CurrentlyInside)
	if err != nil {
		return nil, err
	}
	
	// Pre-registered visitors
	err = h.db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM dm3_visitor.visitors 
		 WHERE tenant_id = $1 AND status = 'pre_registered' AND created_at >= $2 AND created_at < $3 AND deleted_at IS NULL`,
		tenantID, startOfDay, endOfDay).Scan(&report.PreRegistered)
	if err != nil {
		return nil, err
	}
	
	// Walk-ins (visitors created without pre-registration)
	err = h.db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM dm3_visitor.visitors 
		 WHERE tenant_id = $1 AND status != 'pre_registered' AND created_at >= $2 AND created_at < $3 AND deleted_at IS NULL`,
		tenantID, startOfDay, endOfDay).Scan(&report.WalkIns)
	if err != nil {
		return nil, err
	}
	
	// By visitor type
	rows, err := h.db.Pool.Query(ctx,
		`SELECT visitor_type, COUNT(*) FROM dm3_visitor.visitors 
		 WHERE tenant_id = $1 AND created_at >= $2 AND created_at < $3 AND deleted_at IS NULL
		 GROUP BY visitor_type`,
		tenantID, startOfDay, endOfDay)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	for rows.Next() {
		var visitorType string
		var count int64
		if err := rows.Scan(&visitorType, &count); err == nil {
			report.ByVisitorType[visitorType] = count
		}
	}
	
	// By status
	rows, err = h.db.Pool.Query(ctx,
		`SELECT status, COUNT(*) FROM dm3_visitor.visitors 
		 WHERE tenant_id = $1 AND created_at >= $2 AND created_at < $3 AND deleted_at IS NULL
		 GROUP BY status`,
		tenantID, startOfDay, endOfDay)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	for rows.Next() {
		var status string
		var count int64
		if err := rows.Scan(&status, &count); err == nil {
			report.ByStatus[status] = count
		}
	}
	
	// Top hosts
	rows, err = h.db.Pool.Query(ctx,
		`SELECT host_id, host_name, host_email, COUNT(*) as visitor_count
		 FROM dm3_visitor.visitors 
		 WHERE tenant_id = $1 AND created_at >= $2 AND created_at < $3 AND host_id IS NOT NULL AND deleted_at IS NULL
		 GROUP BY host_id, host_name, host_email
		 ORDER BY visitor_count DESC
		 LIMIT 10`,
		tenantID, startOfDay, endOfDay)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	for rows.Next() {
		var hostStats HostActivityStats
		if err := rows.Scan(&hostStats.HostID, &hostStats.HostName, &hostStats.HostEmail, &hostStats.VisitorCount); err == nil {
			report.TopHosts = append(report.TopHosts, hostStats)
		}
	}
	
	// Peak hours (check-in times)
	rows, err = h.db.Pool.Query(ctx,
		`SELECT EXTRACT(HOUR FROM checked_in_at) as hour, COUNT(*) as count
		 FROM dm3_visitor.visitors 
		 WHERE tenant_id = $1 AND checked_in_at >= $2 AND checked_in_at < $3 AND deleted_at IS NULL
		 GROUP BY EXTRACT(HOUR FROM checked_in_at)
		 ORDER BY hour`,
		tenantID, startOfDay, endOfDay)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	for rows.Next() {
		var hourStats HourlyStats
		if err := rows.Scan(&hourStats.Hour, &hourStats.Count); err == nil {
			report.PeakHours = append(report.PeakHours, hourStats)
		}
	}
	
	// Average stay duration (for visitors who checked out)
	var avgDurationMinutes *int
	err = h.db.Pool.QueryRow(ctx,
		`SELECT AVG(EXTRACT(EPOCH FROM (checked_out_at - checked_in_at))) / 60 as avg_minutes
		 FROM dm3_visitor.visitors 
		 WHERE tenant_id = $1 AND checked_in_at >= $2 AND checked_out_at < $3 
		   AND checked_in_at IS NOT NULL AND checked_out_at IS NOT NULL AND deleted_at IS NULL`,
		tenantID, startOfDay, endOfDay).Scan(&avgDurationMinutes)
	if err == nil {
		report.AverageStayDuration = avgDurationMinutes
	}
	
	return report, nil
}

func (h *Handlers) generateHostActivityReport(ctx context.Context, tenantID uuid.UUID, dateFrom, dateTo string) (map[string]interface{}, error) {
	// Host activity report showing visitor patterns by host
	query := `
		SELECT 
			host_id,
			host_name,
			host_email,
			COUNT(*) as total_visitors,
			COUNT(*) FILTER (WHERE status = 'checked_in') as checked_in_count,
			COUNT(*) FILTER (WHERE status = 'checked_out') as checked_out_count,
			COUNT(*) FILTER (WHERE status = 'approved') as approved_count,
			COUNT(*) FILTER (WHERE status = 'waiting') as waiting_count,
			COUNT(*) FILTER (WHERE status = 'rejected') as rejected_count
		FROM dm3_visitor.visitors
		WHERE tenant_id = $1 AND created_at >= $2 AND created_at < $3::date + interval '1 day'
		  AND host_id IS NOT NULL AND deleted_at IS NULL
		GROUP BY host_id, host_name, host_email
		ORDER BY total_visitors DESC
	`
	
	rows, err := h.db.Pool.Query(ctx, query, tenantID, dateFrom, dateTo)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	var hostActivities []map[string]interface{}
	var totalVisitors int64
	
	for rows.Next() {
		var hostID uuid.UUID
		var hostName, hostEmail string
		var total, checkedIn, checkedOut, approved, waiting, rejected int64
		
		err := rows.Scan(&hostID, &hostName, &hostEmail, &total, &checkedIn, &checkedOut, &approved, &waiting, &rejected)
		if err != nil {
			continue
		}
		
		totalVisitors += total
		
		activity := map[string]interface{}{
			"host_id":         hostID,
			"host_name":       hostName,
			"host_email":      hostEmail,
			"total_visitors":  total,
			"checked_in":      checkedIn,
			"checked_out":     checkedOut,
			"approved":        approved,
			"waiting":         waiting,
			"rejected":        rejected,
			"approval_rate":   float64(approved) / float64(total) * 100,
		}
		
		hostActivities = append(hostActivities, activity)
	}
	
	return map[string]interface{}{
		"period_from":     dateFrom,
		"period_to":       dateTo,
		"total_visitors":  totalVisitors,
		"host_count":      len(hostActivities),
		"host_activities": hostActivities,
	}, nil
}

func (h *Handlers) getVisitorStatistics(ctx context.Context, tenantID uuid.UUID) (*VisitorStatsResponse, error) {
	stats := &VisitorStatsResponse{
		TenantID:      tenantID,
		ByStatus:      make(map[string]int64),
		ByVisitorType: make(map[string]int64),
	}
	
	// Total visitors
	err := h.db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM dm3_visitor.visitors WHERE tenant_id = $1 AND deleted_at IS NULL`,
		tenantID).Scan(&stats.TotalVisitors)
	if err != nil {
		return nil, err
	}
	
	// Active visitors (not checked out or expired)
	err = h.db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM dm3_visitor.visitors 
		 WHERE tenant_id = $1 AND status IN ('waiting', 'approved', 'checked_in') AND deleted_at IS NULL`,
		tenantID).Scan(&stats.ActiveVisitors)
	if err != nil {
		return nil, err
	}
	
	// Visitors today
	today := time.Now().Truncate(24 * time.Hour)
	err = h.db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM dm3_visitor.visitors 
		 WHERE tenant_id = $1 AND created_at >= $2 AND deleted_at IS NULL`,
		tenantID, today).Scan(&stats.VisitorsToday)
	if err != nil {
		return nil, err
	}
	
	// Visitors this week
	weekStart := today.AddDate(0, 0, -int(today.Weekday()))
	err = h.db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM dm3_visitor.visitors 
		 WHERE tenant_id = $1 AND created_at >= $2 AND deleted_at IS NULL`,
		tenantID, weekStart).Scan(&stats.VisitorsThisWeek)
	if err != nil {
		return nil, err
	}
	
	// Visitors this month
	monthStart := time.Date(today.Year(), today.Month(), 1, 0, 0, 0, 0, today.Location())
	err = h.db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM dm3_visitor.visitors 
		 WHERE tenant_id = $1 AND created_at >= $2 AND deleted_at IS NULL`,
		tenantID, monthStart).Scan(&stats.VisitorsThisMonth)
	if err != nil {
		return nil, err
	}
	
	// Currently inside
	err = h.db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM dm3_visitor.visitors 
		 WHERE tenant_id = $1 AND status = 'checked_in' AND deleted_at IS NULL`,
		tenantID).Scan(&stats.CurrentlyInside)
	if err != nil {
		return nil, err
	}
	
	// Awaiting approval
	err = h.db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM dm3_visitor.visitors 
		 WHERE tenant_id = $1 AND status = 'waiting' AND deleted_at IS NULL`,
		tenantID).Scan(&stats.AwaitingApproval)
	if err != nil {
		return nil, err
	}
	
	// By status
	rows, err := h.db.Pool.Query(ctx,
		`SELECT status, COUNT(*) FROM dm3_visitor.visitors 
		 WHERE tenant_id = $1 AND deleted_at IS NULL GROUP BY status`,
		tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	for rows.Next() {
		var status string
		var count int64
		if err := rows.Scan(&status, &count); err == nil {
			stats.ByStatus[status] = count
		}
	}
	
	// By visitor type
	rows, err = h.db.Pool.Query(ctx,
		`SELECT visitor_type, COUNT(*) FROM dm3_visitor.visitors 
		 WHERE tenant_id = $1 AND deleted_at IS NULL GROUP BY visitor_type`,
		tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	for rows.Next() {
		var visitorType string
		var count int64
		if err := rows.Scan(&visitorType, &count); err == nil {
			stats.ByVisitorType[visitorType] = count
		}
	}
	
	// Top hosts
	rows, err = h.db.Pool.Query(ctx,
		`SELECT host_id, host_name, host_email, COUNT(*) as visitor_count
		 FROM dm3_visitor.visitors 
		 WHERE tenant_id = $1 AND host_id IS NOT NULL AND deleted_at IS NULL
		 GROUP BY host_id, host_name, host_email
		 ORDER BY visitor_count DESC
		 LIMIT 10`,
		tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	for rows.Next() {
		var hostStats HostActivityStats
		if err := rows.Scan(&hostStats.HostID, &hostStats.HostName, &hostStats.HostEmail, &hostStats.VisitorCount); err == nil {
			stats.TopHosts = append(stats.TopHosts, hostStats)
		}
	}
	
	// Average visit duration
	var avgDurationMinutes *int
	err = h.db.Pool.QueryRow(ctx,
		`SELECT AVG(EXTRACT(EPOCH FROM (checked_out_at - checked_in_at))) / 60 as avg_minutes
		 FROM dm3_visitor.visitors 
		 WHERE tenant_id = $1 AND checked_in_at IS NOT NULL AND checked_out_at IS NOT NULL AND deleted_at IS NULL`,
		tenantID).Scan(&avgDurationMinutes)
	if err == nil {
		stats.AverageVisitDuration = avgDurationMinutes
	}
	
	// Compliance rate (checkout rate)
	var checkedInCount, checkedOutCount int64
	h.db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM dm3_visitor.visitors 
		 WHERE tenant_id = $1 AND checked_in_at IS NOT NULL AND deleted_at IS NULL`,
		tenantID).Scan(&checkedInCount)
	
	h.db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM dm3_visitor.visitors 
		 WHERE tenant_id = $1 AND checked_out_at IS NOT NULL AND deleted_at IS NULL`,
		tenantID).Scan(&checkedOutCount)
	
	if checkedInCount > 0 {
		stats.ComplianceRate = float64(checkedOutCount) / float64(checkedInCount) * 100
	}
	
	return stats, nil
}