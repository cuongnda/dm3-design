package attend

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/nats-io/nats.go"
)

// NATS event consumers for attendance service

func (h *Handlers) StartAttendanceConsumers(ctx context.Context) {
	go h.consumeAccessEvents(ctx)
	go h.consumeDeviceEvents(ctx)
	go h.consumeIdentityEvents(ctx)
	
	slog.Info("attendance NATS consumers started")
}

// consumeAccessEvents listens for access events and auto-creates attendance records
func (h *Handlers) consumeAccessEvents(ctx context.Context) {
	// Subscribe to access events from all tenants
	subject := "dm.*.access.log.granted"
	
	_, err := h.nats.Subscribe(subject, func(msg *nats.Msg) {
		var event AccessEvent
		if err := json.Unmarshal(msg.Data, &event); err != nil {
			slog.Error("failed to unmarshal access event", "error", err, "subject", msg.Subject)
			return
		}
		
		// Process access event for attendance
		if err := h.processAccessEvent(ctx, &event); err != nil {
			slog.Error("failed to process access event for attendance", "error", err, "event", event)
		}
	})
	
	if err != nil {
		slog.Error("failed to subscribe to access events", "error", err, "subject", subject)
		return
	}
	
	slog.Info("subscribed to access events", "subject", subject)
}

// consumeDeviceEvents listens for device events (online/offline)
func (h *Handlers) consumeDeviceEvents(ctx context.Context) {
	subject := "dm.*.device.status.*"
	
	_, err := h.nats.Subscribe(subject, func(msg *nats.Msg) {
		var event DeviceEvent
		if err := json.Unmarshal(msg.Data, &event); err != nil {
			slog.Error("failed to unmarshal device event", "error", err)
			return
		}
		
		// Log device events for attendance audit
		slog.Info("device event received", "device_id", event.DeviceID, "status", event.Status, "tenant_id", event.TenantID)
	})
	
	if err != nil {
		slog.Error("failed to subscribe to device events", "error", err, "subject", subject)
	}
}

// consumeIdentityEvents listens for person/employee changes
func (h *Handlers) consumeIdentityEvents(ctx context.Context) {
	subject := "dm.*.identity.person.*"
	
	_, err := h.nats.Subscribe(subject, func(msg *nats.Msg) {
		var event IdentityEvent
		if err := json.Unmarshal(msg.Data, &event); err != nil {
			slog.Error("failed to unmarshal identity event", "error", err)
			return
		}
		
		// Handle person changes (name updates, deactivation, etc.)
		if err := h.processIdentityEvent(ctx, &event); err != nil {
			slog.Error("failed to process identity event", "error", err)
		}
	})
	
	if err != nil {
		slog.Error("failed to subscribe to identity events", "error", err, "subject", subject)
	}
}

// Event processors

func (h *Handlers) processAccessEvent(ctx context.Context, event *AccessEvent) error {
	// Only process door access events for attendance
	if event.AccessType != "door" || event.PersonID == nil {
		return nil
	}

	tenantID := event.TenantID
	personID := *event.PersonID
	accessTime := event.Timestamp
	deviceLocation := event.DeviceName

	// Determine if this is clock in or clock out
	isClockIn, err := h.determineClockAction(ctx, tenantID, personID, accessTime)
	if err != nil {
		return err
	}

	if isClockIn {
		// Auto clock in
		req := ClockInRequest{
			PersonID:  personID,
			Method:    ClockMethodDoor,
			Location:  &deviceLocation,
			DeviceID:  &event.DeviceID,
			Timestamp: &accessTime,
			Metadata: map[string]interface{}{
				"auto_generated": true,
				"access_event_id": event.ID,
				"card_number":     event.CardNumber,
				"zone":           event.Zone,
			},
		}

		attendance, err := h.processClockIn(ctx, tenantID, req, accessTime)
		if err != nil {
			slog.Error("failed to auto clock in", "error", err, "person_id", personID, "device", deviceLocation)
			return err
		}

		// Publish attendance event
		go h.publishAttendanceEvent(attendance, "auto_clock_in")
		
		slog.Info("auto clock in processed", "person_id", personID, "device", deviceLocation, "time", accessTime)

	} else {
		// Auto clock out
		attendance, err := h.getTodayAttendanceRecord(ctx, tenantID, personID)
		if err != nil || attendance == nil || attendance.ClockInTime == nil {
			// No clock in record, skip clock out
			return nil
		}

		if attendance.ClockOutTime != nil {
			// Already clocked out, skip
			return nil
		}

		req := ClockOutRequest{
			PersonID:  personID,
			Method:    ClockMethodDoor,
			Location:  &deviceLocation,
			DeviceID:  &event.DeviceID,
			Timestamp: &accessTime,
			Metadata: map[string]interface{}{
				"auto_generated": true,
				"access_event_id": event.ID,
				"card_number":     event.CardNumber,
				"zone":           event.Zone,
			},
		}

		attendance, err = h.processClockOut(ctx, attendance, req, accessTime)
		if err != nil {
			slog.Error("failed to auto clock out", "error", err, "person_id", personID, "device", deviceLocation)
			return err
		}

		// Publish attendance event
		go h.publishAttendanceEvent(attendance, "auto_clock_out")
		
		slog.Info("auto clock out processed", "person_id", personID, "device", deviceLocation, "time", accessTime, "worked_minutes", attendance.WorkedMinutes)
	}

	return nil
}

