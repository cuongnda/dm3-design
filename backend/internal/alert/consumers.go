package alert

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"duall-master/pkg/db"

	"github.com/google/uuid"
	"github.com/nats-io/nats.go"
)

// EventConsumer handles NATS events and processes them through the rule engine
type EventConsumer struct {
	db         *db.DB
	nats       *nats.Conn
	ruleEngine *RuleEngine
	subscriptions []*nats.Subscription
}

// NewEventConsumer creates a new event consumer
func NewEventConsumer(database *db.DB, nc *nats.Conn, re *RuleEngine) *EventConsumer {
	return &EventConsumer{
		db:         database,
		nats:       nc,
		ruleEngine: re,
	}
}

// Start begins consuming NATS events
func (ec *EventConsumer) Start() error {
	slog.Info("starting alert event consumers")

	// Subscribe to various event types that should trigger alert evaluation
	subjects := []struct {
		pattern string
		handler nats.MsgHandler
	}{
		// Access control events
		{"dm.*.access.granted", ec.handleAccessGranted},
		{"dm.*.access.denied", ec.handleAccessDenied},
		{"dm.*.access.door.opened", ec.handleDoorOpened},
		{"dm.*.access.door.closed", ec.handleDoorClosed},
		{"dm.*.access.door.forced", ec.handleDoorForced},
		{"dm.*.access.door.held", ec.handleDoorHeld},
		
		// Device status events
		{"dm.*.device.status", ec.handleDeviceStatus},
		{"dm.*.device.offline", ec.handleDeviceOffline},
		{"dm.*.device.online", ec.handleDeviceOnline},
		{"dm.*.device.error", ec.handleDeviceError},
		{"dm.*.device.tamper", ec.handleDeviceTamper},
		
		// Video surveillance events
		{"dm.*.video.motion.detected", ec.handleMotionDetection},
		{"dm.*.video.person.detected", ec.handlePersonDetection},
		{"dm.*.video.recording.started", ec.handleRecordingStarted},
		{"dm.*.video.recording.failed", ec.handleRecordingFailed},
		{"dm.*.video.camera.offline", ec.handleCameraOffline},
		
		// Attendance events
		{"dm.*.attendance.clock.in", ec.handleClockIn},
		{"dm.*.attendance.clock.out", ec.handleClockOut},
		{"dm.*.attendance.break.start", ec.handleBreakStart},
		{"dm.*.attendance.overtime.detected", ec.handleOvertimeDetected},
		{"dm.*.attendance.missing.checkout", ec.handleMissingCheckout},
		
		// Visitor management events
		{"dm.*.visitor.arrived", ec.handleVisitorArrived},
		{"dm.*.visitor.overstayed", ec.handleVisitorOverstayed},
		{"dm.*.visitor.approved", ec.handleVisitorApproved},
		{"dm.*.visitor.rejected", ec.handleVisitorRejected},
		
		// System events
		{"dm.*.system.error", ec.handleSystemError},
		{"dm.*.system.warning", ec.handleSystemWarning},
		{"dm.*.system.maintenance", ec.handleSystemMaintenance},
		{"dm.*.system.backup.failed", ec.handleBackupFailed},
		{"dm.*.system.disk.full", ec.handleDiskFull},
		{"dm.*.system.cpu.high", ec.handleHighCPU},
		{"dm.*.system.memory.high", ec.handleHighMemory},
		
		// Security events
		{"dm.*.security.intrusion", ec.handleIntrusion},
		{"dm.*.security.breach", ec.handleSecurityBreach},
		{"dm.*.security.suspicious", ec.handleSuspiciousActivity},
		{"dm.*.security.multiple.failures", ec.handleMultipleFailures},
		
		// Emergency events (highest priority)
		{"dm.*.emergency.fire", ec.handleFireEmergency},
		{"dm.*.emergency.panic", ec.handlePanicAlert},
		{"dm.*.emergency.medical", ec.handleMedicalEmergency},
		{"dm.*.emergency.evacuation", ec.handleEvacuation},
		
		// Network and connectivity
		{"dm.*.network.disconnected", ec.handleNetworkDisconnection},
		{"dm.*.network.restored", ec.handleNetworkRestored},
		{"dm.*.network.latency.high", ec.handleHighLatency},
		
		// Audit events
		{"dm.*.audit.integrity.violation", ec.handleAuditViolation},
		{"dm.*.audit.log.tamper", ec.handleLogTamper},
		
		// External integrations
		{"dm.external.webhook", ec.handleExternalWebhook},
		{"dm.external.api.call", ec.handleExternalAPICall},
		
		// Custom and configurable events
		{"dm.*.custom.*", ec.handleCustomEvent},
	}

	for _, sub := range subjects {
		subscription, err := ec.nats.Subscribe(sub.pattern, sub.handler)
		if err != nil {
			slog.Error("failed to subscribe to subject", "subject", sub.pattern, "error", err)
			continue
		}
		ec.subscriptions = append(ec.subscriptions, subscription)
		slog.Debug("subscribed to subject", "pattern", sub.pattern)
	}

	slog.Info("alert event consumers started", "subscriptions", len(ec.subscriptions))
	return nil
}

