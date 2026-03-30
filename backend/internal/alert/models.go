package alert

import (
	"time"

	"github.com/google/uuid"
)

// AlertRule represents a rule that triggers alerts based on conditions
type AlertRule struct {
	ID                uuid.UUID              `json:"id" db:"id"`
	TenantID          uuid.UUID              `json:"tenant_id" db:"tenant_id"`
	Name              string                 `json:"name" db:"name"`
	Description       string                 `json:"description" db:"description"`
	Category          string                 `json:"category" db:"category"` // security, device, attendance, etc.
	Severity          string                 `json:"severity" db:"severity"` // low, medium, high, critical
	IsEnabled         bool                   `json:"is_enabled" db:"is_enabled"`
	Conditions        map[string]interface{} `json:"conditions" db:"conditions"` // JSON rule conditions
	Actions           []string               `json:"actions" db:"actions"` // notify, log, execute_command, etc.
	Channels          []uuid.UUID            `json:"channels" db:"channels"` // alert channel IDs
	EscalationPolicy  *uuid.UUID             `json:"escalation_policy,omitempty" db:"escalation_policy"`
	Throttle          *ThrottleSettings      `json:"throttle,omitempty" db:"throttle"`
	Schedule          *ScheduleSettings      `json:"schedule,omitempty" db:"schedule"`
	Tags              []string               `json:"tags" db:"tags"`
	Metadata          map[string]interface{} `json:"metadata,omitempty" db:"metadata"`
	LastTriggered     *time.Time             `json:"last_triggered,omitempty" db:"last_triggered"`
	TriggerCount      int64                  `json:"trigger_count" db:"trigger_count"`
	CreatedAt         time.Time              `json:"created_at" db:"created_at"`
	UpdatedAt         time.Time              `json:"updated_at" db:"updated_at"`
	CreatedBy         uuid.UUID              `json:"created_by" db:"created_by"`
	DeletedAt         *time.Time             `json:"deleted_at,omitempty" db:"deleted_at"`
}

// AlertInstance represents a triggered alert
type AlertInstance struct {
	ID               uuid.UUID              `json:"id" db:"id"`
	TenantID         uuid.UUID              `json:"tenant_id" db:"tenant_id"`
	RuleID           uuid.UUID              `json:"rule_id" db:"rule_id"`
	RuleName         string                 `json:"rule_name" db:"rule_name"`
	Title            string                 `json:"title" db:"title"`
	Description      string                 `json:"description" db:"description"`
	Severity         string                 `json:"severity" db:"severity"`
	Status           string                 `json:"status" db:"status"` // open, acknowledged, resolved, suppressed
	Category         string                 `json:"category" db:"category"`
	Source           string                 `json:"source" db:"source"` // system event source
	EventData        map[string]interface{} `json:"event_data,omitempty" db:"event_data"`
	TriggeredAt      time.Time              `json:"triggered_at" db:"triggered_at"`
	AcknowledgedAt   *time.Time             `json:"acknowledged_at,omitempty" db:"acknowledged_at"`
	AcknowledgedBy   *uuid.UUID             `json:"acknowledged_by,omitempty" db:"acknowledged_by"`
	AcknowledgeNote  *string                `json:"acknowledge_note,omitempty" db:"acknowledge_note"`
	ResolvedAt       *time.Time             `json:"resolved_at,omitempty" db:"resolved_at"`
	ResolvedBy       *uuid.UUID             `json:"resolved_by,omitempty" db:"resolved_by"`
	ResolutionNote   *string                `json:"resolution_note,omitempty" db:"resolution_note"`
	SnoozedUntil     *time.Time             `json:"snoozed_until,omitempty" db:"snoozed_until"`
	EscalationLevel  int                    `json:"escalation_level" db:"escalation_level"`
	NotificationsSent int                   `json:"notifications_sent" db:"notifications_sent"`
	Tags             []string               `json:"tags" db:"tags"`
	Metadata         map[string]interface{} `json:"metadata,omitempty" db:"metadata"`
	CreatedAt        time.Time              `json:"created_at" db:"created_at"`
	UpdatedAt        time.Time              `json:"updated_at" db:"updated_at"`
}