func (h *Handlers) processIdentityEvent(ctx context.Context, event *IdentityEvent) error {
	switch event.Action {
	case "person_updated":
		// Update person name in attendance records
		if event.PersonID != nil && event.PersonName != "" {
			if err := h.updatePersonNameInAttendance(ctx, event.TenantID, *event.PersonID, event.PersonName); err != nil {
				slog.Error("failed to update person name in attendance", "error", err)
			}
		}
		
	case "person_deactivated":
		// Handle person deactivation
		if event.PersonID != nil {
			slog.Info("person deactivated", "person_id", *event.PersonID, "tenant_id", event.TenantID)
			// Could end active shift assignments, etc.
		}
	}
	
	return nil
}

// Helper methods

func (h *Handlers) determineClockAction(ctx context.Context, tenantID, personID uuid.UUID, accessTime time.Time) (bool, error) {
	// Get today's attendance record
	attendance, err := h.getTodayAttendanceRecord(ctx, tenantID, personID)
	if err != nil {
		return false, err
	}

	// If no record or not clocked in yet -> clock in
	if attendance == nil || attendance.ClockInTime == nil {
		return true, nil
	}

	// If already clocked out -> clock in again (new shift/overtime)
	if attendance.ClockOutTime != nil {
		return true, nil
	}

	// If clocked in but no recent access (>30 min) -> assume clock out
	if time.Since(*attendance.ClockInTime) > 30*time.Minute {
		return false, nil
	}

	// Recent clock in, this might be entering different zone -> ignore
	return false, nil
}

func (h *Handlers) updatePersonNameInAttendance(ctx context.Context, tenantID, personID uuid.UUID, newName string) error {
	if err := h.db.SetTenant(ctx, tenantID); err != nil {
		return err
	}

	query := `
		UPDATE dm3_attend.attendance_records 
		SET person_name = $2, updated_at = now()
		WHERE person_id = $1 AND person_name != $2
	`

	_, err := h.db.Exec(ctx, query, personID, newName)
	return err
}

// Event publishers

