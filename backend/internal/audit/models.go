package audit

import (
	"time"

	"github.com/google/uuid"
)

// AuditEvent represents an immutable audit log entry
type AuditEvent struct {
	ID           uuid.UUID              `json:"id" db:"id"`
	TenantID     uuid.UUID              `json:"tenant_id" db:"tenant_id"`
	EventType    string                 `json:"event_type" db:"event_type"`
	ActorID      *uuid.UUID             `json:"actor_id,omitempty" db:"actor_id"` // who performed the action
	ActorType    string                 `json:"actor_type" db:"actor_type"`       // user, system, device
	ActorName    *string                `json:"actor_name,omitempty" db:"actor_name"`
	Action       string                 `json:"action" db:"action"`           // created, updated, deleted, accessed
	Resource     string                 `json:"resource" db:"resource"`       // user, door, rule, device
	ResourceID   *string                `json:"resource_id,omitempty" db:"resource_id"`
	ResourceName *string                `json:"resource_name,omitempty" db:"resource_name"`
	OldValue     map[string]interface{} `json:"old_value,omitempty" db:"old_value"` // before change
	NewValue     map[string]interface{} `json:"new_value,omitempty" db:"new_value"` // after change
	IPAddress    *string                `json:"ip_address,omitempty" db:"ip_address"`
	UserAgent    *string                `json:"user_agent,omitempty" db:"user_agent"`
	SessionID    *string                `json:"session_id,omitempty" db:"session_id"`
	Result       string                 `json:"result" db:"result"` // success, failure, error
	ErrorMsg     *string                `json:"error_msg,omitempty" db:"error_msg"`
	Metadata     map[string]interface{} `json:"metadata,omitempty" db:"metadata"`
	Timestamp    time.Time              `json:"timestamp" db:"timestamp"`
	ChainHash    *string                `json:"chain_hash,omitempty" db:"chain_hash"` // SHA-256 integrity chain
}

// IntegrityCheckpoint represents periodic integrity verification points
type IntegrityCheckpoint struct {
	ID           uuid.UUID `json:"id" db:"id"`
	TenantID     uuid.UUID `json:"tenant_id" db:"tenant_id"`
	LastEventID  uuid.UUID `json:"last_event_id" db:"last_event_id"`
	EventCount   int64     `json:"event_count" db:"event_count"`
	ChainHash    string    `json:"chain_hash" db:"chain_hash"`
	VerifiedAt   time.Time `json:"verified_at" db:"verified_at"`
	VerifiedBy   string    `json:"verified_by" db:"verified_by"` // system, admin
	Status       string    `json:"status" db:"status"`           // verified, compromised
	ErrorDetails *string   `json:"error_details,omitempty" db:"error_details"`
}

// Request/Response types

type AuditEventQuery struct {
	TenantID     uuid.UUID `query:"tenant_id"`
	EventType    *string   `query:"event_type"`
	ActorID      *string   `query:"actor_id"`
	ActorType    *string   `query:"actor_type"`
	Action       *string   `query:"action"`
	Resource     *string   `query:"resource"`
	ResourceID   *string   `query:"resource_id"`
	Result       *string   `query:"result"`
	DateFrom     *string   `query:"date_from"` // YYYY-MM-DD format
	DateTo       *string   `query:"date_to"`
	IPAddress    *string   `query:"ip_address"`
	SearchTerm   *string   `query:"search"`    // free text search
	Limit        int       `query:"limit"`
	Offset       int       `query:"offset"`
	OrderBy      *string   `query:"order_by"`  // timestamp, action, resource
	OrderDir     *string   `query:"order_dir"` // asc, desc
}

type ActivityReportRequest struct {
	TenantID  uuid.UUID `query:"tenant_id"`
	DateFrom  string    `query:"date_from"`
	DateTo    string    `query:"date_to"`
	ActorID   *string   `query:"actor_id"`
	ActorType *string   `query:"actor_type"`
	GroupBy   *string   `query:"group_by"` // day, hour, actor, resource
}

type AccessReportRequest struct {
	TenantID   uuid.UUID `query:"tenant_id"`
	DateFrom   string    `query:"date_from"`
	DateTo     string    `query:"date_to"`
	DoorID     *string   `query:"door_id"`
	PersonID   *string   `query:"person_id"`
	Decision   *string   `query:"decision"` // granted, denied
	IncludeDenied bool   `query:"include_denied"`
}

