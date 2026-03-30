package notif

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/nats-io/nats.go"
)

// StartEventConsumers starts NATS consumers for notification events
func (h *Handlers) StartEventConsumers(ctx context.Context) {
	// Access events (denied access, forced door, etc.)
	_, err := h.nats.Subscribe("dm.*.access.log.*", h.handleAccessEvent)
	if err != nil {
		slog.Error("failed to subscribe to access events", "error", err)
		return
	}

	// Device status events (offline, online, health)
	_, err = h.nats.Subscribe("dm.*.device.status.*", h.handleDeviceEvent)
	if err != nil {
		slog.Error("failed to subscribe to device events", "error", err)
		return
	}

	// Alarm events (intrusion, fire, tamper, etc.)
	_, err = h.nats.Subscribe("dm.*.alert.*", h.handleAlarmEvent)
	if err != nil {
		slog.Error("failed to subscribe to alarm events", "error", err)
		return
	}

	// Emergency events (lockdown, evacuation, etc.)
	_, err = h.nats.Subscribe("dm.*.emergency.*", h.handleEmergencyEvent)
	if err != nil {
		slog.Error("failed to subscribe to emergency events", "error", err)
		return
	}

	// Visitor events (arrival, check-in, etc.)
	_, err = h.nats.Subscribe("dm.*.visitor.*", h.handleVisitorEvent)
	if err != nil {
		slog.Error("failed to subscribe to visitor events", "error", err)
		return
	}

	slog.Info("notification service: NATS consumers started")

	// Keep consumers running
	<-ctx.Done()
	slog.Info("notification service: stopping NATS consumers")
}

func (h *Handlers) handleAccessEvent(msg *nats.Msg) {
	var event AccessEvent
	if err := json.Unmarshal(msg.Data, &event); err != nil {
		slog.Error("failed to unmarshal access event", "error", err)
		return
	}

	// Only notify on specific events
	switch {
	case event.Decision == "denied":
		h.sendAccessDeniedNotification(event)
	case event.Reason != nil && *event.Reason == "forced":
		h.sendForcedDoorNotification(event)
	case event.Reason != nil && *event.Reason == "tamper":
		h.sendTamperNotification(event)
	}
}

func (h *Handlers) handleDeviceEvent(msg *nats.Msg) {
	var event DeviceEvent
	if err := json.Unmarshal(msg.Data, &event); err != nil {
		slog.Error("failed to unmarshal device event", "error", err)
		return
	}

	// Notify on device offline
	if event.Status == "offline" {
		h.sendDeviceOfflineNotification(event)
	}
}

func (h *Handlers) handleAlarmEvent(msg *nats.Msg) {
	var event AlarmEvent
	if err := json.Unmarshal(msg.Data, &event); err != nil {
		slog.Error("failed to unmarshal alarm event", "error", err)
		return
	}

	// All alarm events trigger notifications
	h.sendAlarmNotification(event)
}

func (h *Handlers) handleEmergencyEvent(msg *nats.Msg) {
	var event AlarmEvent // Emergency events use same structure as alarms
	if err := json.Unmarshal(msg.Data, &event); err != nil {
		slog.Error("failed to unmarshal emergency event", "error", err)
		return
	}

	// Emergency events are high-priority notifications
	h.sendEmergencyNotification(event)
}

func (h *Handlers) handleVisitorEvent(msg *nats.Msg) {
	var event struct {
		Type       string                 `json:"type"`
		TenantID   uuid.UUID              `json:"tenant_id"`
		VisitorID  uuid.UUID              `json:"visitor_id"`
		Action     string                 `json:"action"`
		HostID     *uuid.UUID             `json:"host_id,omitempty"`
		HostName   *string                `json:"host_name,omitempty"`
		VisitorName string                `json:"visitor_name"`
		Timestamp  time.Time              `json:"timestamp"`
		Metadata   map[string]interface{} `json:"metadata,omitempty"`
	}
	if err := json.Unmarshal(msg.Data, &event); err != nil {
		slog.Error("failed to unmarshal visitor event", "error", err)
		return
	}

	// Notify hosts when their visitors arrive
	if event.Action == "checkin" && event.HostID != nil {
		h.sendVisitorArrivalNotification(event.TenantID, *event.HostID, event.VisitorName)
	}
}

// Notification sending methods

func (h *Handlers) sendAccessDeniedNotification(event AccessEvent) {
	notification := &Notification{
		ID:       uuid.New(),
		TenantID: event.TenantID,
		Type:     NotifTypeAccessDenied,
		Title:    "Access Denied",
		Message:  h.buildAccessDeniedMessage(event),
		Channels: []string{ChannelPush}, // Low priority - push only
		Status:   StatusPending,
		Metadata: map[string]interface{}{
			"device_id": event.DeviceID,
			"door_id":   event.DoorID,
			"reason":    event.Reason,
		},
		CreatedAt: time.Now(),
	}

	h.storeAndSendNotification(notification)
}

