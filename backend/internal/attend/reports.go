package attend

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"duall-master/pkg/httputil"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
)

// Reports and analytics handlers

// GetDailyReport generates daily attendance report
func (h *Handlers) GetDailyReport(w http.ResponseWriter, r *http.Request) {
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	// Parse date parameter (defaults to today)
	dateStr := r.URL.Query().Get("date")
	if dateStr == "" {
		dateStr = time.Now().Format("2006-01-02")
	}
	
	date, err := time.Parse("2006-01-02", dateStr)
	if err != nil {
		httputil.Error(w, "invalid date format, use YYYY-MM-DD", http.StatusBadRequest)
		return
	}
	
	report, err := h.generateDailyReport(r.Context(), tenantID, date)
	if err != nil {
		slog.Error("failed to generate daily report", "error", err)
		httputil.Error(w, "failed to generate daily report", http.StatusInternalServerError)
		return
	}
	
	httputil.JSON(w, report)
}

// GetWeeklyReport generates weekly attendance report
func (h *Handlers) GetWeeklyReport(w http.ResponseWriter, r *http.Request) {
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	// Parse week start date (defaults to this week's Monday)
	weekStr := r.URL.Query().Get("week_start")
	var weekStart time.Time
	var err error
	
	if weekStr == "" {
		now := time.Now()
		weekday := int(now.Weekday())
		if weekday == 0 { // Sunday
			weekday = 7
		}
		weekStart = now.AddDate(0, 0, -(weekday-1)) // Go to Monday
		weekStart = time.Date(weekStart.Year(), weekStart.Month(), weekStart.Day(), 0, 0, 0, 0, weekStart.Location())
	} else {
		weekStart, err = time.Parse("2006-01-02", weekStr)
		if err != nil {
			httputil.Error(w, "invalid week_start format, use YYYY-MM-DD", http.StatusBadRequest)
			return
		}
	}
	
	report, err := h.generateWeeklyReport(r.Context(), tenantID, weekStart)
	if err != nil {
		slog.Error("failed to generate weekly report", "error", err)
		httputil.Error(w, "failed to generate weekly report", http.StatusInternalServerError)
		return
	}
	
	httputil.JSON(w, report)
}

// GetMonthlyReport generates monthly attendance report
func (h *Handlers) GetMonthlyReport(w http.ResponseWriter, r *http.Request) {
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	// Parse year and month (defaults to current month)
	yearStr := r.URL.Query().Get("year")
	monthStr := r.URL.Query().Get("month")
	
	year := time.Now().Year()
	month := int(time.Now().Month())
	
	if yearStr != "" {
		if y, err := strconv.Atoi(yearStr); err == nil {
			year = y
		}
	}
	
	if monthStr != "" {
		if m, err := strconv.Atoi(monthStr); err == nil && m >= 1 && m <= 12 {
			month = m
		}
	}
	
	report, err := h.generateMonthlyReport(r.Context(), tenantID, year, month)
	if err != nil {
		slog.Error("failed to generate monthly report", "error", err)
		httputil.Error(w, "failed to generate monthly report", http.StatusInternalServerError)
		return
	}
	
	httputil.JSON(w, report)
}

// GetPayrollReport generates payroll report for specified period
func (h *Handlers) GetPayrollReport(w http.ResponseWriter, r *http.Request) {
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	startDateStr := r.URL.Query().Get("start_date")
	endDateStr := r.URL.Query().Get("end_date")
	
	if startDateStr == "" || endDateStr == "" {
		httputil.Error(w, "start_date and end_date parameters required", http.StatusBadRequest)
		return
	}
	
	startDate, err := time.Parse("2006-01-02", startDateStr)
	if err != nil {
		httputil.Error(w, "invalid start_date format", http.StatusBadRequest)
		return
	}
	
	endDate, err := time.Parse("2006-01-02", endDateStr)
	if err != nil {
		httputil.Error(w, "invalid end_date format", http.StatusBadRequest)
		return
	}
	
	report, err := h.generatePayrollReport(r.Context(), tenantID, startDate, endDate)
	if err != nil {
		slog.Error("failed to generate payroll report", "error", err)
		httputil.Error(w, "failed to generate payroll report", http.StatusInternalServerError)
		return
	}
	
	httputil.JSON(w, report)
}