// AutomationRule represents an automation action triggered by events
type AutomationRule struct {
	ID           uuid.UUID              `json:"id" db:"id"`
	TenantID     uuid.UUID              `json:"tenant_id" db:"tenant_id"`
	Name         string                 `json:"name" db:"name"`
	Description  string                 `json:"description" db:"description"`
	Category     string                 `json:"category" db:"category"`
	IsEnabled    bool                   `json:"is_enabled" db:"is_enabled"`
	Trigger      AutomationTrigger      `json:"trigger" db:"trigger"`
	Conditions   []AutomationCondition  `json:"conditions" db:"conditions"`
	Actions      []AutomationAction     `json:"actions" db:"actions"`
	Schedule     *ScheduleSettings      `json:"schedule,omitempty" db:"schedule"`
	Cooldown     *time.Duration         `json:"cooldown,omitempty" db:"cooldown"` // minimum time between executions
	Tags         []string               `json:"tags" db:"tags"`
	LastExecuted *time.Time             `json:"last_executed,omitempty" db:"last_executed"`
	ExecutionCount int64                `json:"execution_count" db:"execution_count"`
	Metadata     map[string]interface{} `json:"metadata,omitempty" db:"metadata"`
	CreatedAt    time.Time              `json:"created_at" db:"created_at"`
	UpdatedAt    time.Time              `json:"updated_at" db:"updated_at"`
	CreatedBy    uuid.UUID              `json:"created_by" db:"created_by"`
	DeletedAt    *time.Time             `json:"deleted_at,omitempty" db:"deleted_at"`
}

// EscalationPolicy defines how alerts should escalate over time
type EscalationPolicy struct {
	ID          uuid.UUID         `json:"id" db:"id"`
	TenantID    uuid.UUID         `json:"tenant_id" db:"tenant_id"`
	Name        string            `json:"name" db:"name"`
	Description string            `json:"description" db:"description"`
	IsEnabled   bool              `json:"is_enabled" db:"is_enabled"`
	Steps       []EscalationStep  `json:"steps" db:"steps"`
	RepeatCount int               `json:"repeat_count" db:"repeat_count"` // how many times to repeat the policy
	CreatedAt   time.Time         `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time         `json:"updated_at" db:"updated_at"`
	CreatedBy   uuid.UUID         `json:"created_by" db:"created_by"`
}

// AlertChannel represents a notification destination
type AlertChannel struct {
	ID           uuid.UUID              `json:"id" db:"id"`
	TenantID     uuid.UUID              `json:"tenant_id" db:"tenant_id"`
	Name         string                 `json:"name" db:"name"`
	Description  string                 `json:"description" db:"description"`
	Type         string                 `json:"type" db:"type"` // email, slack, webhook, sms, teams, discord
	IsEnabled    bool                   `json:"is_enabled" db:"is_enabled"`
	Configuration map[string]interface{} `json:"configuration" db:"configuration"` // channel-specific config
	Templates    *ChannelTemplates      `json:"templates,omitempty" db:"templates"`
	CreatedAt    time.Time              `json:"created_at" db:"created_at"`
	UpdatedAt    time.Time              `json:"updated_at" db:"updated_at"`
	CreatedBy    uuid.UUID              `json:"created_by" db:"created_by"`
}

// AlertTemplate represents message templates for different alert types
type AlertTemplate struct {
	ID          uuid.UUID `json:"id" db:"id"`
	TenantID    uuid.UUID `json:"tenant_id" db:"tenant_id"`
	Name        string    `json:"name" db:"name"`
	Description string    `json:"description" db:"description"`
	Category    string    `json:"category" db:"category"`
	Severity    string    `json:"severity" db:"severity"`
	Subject     string    `json:"subject" db:"subject"`
	Body        string    `json:"body" db:"body"`
	Format      string    `json:"format" db:"format"` // text, html, markdown
	Variables   []string  `json:"variables" db:"variables"` // available template variables
	CreatedAt   time.Time `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time `json:"updated_at" db:"updated_at"`
	CreatedBy   uuid.UUID `json:"created_by" db:"created_by"`
}