// Stop unsubscribes from all NATS subscriptions
func (ec *EventConsumer) Stop() {
	slog.Info("stopping alert event consumers")
	
	for _, sub := range ec.subscriptions {
		if err := sub.Unsubscribe(); err != nil {
			slog.Warn("error unsubscribing", "error", err)
		}
	}
	
	ec.subscriptions = nil
	slog.Info("alert event consumers stopped")
}

// Access control event handlers

func (ec *EventConsumer) handleAccessGranted(msg *nats.Msg) {
	event := ec.parseEvent(msg, "access", "granted")
	if event != nil {
		event["access_result"] = "granted"
		ec.processEvent(event)
	}
}

func (ec *EventConsumer) handleAccessDenied(msg *nats.Msg) {
	event := ec.parseEvent(msg, "access", "denied")
	if event != nil {
		event["access_result"] = "denied"
		event["severity"] = "medium" // Access denials might indicate security issues
		ec.processEvent(event)
	}
}

func (ec *EventConsumer) handleDoorOpened(msg *nats.Msg) {
	event := ec.parseEvent(msg, "door", "opened")
	if event != nil {
		event["door_state"] = "opened"
		ec.processEvent(event)
	}
}

func (ec *EventConsumer) handleDoorClosed(msg *nats.Msg) {
	event := ec.parseEvent(msg, "door", "closed")
	if event != nil {
		event["door_state"] = "closed"
		ec.processEvent(event)
	}
}

func (ec *EventConsumer) handleDoorForced(msg *nats.Msg) {
	event := ec.parseEvent(msg, "door", "forced")
	if event != nil {
		event["door_state"] = "forced"
		event["severity"] = "high" // Forced door is a security breach
		event["category"] = CategorySecurity
		ec.processEvent(event)
	}
}

func (ec *EventConsumer) handleDoorHeld(msg *nats.Msg) {
	event := ec.parseEvent(msg, "door", "held")
	if event != nil {
		event["door_state"] = "held"
		event["severity"] = "medium" // Door held open might be policy violation
		ec.processEvent(event)
	}
}

// Device event handlers

func (ec *EventConsumer) handleDeviceStatus(msg *nats.Msg) {
	event := ec.parseEvent(msg, "device", "status")
	if event != nil {
		// Check if device is reporting issues
		if status, ok := event["status"].(string); ok {
			if strings.Contains(strings.ToLower(status), "error") ||
			   strings.Contains(strings.ToLower(status), "warning") ||
			   strings.Contains(strings.ToLower(status), "fail") {
				event["severity"] = "medium"
				event["category"] = CategoryDevice
			}
		}
		ec.processEvent(event)
	}
}

func (ec *EventConsumer) handleDeviceOffline(msg *nats.Msg) {
	event := ec.parseEvent(msg, "device", "offline")
	if event != nil {
		event["device_state"] = "offline"
		event["severity"] = "high" // Device offline is critical
		event["category"] = CategoryDevice
		ec.processEvent(event)
	}
}