// GetAttendanceSummary gets high-level attendance summary for dashboard
func (h *Handlers) GetAttendanceSummary(w http.ResponseWriter, r *http.Request) {
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	summary, err := h.generateAttendanceSummary(r.Context(), tenantID)
	if err != nil {
		slog.Error("failed to generate attendance summary", "error", err)
		httputil.Error(w, "failed to generate attendance summary", http.StatusInternalServerError)
		return
	}
	
	httputil.JSON(w, summary)
}

// GetAttendanceStats gets overall attendance statistics
func (h *Handlers) GetAttendanceStats(w http.ResponseWriter, r *http.Request) {
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	stats, err := h.generateAttendanceStats(r.Context(), tenantID)
	if err != nil {
		slog.Error("failed to generate attendance stats", "error", err)
		httputil.Error(w, "failed to generate attendance stats", http.StatusInternalServerError)
		return
	}
	
	httputil.JSON(w, stats)
}

// GetPersonAttendanceStats gets attendance statistics for specific person
func (h *Handlers) GetPersonAttendanceStats(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	personID := uuid.MustParse(vars["person_id"])
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	// Parse date range (defaults to current month)
	startDateStr := r.URL.Query().Get("start_date")
	endDateStr := r.URL.Query().Get("end_date")
	
	var startDate, endDate time.Time
	if startDateStr != "" && endDateStr != "" {
		var err error
		startDate, err = time.Parse("2006-01-02", startDateStr)
		if err != nil {
			httputil.Error(w, "invalid start_date format", http.StatusBadRequest)
			return
		}
		
		endDate, err = time.Parse("2006-01-02", endDateStr)
		if err != nil {
			httputil.Error(w, "invalid end_date format", http.StatusBadRequest)
			return
		}
	} else {
		// Default to current month
		now := time.Now()
		startDate = time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
		endDate = startDate.AddDate(0, 1, -1) // Last day of month
	}
	
	stats, err := h.generatePersonAttendanceStats(r.Context(), tenantID, personID, startDate, endDate)
	if err != nil {
		slog.Error("failed to generate person attendance stats", "error", err)
		httputil.Error(w, "failed to generate person attendance stats", http.StatusInternalServerError)
		return
	}
	
	httputil.JSON(w, stats)
}

// Report generation methods

