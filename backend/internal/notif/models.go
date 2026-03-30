package notif

import (
	"time"

	"github.com/google/uuid"
)

// Notification represents a notification that has been sent or is pending
type Notification struct {
	ID        uuid.UUID              `json:"id" db:"id"`
	TenantID  uuid.UUID              `json:"tenant_id" db:"tenant_id"`
	Type      string                 `json:"type" db:"type"`
	Title     string                 `json:"title" db:"title"`
	Message   string                 `json:"message" db:"message"`
	Channels  []string               `json:"channels" db:"channels"`
	UserID    *uuid.UUID             `json:"user_id,omitempty" db:"user_id"`
	UserEmail *string                `json:"user_email,omitempty" db:"user_email"`
	Metadata  map[string]interface{} `json:"metadata,omitempty" db:"metadata"`
	Status    string                 `json:"status" db:"status"` // pending, sent, failed, delivered
	SentAt    *time.Time             `json:"sent_at,omitempty" db:"sent_at"`
	Error     *string                `json:"error,omitempty" db:"error"`
	CreatedAt time.Time              `json:"created_at" db:"created_at"`
}

// NotificationPreferences represents user notification settings
type NotificationPreferences struct {
	ID               uuid.UUID            `json:"id" db:"id"`
	TenantID         uuid.UUID            `json:"tenant_id" db:"tenant_id"`
	UserID           uuid.UUID            `json:"user_id" db:"user_id"`
	EmailEnabled     bool                 `json:"email_enabled" db:"email_enabled"`
	PushEnabled      bool                 `json:"push_enabled" db:"push_enabled"`
	SMSEnabled       bool                 `json:"sms_enabled" db:"sms_enabled"`
	TypePreferences  map[string][]string  `json:"type_preferences" db:"type_preferences"` // type -> channels
	QuietHours       *QuietHours          `json:"quiet_hours,omitempty" db:"quiet_hours"`
	UpdatedAt        time.Time            `json:"updated_at" db:"updated_at"`
	CreatedAt        time.Time            `json:"created_at" db:"created_at"`
}

// QuietHours represents do-not-disturb settings
type QuietHours struct {
	Enabled   bool   `json:"enabled"`
	StartTime string `json:"start_time"` // HH:MM format
	EndTime   string `json:"end_time"`   // HH:MM format
	Timezone  string `json:"timezone"`
}

// NotificationTemplate represents a reusable notification template
type NotificationTemplate struct {
	ID        uuid.UUID              `json:"id" db:"id"`
	TenantID  uuid.UUID              `json:"tenant_id" db:"tenant_id"`
	Name      string                 `json:"name" db:"name"`
	Type      string                 `json:"type" db:"type"`
	Subject   string                 `json:"subject" db:"subject"`
	Body      string                 `json:"body" db:"body"`
	Channels  []string               `json:"channels" db:"channels"`
	Variables map[string]string      `json:"variables" db:"variables"` // variable_name -> description
	CreatedAt time.Time              `json:"created_at" db:"created_at"`
	UpdatedAt time.Time              `json:"updated_at" db:"updated_at"`
}

// Request/Response types

type SendNotificationRequest struct {
	Type     string                 `json:"type" validate:"required"`
	Title    string                 `json:"title" validate:"required"`
	Message  string                 `json:"message" validate:"required"`
	Channels []string               `json:"channels"` // email, push, sms
	UserID   *uuid.UUID             `json:"user_id,omitempty"`
	Email    *string                `json:"email,omitempty"`
	Metadata map[string]interface{} `json:"metadata,omitempty"`
}

type UpdatePreferencesRequest struct {
	UserID          uuid.UUID            `json:"user_id" validate:"required"`
	EmailEnabled    *bool                `json:"email_enabled,omitempty"`
	PushEnabled     *bool                `json:"push_enabled,omitempty"`
	SMSEnabled      *bool                `json:"sms_enabled,omitempty"`
	TypePreferences *map[string][]string `json:"type_preferences,omitempty"`
	QuietHours      *QuietHours          `json:"quiet_hours,omitempty"`
}

type CreateTemplateRequest struct {
	Name      string            `json:"name" validate:"required"`
	Type      string            `json:"type" validate:"required"`
	Subject   string            `json:"subject" validate:"required"`
	Body      string            `json:"body" validate:"required"`
	Channels  []string          `json:"channels"`
	Variables map[string]string `json:"variables,omitempty"`
}

type UpdateTemplateRequest struct {
	Name      *string            `json:"name,omitempty"`
	Subject   *string            `json:"subject,omitempty"`
	Body      *string            `json:"body,omitempty"`
	Channels  *[]string          `json:"channels,omitempty"`
	Variables *map[string]string `json:"variables,omitempty"`
}

// Event types for NATS consumption

type AccessEvent struct {
	Type       string                 `json:"type"`
	TenantID   uuid.UUID              `json:"tenant_id"`
	DeviceID   string                 `json:"device_id"`
	DoorID     *string                `json:"door_id,omitempty"`
	PersonName *string                `json:"person_name,omitempty"`
	Decision   string                 `json:"decision"`
	Reason     *string                `json:"reason,omitempty"`
	Timestamp  time.Time              `json:"timestamp"`
	Metadata   map[string]interface{} `json:"metadata,omitempty"`
}

type DeviceEvent struct {
	Type      string                 `json:"type"`
	TenantID  uuid.UUID              `json:"tenant_id"`
	DeviceID  string                 `json:"device_id"`
	Status    string                 `json:"status"`
	Timestamp time.Time              `json:"timestamp"`
	Metadata  map[string]interface{} `json:"metadata,omitempty"`
}

type AlarmEvent struct {
	Type      string                 `json:"type"`
	TenantID  uuid.UUID              `json:"tenant_id"`
	AlarmType string                 `json:"alarm_type"`
	Severity  string                 `json:"severity"`
	DoorID    *string                `json:"door_id,omitempty"`
	Message   string                 `json:"message"`
	Timestamp time.Time              `json:"timestamp"`
	Metadata  map[string]interface{} `json:"metadata,omitempty"`
}

// Notification types
const (
	NotifTypeAccessDenied    = "access.denied"
	NotifTypeAlarmTriggered  = "alarm.triggered"
	NotifTypeDeviceOffline   = "device.offline"
	NotifTypeVisitorArrival  = "visitor.arrival"
	NotifTypeMaintenanceDue  = "maintenance.due"
	NotifTypeSecurityAlert   = "security.alert"
	NotifTypeEmergency       = "emergency"
	NotifTypeSystemUpdate    = "system.update"
)

// Channels
const (
	ChannelEmail = "email"
	ChannelPush  = "push"
	ChannelSMS   = "sms"
)

// Status
const (
	StatusPending   = "pending"
	StatusSent      = "sent"
	StatusDelivered = "delivered"
	StatusFailed    = "failed"
)