func (ec *EventConsumer) handleDeviceOnline(msg *nats.Msg) {
	event := ec.parseEvent(msg, "device", "online")
	if event != nil {
		event["device_state"] = "online"
		event["severity"] = "low" // Recovery event
		ec.processEvent(event)
	}
}

func (ec *EventConsumer) handleDeviceError(msg *nats.Msg) {
	event := ec.parseEvent(msg, "device", "error")
	if event != nil {
		event["severity"] = "high"
		event["category"] = CategoryDevice
		ec.processEvent(event)
	}
}

func (ec *EventConsumer) handleDeviceTamper(msg *nats.Msg) {
	event := ec.parseEvent(msg, "device", "tamper")
	if event != nil {
		event["severity"] = "critical" // Physical tampering is critical
		event["category"] = CategorySecurity
		ec.processEvent(event)
	}
}

// Video surveillance event handlers

func (ec *EventConsumer) handleMotionDetection(msg *nats.Msg) {
	event := ec.parseEvent(msg, "video", "motion_detected")
	if event != nil {
		event["detection_type"] = "motion"
		event["category"] = CategoryVideo
		ec.processEvent(event)
	}
}

func (ec *EventConsumer) handlePersonDetection(msg *nats.Msg) {
	event := ec.parseEvent(msg, "video", "person_detected")
	if event != nil {
		event["detection_type"] = "person"
		event["category"] = CategoryVideo
		ec.processEvent(event)
	}
}

func (ec *EventConsumer) handleRecordingStarted(msg *nats.Msg) {
	event := ec.parseEvent(msg, "video", "recording_started")
	if event != nil {
		event["recording_state"] = "started"
		event["category"] = CategoryVideo
		ec.processEvent(event)
	}
}

func (ec *EventConsumer) handleRecordingFailed(msg *nats.Msg) {
	event := ec.parseEvent(msg, "video", "recording_failed")
	if event != nil {
		event["recording_state"] = "failed"
		event["severity"] = "medium"
		event["category"] = CategoryVideo
		ec.processEvent(event)
	}
}

func (ec *EventConsumer) handleCameraOffline(msg *nats.Msg) {
	event := ec.parseEvent(msg, "video", "camera_offline")
	if event != nil {
		event["camera_state"] = "offline"
		event["severity"] = "medium"
		event["category"] = CategoryVideo
		ec.processEvent(event)
	}
}

// Attendance event handlers

func (ec *EventConsumer) handleClockIn(msg *nats.Msg) {
	event := ec.parseEvent(msg, "attendance", "clock_in")
	if event != nil {
		event["attendance_action"] = "clock_in"
		event["category"] = CategoryAttendance
		ec.processEvent(event)
	}
}

func (ec *EventConsumer) handleClockOut(msg *nats.Msg) {
	event := ec.parseEvent(msg, "attendance", "clock_out")
	if event != nil {
		event["attendance_action"] = "clock_out"
		event["category"] = CategoryAttendance
		ec.processEvent(event)
	}
}

func (ec *EventConsumer) handleBreakStart(msg *nats.Msg) {
	event := ec.parseEvent(msg, "attendance", "break_start")
	if event != nil {
		event["attendance_action"] = "break_start"
		event["category"] = CategoryAttendance
		ec.processEvent(event)
	}
}

func (ec *EventConsumer) handleOvertimeDetected(msg *nats.Msg) {
	event := ec.parseEvent(msg, "attendance", "overtime_detected")
	if event != nil {
		event["attendance_issue"] = "overtime"
		event["severity"] = "medium"
		event["category"] = CategoryAttendance
		ec.processEvent(event)
	}
}

func (ec *EventConsumer) handleMissingCheckout(msg *nats.Msg) {
	event := ec.parseEvent(msg, "attendance", "missing_checkout")
	if event != nil {
		event["attendance_issue"] = "missing_checkout"
		event["severity"] = "medium"
		event["category"] = CategoryAttendance
		ec.processEvent(event)
	}
}