func (h *Handlers) generateDailyReport(ctx context.Context, tenantID uuid.UUID, date time.Time) (*DailyAttendanceReport, error) {
	if err := h.db.SetTenant(ctx, tenantID); err != nil {
		return nil, err
	}

	report := &DailyAttendanceReport{
		Date:    date.Format("2006-01-02"),
		ByShift: make(map[string]ShiftAttendance),
	}

	// Get overall stats for the day
	statsQuery := `
		SELECT 
			COUNT(DISTINCT a.person_id) as total_employees,
			COUNT(DISTINCT CASE WHEN a.status != 'absent' THEN a.person_id END) as present,
			COUNT(DISTINCT CASE WHEN a.status = 'absent' THEN a.person_id END) as absent,
			COUNT(DISTINCT CASE WHEN a.status = 'late' THEN a.person_id END) as late,
			COUNT(DISTINCT CASE WHEN a.status = 'early_leave' THEN a.person_id END) as early_leave,
			COALESCE(SUM(a.worked_minutes), 0) / 60.0 as total_hours,
			COALESCE(SUM(a.overtime_minutes), 0) / 60.0 as overtime_hours
		FROM dm3_attend.attendance_records a
		WHERE DATE(a.date) = $1 AND a.deleted_at IS NULL
	`

	err := h.db.QueryRow(ctx, statsQuery, date.Format("2006-01-02")).Scan(
		&report.TotalEmployees, &report.Present, &report.Absent, &report.Late,
		&report.EarlyLeave, &report.TotalHours, &report.OvertimeHours,
	)
	if err != nil {
		return nil, err
	}

	// Get by shift breakdown
	shiftQuery := `
		SELECT 
			COALESCE(s.name, 'Unassigned') as shift_name,
			COUNT(DISTINCT sa.person_id) as expected,
			COUNT(DISTINCT CASE WHEN a.status != 'absent' THEN a.person_id END) as present,
			COUNT(DISTINCT CASE WHEN a.status = 'absent' THEN a.person_id END) as absent,
			COUNT(DISTINCT CASE WHEN a.status = 'late' THEN a.person_id END) as late,
			COALESCE(SUM(a.worked_minutes), 0) / 60.0 as total_hours,
			COALESCE(SUM(a.overtime_minutes), 0) / 60.0 as overtime_hours
		FROM dm3_attend.shift_assignments sa
		LEFT JOIN dm3_attend.shifts s ON sa.shift_id = s.id
		LEFT JOIN dm3_attend.attendance_records a ON sa.person_id = a.person_id AND DATE(a.date) = $1
		WHERE sa.is_active = true 
		  AND sa.start_date <= $1 
		  AND (sa.end_date IS NULL OR sa.end_date >= $1)
		GROUP BY s.name
	`

	shiftRows, err := h.db.Query(ctx, shiftQuery, date.Format("2006-01-02"))
	if err != nil {
		return nil, err
	}
	defer shiftRows.Close()

	for shiftRows.Next() {
		var shiftName string
		var shiftStats ShiftAttendance

		err := shiftRows.Scan(&shiftName, &shiftStats.Expected, &shiftStats.Present,
			&shiftStats.Absent, &shiftStats.Late, &shiftStats.TotalHours, &shiftStats.OvertimeHours)
		if err != nil {
			continue
		}

		shiftStats.ShiftName = shiftName
		report.ByShift[shiftName] = shiftStats
	}

	// Get individual employee details
	employeeQuery := `
		SELECT 
			a.person_id, a.person_name, p.department,
			COALESCE(s.name, 'Unassigned') as shift_name,
			a.status, a.clock_in_time, a.clock_out_time,
			a.worked_minutes / 60.0 as worked_hours,
			a.overtime_minutes / 60.0 as overtime_hours,
			a.break_minutes,
			CASE WHEN a.status = 'late' THEN true ELSE false END as is_late,
			CASE WHEN a.status = 'early_leave' THEN true ELSE false END as is_early_leave
		FROM dm3_attend.attendance_records a
		LEFT JOIN dm3_identity.persons p ON a.person_id = p.id
		LEFT JOIN dm3_attend.shifts s ON a.shift_id = s.id
		WHERE DATE(a.date) = $1 AND a.deleted_at IS NULL
		ORDER BY a.person_name
	`

	empRows, err := h.db.Query(ctx, employeeQuery, date.Format("2006-01-02"))
	if err != nil {
		return nil, err
	}
	defer empRows.Close()

	for empRows.Next() {
		var emp EmployeeAttendanceDetail
		var department sql.NullString
		var shiftName sql.NullString

		err := empRows.Scan(
			&emp.PersonID, &emp.PersonName, &department, &shiftName,
			&emp.Status, &emp.ClockInTime, &emp.ClockOutTime,
			&emp.WorkedHours, &emp.OvertimeHours, &emp.BreakMinutes,
			&emp.IsLate, &emp.IsEarlyLeave,
		)
		if err != nil {
			continue
		}

		if department.Valid {
			emp.Department = &department.String
		}
		if shiftName.Valid {
			emp.ShiftName = &shiftName.String
		}

		report.Employees = append(report.Employees, emp)
	}

	return report, nil
}

