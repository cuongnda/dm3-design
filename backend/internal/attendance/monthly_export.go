package attendance

import (
	"bytes"
	"context"
	"encoding/csv"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/xuri/excelize/v2"

	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/pkg/httputil"
)

// ExportMonthlyReport generates a monthly attendance report from the
// attendance_summary rollup, uploads it to MinIO, and returns the
// object key + direct download URL (served by this same service).
//
// POST /api/v1/attendance/reports/monthly/export?year&month&format=csv|xlsx
//
// The caller gets a stable key like:
//
//	tenants/{tenant}/attendance/monthly-2026-04.csv
//
// Re-exporting the same period overwrites the previous file so the
// latest numbers are always at the known path.
func (h *AttendanceHandlers) ExportMonthlyReport(w http.ResponseWriter, r *http.Request) {
	tenantID := authsvc.CompanyIDFromContext(r.Context())
	if tenantID == "" {
		httputil.Error(w, http.StatusUnauthorized, "missing tenant context")
		return
	}
	if h.store == nil {
		httputil.Error(w, http.StatusServiceUnavailable, "object storage is not configured")
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
	format := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("format")))
	if format == "" {
		format = "csv"
	}
	if format != "csv" && format != "xlsx" {
		httputil.Error(w, http.StatusBadRequest, "format must be csv or xlsx")
		return
	}

	// Pull rows from the rollup first. If the period has never been
	// computed, force a rebuild so the caller gets a fresh file.
	rows, err := h.loadSummaryRowsForExport(r.Context(), tenantID, year, month)
	if err != nil {
		slog.Error("monthly export: load rows", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "failed to load summary rows")
		return
	}
	if len(rows) == 0 {
		if err := h.rebuildMonthlySummary(r.Context(), year, month); err != nil {
			slog.Error("monthly export: on-demand rebuild", "error", err)
			httputil.Error(w, http.StatusInternalServerError, "failed to rebuild summary")
			return
		}
		rows, err = h.loadSummaryRowsForExport(r.Context(), tenantID, year, month)
		if err != nil {
			slog.Error("monthly export: reload after rebuild", "error", err)
			httputil.Error(w, http.StatusInternalServerError, "failed to load summary rows")
			return
		}
	}

	var (
		buf         bytes.Buffer
		contentType string
		ext         string
	)
	switch format {
	case "csv":
		if err := writeMonthlySummaryCSV(&buf, year, month, rows); err != nil {
			slog.Error("monthly export: write csv", "error", err)
			httputil.Error(w, http.StatusInternalServerError, "failed to write csv")
			return
		}
		contentType = "text/csv; charset=utf-8"
		ext = "csv"
	case "xlsx":
		if err := writeMonthlySummaryXLSX(&buf, year, month, rows); err != nil {
			slog.Error("monthly export: write xlsx", "error", err)
			httputil.Error(w, http.StatusInternalServerError, "failed to write xlsx")
			return
		}
		contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
		ext = "xlsx"
	}

	key := fmt.Sprintf("tenants/%s/attendance/monthly-%04d-%02d.%s", tenantID, year, month, ext)
	if err := h.store.PutObject(r.Context(), key, bytes.NewReader(buf.Bytes()), int64(buf.Len()), contentType); err != nil {
		slog.Error("monthly export: put object", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "failed to upload report")
		return
	}

	h.audit.LogFromRequest(r, "attendance.monthly_report_exported", "attendance_report",
		fmt.Sprintf("%d-%02d", year, month), "", "success", nil, map[string]any{
			"year":     year,
			"month":    month,
			"format":   format,
			"rows":     len(rows),
			"key":      key,
			"bytes":    buf.Len(),
			"mime":     contentType,
			"exported": time.Now().UTC().Format(time.RFC3339),
		})

	httputil.JSON(w, http.StatusOK, map[string]any{
		"year":         year,
		"month":        month,
		"format":       format,
		"rows":         len(rows),
		"key":          key,
		"size":         buf.Len(),
		"content_type": contentType,
		// Download URL on this service — the frontend can pass it to the
		// browser as-is since the JWT cookie (or Bearer) is already set up.
		"download_url": fmt.Sprintf("/api/v1/attendance/reports/monthly/download?year=%d&month=%d&format=%s", year, month, format),
	})
}

