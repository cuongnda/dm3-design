package audit

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/nats-io/nats.go"
)

// StartAuditConsumers starts NATS consumers for audit events from all services
func (h *Handlers) StartAuditConsumers(ctx context.Context) {
	// All audit events go to dm.audit.* subjects
	_, err := h.nats.Subscribe("dm.audit.>", h.handleAuditEvent)
	if err != nil {
		slog.Error("failed to subscribe to audit events", "error", err)
		return
	}
	
	// Also consume access events to create audit trails
	_, err = h.nats.Subscribe("dm.*.access.log.*", h.handleAccessLogEvent)
	if err != nil {
		slog.Error("failed to subscribe to access log events", "error", err)
		return
	}
	
	// Device provisioning events
	_, err = h.nats.Subscribe("dm.*.device.provisioned", h.handleDeviceProvisioningEvent)
	if err != nil {
		slog.Error("failed to subscribe to device provisioning events", "error", err)
		return
	}
	
	// Emergency events - high priority audit
	_, err = h.nats.Subscribe("dm.*.emergency.*", h.handleEmergencyEvent)
	if err != nil {
		slog.Error("failed to subscribe to emergency events", "error", err)
		return
	}
	
	// Start integrity verification job
	go h.runIntegrityCheckJob(ctx)
	
	slog.Info("audit service: NATS consumers started")
	
	// Keep consumers running
	<-ctx.Done()
	slog.Info("audit service: stopping NATS consumers")
}

func (h *Handlers) handleAuditEvent(msg *nats.Msg) {
	var event AuditEvent
	if err := json.Unmarshal(msg.Data, &event); err != nil {
		slog.Error("failed to unmarshal audit event", "error", err)
		return
	}
	
	// Ensure event has required fields
	if event.ID == uuid.Nil {
		event.ID = uuid.New()
	}
	if event.Timestamp.IsZero() {
		event.Timestamp = time.Now()
	}
	
	// Store audit event
	if err := h.storeAuditEvent(&event); err != nil {
		slog.Error("failed to store audit event", "error", err, "event_id", event.ID)
	}
}

func (h *Handlers) handleAccessLogEvent(msg *nats.Msg) {
	var accessEvent struct {
		Type       string                 `json:"type"`
		TenantID   uuid.UUID              `json:"tenant_id"`
		DeviceID   string                 `json:"device_id"`
		DoorID     *string                `json:"door_id,omitempty"`
		PersonID   *uuid.UUID             `json:"person_id,omitempty"`
		PersonName *string                `json:"person_name,omitempty"`
		Decision   string                 `json:"decision"`
		Reason     *string                `json:"reason,omitempty"`
		Credential *string                `json:"credential_type,omitempty"`
		Timestamp  time.Time              `json:"timestamp"`
		Metadata   map[string]interface{} `json:"metadata,omitempty"`
	}
	
	if err := json.Unmarshal(msg.Data, &accessEvent); err != nil {
		slog.Error("failed to unmarshal access log event", "error", err)
		return
	}
	
	// Create audit event from access event
	auditEvent := &AuditEvent{
		ID:        uuid.New(),
		TenantID:  accessEvent.TenantID,
		EventType: EventTypeAccess,
		ActorID:   accessEvent.PersonID,
		ActorName: accessEvent.PersonName,
		ActorType: ActorTypeUser,
		Action:    accessEvent.Decision, // granted or denied
		Resource:  ResourceDoor,
		Result:    ResultSuccess, // access decision was made successfully
		Timestamp: accessEvent.Timestamp,
		Metadata: map[string]interface{}{
			"device_id":       accessEvent.DeviceID,
			"door_id":         accessEvent.DoorID,
			"credential_type": accessEvent.Credential,
			"reason":          accessEvent.Reason,
			"decision_source": "local_device",
		},
	}
	
	if accessEvent.DoorID != nil {
		auditEvent.ResourceID = accessEvent.DoorID
		auditEvent.ResourceName = accessEvent.DoorID // TODO: lookup door name
	}
	
	// If access was denied, mark as a security event
	if accessEvent.Decision == "denied" {
		auditEvent.Result = ResultFailure
		if accessEvent.Reason != nil {
			auditEvent.ErrorMsg = accessEvent.Reason
		}
	}
	
	if err := h.storeAuditEvent(auditEvent); err != nil {
		slog.Error("failed to store access audit event", "error", err)
	}
}

func (h *Handlers) handleDeviceProvisioningEvent(msg *nats.Msg) {
	var provEvent struct {
		Type       string                 `json:"type"`
		TenantID   uuid.UUID              `json:"tenant_id"`
		DeviceID   string                 `json:"device_id"`
		DeviceName string                 `json:"device_name"`
		ActorID    uuid.UUID              `json:"actor_id"`
		ActorName  string                 `json:"actor_name"`
		Action     string                 `json:"action"` // provisioned, deprovisioned
		Timestamp  time.Time              `json:"timestamp"`
		Metadata   map[string]interface{} `json:"metadata,omitempty"`
	}
	
	if err := json.Unmarshal(msg.Data, &provEvent); err != nil {
		slog.Error("failed to unmarshal device provisioning event", "error", err)
		return
	}
	
	// Device provisioning is a critical audit event
	auditEvent := &AuditEvent{
		ID:           uuid.New(),
		TenantID:     provEvent.TenantID,
		EventType:    EventTypeDevice,
		ActorID:      &provEvent.ActorID,
		ActorName:    &provEvent.ActorName,
		ActorType:    ActorTypeUser,
		Action:       provEvent.Action,
		Resource:     ResourceDevice,
		ResourceID:   &provEvent.DeviceID,
		ResourceName: &provEvent.DeviceName,
		Result:       ResultSuccess,
		Timestamp:    provEvent.Timestamp,
		Metadata:     provEvent.Metadata,
	}
	
	if err := h.storeAuditEvent(auditEvent); err != nil {
		slog.Error("failed to store device provisioning audit event", "error", err)
	}
}