func (h *Handlers) generateWeeklyReport(ctx context.Context, tenantID uuid.UUID, weekStart time.Time) (map[string]interface{}, error) {
	if err := h.db.SetTenant(ctx, tenantID); err != nil {
		return nil, err
	}

	weekEnd := weekStart.AddDate(0, 0, 6) // Sunday

	// Generate daily reports for each day of the week
	weeklyData := map[string]interface{}{
		"week_start": weekStart.Format("2006-01-02"),
		"week_end":   weekEnd.Format("2006-01-02"),
		"daily_reports": make(map[string]*DailyAttendanceReport),
		"weekly_summary": make(map[string]interface{}),
	}

	var totalEmployees, totalPresent, totalAbsent, totalLate int64
	var totalHours, totalOvertimeHours float64

	// Generate report for each day
	for i := 0; i < 7; i++ {
		currentDay := weekStart.AddDate(0, 0, i)
		dailyReport, err := h.generateDailyReport(ctx, tenantID, currentDay)
		if err != nil {
			continue
		}

		dayName := currentDay.Format("Monday")
		weeklyData["daily_reports"].(map[string]*DailyAttendanceReport)[dayName] = dailyReport

		// Aggregate weekly totals
		if dailyReport.TotalEmployees > totalEmployees {
			totalEmployees = dailyReport.TotalEmployees
		}
		totalPresent += dailyReport.Present
		totalAbsent += dailyReport.Absent
		totalLate += dailyReport.Late
		totalHours += dailyReport.TotalHours
		totalOvertimeHours += dailyReport.OvertimeHours
	}

	// Weekly summary
	weeklyData["weekly_summary"] = map[string]interface{}{
		"total_employees":     totalEmployees,
		"total_present":       totalPresent,
		"total_absent":        totalAbsent,
		"total_late":          totalLate,
		"total_hours":         totalHours,
		"total_overtime_hours": totalOvertimeHours,
		"average_attendance_rate": func() float64 {
			if totalEmployees > 0 {
				return float64(totalPresent) / float64(totalEmployees*7) * 100
			}
			return 0
		}(),
		"average_punctuality_rate": func() float64 {
			if totalPresent > 0 {
				return float64(totalPresent-totalLate) / float64(totalPresent) * 100
			}
			return 0
		}(),
	}

	return weeklyData, nil
}