func (h *Handlers) sendForcedDoorNotification(event AccessEvent) {
	notification := &Notification{
		ID:       uuid.New(),
		TenantID: event.TenantID,
		Type:     NotifTypeSecurityAlert,
		Title:    "🚨 Forced Door Entry",
		Message:  h.buildForcedDoorMessage(event),
		Channels: []string{ChannelPush, ChannelEmail}, // High priority
		Status:   StatusPending,
		Metadata: map[string]interface{}{
			"device_id": event.DeviceID,
			"door_id":   event.DoorID,
			"severity":  "critical",
		},
		CreatedAt: time.Now(),
	}

	h.storeAndSendNotification(notification)
}

func (h *Handlers) sendTamperNotification(event AccessEvent) {
	notification := &Notification{
		ID:       uuid.New(),
		TenantID: event.TenantID,
		Type:     NotifTypeSecurityAlert,
		Title:    "🚨 Device Tamper Detected",
		Message:  h.buildTamperMessage(event),
		Channels: []string{ChannelPush, ChannelEmail, ChannelSMS}, // Critical
		Status:   StatusPending,
		Metadata: map[string]interface{}{
			"device_id": event.DeviceID,
			"severity":  "critical",
		},
		CreatedAt: time.Now(),
	}

	h.storeAndSendNotification(notification)
}

func (h *Handlers) sendDeviceOfflineNotification(event DeviceEvent) {
	notification := &Notification{
		ID:       uuid.New(),
		TenantID: event.TenantID,
		Type:     NotifTypeDeviceOffline,
		Title:    "Device Offline",
		Message:  h.buildDeviceOfflineMessage(event),
		Channels: []string{ChannelPush}, // Medium priority
		Status:   StatusPending,
		Metadata: map[string]interface{}{
			"device_id": event.DeviceID,
		},
		CreatedAt: time.Now(),
	}

	h.storeAndSendNotification(notification)
}

func (h *Handlers) sendAlarmNotification(event AlarmEvent) {
	channels := []string{ChannelPush, ChannelEmail}
	if event.Severity == "critical" {
		channels = append(channels, ChannelSMS)
	}

	notification := &Notification{
		ID:       uuid.New(),
		TenantID: event.TenantID,
		Type:     NotifTypeAlarmTriggered,
		Title:    "🚨 " + event.AlarmType + " Alarm",
		Message:  event.Message,
		Channels: channels,
		Status:   StatusPending,
		Metadata: map[string]interface{}{
			"alarm_type": event.AlarmType,
			"severity":   event.Severity,
			"door_id":    event.DoorID,
		},
		CreatedAt: time.Now(),
	}

	h.storeAndSendNotification(notification)
}

func (h *Handlers) sendEmergencyNotification(event AlarmEvent) {
	notification := &Notification{
		ID:       uuid.New(),
		TenantID: event.TenantID,
		Type:     NotifTypeEmergency,
		Title:    "🚨 EMERGENCY: " + event.AlarmType,
		Message:  event.Message,
		Channels: []string{ChannelPush, ChannelEmail, ChannelSMS}, // All channels
		Status:   StatusPending,
		Metadata: map[string]interface{}{
			"alarm_type": event.AlarmType,
			"severity":   "emergency",
		},
		CreatedAt: time.Now(),
	}

	h.storeAndSendNotification(notification)
}

func (h *Handlers) sendVisitorArrivalNotification(tenantID, hostID uuid.UUID, visitorName string) {
	notification := &Notification{
		ID:       uuid.New(),
		TenantID: tenantID,
		Type:     NotifTypeVisitorArrival,
		Title:    "Visitor Arrived",
		Message:  visitorName + " has checked in and is waiting for you",
		Channels: []string{ChannelPush},
		UserID:   &hostID,
		Status:   StatusPending,
		Metadata: map[string]interface{}{
			"visitor_name": visitorName,
		},
		CreatedAt: time.Now(),
	}

	h.storeAndSendNotification(notification)
}

// Helper methods for building messages

func (h *Handlers) buildAccessDeniedMessage(event AccessEvent) string {
	personName := "Unknown person"
	if event.PersonName != nil {
		personName = *event.PersonName
	}
	
	reason := "unknown reason"
	if event.Reason != nil {
		reason = *event.Reason
	}

	return personName + " was denied access - " + reason
}

func (h *Handlers) buildForcedDoorMessage(event AccessEvent) string {
	doorInfo := "a door"
	if event.DoorID != nil {
		doorInfo = "door " + *event.DoorID
	}
	
	return "Forced entry detected at " + doorInfo + " on device " + event.DeviceID
}

func (h *Handlers) buildTamperMessage(event AccessEvent) string {
	return "Tamper detected on device " + event.DeviceID + ". Immediate investigation required."
}

func (h *Handlers) buildDeviceOfflineMessage(event DeviceEvent) string {
	return "Device " + event.DeviceID + " has gone offline"
}

func (h *Handlers) storeAndSendNotification(notification *Notification) {
	// Store notification first
	ctx := context.Background()
	if err := h.storeNotification(ctx, notification); err != nil {
		slog.Error("failed to store notification", "error", err, "id", notification.ID)
		return
	}

	// Send notification asynchronously
	go h.sendNotification(notification)
}