// DownloadMonthlyReport streams a previously-exported CSV/XLSX back to
// the caller. The object key is derived from (tenant, year, month, format)
// so the caller cannot request another tenant's file by fiddling with
// URL params.
func (h *AttendanceHandlers) DownloadMonthlyReport(w http.ResponseWriter, r *http.Request) {
	tenantID := authsvc.CompanyIDFromContext(r.Context())
	if tenantID == "" {
		httputil.Error(w, http.StatusUnauthorized, "missing tenant context")
		return
	}
	if h.store == nil {
		httputil.Error(w, http.StatusServiceUnavailable, "object storage is not configured")
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
	format := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("format")))
	if format == "" {
		format = "csv"
	}
	if format != "csv" && format != "xlsx" {
		httputil.Error(w, http.StatusBadRequest, "format must be csv or xlsx")
		return
	}

	key := fmt.Sprintf("tenants/%s/attendance/monthly-%04d-%02d.%s", tenantID, year, month, format)
	obj, info, err := h.store.GetObject(r.Context(), key)
	if err != nil {
		slog.Warn("monthly export: object not found", "key", key, "error", err)
		httputil.Error(w, http.StatusNotFound, "report not found — export it first")
		return
	}
	defer obj.Close()

	contentType := info.ContentType
	if contentType == "" {
		if format == "xlsx" {
			contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
		} else {
			contentType = "text/csv; charset=utf-8"
		}
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="attendance-%04d-%02d.%s"`, year, month, format))
	if info.Size > 0 {
		w.Header().Set("Content-Length", strconv.FormatInt(info.Size, 10))
	}
	if _, err := io.Copy(w, obj); err != nil {
		slog.Error("monthly export: stream", "error", err)
	}
}

// summaryExportRow is the minimal projection we need to render the file.
// Keeping this tight keeps the CSV/XLSX writers branch-free.
type summaryExportRow struct {
	UserName              string
	UserEmail             string
	Workdays              int
	OnTimeCount           int
	LateCount             int
	AbsentCount           int
	OnLeaveCount          int
	HalfDayCount          int
	HolidayCount          int
	TotalHours            float64
	RegularHours          float64
	OvertimeHours         float64
	ApprovedOvertimeHours float64
	LateMinutes           int
	EarlyLeaveMinutes     int
}

func (h *AttendanceHandlers) loadSummaryRowsForExport(ctx context.Context, tenantID string, year, month int) ([]summaryExportRow, error) {
	rows, err := h.db.Pool.Query(ctx, `
		SELECT
			COALESCE(NULLIF(TRIM(u.first_name || ' ' || u.last_name), ''), '') AS user_name,
			COALESCE(u.email, ''),
			s.workdays, s.on_time_count, s.late_count, s.absent_count,
			s.on_leave_count, s.half_day_count, s.holiday_count,
			s.total_hours, s.regular_hours, s.overtime_hours,
			s.approved_overtime_hours, s.late_minutes, s.early_leave_minutes
		  FROM dm3_attendance.attendance_summary s
		  LEFT JOIN dm3_identity.users u ON u.id = s.user_id AND u.tenant_id = s.tenant_id
		 WHERE s.tenant_id = $1::uuid AND s.year = $2::int AND s.month = $3::int
		 ORDER BY user_name ASC
	`, tenantID, year, month)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]summaryExportRow, 0)
	for rows.Next() {
		var row summaryExportRow
		if err := rows.Scan(
			&row.UserName, &row.UserEmail,
			&row.Workdays, &row.OnTimeCount, &row.LateCount, &row.AbsentCount,
			&row.OnLeaveCount, &row.HalfDayCount, &row.HolidayCount,
			&row.TotalHours, &row.RegularHours, &row.OvertimeHours,
			&row.ApprovedOvertimeHours, &row.LateMinutes, &row.EarlyLeaveMinutes,
		); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

var monthlyReportHeaders = []string{
	"User", "Email", "Workdays",
	"On time", "Late", "Absent", "On leave", "Half day", "Holiday",
	"Total hours", "Regular hours", "Overtime hours", "Approved OT hours",
	"Late minutes", "Early leave minutes",
}

func writeMonthlySummaryCSV(w io.Writer, year, month int, rows []summaryExportRow) error {
	cw := csv.NewWriter(w)
	defer cw.Flush()

	// Period header — the report is not useful without knowing which
	// month it covers, and the CSV has no other way to express it.
	if err := cw.Write([]string{fmt.Sprintf("Attendance summary %04d-%02d", year, month)}); err != nil {
		return err
	}
	if err := cw.Write([]string{}); err != nil {
		return err
	}
	if err := cw.Write(monthlyReportHeaders); err != nil {
		return err
	}
	for _, r := range rows {
		record := []string{
			r.UserName,
			r.UserEmail,
			strconv.Itoa(r.Workdays),
			strconv.Itoa(r.OnTimeCount),
			strconv.Itoa(r.LateCount),
			strconv.Itoa(r.AbsentCount),
			strconv.Itoa(r.OnLeaveCount),
			strconv.Itoa(r.HalfDayCount),
			strconv.Itoa(r.HolidayCount),
			formatFloat(r.TotalHours),
			formatFloat(r.RegularHours),
			formatFloat(r.OvertimeHours),
			formatFloat(r.ApprovedOvertimeHours),
			strconv.Itoa(r.LateMinutes),
			strconv.Itoa(r.EarlyLeaveMinutes),
		}
		if err := cw.Write(record); err != nil {
			return err
		}
	}
	cw.Flush()
	return cw.Error()
}

func writeMonthlySummaryXLSX(w io.Writer, year, month int, rows []summaryExportRow) error {
	f := excelize.NewFile()
	defer f.Close()

	sheet := fmt.Sprintf("%04d-%02d", year, month)
	idx, err := f.NewSheet(sheet)
	if err != nil {
		return err
	}
	f.SetActiveSheet(idx)
	// Delete the default Sheet1 excelize creates; we only want our named sheet.
	_ = f.DeleteSheet("Sheet1")

	// Headers
	for i, h := range monthlyReportHeaders {
		cell, _ := excelize.CoordinatesToCellName(i+1, 1)
		if err := f.SetCellValue(sheet, cell, h); err != nil {
			return err
		}
	}

	for r, row := range rows {
		rowNum := r + 2
		cells := []any{
			row.UserName, row.UserEmail, row.Workdays,
			row.OnTimeCount, row.LateCount, row.AbsentCount,
			row.OnLeaveCount, row.HalfDayCount, row.HolidayCount,
			row.TotalHours, row.RegularHours, row.OvertimeHours,
			row.ApprovedOvertimeHours,
			row.LateMinutes, row.EarlyLeaveMinutes,
		}
		for i, v := range cells {
			cell, _ := excelize.CoordinatesToCellName(i+1, rowNum)
			if err := f.SetCellValue(sheet, cell, v); err != nil {
				return err
			}
		}
	}

	return f.Write(w)
}

func formatFloat(v float64) string {
	// Two decimals is plenty for hours; avoids 3.9999999 artefacts.
	return strconv.FormatFloat(v, 'f', 2, 64)
}