// Schedule represents on-call schedules
type Schedule struct {
	ID          uuid.UUID      `json:"id" db:"id"`
	TenantID    uuid.UUID      `json:"tenant_id" db:"tenant_id"`
	Name        string         `json:"name" db:"name"`
	Description string         `json:"description" db:"description"`
	TimeZone    string         `json:"timezone" db:"timezone"`
	Layers      []ScheduleLayer `json:"layers" db:"layers"`
	Overrides   []ScheduleOverride `json:"overrides" db:"overrides"`
	IsEnabled   bool           `json:"is_enabled" db:"is_enabled"`
	CreatedAt   time.Time      `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at" db:"updated_at"`
	CreatedBy   uuid.UUID      `json:"created_by" db:"created_by"`
}

// MaintenanceWindow represents a maintenance window during which alerts are suppressed
type MaintenanceWindow struct {
	ID          uuid.UUID              `json:"id" db:"id"`
	TenantID    uuid.UUID              `json:"tenant_id" db:"tenant_id"`
	Name        string                 `json:"name" db:"name"`
	Description string                 `json:"description" db:"description"`
	StartTime   time.Time              `json:"start_time" db:"start_time"`
	EndTime     time.Time              `json:"end_time" db:"end_time"`
	IsRecurring bool                   `json:"is_recurring" db:"is_recurring"`
	RecurrenceRule *string             `json:"recurrence_rule,omitempty" db:"recurrence_rule"` // RRULE format
	Scope       MaintenanceScope       `json:"scope" db:"scope"`
	IsActive    bool                   `json:"is_active" db:"is_active"`
	CreatedAt   time.Time              `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time              `json:"updated_at" db:"updated_at"`
	CreatedBy   uuid.UUID              `json:"created_by" db:"created_by"`
}

// AlertSettings represents tenant-wide alert configuration
type AlertSettings struct {
	ID                    uuid.UUID              `json:"id" db:"id"`
	TenantID              uuid.UUID              `json:"tenant_id" db:"tenant_id"`
	DefaultSeverity       string                 `json:"default_severity" db:"default_severity"`
	AutoResolutionEnabled bool                   `json:"auto_resolution_enabled" db:"auto_resolution_enabled"`
	AutoResolutionTimeout int                    `json:"auto_resolution_timeout" db:"auto_resolution_timeout"` // minutes
	GlobalThrottle        *ThrottleSettings      `json:"global_throttle,omitempty" db:"global_throttle"`
	DefaultChannels       []uuid.UUID            `json:"default_channels" db:"default_channels"`
	AlertRetentionDays    int                    `json:"alert_retention_days" db:"alert_retention_days"`
	EnableMaintenanceMode bool                   `json:"enable_maintenance_mode" db:"enable_maintenance_mode"`
	NotificationSettings  map[string]interface{} `json:"notification_settings,omitempty" db:"notification_settings"`
	IntegrationSettings   map[string]interface{} `json:"integration_settings,omitempty" db:"integration_settings"`
	CreatedAt             time.Time              `json:"created_at" db:"created_at"`
	UpdatedAt             time.Time              `json:"updated_at" db:"updated_at"`
}

// Embedded types

type ThrottleSettings struct {
	Enabled     bool          `json:"enabled"`
	WindowSize  time.Duration `json:"window_size"` // time window for throttling
	MaxAlerts   int           `json:"max_alerts"`  // max alerts in window
	Cooldown    time.Duration `json:"cooldown"`    // cooldown after throttle
}

type ScheduleSettings struct {
	Enabled   bool     `json:"enabled"`
	TimeZone  string   `json:"timezone"`
	StartTime string   `json:"start_time"` // HH:MM
	EndTime   string   `json:"end_time"`   // HH:MM
	WeekDays  []int    `json:"weekdays"`   // 0-6, 0=Sunday
}

type AutomationTrigger struct {
	Type       string                 `json:"type"` // event, schedule, manual
	EventTypes []string               `json:"event_types,omitempty"` // access.granted, motion.detected, etc.
	Schedule   *ScheduleSettings      `json:"schedule,omitempty"`
	Filters    map[string]interface{} `json:"filters,omitempty"`
}

type AutomationCondition struct {
	Field    string      `json:"field"`    // event field to check
	Operator string      `json:"operator"` // equals, contains, greater_than, etc.
	Value    interface{} `json:"value"`    // value to compare against
	LogicOp  string      `json:"logic_op,omitempty"` // AND, OR (for chaining)
}

type AutomationAction struct {
	Type       string                 `json:"type"` // send_notification, execute_command, update_device, etc.
	Target     string                 `json:"target,omitempty"` // target for the action
	Parameters map[string]interface{} `json:"parameters,omitempty"`
	Timeout    *time.Duration         `json:"timeout,omitempty"`
}

type EscalationStep struct {
	Delay     time.Duration `json:"delay"`     // time to wait before escalating
	Targets   []uuid.UUID   `json:"targets"`   // user or channel IDs
	Actions   []string      `json:"actions"`   // notify, page, call
}

type ChannelTemplates struct {
	Alert     *string `json:"alert,omitempty"`
	Resolved  *string `json:"resolved,omitempty"`
	Escalated *string `json:"escalated,omitempty"`
}

type ScheduleLayer struct {
	Name       string              `json:"name"`
	Start      time.Time           `json:"start"`
	Rotation   RotationSettings    `json:"rotation"`
	Users      []uuid.UUID         `json:"users"`
	Restrictions []TimeRestriction `json:"restrictions,omitempty"`
}

type RotationSettings struct {
	Type     string        `json:"type"`     // daily, weekly, custom
	Length   time.Duration `json:"length"`   // rotation length
	Handoff  string        `json:"handoff"`  // time of day for handoff
}

type ScheduleOverride struct {
	ID      uuid.UUID `json:"id"`
	User    uuid.UUID `json:"user"`
	Start   time.Time `json:"start"`
	End     time.Time `json:"end"`
	Reason  string    `json:"reason"`
}

type TimeRestriction struct {
	Type      string `json:"type"`       // daily, weekly
	StartTime string `json:"start_time"` // HH:MM
	EndTime   string `json:"end_time"`   // HH:MM
	WeekDays  []int  `json:"weekdays,omitempty"`
}

type MaintenanceScope struct {
	Type      string      `json:"type"` // all, rules, categories, specific
	RuleIDs   []uuid.UUID `json:"rule_ids,omitempty"`
	Categories []string    `json:"categories,omitempty"`
}

// Request/Response types

type CreateAlertRuleRequest struct {
	Name             string                 `json:"name" validate:"required"`
	Description      string                 `json:"description"`
	Category         string                 `json:"category" validate:"required"`
	Severity         string                 `json:"severity" validate:"required"`
	Conditions       map[string]interface{} `json:"conditions" validate:"required"`
	Actions          []string               `json:"actions"`
	Channels         []uuid.UUID            `json:"channels"`
	EscalationPolicy *uuid.UUID             `json:"escalation_policy,omitempty"`
	Throttle         *ThrottleSettings      `json:"throttle,omitempty"`
	Schedule         *ScheduleSettings      `json:"schedule,omitempty"`
	Tags             []string               `json:"tags"`
}

type CreateAutomationRuleRequest struct {
	Name        string                `json:"name" validate:"required"`
	Description string                `json:"description"`
	Category    string                `json:"category" validate:"required"`
	Trigger     AutomationTrigger     `json:"trigger" validate:"required"`
	Conditions  []AutomationCondition `json:"conditions"`
	Actions     []AutomationAction    `json:"actions" validate:"required"`
	Schedule    *ScheduleSettings     `json:"schedule,omitempty"`
	Cooldown    *time.Duration        `json:"cooldown,omitempty"`
	Tags        []string              `json:"tags"`
}

type CreateAlertChannelRequest struct {
	Name          string                 `json:"name" validate:"required"`
	Description   string                 `json:"description"`
	Type          string                 `json:"type" validate:"required"`
	Configuration map[string]interface{} `json:"configuration" validate:"required"`
	Templates     *ChannelTemplates      `json:"templates,omitempty"`
}

type CreateEscalationPolicyRequest struct {
	Name        string           `json:"name" validate:"required"`
	Description string           `json:"description"`
	Steps       []EscalationStep `json:"steps" validate:"required"`
	RepeatCount int              `json:"repeat_count"`
}

type CreateMaintenanceWindowRequest struct {
	Name           string           `json:"name" validate:"required"`
	Description    string           `json:"description"`
	StartTime      time.Time        `json:"start_time" validate:"required"`
	EndTime        time.Time        `json:"end_time" validate:"required"`
	IsRecurring    bool             `json:"is_recurring"`
	RecurrenceRule *string          `json:"recurrence_rule,omitempty"`
	Scope          MaintenanceScope `json:"scope"`
}

type CreateManualAlertRequest struct {
	Title       string                 `json:"title" validate:"required"`
	Description string                 `json:"description" validate:"required"`
	Severity    string                 `json:"severity" validate:"required"`
	Category    string                 `json:"category"`
	Source      string                 `json:"source"`
	EventData   map[string]interface{} `json:"event_data,omitempty"`
	Tags        []string               `json:"tags"`
}

type AlertRuleListQuery struct {
	Category  *string `query:"category"`
	Severity  *string `query:"severity"`
	IsEnabled *bool   `query:"is_enabled"`
	Tags      *string `query:"tags"`
	Search    *string `query:"search"`
	Limit     int     `query:"limit"`
	Offset    int     `query:"offset"`
}

type AlertInstanceListQuery struct {
	RuleID     *string `query:"rule_id"`
	Status     *string `query:"status"`
	Severity   *string `query:"severity"`
	Category   *string `query:"category"`
	DateFrom   *string `query:"date_from"`
	DateTo     *string `query:"date_to"`
	Acknowledged *bool `query:"acknowledged"`
	Limit      int     `query:"limit"`
	Offset     int     `query:"offset"`
}

type AcknowledgeAlertRequest struct {
	Note *string `json:"note,omitempty"`
}

type ResolveAlertRequest struct {
	Note *string `json:"note,omitempty"`
}

type SnoozeAlertRequest struct {
	Duration time.Duration `json:"duration" validate:"required"`
	Note     *string       `json:"note,omitempty"`
}

// Response types

type AlertAnalyticsResponse struct {
	TenantID              uuid.UUID         `json:"tenant_id"`
	TotalRules            int64             `json:"total_rules"`
	ActiveRules           int64             `json:"active_rules"`
	TotalAlerts           int64             `json:"total_alerts"`
	OpenAlerts            int64             `json:"open_alerts"`
	AcknowledgedAlerts    int64             `json:"acknowledged_alerts"`
	ResolvedAlerts        int64             `json:"resolved_alerts"`
	AlertsToday           int64             `json:"alerts_today"`
	AlertsThisWeek        int64             `json:"alerts_this_week"`
	ByStatus              map[string]int64  `json:"by_status"`
	BySeverity            map[string]int64  `json:"by_severity"`
	ByCategory            map[string]int64  `json:"by_category"`
	TopAlertRules         []RuleStats       `json:"top_alert_rules"`
	MeanTimeToAcknowledge float64           `json:"mean_time_to_acknowledge"` // minutes
	MeanTimeToResolve     float64           `json:"mean_time_to_resolve"`     // minutes
	EscalationRate        float64           `json:"escalation_rate"`          // percentage
}

type RuleStats struct {
	RuleID      uuid.UUID `json:"rule_id"`
	RuleName    string    `json:"rule_name"`
	AlertCount  int64     `json:"alert_count"`
	LastTriggered *time.Time `json:"last_triggered,omitempty"`
}

type OnCallStatusResponse struct {
	CurrentOnCall    []OnCallUser  `json:"current_on_call"`
	NextOnCall       []OnCallUser  `json:"next_on_call"`
	ScheduleChanges  []ScheduleChange `json:"upcoming_changes"`
	MaintenanceWindows []MaintenanceWindow `json:"active_maintenance"`
}

type OnCallUser struct {
	UserID      uuid.UUID `json:"user_id"`
	UserName    string    `json:"user_name"`
	ScheduleID  uuid.UUID `json:"schedule_id"`
	ScheduleName string   `json:"schedule_name"`
	StartTime   time.Time `json:"start_time"`
	EndTime     time.Time `json:"end_time"`
	IsOverride  bool      `json:"is_override"`
}

type ScheduleChange struct {
	Type        string    `json:"type"` // handoff, override_start, override_end
	Time        time.Time `json:"time"`
	FromUser    *uuid.UUID `json:"from_user,omitempty"`
	ToUser      *uuid.UUID `json:"to_user,omitempty"`
	ScheduleID  uuid.UUID `json:"schedule_id"`
}

// Constants

// Alert severities
const (
	SeverityLow      = "low"
	SeverityMedium   = "medium"
	SeverityHigh     = "high"
	SeverityCritical = "critical"
)

// Alert statuses
const (
	StatusOpen         = "open"
	StatusAcknowledged = "acknowledged"
	StatusResolved     = "resolved"
	StatusSuppressed   = "suppressed"
	StatusSnoozed      = "snoozed"
)

// Alert categories
const (
	CategorySecurity    = "security"
	CategoryDevice      = "device"
	CategoryAttendance  = "attendance"
	CategoryVideo       = "video"
	CategoryAccess      = "access"
	CategorySystem      = "system"
	CategoryCustom      = "custom"
)

// Channel types
const (
	ChannelTypeEmail   = "email"
	ChannelTypeSlack   = "slack"
	ChannelTypeSMS     = "sms"
	ChannelTypeWebhook = "webhook"
	ChannelTypeTeams   = "teams"
	ChannelTypeDiscord = "discord"
	ChannelTypePush    = "push"
)

// Action types
const (
	ActionNotify         = "notify"
	ActionLog            = "log"
	ActionExecuteCommand = "execute_command"
	ActionUpdateDevice   = "update_device"
	ActionCreateTicket   = "create_ticket"
	ActionSendWebhook    = "send_webhook"
)

// Automation trigger types
const (
	TriggerTypeEvent    = "event"
	TriggerTypeSchedule = "schedule"
	TriggerTypeManual   = "manual"
)

// Automation action types
const (
	AutoActionNotify         = "send_notification"
	AutoActionCommand        = "execute_command"
	AutoActionDevice         = "update_device"
	AutoActionDoor           = "control_door"
	AutoActionCamera         = "control_camera"
	AutoActionRecording      = "start_recording"
	AutoActionWebhook        = "send_webhook"
	AutoActionTicket         = "create_ticket"
)

// Default settings
var DefaultAlertSettings = AlertSettings{
	DefaultSeverity:       SeverityMedium,
	AutoResolutionEnabled: true,
	AutoResolutionTimeout: 1440, // 24 hours
	AlertRetentionDays:    90,
	EnableMaintenanceMode: true,
}