func (h *Handlers) handleEmergencyEvent(msg *nats.Msg) {
	var emergencyEvent struct {
		Type        string                 `json:"type"`
		TenantID    uuid.UUID              `json:"tenant_id"`
		EmergencyType string               `json:"emergency_type"`
		Message     string                 `json:"message"`
		ActorID     *uuid.UUID             `json:"actor_id,omitempty"`
		ActorName   *string                `json:"actor_name,omitempty"`
		Timestamp   time.Time              `json:"timestamp"`
		Metadata    map[string]interface{} `json:"metadata,omitempty"`
	}
	
	if err := json.Unmarshal(msg.Data, &emergencyEvent); err != nil {
		slog.Error("failed to unmarshal emergency event", "error", err)
		return
	}
	
	// Emergency events are high-priority audit entries
	auditEvent := &AuditEvent{
		ID:        uuid.New(),
		TenantID:  emergencyEvent.TenantID,
		EventType: EventTypeEmergency,
		ActorID:   emergencyEvent.ActorID,
		ActorName: emergencyEvent.ActorName,
		ActorType: ActorTypeUser,
		Action:    "triggered",
		Resource:  "emergency_system",
		Result:    ResultSuccess,
		Timestamp: emergencyEvent.Timestamp,
		Metadata: map[string]interface{}{
			"emergency_type": emergencyEvent.EmergencyType,
			"message":        emergencyEvent.Message,
			"severity":       "critical",
		},
	}
	
	if err := h.storeAuditEvent(auditEvent); err != nil {
		slog.Error("failed to store emergency audit event", "error", err)
	}
}

// runIntegrityCheckJob runs periodic integrity verification
func (h *Handlers) runIntegrityCheckJob(ctx context.Context) {
	ticker := time.NewTicker(24 * time.Hour) // Check integrity daily
	defer ticker.Stop()
	
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			h.performIntegrityCheck()
		}
	}
}

func (h *Handlers) performIntegrityCheck() {
	ctx := context.Background()
	
	// Get all tenants and check integrity for each
	tenants, err := h.getAllTenants(ctx)
	if err != nil {
		slog.Error("failed to get tenants for integrity check", "error", err)
		return
	}
	
	for _, tenantID := range tenants {
		slog.Info("performing integrity check", "tenant_id", tenantID)
		
		result, err := h.verifyAuditIntegrity(ctx, tenantID)
		if err != nil {
			slog.Error("integrity check failed", "error", err, "tenant_id", tenantID)
			continue
		}
		
		if !result.IsValid {
			slog.Warn("audit integrity compromised", "tenant_id", tenantID, "details", result.ErrorDetails)
			
			// Log integrity violation as audit event
			auditEvent := &AuditEvent{
				ID:        uuid.New(),
				TenantID:  tenantID,
				EventType: EventTypeSystem,
				ActorType: ActorTypeSystem,
				Action:    "integrity_check_failed",
				Resource:  "audit_log",
				Result:    ResultFailure,
				ErrorMsg:  &result.ErrorDetails,
				Timestamp: time.Now(),
				Metadata: map[string]interface{}{
					"expected_hash": result.ExpectedHash,
					"actual_hash":   result.ActualHash,
					"events_checked": result.EventsChecked,
				},
			}
			
			h.storeAuditEvent(auditEvent)
		}
		
		// Store integrity checkpoint
		checkpoint := &IntegrityCheckpoint{
			ID:           uuid.New(),
			TenantID:     tenantID,
			LastEventID:  result.LastEventID,
			EventCount:   result.EventsChecked,
			ChainHash:    result.ActualHash,
			VerifiedAt:   time.Now(),
			VerifiedBy:   "system",
			Status:       "verified",
		}
		
		if !result.IsValid {
			checkpoint.Status = "compromised"
			checkpoint.ErrorDetails = &result.ErrorDetails
		}
		
		if err := h.storeIntegrityCheckpoint(ctx, checkpoint); err != nil {
			slog.Error("failed to store integrity checkpoint", "error", err, "tenant_id", tenantID)
		}
	}
	
	slog.Info("integrity check completed for all tenants")
}

// Helper to create audit events from the audit service itself
func (h *Handlers) CreateAuditEvent(tenantID uuid.UUID, actorID *uuid.UUID, actorName *string, eventType, action, resource string, resourceID *string, resourceName *string, oldValue, newValue map[string]interface{}, result string, errorMsg *string, metadata map[string]interface{}) {
	event := &AuditEvent{
		ID:           uuid.New(),
		TenantID:     tenantID,
		EventType:    eventType,
		ActorID:      actorID,
		ActorName:    actorName,
		ActorType:    ActorTypeUser,
		Action:       action,
		Resource:     resource,
		ResourceID:   resourceID,
		ResourceName: resourceName,
		OldValue:     oldValue,
		NewValue:     newValue,
		Result:       result,
		ErrorMsg:     errorMsg,
		Metadata:     metadata,
		Timestamp:    time.Now(),
	}
	
	if actorID == nil {
		event.ActorType = ActorTypeSystem
	}
	
	if err := h.storeAuditEvent(event); err != nil {
		slog.Error("failed to store audit event", "error", err)
	}
}