// Visitor management event handlers

func (ec *EventConsumer) handleVisitorArrived(msg *nats.Msg) {
	event := ec.parseEvent(msg, "visitor", "arrived")
	if event != nil {
		event["visitor_status"] = "arrived"
		ec.processEvent(event)
	}
}

func (ec *EventConsumer) handleVisitorOverstayed(msg *nats.Msg) {
	event := ec.parseEvent(msg, "visitor", "overstayed")
	if event != nil {
		event["visitor_issue"] = "overstayed"
		event["severity"] = "medium"
		ec.processEvent(event)
	}
}

func (ec *EventConsumer) handleVisitorApproved(msg *nats.Msg) {
	event := ec.parseEvent(msg, "visitor", "approved")
	if event != nil {
		event["visitor_status"] = "approved"
		ec.processEvent(event)
	}
}

func (ec *EventConsumer) handleVisitorRejected(msg *nats.Msg) {
	event := ec.parseEvent(msg, "visitor", "rejected")
	if event != nil {
		event["visitor_status"] = "rejected"
		event["severity"] = "low"
		ec.processEvent(event)
	}
}

// System event handlers

func (ec *EventConsumer) handleSystemError(msg *nats.Msg) {
	event := ec.parseEvent(msg, "system", "error")
	if event != nil {
		event["severity"] = "high"
		event["category"] = CategorySystem
		ec.processEvent(event)
	}
}

func (ec *EventConsumer) handleSystemWarning(msg *nats.Msg) {
	event := ec.parseEvent(msg, "system", "warning")
	if event != nil {
		event["severity"] = "medium"
		event["category"] = CategorySystem
		ec.processEvent(event)
	}
}

func (ec *EventConsumer) handleSystemMaintenance(msg *nats.Msg) {
	event := ec.parseEvent(msg, "system", "maintenance")
	if event != nil {
		event["severity"] = "low"
		event["category"] = CategorySystem
		ec.processEvent(event)
	}
}

func (ec *EventConsumer) handleBackupFailed(msg *nats.Msg) {
	event := ec.parseEvent(msg, "system", "backup_failed")
	if event != nil {
		event["system_issue"] = "backup_failed"
		event["severity"] = "high"
		event["category"] = CategorySystem
		ec.processEvent(event)
	}
}

func (ec *EventConsumer) handleDiskFull(msg *nats.Msg) {
	event := ec.parseEvent(msg, "system", "disk_full")
	if event != nil {
		event["system_issue"] = "disk_full"
		event["severity"] = "critical"
		event["category"] = CategorySystem
		ec.processEvent(event)
	}
}

func (ec *EventConsumer) handleHighCPU(msg *nats.Msg) {
	event := ec.parseEvent(msg, "system", "cpu_high")
	if event != nil {
		event["system_issue"] = "high_cpu"
		event["severity"] = "medium"
		event["category"] = CategorySystem
		ec.processEvent(event)
	}
}

func (ec *EventConsumer) handleHighMemory(msg *nats.Msg) {
	event := ec.parseEvent(msg, "system", "memory_high")
	if event != nil {
		event["system_issue"] = "high_memory"
		event["severity"] = "medium"
		event["category"] = CategorySystem
		ec.processEvent(event)
	}
}

// Security event handlers

func (ec *EventConsumer) handleIntrusion(msg *nats.Msg) {
	event := ec.parseEvent(msg, "security", "intrusion")
	if event != nil {
		event["security_threat"] = "intrusion"
		event["severity"] = "critical"
		event["category"] = CategorySecurity
		ec.processEvent(event)
	}
}

func (ec *EventConsumer) handleSecurityBreach(msg *nats.Msg) {
	event := ec.parseEvent(msg, "security", "breach")
	if event != nil {
		event["security_threat"] = "breach"
		event["severity"] = "critical"
		event["category"] = CategorySecurity
		ec.processEvent(event)
	}
}