func (h *Handlers) generateMonthlyReport(ctx context.Context, tenantID uuid.UUID, year, month int) (map[string]interface{}, error) {
	if err := h.db.SetTenant(ctx, tenantID); err != nil {
		return nil, err
	}

	monthStart := time.Date(year, time.Month(month), 1, 0, 0, 0, 0, time.UTC)
	monthEnd := monthStart.AddDate(0, 1, -1)

	monthlyData := map[string]interface{}{
		"year":  year,
		"month": month,
		"month_name": monthStart.Format("January"),
		"start_date": monthStart.Format("2006-01-02"),
		"end_date":   monthEnd.Format("2006-01-02"),
	}

	// Monthly aggregated stats
	query := `
		SELECT 
			COUNT(DISTINCT person_id) as total_employees,
			COUNT(*) FILTER (WHERE status != 'absent') as total_present_days,
			COUNT(*) FILTER (WHERE status = 'absent') as total_absent_days,
			COUNT(*) FILTER (WHERE status = 'late') as total_late_days,
			COALESCE(SUM(worked_minutes), 0) / 60.0 as total_hours,
			COALESCE(SUM(overtime_minutes), 0) / 60.0 as total_overtime_hours,
			COUNT(DISTINCT DATE(date)) as working_days
		FROM dm3_attend.attendance_records
		WHERE date >= $1 AND date <= $2 AND deleted_at IS NULL
	`

	var stats struct {
		TotalEmployees     int64   `json:"total_employees"`
		TotalPresentDays   int64   `json:"total_present_days"`
		TotalAbsentDays    int64   `json:"total_absent_days"`
		TotalLateDays      int64   `json:"total_late_days"`
		TotalHours         float64 `json:"total_hours"`
		TotalOvertimeHours float64 `json:"total_overtime_hours"`
		WorkingDays        int64   `json:"working_days"`
	}

	err := h.db.QueryRow(ctx, query, monthStart, monthEnd).Scan(
		&stats.TotalEmployees, &stats.TotalPresentDays, &stats.TotalAbsentDays,
		&stats.TotalLateDays, &stats.TotalHours, &stats.TotalOvertimeHours, &stats.WorkingDays,
	)
	if err != nil {
		return nil, err
	}

	// Calculate rates
	if stats.TotalEmployees > 0 && stats.WorkingDays > 0 {
		expectedDays := stats.TotalEmployees * stats.WorkingDays
		stats := map[string]interface{}{
			"total_employees":       stats.TotalEmployees,
			"total_present_days":    stats.TotalPresentDays,
			"total_absent_days":     stats.TotalAbsentDays,
			"total_late_days":       stats.TotalLateDays,
			"total_hours":           stats.TotalHours,
			"total_overtime_hours":  stats.TotalOvertimeHours,
			"working_days":          stats.WorkingDays,
			"attendance_rate":       float64(stats.TotalPresentDays) / float64(expectedDays) * 100,
			"punctuality_rate":      float64(stats.TotalPresentDays-stats.TotalLateDays) / float64(stats.TotalPresentDays) * 100,
			"average_hours_per_day": stats.TotalHours / float64(stats.TotalPresentDays),
		}
		monthlyData["statistics"] = stats
	}

	// Top performers by attendance
	topPerformersQuery := `
		SELECT 
			person_id, person_name,
			COUNT(*) FILTER (WHERE status != 'absent') as present_days,
			COUNT(*) FILTER (WHERE status = 'absent') as absent_days,
			COUNT(*) FILTER (WHERE status = 'late') as late_days,
			COALESCE(SUM(worked_minutes), 0) / 60.0 as total_hours
		FROM dm3_attend.attendance_records
		WHERE date >= $1 AND date <= $2 AND deleted_at IS NULL
		GROUP BY person_id, person_name
		HAVING COUNT(*) FILTER (WHERE status != 'absent') > 0
		ORDER BY present_days DESC, late_days ASC
		LIMIT 10
	`

	topRows, err := h.db.Query(ctx, topPerformersQuery, monthStart, monthEnd)
	if err != nil {
		return nil, err
	}
	defer topRows.Close()

	var topPerformers []map[string]interface{}
	for topRows.Next() {
		var performer map[string]interface{} = make(map[string]interface{})
		var personID uuid.UUID
		var personName string
		var presentDays, absentDays, lateDays int64
		var totalHours float64

		err := topRows.Scan(&personID, &personName, &presentDays, &absentDays, &lateDays, &totalHours)
		if err != nil {
			continue
		}

		performer["person_id"] = personID
		performer["person_name"] = personName
		performer["present_days"] = presentDays
		performer["absent_days"] = absentDays
		performer["late_days"] = lateDays
		performer["total_hours"] = totalHours

		if presentDays+absentDays > 0 {
			performer["attendance_rate"] = float64(presentDays) / float64(presentDays+absentDays) * 100
		}
		if presentDays > 0 {
			performer["punctuality_rate"] = float64(presentDays-lateDays) / float64(presentDays) * 100
		}

		topPerformers = append(topPerformers, performer)
	}

	monthlyData["top_performers"] = topPerformers

	return monthlyData, nil
}