type AdminActionsReportRequest struct {
	TenantID  uuid.UUID `query:"tenant_id"`
	DateFrom  string    `query:"date_from"`
	DateTo    string    `query:"date_to"`
	AdminID   *string   `query:"admin_id"`
	Action    *string   `query:"action"`
	Resource  *string   `query:"resource"`
	HighRisk  bool      `query:"high_risk"` // only critical actions
}

type AuditStatsResponse struct {
	TenantID       uuid.UUID          `json:"tenant_id"`
	TotalEvents    int64              `json:"total_events"`
	EventsByType   map[string]int64   `json:"events_by_type"`
	EventsByAction map[string]int64   `json:"events_by_action"`
	EventsByResult map[string]int64   `json:"events_by_result"`
	TopActors      []ActorStats       `json:"top_actors"`
	TopResources   []ResourceStats    `json:"top_resources"`
	LastCheckpoint *time.Time         `json:"last_checkpoint,omitempty"`
	IntegrityOK    bool               `json:"integrity_ok"`
	Period         string             `json:"period"`
}

type ActorStats struct {
	ActorID   uuid.UUID `json:"actor_id"`
	ActorName string    `json:"actor_name"`
	ActorType string    `json:"actor_type"`
	Count     int64     `json:"count"`
}

type ResourceStats struct {
	Resource string `json:"resource"`
	Count    int64  `json:"count"`
}

// Event types
const (
	EventTypeAccess      = "access"
	EventTypeAuth        = "auth"
	EventTypeUser        = "user"
	EventTypeDoor        = "door"
	EventTypeRule        = "rule"
	EventTypeDevice      = "device"
	EventTypeVisitor     = "visitor"
	EventTypeSystem      = "system"
	EventTypeCompany     = "company"
	EventTypeConfig      = "config"
	EventTypeEmergency   = "emergency"
	EventTypeIntegration = "integration"
)

// Actions
const (
	ActionCreated   = "created"
	ActionUpdated   = "updated"
	ActionDeleted   = "deleted"
	ActionViewed    = "viewed"
	ActionExported  = "exported"
	ActionLogin     = "login"
	ActionLogout    = "logout"
	ActionUnlocked  = "unlocked"
	ActionLocked    = "locked"
	ActionGranted   = "granted"
	ActionDenied    = "denied"
	ActionEnabled   = "enabled"
	ActionDisabled  = "disabled"
	ActionProvisioned = "provisioned"
	ActionDeprovisioned = "deprovisioned"
	ActionActivated = "activated"
	ActionSuspended = "suspended"
	ActionRestored  = "restored"
)

// Actor types
const (
	ActorTypeUser   = "user"
	ActorTypeSystem = "system"
	ActorTypeDevice = "device"
	ActorTypeAPI    = "api"
)

// Resources
const (
	ResourceUser        = "user"
	ResourceCompany     = "company"
	ResourceDoor        = "door"
	ResourceRule        = "rule"
	ResourceSchedule    = "schedule"
	ResourcePerson      = "person"
	ResourceCredential  = "credential"
	ResourceDevice      = "device"
	ResourceVisitor     = "visitor"
	ResourceTemplate    = "template"
	ResourceReport      = "report"
	ResourceSettings    = "settings"
	ResourceIntegration = "integration"
)

// Results
const (
	ResultSuccess = "success"
	ResultFailure = "failure"
	ResultError   = "error"
)

// High-risk actions that require special attention
var HighRiskActions = map[string]map[string]bool{
	ResourceUser: {
		ActionCreated:       true,
		ActionDeleted:       true,
		ActionSuspended:     true,
		ActionActivated:     true,
	},
	ResourceDoor: {
		ActionCreated:   true,
		ActionDeleted:   true,
		ActionUnlocked:  true, // manual unlock
		ActionLocked:    true, // manual lock
	},
	ResourceRule: {
		ActionCreated: true,
		ActionUpdated: true,
		ActionDeleted: true,
	},
	ResourceDevice: {
		ActionProvisioned:   true,
		ActionDeprovisioned: true,
		ActionDisabled:      true,
	},
	ResourceCompany: {
		ActionCreated: true,
		ActionUpdated: true,
		ActionDeleted: true,
	},
	ResourceSettings: {
		ActionUpdated: true,
	},
}

// Helper function to check if an action is high-risk
func IsHighRiskAction(resource, action string) bool {
	if actions, exists := HighRiskActions[resource]; exists {
		return actions[action]
	}
	return false
}