func (ec *EventConsumer) handleSuspiciousActivity(msg *nats.Msg) {
	event := ec.parseEvent(msg, "security", "suspicious")
	if event != nil {
		event["security_threat"] = "suspicious_activity"
		event["severity"] = "high"
		event["category"] = CategorySecurity
		ec.processEvent(event)
	}
}

func (ec *EventConsumer) handleMultipleFailures(msg *nats.Msg) {
	event := ec.parseEvent(msg, "security", "multiple_failures")
	if event != nil {
		event["security_threat"] = "multiple_failures"
		event["severity"] = "high"
		event["category"] = CategorySecurity
		ec.processEvent(event)
	}
}

// Emergency event handlers

func (ec *EventConsumer) handleFireEmergency(msg *nats.Msg) {
	event := ec.parseEvent(msg, "emergency", "fire")
	if event != nil {
		event["emergency_type"] = "fire"
		event["severity"] = "critical"
		event["category"] = CategorySecurity
		event["priority"] = "critical"
		ec.processEvent(event)
	}
}

func (ec *EventConsumer) handlePanicAlert(msg *nats.Msg) {
	event := ec.parseEvent(msg, "emergency", "panic")
	if event != nil {
		event["emergency_type"] = "panic"
		event["severity"] = "critical"
		event["category"] = CategorySecurity
		event["priority"] = "critical"
		ec.processEvent(event)
	}
}

func (ec *EventConsumer) handleMedicalEmergency(msg *nats.Msg) {
	event := ec.parseEvent(msg, "emergency", "medical")
	if event != nil {
		event["emergency_type"] = "medical"
		event["severity"] = "critical"
		event["category"] = CategorySecurity
		event["priority"] = "critical"
		ec.processEvent(event)
	}
}

func (ec *EventConsumer) handleEvacuation(msg *nats.Msg) {
	event := ec.parseEvent(msg, "emergency", "evacuation")
	if event != nil {
		event["emergency_type"] = "evacuation"
		event["severity"] = "critical"
		event["category"] = CategorySecurity
		event["priority"] = "critical"
		ec.processEvent(event)
	}
}

// Network event handlers

func (ec *EventConsumer) handleNetworkDisconnection(msg *nats.Msg) {
	event := ec.parseEvent(msg, "network", "disconnected")
	if event != nil {
		event["network_state"] = "disconnected"
		event["severity"] = "high"
		event["category"] = CategorySystem
		ec.processEvent(event)
	}
}

func (ec *EventConsumer) handleNetworkRestored(msg *nats.Msg) {
	event := ec.parseEvent(msg, "network", "restored")
	if event != nil {
		event["network_state"] = "restored"
		event["severity"] = "low"
		event["category"] = CategorySystem
		ec.processEvent(event)
	}
}

func (ec *EventConsumer) handleHighLatency(msg *nats.Msg) {
	event := ec.parseEvent(msg, "network", "latency_high")
	if event != nil {
		event["network_issue"] = "high_latency"
		event["severity"] = "medium"
		event["category"] = CategorySystem
		ec.processEvent(event)
	}
}

// Audit event handlers

func (ec *EventConsumer) handleAuditViolation(msg *nats.Msg) {
	event := ec.parseEvent(msg, "audit", "integrity_violation")
	if event != nil {
		event["audit_issue"] = "integrity_violation"
		event["severity"] = "critical"
		event["category"] = CategorySecurity
		ec.processEvent(event)
	}
}

func (ec *EventConsumer) handleLogTamper(msg *nats.Msg) {
	event := ec.parseEvent(msg, "audit", "log_tamper")
	if event != nil {
		event["audit_issue"] = "log_tampering"
		event["severity"] = "critical"
		event["category"] = CategorySecurity
		ec.processEvent(event)
	}
}

// External integration handlers

func (ec *EventConsumer) handleExternalWebhook(msg *nats.Msg) {
	event := ec.parseEvent(msg, "external", "webhook")
	if event != nil {
		event["source_type"] = "external_webhook"
		ec.processEvent(event)
	}
}