func (h *Handlers) generatePayrollReport(ctx context.Context, tenantID uuid.UUID, startDate, endDate time.Time) (*PayrollReport, error) {
	if err := h.db.SetTenant(ctx, tenantID); err != nil {
		return nil, err
	}

	report := &PayrollReport{
		PeriodStart: startDate,
		PeriodEnd:   endDate,
	}

	// Get summary totals
	summaryQuery := `
		SELECT 
			COUNT(DISTINCT person_id) as total_employees,
			COALESCE(SUM(regular_minutes), 0) / 60.0 as total_regular_hours,
			COALESCE(SUM(overtime_minutes), 0) / 60.0 as total_overtime_hours
		FROM dm3_attend.attendance_records
		WHERE date >= $1 AND date <= $2 AND deleted_at IS NULL
	`

	err := h.db.QueryRow(ctx, summaryQuery, startDate, endDate).Scan(
		&report.TotalEmployees, &report.TotalRegularHours, &report.TotalOvertimeHours,
	)
	if err != nil {
		return nil, err
	}

	// Get individual employee payroll details
	employeeQuery := `
		SELECT 
			a.person_id, a.person_name, p.department,
			COALESCE(SUM(a.regular_minutes), 0) / 60.0 as regular_hours,
			COALESCE(SUM(a.overtime_minutes), 0) / 60.0 as overtime_hours,
			COALESCE(SUM(a.worked_minutes), 0) / 60.0 as total_hours,
			COUNT(*) FILTER (WHERE a.status != 'absent') as work_days,
			COUNT(*) FILTER (WHERE a.status = 'absent') as absent_days,
			COUNT(*) FILTER (WHERE a.status = 'late') as late_days
		FROM dm3_attend.attendance_records a
		LEFT JOIN dm3_identity.persons p ON a.person_id = p.id
		WHERE a.date >= $1 AND a.date <= $2 AND a.deleted_at IS NULL
		GROUP BY a.person_id, a.person_name, p.department
		ORDER BY a.person_name
	`

	empRows, err := h.db.Query(ctx, employeeQuery, startDate, endDate)
	if err != nil {
		return nil, err
	}
	defer empRows.Close()

	for empRows.Next() {
		var emp EmployeePayrollDetail
		var department sql.NullString

		err := empRows.Scan(
			&emp.PersonID, &emp.PersonName, &department,
			&emp.RegularHours, &emp.OvertimeHours, &emp.TotalHours,
			&emp.WorkDays, &emp.AbsentDays, &emp.LateDays,
		)
		if err != nil {
			continue
		}

		if department.Valid {
			emp.Department = &department.String
		}

		report.Employees = append(report.Employees, emp)
	}

	return report, nil
}