func (h *Handlers) publishAttendanceEvent(attendance *AttendanceRecord, action string) {
	event := AttendanceEvent{
		Type:       "attendance",
		TenantID:   attendance.TenantID,
		PersonID:   attendance.PersonID,
		PersonName: attendance.PersonName,
		Action:     action,
		Timestamp:  time.Now(),
		Method:     getClockMethod(attendance, action),
		Location:   getClockLocation(attendance, action),
		Metadata: map[string]interface{}{
			"attendance_id":    attendance.ID,
			"status":          attendance.Status,
			"worked_minutes":  attendance.WorkedMinutes,
			"break_minutes":   attendance.BreakMinutes,
		},
	}

	// Merge existing metadata
	if attendance.Metadata != nil {
		for k, v := range attendance.Metadata {
			event.Metadata[k] = v
		}
	}

	eventJSON, _ := json.Marshal(event)

	// Publish to tenant-specific subject
	subject := fmt.Sprintf("dm.%s.attendance.%s", attendance.TenantID, action)
	if err := h.nats.Publish(subject, eventJSON); err != nil {
		slog.Error("failed to publish attendance event", "error", err, "subject", subject)
	}

	// Publish to notification service for alerts
	if shouldNotify(action, attendance) {
		notifEvent := map[string]interface{}{
			"type":        "attendance_alert",
			"tenant_id":   attendance.TenantID,
			"person_id":   attendance.PersonID,
			"person_name": attendance.PersonName,
			"action":      action,
			"timestamp":   event.Timestamp,
			"status":      attendance.Status,
			"worked_hours": float64(attendance.WorkedMinutes) / 60.0,
			"message":     generateAttendanceMessage(action, attendance),
		}

		notifJSON, _ := json.Marshal(notifEvent)
		h.nats.Publish("dm.notification.send", notifJSON)
	}
}

func (h *Handlers) publishBreakEvent(breakRecord *BreakRecord, action string) {
	event := map[string]interface{}{
		"type":         "break",
		"tenant_id":    breakRecord.TenantID,
		"person_id":    breakRecord.PersonID,
		"break_id":     breakRecord.ID,
		"attendance_id": breakRecord.AttendanceID,
		"action":       action,
		"break_type":   breakRecord.BreakType,
		"timestamp":    time.Now(),
		"start_time":   breakRecord.StartTime,
		"end_time":     breakRecord.EndTime,
		"minutes":      breakRecord.Minutes,
		"is_paid":      breakRecord.IsPaid,
	}

	eventJSON, _ := json.Marshal(event)

	// Publish break event
	subject := fmt.Sprintf("dm.%s.attendance.%s", breakRecord.TenantID, action)
	if err := h.nats.Publish(subject, eventJSON); err != nil {
		slog.Error("failed to publish break event", "error", err)
	}
}

// Background jobs

func (h *Handlers) StartAttendanceJobs() {
	// Auto clock out job - runs every hour
	go h.runAutoClockOutJob()

	// Daily summary job - runs at midnight
	go h.runDailySummaryJob()

	// Overtime alert job - runs every 30 minutes
	go h.runOvertimeAlertJob()

	slog.Info("attendance background jobs started")
}

func (h *Handlers) runAutoClockOutJob() {
	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			if err := h.processAutoClockOut(context.Background()); err != nil {
				slog.Error("auto clock out job failed", "error", err)
			}
		}
	}
}

func (h *Handlers) runDailySummaryJob() {
	// Calculate time until next midnight
	now := time.Now()
	tomorrow := now.Add(24 * time.Hour)
	midnight := time.Date(tomorrow.Year(), tomorrow.Month(), tomorrow.Day(), 0, 0, 0, 0, tomorrow.Location())
	timeUntilMidnight := midnight.Sub(now)

	// Wait until midnight, then run daily
	time.Sleep(timeUntilMidnight)
	
	ticker := time.NewTicker(24 * time.Hour)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			if err := h.processDailySummary(context.Background()); err != nil {
				slog.Error("daily summary job failed", "error", err)
			}
		}
	}
}

func (h *Handlers) runOvertimeAlertJob() {
	ticker := time.NewTicker(30 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			if err := h.processOvertimeAlerts(context.Background()); err != nil {
				slog.Error("overtime alert job failed", "error", err)
			}
		}
	}
}

func (h *Handlers) processAutoClockOut(ctx context.Context) error {
	// Get all tenants with auto clock out enabled
	tenants, err := h.getTenantsWithAutoClockOut(ctx)
	if err != nil {
		return err
	}

	for _, tenantID := range tenants {
		// Get attendance settings
		settings, err := h.getAttendanceSettings(ctx, tenantID)
		if err != nil {
			continue
		}

		if !settings.AutoClockOut || settings.AutoClockOutTime == nil {
			continue
		}

		// Parse auto clock out time
		autoClockOutTime, err := time.Parse("15:04", *settings.AutoClockOutTime)
		if err != nil {
			continue
		}

		// Check if it's time to auto clock out
		now := time.Now()
		clockOutTime := time.Date(now.Year(), now.Month(), now.Day(), 
			autoClockOutTime.Hour(), autoClockOutTime.Minute(), 0, 0, now.Location())

		// Only run if current time is within 5 minutes of clock out time
		if now.After(clockOutTime) && now.Before(clockOutTime.Add(5*time.Minute)) {
			if err := h.autoClockOutEmployees(ctx, tenantID); err != nil {
				slog.Error("failed to auto clock out employees", "error", err, "tenant_id", tenantID)
			}
		}
	}

	return nil
}