func (ec *EventConsumer) handleExternalAPICall(msg *nats.Msg) {
	event := ec.parseEvent(msg, "external", "api_call")
	if event != nil {
		event["source_type"] = "external_api"
		ec.processEvent(event)
	}
}

// Custom event handler

func (ec *EventConsumer) handleCustomEvent(msg *nats.Msg) {
	event := ec.parseEvent(msg, "custom", "event")
	if event != nil {
		event["category"] = CategoryCustom
		ec.processEvent(event)
	}
}

// Helper functions

func (ec *EventConsumer) parseEvent(msg *nats.Msg, eventType, eventSubtype string) map[string]interface{} {
	var eventData map[string]interface{}
	
	if err := json.Unmarshal(msg.Data, &eventData); err != nil {
		slog.Warn("failed to parse event data", "subject", msg.Subject, "error", err)
		return nil
	}
	
	// Extract tenant ID from subject (format: dm.{tenant_id}.{category}.{action})
	parts := strings.Split(msg.Subject, ".")
	var tenantID string
	if len(parts) >= 2 {
		tenantID = parts[1]
	}
	
	// Enrich event data with metadata
	event := map[string]interface{}{
		"event_type":    eventType,
		"event_subtype": eventSubtype,
		"subject":       msg.Subject,
		"tenant_id":     tenantID,
		"timestamp":     time.Now(),
		"source":        "nats_event",
	}
	
	// Merge original event data
	for key, value := range eventData {
		event[key] = value
	}
	
	return event
}

func (ec *EventConsumer) processEvent(event map[string]interface{}) {
	// Log the event for debugging
	slog.Debug("processing alert event", 
		"event_type", event["event_type"],
		"event_subtype", event["event_subtype"],
		"subject", event["subject"],
		"tenant_id", event["tenant_id"])
	
	// Store event in audit trail if configured
	go ec.storeEventAudit(event)
	
	// Process through rule engine
	// The rule engine will evaluate this event against all registered rules
	// and trigger alerts/automations as needed
	
	// Note: The actual rule evaluation is handled by the RuleEngine
	// which subscribes to these same events. This consumer is for
	// additional processing, logging, and audit trail.
}

func (ec *EventConsumer) storeEventAudit(event map[string]interface{}) {
	// Store event in audit trail for compliance and debugging
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	
	tenantIDStr, ok := event["tenant_id"].(string)
	if !ok || tenantIDStr == "" {
		return
	}
	
	tenantID, err := uuid.Parse(tenantIDStr)
	if err != nil {
		return
	}
	
	if err := ec.db.SetTenant(ctx, tenantID); err != nil {
		return
	}
	
	eventJSON, _ := json.Marshal(event)
	
	// Insert into audit log
	query := `
		INSERT INTO dm3_audit.events (
			tenant_id, event_type, event_subtype, source, subject,
			event_data, created_at
		) VALUES ($1, $2, $3, $4, $5, $6, now())
		ON CONFLICT DO NOTHING
	`
	
	ec.db.Exec(ctx, query,
		tenantID,
		getStringFromEvent(event, "event_type"),
		getStringFromEvent(event, "event_subtype"),
		getStringFromEvent(event, "source"),
		getStringFromEvent(event, "subject"),
		eventJSON,
	)
}

func getStringFromEvent(event map[string]interface{}, key string) string {
	if value, exists := event[key]; exists {
		return fmt.Sprintf("%v", value)
	}
	return ""
}

// Statistics and monitoring

func (ec *EventConsumer) GetEventStats() map[string]interface{} {
	return map[string]interface{}{
		"active_subscriptions": len(ec.subscriptions),
		"started_at":          time.Now(), // This would be stored in a real implementation
		"total_events_processed": 0,       // This would be tracked in a real implementation
	}
}

// Health check for the event consumer
func (ec *EventConsumer) HealthCheck() bool {
	// Check if NATS connection is healthy
	if ec.nats == nil {
		return false
	}
	
	if !ec.nats.IsConnected() {
		return false
	}
	
	// Check if we have active subscriptions
	return len(ec.subscriptions) > 0
}