func (h *Handlers) generateAttendanceSummary(ctx context.Context, tenantID uuid.UUID) (map[string]interface{}, error) {
	if err := h.db.SetTenant(ctx, tenantID); err != nil {
		return nil, err
	}

	today := time.Now().Format("2006-01-02")
	summary := make(map[string]interface{})

	// Today's stats
	todayQuery := `
		SELECT 
			COUNT(DISTINCT a.person_id) as total_employees,
			COUNT(DISTINCT CASE WHEN a.status != 'absent' THEN a.person_id END) as present_today,
			COUNT(DISTINCT CASE WHEN a.status = 'absent' THEN a.person_id END) as absent_today,
			COUNT(DISTINCT CASE WHEN a.status = 'late' THEN a.person_id END) as late_today,
			COUNT(DISTINCT CASE WHEN a.clock_in_time IS NOT NULL AND a.clock_out_time IS NULL THEN a.person_id END) as working_now,
			COUNT(DISTINCT CASE WHEN EXISTS(SELECT 1 FROM dm3_attend.break_records b WHERE b.person_id = a.person_id AND b.end_time IS NULL) THEN a.person_id END) as on_break,
			COUNT(DISTINCT CASE WHEN a.approval_status = 'pending' THEN a.person_id END) as pending_approvals
		FROM dm3_attend.attendance_records a
		WHERE DATE(a.date) = $1 AND a.deleted_at IS NULL
	`

	var todayStats struct {
		TotalEmployees    int64 `json:"total_employees"`
		PresentToday      int64 `json:"present_today"`
		AbsentToday       int64 `json:"absent_today"`
		LateToday         int64 `json:"late_today"`
		WorkingNow        int64 `json:"working_now"`
		OnBreak           int64 `json:"on_break"`
		PendingApprovals  int64 `json:"pending_approvals"`
	}

	err := h.db.QueryRow(ctx, todayQuery, today).Scan(
		&todayStats.TotalEmployees, &todayStats.PresentToday, &todayStats.AbsentToday,
		&todayStats.LateToday, &todayStats.WorkingNow, &todayStats.OnBreak, &todayStats.PendingApprovals,
	)
	if err != nil {
		return nil, err
	}

	summary["today"] = todayStats

	// This month's averages
	monthStart := time.Date(time.Now().Year(), time.Now().Month(), 1, 0, 0, 0, 0, time.UTC)
	monthQuery := `
		SELECT 
			AVG(worked_minutes) / 60.0 as avg_working_hours,
			SUM(overtime_minutes) / 60.0 as total_overtime_hours,
			COUNT(*) FILTER (WHERE status != 'absent')::float / NULLIF(COUNT(*), 0) * 100 as attendance_rate,
			COUNT(*) FILTER (WHERE status NOT IN ('absent', 'late'))::float / NULLIF(COUNT(*) FILTER (WHERE status != 'absent'), 0) * 100 as punctuality_rate
		FROM dm3_attend.attendance_records
		WHERE date >= $1 AND deleted_at IS NULL
	`

	var monthStats struct {
		AvgWorkingHours   float64 `json:"average_working_hours"`
		TotalOvertimeHours float64 `json:"total_overtime_hours"`
		AttendanceRate    float64 `json:"attendance_rate"`
		PunctualityRate   float64 `json:"punctuality_rate"`
	}

	err = h.db.QueryRow(ctx, monthQuery, monthStart).Scan(
		&monthStats.AvgWorkingHours, &monthStats.TotalOvertimeHours,
		&monthStats.AttendanceRate, &monthStats.PunctualityRate,
	)
	if err != nil {
		return nil, err
	}

	summary["this_month"] = monthStats

	// By status breakdown
	statusQuery := `
		SELECT status, COUNT(*) as count
		FROM dm3_attend.attendance_records
		WHERE DATE(date) = $1 AND deleted_at IS NULL
		GROUP BY status
	`

	statusRows, err := h.db.Query(ctx, statusQuery, today)
	if err != nil {
		return nil, err
	}
	defer statusRows.Close()

	byStatus := make(map[string]int64)
	for statusRows.Next() {
		var status string
		var count int64
		if err := statusRows.Scan(&status, &count); err == nil {
			byStatus[status] = count
		}
	}
	summary["by_status"] = byStatus

	return summary, nil
}

func (h *Handlers) generateAttendanceStats(ctx context.Context, tenantID uuid.UUID) (*AttendanceStatsResponse, error) {
	summary, err := h.generateAttendanceSummary(ctx, tenantID)
	if err != nil {
		return nil, err
	}

	stats := &AttendanceStatsResponse{
		TenantID: tenantID,
	}

	// Extract values from summary
	if todayData, ok := summary["today"].(struct {
		TotalEmployees   int64 `json:"total_employees"`
		PresentToday     int64 `json:"present_today"`
		AbsentToday      int64 `json:"absent_today"`
		LateToday        int64 `json:"late_today"`
		WorkingNow       int64 `json:"working_now"`
		OnBreak          int64 `json:"on_break"`
		PendingApprovals int64 `json:"pending_approvals"`
	}); ok {
		stats.TotalEmployees = todayData.TotalEmployees
		stats.PresentToday = todayData.PresentToday
		stats.AbsentToday = todayData.AbsentToday
		stats.LateToday = todayData.LateToday
		stats.WorkingNow = todayData.WorkingNow
		stats.OnBreak = todayData.OnBreak
		stats.PendingApprovals = todayData.PendingApprovals
	}

	if monthData, ok := summary["this_month"].(struct {
		AvgWorkingHours    float64 `json:"average_working_hours"`
		TotalOvertimeHours float64 `json:"total_overtime_hours"`
		AttendanceRate     float64 `json:"attendance_rate"`
		PunctualityRate    float64 `json:"punctuality_rate"`
	}); ok {
		stats.AverageWorkingHours = monthData.AvgWorkingHours
		stats.TotalOvertimeHours = monthData.TotalOvertimeHours
		stats.AttendanceRate = monthData.AttendanceRate
		stats.PunctualityRate = monthData.PunctualityRate
	}

	if statusData, ok := summary["by_status"].(map[string]int64); ok {
		stats.ByStatus = statusData
	}

	return stats, nil
}