func (h *Handlers) processDailySummary(ctx context.Context) error {
	// Generate daily attendance summary for all tenants
	yesterday := time.Now().AddDate(0, 0, -1).Format("2006-01-02")
	
	// This would generate daily reports and send them via notification service
	slog.Info("processing daily attendance summary", "date", yesterday)
	
	return nil
}

func (h *Handlers) processOvertimeAlerts(ctx context.Context) error {
	// Find employees working overtime and send alerts
	now := time.Now()
	
	// Get employees who have been working > 8 hours today without clock out
	query := `
		SELECT DISTINCT a.tenant_id, a.person_id, a.person_name, a.clock_in_time, a.worked_minutes
		FROM dm3_attend.attendance_records a
		WHERE DATE(a.date) = CURRENT_DATE 
		  AND a.clock_in_time IS NOT NULL 
		  AND a.clock_out_time IS NULL
		  AND EXTRACT(EPOCH FROM (now() - a.clock_in_time)) / 60 > 480
	`

	rows, err := h.db.Query(ctx, query)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var tenantID, personID uuid.UUID
		var personName string
		var clockInTime time.Time
		var workedMinutes int

		err := rows.Scan(&tenantID, &personID, &personName, &clockInTime, &workedMinutes)
		if err != nil {
			continue
		}

		// Calculate current working hours
		currentWorkedHours := time.Since(clockInTime).Hours()

		// Send overtime alert
		alertEvent := map[string]interface{}{
			"type":         "overtime_alert",
			"tenant_id":    tenantID,
			"person_id":    personID,
			"person_name":  personName,
			"worked_hours": currentWorkedHours,
			"clock_in_time": clockInTime,
			"message":      fmt.Sprintf("%s has been working for %.1f hours", personName, currentWorkedHours),
			"severity":     getOvertimeSeverity(currentWorkedHours),
		}

		alertJSON, _ := json.Marshal(alertEvent)
		h.nats.Publish("dm.notification.send", alertJSON)
	}

	return nil
}

// Helper functions

func getClockMethod(attendance *AttendanceRecord, action string) string {
	if action == "clock_in" || action == "auto_clock_in" {
		if attendance.ClockInMethod != nil {
			return *attendance.ClockInMethod
		}
	} else if action == "clock_out" || action == "auto_clock_out" {
		if attendance.ClockOutMethod != nil {
			return *attendance.ClockOutMethod
		}
	}
	return ClockMethodManual
}

func getClockLocation(attendance *AttendanceRecord, action string) *string {
	if action == "clock_in" || action == "auto_clock_in" {
		return attendance.ClockInLocation
	} else if action == "clock_out" || action == "auto_clock_out" {
		return attendance.ClockOutLocation
	}
	return nil
}

func shouldNotify(action string, attendance *AttendanceRecord) bool {
	// Send notifications for important events
	switch action {
	case "clock_in":
		return attendance.Status == AttendanceStatusLate
	case "clock_out":
		return attendance.OvertimeMinutes > 60 // > 1 hour overtime
	case "auto_clock_in", "auto_clock_out":
		return true // Always notify for auto events
	default:
		return false
	}
}

