package attend

import (
	"context"
	"database/sql"
	"fmt"
	"strconv"
	"strings"
	"time"

	"duall-master/pkg/db"

	"github.com/google/uuid"
	"github.com/lib/pq"
)

// Database operations for attendance service

func (h *Handlers) getAttendanceRecords(ctx context.Context, tenantID uuid.UUID, query AttendanceListQuery) ([]AttendanceRecord, int64, error) {
	// Set tenant context
	if err := h.db.SetTenant(ctx, tenantID); err != nil {
		return nil, 0, err
	}

	// Build WHERE clause
	var conditions []string
	var args []interface{}
	argCount := 0

	// Base condition for non-deleted records
	conditions = append(conditions, "a.deleted_at IS NULL")

	if query.PersonID != nil {
		argCount++
		conditions = append(conditions, fmt.Sprintf("a.person_id = $%d", argCount))
		args = append(args, *query.PersonID)
	}

	if query.ShiftID != nil {
		argCount++
		conditions = append(conditions, fmt.Sprintf("a.shift_id = $%d", argCount))
		args = append(args, *query.ShiftID)
	}

	if query.Status != nil {
		argCount++
		conditions = append(conditions, fmt.Sprintf("a.status = $%d", argCount))
		args = append(args, *query.Status)
	}

	if query.DateFrom != nil {
		if date, err := time.Parse("2006-01-02", *query.DateFrom); err == nil {
			argCount++
			conditions = append(conditions, fmt.Sprintf("a.date >= $%d", argCount))
			args = append(args, date)
		}
	}

	if query.DateTo != nil {
		if date, err := time.Parse("2006-01-02", *query.DateTo); err == nil {
			argCount++
			conditions = append(conditions, fmt.Sprintf("a.date <= $%d", argCount))
			args = append(args, date)
		}
	}

	whereClause := ""
	if len(conditions) > 0 {
		whereClause = "WHERE " + strings.Join(conditions, " AND ")
	}

	// Order by
	orderBy := "a.date DESC, a.created_at DESC"
	if query.OrderBy != nil {
		switch *query.OrderBy {
		case "date":
			orderBy = "a.date"
		case "person_name":
			orderBy = "p.first_name, p.last_name"
		case "status":
			orderBy = "a.status"
		case "worked_minutes":
			orderBy = "a.worked_minutes"
		}
		
		if query.OrderDir != nil && *query.OrderDir == "desc" {
			orderBy += " DESC"
		} else {
			orderBy += " ASC"
		}
	}

	// Count query
	countQuery := fmt.Sprintf(`
		SELECT COUNT(*)
		FROM dm3_attend.attendance_records a
		LEFT JOIN dm3_identity.persons p ON a.person_id = p.id
		%s
	`, whereClause)

	var total int64
	if err := h.db.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	// Main query
	argCount++
	limitArg := argCount
	argCount++
	offsetArg := argCount

	mainQuery := fmt.Sprintf(`
		SELECT 
			a.id, a.tenant_id, a.person_id,
			COALESCE(p.first_name || ' ' || p.last_name, a.person_name) as person_name,
			a.date, a.shift_id, s.name as shift_name,
			a.clock_in_time, a.clock_out_time, a.clock_in_method, a.clock_out_method,
			a.clock_in_location, a.clock_out_location, a.break_minutes, a.worked_minutes,
			a.regular_minutes, a.overtime_minutes, a.status, a.approval_status,
			a.notes, a.metadata, a.created_at, a.updated_at,
			a.approved_by, a.approved_at
		FROM dm3_attend.attendance_records a
		LEFT JOIN dm3_identity.persons p ON a.person_id = p.id
		LEFT JOIN dm3_attend.shifts s ON a.shift_id = s.id
		%s
		ORDER BY %s
		LIMIT $%d OFFSET $%d
	`, whereClause, orderBy, limitArg, offsetArg)

	args = append(args, query.Limit, query.Offset)

	rows, err := h.db.Query(ctx, mainQuery, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var records []AttendanceRecord
	for rows.Next() {
		var r AttendanceRecord
		var metadata sql.NullString

		err := rows.Scan(
			&r.ID, &r.TenantID, &r.PersonID, &r.PersonName, &r.Date,
			&r.ShiftID, &r.ShiftName, &r.ClockInTime, &r.ClockOutTime,
			&r.ClockInMethod, &r.ClockOutMethod, &r.ClockInLocation, &r.ClockOutLocation,
			&r.BreakMinutes, &r.WorkedMinutes, &r.RegularMinutes, &r.OvertimeMinutes,
			&r.Status, &r.ApprovalStatus, &r.Notes, &metadata,
			&r.CreatedAt, &r.UpdatedAt, &r.ApprovedBy, &r.ApprovedAt,
		)
		if err != nil {
			return nil, 0, err
		}

		// Parse metadata JSON
		if metadata.Valid && metadata.String != "" {
			if err := db.ParseJSONB(metadata.String, &r.Metadata); err != nil {
				r.Metadata = map[string]interface{}{}
			}
		}

		records = append(records, r)
	}

	return records, total, nil
}

func (h *Handlers) getAttendanceRecord(ctx context.Context, tenantID, attendanceID uuid.UUID) (*AttendanceRecord, error) {
	if err := h.db.SetTenant(ctx, tenantID); err != nil {
		return nil, err
	}

	query := `
		SELECT 
			a.id, a.tenant_id, a.person_id,
			COALESCE(p.first_name || ' ' || p.last_name, a.person_name) as person_name,
			a.date, a.shift_id, s.name as shift_name,
			a.clock_in_time, a.clock_out_time, a.clock_in_method, a.clock_out_method,
			a.clock_in_location, a.clock_out_location, a.break_minutes, a.worked_minutes,
			a.regular_minutes, a.overtime_minutes, a.status, a.approval_status,
			a.notes, a.metadata, a.created_at, a.updated_at,
			a.approved_by, a.approved_at
		FROM dm3_attend.attendance_records a
		LEFT JOIN dm3_identity.persons p ON a.person_id = p.id
		LEFT JOIN dm3_attend.shifts s ON a.shift_id = s.id
		WHERE a.id = $1 AND a.deleted_at IS NULL
	`

	var r AttendanceRecord
	var metadata sql.NullString

	err := h.db.QueryRow(ctx, query, attendanceID).Scan(
		&r.ID, &r.TenantID, &r.PersonID, &r.PersonName, &r.Date,
		&r.ShiftID, &r.ShiftName, &r.ClockInTime, &r.ClockOutTime,
		&r.ClockInMethod, &r.ClockOutMethod, &r.ClockInLocation, &r.ClockOutLocation,
		&r.BreakMinutes, &r.WorkedMinutes, &r.RegularMinutes, &r.OvertimeMinutes,
		&r.Status, &r.ApprovalStatus, &r.Notes, &metadata,
		&r.CreatedAt, &r.UpdatedAt, &r.ApprovedBy, &r.ApprovedAt,
	)

	if err != nil {
		return nil, err
	}

	// Parse metadata
	if metadata.Valid && metadata.String != "" {
		if err := db.ParseJSONB(metadata.String, &r.Metadata); err != nil {
			r.Metadata = map[string]interface{}{}
		}
	}

	return &r, nil
}

func (h *Handlers) getTodayAttendanceRecord(ctx context.Context, tenantID, personID uuid.UUID) (*AttendanceRecord, error) {
	if err := h.db.SetTenant(ctx, tenantID); err != nil {
		return nil, err
	}

	today := time.Now().Format("2006-01-02")
	query := `
		SELECT 
			a.id, a.tenant_id, a.person_id,
			COALESCE(p.first_name || ' ' || p.last_name, a.person_name) as person_name,
			a.date, a.shift_id, s.name as shift_name,
			a.clock_in_time, a.clock_out_time, a.clock_in_method, a.clock_out_method,
			a.clock_in_location, a.clock_out_location, a.break_minutes, a.worked_minutes,
			a.regular_minutes, a.overtime_minutes, a.status, a.approval_status,
			a.notes, a.metadata, a.created_at, a.updated_at,
			a.approved_by, a.approved_at
		FROM dm3_attend.attendance_records a
		LEFT JOIN dm3_identity.persons p ON a.person_id = p.id
		LEFT JOIN dm3_attend.shifts s ON a.shift_id = s.id
		WHERE a.person_id = $1 AND DATE(a.date) = $2 AND a.deleted_at IS NULL
		ORDER BY a.created_at DESC
		LIMIT 1
	`

	var r AttendanceRecord
	var metadata sql.NullString

	err := h.db.QueryRow(ctx, query, personID, today).Scan(
		&r.ID, &r.TenantID, &r.PersonID, &r.PersonName, &r.Date,
		&r.ShiftID, &r.ShiftName, &r.ClockInTime, &r.ClockOutTime,
		&r.ClockInMethod, &r.ClockOutMethod, &r.ClockInLocation, &r.ClockOutLocation,
		&r.BreakMinutes, &r.WorkedMinutes, &r.RegularMinutes, &r.OvertimeMinutes,
		&r.Status, &r.ApprovalStatus, &r.Notes, &metadata,
		&r.CreatedAt, &r.UpdatedAt, &r.ApprovedBy, &r.ApprovedAt,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	// Parse metadata
	if metadata.Valid && metadata.String != "" {
		if err := db.ParseJSONB(metadata.String, &r.Metadata); err != nil {
			r.Metadata = map[string]interface{}{}
		}
	}

	return &r, nil
}

func (h *Handlers) createAttendanceRecord(ctx context.Context, record *AttendanceRecord) error {
	if err := h.db.SetTenant(ctx, record.TenantID); err != nil {
		return err
	}

	metadataJSON, _ := db.ToJSONB(record.Metadata)

	query := `
		INSERT INTO dm3_attend.attendance_records (
			id, tenant_id, person_id, person_name, date, shift_id,
			clock_in_time, clock_out_time, clock_in_method, clock_out_method,
			clock_in_location, clock_out_location, break_minutes, worked_minutes,
			regular_minutes, overtime_minutes, status, approval_status,
			notes, metadata, created_at, updated_at
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22
		)
	`

	_, err := h.db.Exec(ctx, query,
		record.ID, record.TenantID, record.PersonID, record.PersonName, record.Date, record.ShiftID,
		record.ClockInTime, record.ClockOutTime, record.ClockInMethod, record.ClockOutMethod,
		record.ClockInLocation, record.ClockOutLocation, record.BreakMinutes, record.WorkedMinutes,
		record.RegularMinutes, record.OvertimeMinutes, record.Status, record.ApprovalStatus,
		record.Notes, metadataJSON, record.CreatedAt, record.UpdatedAt,
	)

	return err
}

func (h *Handlers) updateAttendanceRecord(ctx context.Context, record *AttendanceRecord) error {
	if err := h.db.SetTenant(ctx, record.TenantID); err != nil {
		return err
	}

	metadataJSON, _ := db.ToJSONB(record.Metadata)

	query := `
		UPDATE dm3_attend.attendance_records SET
			clock_in_time = $2, clock_out_time = $3, clock_in_method = $4, clock_out_method = $5,
			clock_in_location = $6, clock_out_location = $7, break_minutes = $8, worked_minutes = $9,
			regular_minutes = $10, overtime_minutes = $11, status = $12, approval_status = $13,
			notes = $14, metadata = $15, updated_at = $16,
			approved_by = $17, approved_at = $18
		WHERE id = $1
	`

	_, err := h.db.Exec(ctx, query,
		record.ID, record.ClockInTime, record.ClockOutTime, record.ClockInMethod, record.ClockOutMethod,
		record.ClockInLocation, record.ClockOutLocation, record.BreakMinutes, record.WorkedMinutes,
		record.RegularMinutes, record.OvertimeMinutes, record.Status, record.ApprovalStatus,
		record.Notes, metadataJSON, record.UpdatedAt, record.ApprovedBy, record.ApprovedAt,
	)

	return err
}

// Break records

func (h *Handlers) getActiveBreak(ctx context.Context, tenantID, personID uuid.UUID) (*BreakRecord, error) {
	if err := h.db.SetTenant(ctx, tenantID); err != nil {
		return nil, err
	}

	query := `
		SELECT id, tenant_id, attendance_id, person_id, break_type, start_time, end_time, minutes, is_paid, created_at
		FROM dm3_attend.break_records
		WHERE person_id = $1 AND end_time IS NULL
		ORDER BY start_time DESC
		LIMIT 1
	`

	var br BreakRecord
	err := h.db.QueryRow(ctx, query, personID).Scan(
		&br.ID, &br.TenantID, &br.AttendanceID, &br.PersonID, &br.BreakType,
		&br.StartTime, &br.EndTime, &br.Minutes, &br.IsPaid, &br.CreatedAt,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	return &br, nil
}

func (h *Handlers) createBreakRecord(ctx context.Context, breakRecord *BreakRecord) error {
	if err := h.db.SetTenant(ctx, breakRecord.TenantID); err != nil {
		return err
	}

	query := `
		INSERT INTO dm3_attend.break_records (
			id, tenant_id, attendance_id, person_id, break_type, start_time, is_paid, created_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`

	_, err := h.db.Exec(ctx, query,
		breakRecord.ID, breakRecord.TenantID, breakRecord.AttendanceID, breakRecord.PersonID,
		breakRecord.BreakType, breakRecord.StartTime, breakRecord.IsPaid, breakRecord.CreatedAt,
	)

	return err
}

func (h *Handlers) endBreakRecord(ctx context.Context, breakRecord *BreakRecord) error {
	if err := h.db.SetTenant(ctx, breakRecord.TenantID); err != nil {
		return err
	}

	query := `
		UPDATE dm3_attend.break_records 
		SET end_time = $2, minutes = $3
		WHERE id = $1
	`

	_, err := h.db.Exec(ctx, query, breakRecord.ID, breakRecord.EndTime, breakRecord.Minutes)
	return err
}

// Shifts

func (h *Handlers) getShifts(ctx context.Context, tenantID uuid.UUID) ([]Shift, error) {
	if err := h.db.SetTenant(ctx, tenantID); err != nil {
		return nil, err
	}

	query := `
		SELECT id, tenant_id, name, start_time, end_time, work_days, break_minutes, 
			   grace_period_minutes, color, is_active, created_at, updated_at
		FROM dm3_attend.shifts
		WHERE is_active = true
		ORDER BY name
	`

	rows, err := h.db.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var shifts []Shift
	for rows.Next() {
		var s Shift
		var workDays pq.Int64Array

		err := rows.Scan(
			&s.ID, &s.TenantID, &s.Name, &s.StartTime, &s.EndTime,
			&workDays, &s.BreakMinutes, &s.GracePeriodMinutes, &s.Color,
			&s.IsActive, &s.CreatedAt, &s.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}

		// Convert pq.Int64Array to []int
		s.WorkDays = make([]int, len(workDays))
		for i, day := range workDays {
			s.WorkDays[i] = int(day)
		}

		shifts = append(shifts, s)
	}

	return shifts, nil
}

func (h *Handlers) getShift(ctx context.Context, tenantID, shiftID uuid.UUID) (*Shift, error) {
	if err := h.db.SetTenant(ctx, tenantID); err != nil {
		return nil, err
	}

	query := `
		SELECT id, tenant_id, name, start_time, end_time, work_days, break_minutes, 
			   grace_period_minutes, color, is_active, created_at, updated_at
		FROM dm3_attend.shifts
		WHERE id = $1
	`

	var s Shift
	var workDays pq.Int64Array

	err := h.db.QueryRow(ctx, query, shiftID).Scan(
		&s.ID, &s.TenantID, &s.Name, &s.StartTime, &s.EndTime,
		&workDays, &s.BreakMinutes, &s.GracePeriodMinutes, &s.Color,
		&s.IsActive, &s.CreatedAt, &s.UpdatedAt,
	)

	if err != nil {
		return nil, err
	}

	// Convert work days
	s.WorkDays = make([]int, len(workDays))
	for i, day := range workDays {
		s.WorkDays[i] = int(day)
	}

	return &s, nil
}

func (h *Handlers) createShift(ctx context.Context, shift *Shift) error {
	if err := h.db.SetTenant(ctx, shift.TenantID); err != nil {
		return err
	}

	// Convert []int to pq.Int64Array
	workDays := make(pq.Int64Array, len(shift.WorkDays))
	for i, day := range shift.WorkDays {
		workDays[i] = int64(day)
	}

	query := `
		INSERT INTO dm3_attend.shifts (
			id, tenant_id, name, start_time, end_time, work_days, break_minutes,
			grace_period_minutes, color, is_active, created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
	`

	_, err := h.db.Exec(ctx, query,
		shift.ID, shift.TenantID, shift.Name, shift.StartTime, shift.EndTime,
		workDays, shift.BreakMinutes, shift.GracePeriodMinutes, shift.Color,
		shift.IsActive, shift.CreatedAt, shift.UpdatedAt,
	)

	return err
}

// Helper functions

func (h *Handlers) getPersonName(ctx context.Context, tenantID, personID uuid.UUID) (string, error) {
	if err := h.db.SetTenant(ctx, tenantID); err != nil {
		return "", err
	}

	query := `SELECT first_name || ' ' || last_name FROM dm3_identity.persons WHERE id = $1`
	
	var name string
	err := h.db.QueryRow(ctx, query, personID).Scan(&name)
	return name, err
}

func (h *Handlers) getTenantByCode(ctx context.Context, tenantCode string) (uuid.UUID, error) {
	query := `SELECT id FROM dm3_auth.companies WHERE code = $1 AND active = true`
	
	var tenantID uuid.UUID
	err := h.db.QueryRow(ctx, query, tenantCode).Scan(&tenantID)
	return tenantID, err
}

func (h *Handlers) getPersonByCode(ctx context.Context, tenantID uuid.UUID, personCode string) (uuid.UUID, error) {
	if err := h.db.SetTenant(ctx, tenantID); err != nil {
		return uuid.Nil, err
	}

	// Try employee code first, then badge number
	query := `
		SELECT id FROM dm3_identity.persons 
		WHERE (employee_code = $1 OR badge_number = $1) AND active = true
		LIMIT 1
	`
	
	var personID uuid.UUID
	err := h.db.QueryRow(ctx, query, personCode).Scan(&personID)
	return personID, err
}

// Business logic helpers

func (h *Handlers) processClockIn(ctx context.Context, tenantID uuid.UUID, req ClockInRequest, clockTime time.Time) (*AttendanceRecord, error) {
	// Get person name
	personName, err := h.getPersonName(ctx, tenantID, req.PersonID)
	if err != nil {
		return nil, fmt.Errorf("person not found: %w", err)
	}

	// Get shift assignment for today
	var shiftID *uuid.UUID
	var shiftName *string
	if shift := h.getTodayShiftAssignment(ctx, tenantID, req.PersonID); shift != nil {
		shiftID = &shift.ShiftID
		shiftName = &shift.ShiftName
	}

	// Create attendance record
	attendance := &AttendanceRecord{
		ID:              uuid.New(),
		TenantID:        tenantID,
		PersonID:        req.PersonID,
		PersonName:      personName,
		Date:            time.Date(clockTime.Year(), clockTime.Month(), clockTime.Day(), 0, 0, 0, 0, clockTime.Location()),
		ShiftID:         shiftID,
		ShiftName:       shiftName,
		ClockInTime:     &clockTime,
		ClockInMethod:   &req.Method,
		ClockInLocation: req.Location,
		Status:          AttendanceStatusPresent,
		ApprovalStatus:  ApprovalStatusPending,
		Metadata:        req.Metadata,
		CreatedAt:       time.Now(),
		UpdatedAt:       time.Now(),
	}

	// Calculate status (late/on-time)
	h.calculateAttendanceStatus(attendance)

	if err := h.createAttendanceRecord(ctx, attendance); err != nil {
		return nil, err
	}

	return attendance, nil
}

func (h *Handlers) processClockOut(ctx context.Context, attendance *AttendanceRecord, req ClockOutRequest, clockTime time.Time) (*AttendanceRecord, error) {
	attendance.ClockOutTime = &clockTime
	attendance.ClockOutMethod = &req.Method
	attendance.ClockOutLocation = req.Location
	attendance.UpdatedAt = time.Now()

	// Merge metadata
	if req.Metadata != nil {
		if attendance.Metadata == nil {
			attendance.Metadata = make(map[string]interface{})
		}
		for k, v := range req.Metadata {
			attendance.Metadata[k] = v
		}
	}

	// Calculate worked minutes and status
	h.calculateAttendanceMetrics(attendance)
	h.calculateAttendanceStatus(attendance)

	if err := h.updateAttendanceRecord(ctx, attendance); err != nil {
		return nil, err
	}

	return attendance, nil
}

func (h *Handlers) calculateAttendanceMetrics(attendance *AttendanceRecord) {
	if attendance.ClockInTime == nil {
		return
	}

	var workedMinutes int
	if attendance.ClockOutTime != nil {
		// Calculate total time between clock in and clock out
		totalMinutes := int(attendance.ClockOutTime.Sub(*attendance.ClockInTime).Minutes())
		workedMinutes = totalMinutes - attendance.BreakMinutes
	} else {
		// Currently working - calculate time so far
		totalMinutes := int(time.Since(*attendance.ClockInTime).Minutes())
		workedMinutes = totalMinutes - attendance.BreakMinutes
	}

	if workedMinutes < 0 {
		workedMinutes = 0
	}

	attendance.WorkedMinutes = workedMinutes

	// Calculate regular vs overtime hours
	standardWorkMinutes := 8 * 60 // 8 hours = 480 minutes
	if workedMinutes <= standardWorkMinutes {
		attendance.RegularMinutes = workedMinutes
		attendance.OvertimeMinutes = 0
	} else {
		attendance.RegularMinutes = standardWorkMinutes
		attendance.OvertimeMinutes = workedMinutes - standardWorkMinutes
	}
}

func (h *Handlers) calculateAttendanceStatus(attendance *AttendanceRecord) {
	if attendance.ClockInTime == nil {
		attendance.Status = AttendanceStatusAbsent
		return
	}

	// Default to present
	status := AttendanceStatusPresent

	// Check if late (if we have shift info)
	if attendance.ShiftID != nil {
		if shift, err := h.getShift(context.Background(), attendance.TenantID, *attendance.ShiftID); err == nil {
			if shiftStart, err := time.Parse("15:04", shift.StartTime); err == nil {
				// Combine shift start time with attendance date
				expectedStart := time.Date(
					attendance.Date.Year(), attendance.Date.Month(), attendance.Date.Day(),
					shiftStart.Hour(), shiftStart.Minute(), 0, 0, attendance.Date.Location(),
				)

				// Add grace period
				graceTime := expectedStart.Add(time.Duration(shift.GracePeriodMinutes) * time.Minute)

				if attendance.ClockInTime.After(graceTime) {
					status = AttendanceStatusLate
				}
			}
		}
	}

	// Check for early leave (if clocked out and we have shift info)
	if attendance.ClockOutTime != nil && attendance.ShiftID != nil {
		if shift, err := h.getShift(context.Background(), attendance.TenantID, *attendance.ShiftID); err == nil {
			if shiftEnd, err := time.Parse("15:04", shift.EndTime); err == nil {
				expectedEnd := time.Date(
					attendance.Date.Year(), attendance.Date.Month(), attendance.Date.Day(),
					shiftEnd.Hour(), shiftEnd.Minute(), 0, 0, attendance.Date.Location(),
				)

				// Allow leaving early by threshold (e.g., 15 minutes)
				earlyThreshold := 15 * time.Minute
				if attendance.ClockOutTime.Before(expectedEnd.Add(-earlyThreshold)) {
					if status == AttendanceStatusLate {
						status = AttendanceStatusPartial // late AND early leave
					} else {
						status = AttendanceStatusEarlyLeave
					}
				}
			}
		}
	}

	attendance.Status = status
}

func (h *Handlers) getTodayShiftAssignment(ctx context.Context, tenantID, personID uuid.UUID) *ShiftAssignment {
	if err := h.db.SetTenant(ctx, tenantID); err != nil {
		return nil
	}

	query := `
		SELECT sa.id, sa.tenant_id, sa.person_id, p.first_name || ' ' || p.last_name as person_name,
			   sa.shift_id, s.name as shift_name, sa.start_date, sa.end_date, sa.is_active,
			   sa.created_at, sa.updated_at
		FROM dm3_attend.shift_assignments sa
		JOIN dm3_attend.shifts s ON sa.shift_id = s.id
		LEFT JOIN dm3_identity.persons p ON sa.person_id = p.id
		WHERE sa.person_id = $1 AND sa.is_active = true
		  AND sa.start_date <= CURRENT_DATE 
		  AND (sa.end_date IS NULL OR sa.end_date >= CURRENT_DATE)
		ORDER BY sa.start_date DESC
		LIMIT 1
	`

	var sa ShiftAssignment
	err := h.db.QueryRow(ctx, query, personID).Scan(
		&sa.ID, &sa.TenantID, &sa.PersonID, &sa.PersonName,
		&sa.ShiftID, &sa.ShiftName, &sa.StartDate, &sa.EndDate,
		&sa.IsActive, &sa.CreatedAt, &sa.UpdatedAt,
	)

	if err != nil {
		return nil
	}

	return &sa
}

// Settings

func (h *Handlers) getAttendanceSettings(ctx context.Context, tenantID uuid.UUID) (*AttendanceSettings, error) {
	if err := h.db.SetTenant(ctx, tenantID); err != nil {
		return nil, err
	}

	query := `
		SELECT id, tenant_id, working_days_per_week, working_hours_per_day, overtime_rate,
			   late_threshold_minutes, early_leave_threshold_minutes, require_approval,
			   auto_clock_out, auto_clock_out_time, track_breaks, max_break_minutes,
			   rounding_minutes, week_start_day, timezone_offset, created_at, updated_at
		FROM dm3_attend.attendance_settings
		WHERE tenant_id = $1
	`

	var settings AttendanceSettings
	err := h.db.QueryRow(ctx, query, tenantID).Scan(
		&settings.ID, &settings.TenantID, &settings.WorkingDaysPerWeek, &settings.WorkingHoursPerDay,
		&settings.OvertimeRate, &settings.LateThresholdMinutes, &settings.EarlyLeaveThresholdMinutes,
		&settings.RequireApproval, &settings.AutoClockOut, &settings.AutoClockOutTime,
		&settings.TrackBreaks, &settings.MaxBreakMinutes, &settings.RoundingMinutes,
		&settings.WeekStartDay, &settings.TimezoneOffset, &settings.CreatedAt, &settings.UpdatedAt,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			// Return default settings
			defaults := DefaultAttendanceSettings
			defaults.TenantID = tenantID
			return &defaults, nil
		}
		return nil, err
	}

	return &settings, nil
}