func (h *Handlers) generatePersonAttendanceStats(ctx context.Context, tenantID, personID uuid.UUID, startDate, endDate time.Time) (*PersonAttendanceStats, error) {
	if err := h.db.SetTenant(ctx, tenantID); err != nil {
		return nil, err
	}

	stats := &PersonAttendanceStats{
		PersonID: personID,
	}

	// Get person name and main stats
	mainQuery := `
		SELECT 
			person_name,
			COUNT(*) as total_days,
			COUNT(*) FILTER (WHERE status != 'absent') as present_days,
			COUNT(*) FILTER (WHERE status = 'absent') as absent_days,
			COUNT(*) FILTER (WHERE status = 'late') as late_days,
			COUNT(*) FILTER (WHERE status = 'early_leave') as early_leave_days,
			COALESCE(SUM(worked_minutes), 0) / 60.0 as total_worked_hours,
			COALESCE(SUM(overtime_minutes), 0) / 60.0 as total_overtime_hours
		FROM dm3_attend.attendance_records
		WHERE person_id = $1 AND date >= $2 AND date <= $3 AND deleted_at IS NULL
		GROUP BY person_name
	`

	err := h.db.QueryRow(ctx, mainQuery, personID, startDate, endDate).Scan(
		&stats.PersonName, &stats.TotalDays, &stats.PresentDays, &stats.AbsentDays,
		&stats.LateDays, &stats.EarlyLeaveDays, &stats.TotalWorkedHours, &stats.TotalOvertimeHours,
	)
	if err != nil {
		return nil, err
	}

	// Calculate rates
	if stats.TotalDays > 0 {
		stats.AttendanceRate = float64(stats.PresentDays) / float64(stats.TotalDays) * 100
	}
	if stats.PresentDays > 0 {
		stats.PunctualityRate = float64(stats.PresentDays-stats.LateDays) / float64(stats.PresentDays) * 100
	}

	// Get average arrival and departure times
	avgTimesQuery := `
		SELECT 
			TO_CHAR(AVG(EXTRACT(EPOCH FROM clock_in_time)::int * INTERVAL '1 second'), 'HH24:MI') as avg_arrival,
			TO_CHAR(AVG(EXTRACT(EPOCH FROM clock_out_time)::int * INTERVAL '1 second'), 'HH24:MI') as avg_departure
		FROM dm3_attend.attendance_records
		WHERE person_id = $1 AND date >= $2 AND date <= $3 
		  AND clock_in_time IS NOT NULL AND deleted_at IS NULL
	`

	var avgArrival, avgDeparture sql.NullString
	err = h.db.QueryRow(ctx, avgTimesQuery, personID, startDate, endDate).Scan(&avgArrival, &avgDeparture)
	if err == nil {
		if avgArrival.Valid {
			stats.AverageArrivalTime = &avgArrival.String
		}
		if avgDeparture.Valid {
			stats.AverageDepartureTime = &avgDeparture.String
		}
	}

	return stats, nil
}