func generateAttendanceMessage(action string, attendance *AttendanceRecord) string {
	switch action {
	case "clock_in":
		if attendance.Status == AttendanceStatusLate {
			return fmt.Sprintf("%s clocked in late at %s", attendance.PersonName, attendance.ClockInTime.Format("15:04"))
		}
		return fmt.Sprintf("%s clocked in at %s", attendance.PersonName, attendance.ClockInTime.Format("15:04"))
	
	case "clock_out":
		hours := float64(attendance.WorkedMinutes) / 60.0
		if attendance.OvertimeMinutes > 0 {
			overtimeHours := float64(attendance.OvertimeMinutes) / 60.0
			return fmt.Sprintf("%s clocked out after %.1f hours (%.1f overtime)", attendance.PersonName, hours, overtimeHours)
		}
		return fmt.Sprintf("%s clocked out after %.1f hours", attendance.PersonName, hours)
	
	case "auto_clock_in":
		return fmt.Sprintf("%s automatically clocked in via door access", attendance.PersonName)
	
	case "auto_clock_out":
		return fmt.Sprintf("%s automatically clocked out via door access", attendance.PersonName)
	
	default:
		return fmt.Sprintf("%s attendance event: %s", attendance.PersonName, action)
	}
}

func getOvertimeSeverity(hours float64) string {
	if hours >= 12 {
		return "critical"
	} else if hours >= 10 {
		return "high"
	} else if hours >= 8.5 {
		return "medium"
	}
	return "low"
}

func (h *Handlers) getTenantsWithAutoClockOut(ctx context.Context) ([]uuid.UUID, error) {
	query := `SELECT tenant_id FROM dm3_attend.attendance_settings WHERE auto_clock_out = true`
	
	rows, err := h.db.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tenantIDs []uuid.UUID
	for rows.Next() {
		var tenantID uuid.UUID
		if err := rows.Scan(&tenantID); err == nil {
			tenantIDs = append(tenantIDs, tenantID)
		}
	}

	return tenantIDs, nil
}

func (h *Handlers) autoClockOutEmployees(ctx context.Context, tenantID uuid.UUID) error {
	if err := h.db.SetTenant(ctx, tenantID); err != nil {
		return err
	}

	// Find employees still clocked in
	query := `
		SELECT person_id, person_name FROM dm3_attend.attendance_records 
		WHERE DATE(date) = CURRENT_DATE AND clock_in_time IS NOT NULL AND clock_out_time IS NULL
	`

	rows, err := h.db.Query(ctx, query)
	if err != nil {
		return err
	}
	defer rows.Close()

	now := time.Now()

	for rows.Next() {
		var personID uuid.UUID
		var personName string
		
		if err := rows.Scan(&personID, &personName); err != nil {
			continue
		}

		// Get attendance record
		if attendance, err := h.getTodayAttendanceRecord(ctx, tenantID, personID); err == nil && attendance != nil {
			// Auto clock out
			req := ClockOutRequest{
				PersonID: personID,
				Method:   ClockMethodAuto,
				Metadata: map[string]interface{}{
					"auto_clock_out": true,
					"reason":        "automatic_end_of_shift",
				},
			}

			if _, err := h.processClockOut(ctx, attendance, req, now); err != nil {
				slog.Error("failed to auto clock out employee", "error", err, "person_id", personID)
			} else {
				slog.Info("auto clocked out employee", "person_id", personID, "person_name", personName)
			}
		}
	}

	return nil
}

// Event type definitions for consumed events

type AccessEvent struct {
	ID         string     `json:"id"`
	TenantID   uuid.UUID  `json:"tenant_id"`
	DeviceID   string     `json:"device_id"`
	DeviceName string     `json:"device_name"`
	PersonID   *uuid.UUID `json:"person_id,omitempty"`
	CardNumber *string    `json:"card_number,omitempty"`
	AccessType string     `json:"access_type"` // door, turnstile, etc.
	Zone       string     `json:"zone"`
	Result     string     `json:"result"` // granted, denied
	Timestamp  time.Time  `json:"timestamp"`
}

type DeviceEvent struct {
	TenantID  uuid.UUID `json:"tenant_id"`
	DeviceID  string    `json:"device_id"`
	Status    string    `json:"status"` // online, offline, error
	Timestamp time.Time `json:"timestamp"`
}

type IdentityEvent struct {
	TenantID   uuid.UUID  `json:"tenant_id"`
	PersonID   *uuid.UUID `json:"person_id,omitempty"`
	PersonName string     `json:"person_name,omitempty"`
	Action     string     `json:"action"` // person_created, person_updated, person_deactivated
	Timestamp  time.Time  `json:"timestamp"`
}