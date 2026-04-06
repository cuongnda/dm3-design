package models

import (
	"encoding/json"
	"time"
)

type Door struct {
	ID               string          `json:"id"`
	CompanyID        string          `json:"company_id"`
	SiteID           *string         `json:"site_id,omitempty"`
	ZoneID           *string         `json:"zone_id,omitempty"`
	Name             string          `json:"name"`
	Description      *string         `json:"description,omitempty"`
	Type             string          `json:"type"`
	Location         string          `json:"location"`
	Floor            *string         `json:"floor,omitempty"`
	Building         *string         `json:"building,omitempty"`
	Status           string          `json:"status"`
	State            string          `json:"state"`
	Mode             string          `json:"mode"`
	ControllerID     *string         `json:"controller_id,omitempty"`
	DeviceID         *string         `json:"device_id,omitempty"`
	UnlockDurationMs int             `json:"unlock_duration_ms"`
	AntiPassback     bool            `json:"anti_passback"`
	EmergencyUnlock  bool            `json:"emergency_unlock"`
	CameraID         *string         `json:"camera_id,omitempty"`
	FirmwareVersion  *string         `json:"firmware_version,omitempty"`
	IPAddress        *string         `json:"ip_address,omitempty"`
	LastEventAt      *time.Time      `json:"last_event_at,omitempty"`
	LastHeartbeatAt  *time.Time      `json:"last_heartbeat_at,omitempty"`
	ConfigVersion    int             `json:"config_version"`
	PersonDBVersion  int             `json:"person_db_version"`
	RulesVersion     int             `json:"rules_version"`
	Metadata         json.RawMessage `json:"metadata,omitempty"`
	CreatedAt        time.Time       `json:"created_at"`
	UpdatedAt        time.Time       `json:"updated_at"`
}

type AccessRule struct {
	ID                string          `json:"id"`
	CompanyID         string          `json:"company_id"`
	SiteID            *string         `json:"site_id,omitempty"`
	Name              string          `json:"name"`
	Description       *string         `json:"description,omitempty"`
	DoorIDs           []string        `json:"door_ids"`
	PersonGroupIDs    []string        `json:"person_group_ids"`
	ScheduleID        *string         `json:"schedule_id,omitempty"`
	Schedule          json.RawMessage `json:"schedule,omitempty"`
	AntiPassback      bool            `json:"anti_passback"`
	MultiFactor       bool            `json:"multi_factor"`
	MaxFailedAttempts int             `json:"max_failed_attempts"`
	LockoutDurationMs int             `json:"lockout_duration_ms"`
	Priority          int             `json:"priority"`
	Enabled           bool            `json:"enabled"`
	ValidFrom         *time.Time      `json:"valid_from,omitempty"`
	ValidUntil        *time.Time      `json:"valid_until,omitempty"`
	CreatedBy         *string         `json:"created_by,omitempty"`
	CreatedAt         time.Time       `json:"created_at"`
	UpdatedAt         time.Time       `json:"updated_at"`
}

type Schedule struct {
	ID                string          `json:"id"`
	CompanyID         string          `json:"company_id"`
	Name              string          `json:"name"`
	Timezone          string          `json:"timezone"`
	Periods           json.RawMessage `json:"periods"`
	HolidaysExcluded  bool            `json:"holidays_excluded"`
	HolidayCalendarID *string         `json:"holiday_calendar_id,omitempty"`
	CreatedAt         time.Time       `json:"created_at"`
	UpdatedAt         time.Time       `json:"updated_at"`
}

type DashboardStats struct {
	DoorsOnline  int            `json:"doors_online"`
	DoorsOffline int            `json:"doors_offline"`
	DoorsAlarm   int            `json:"doors_alarm"`
	DoorsTotal   int            `json:"doors_total"`
	EventsToday  int            `json:"events_today"`
	GrantedToday int            `json:"granted_today"`
	DeniedToday  int            `json:"denied_today"`
	RecentEvents []AccessEvent  `json:"recent_events"`
}

type SyncPackage struct {
	DoorID       string          `json:"door_id"`
	Rules        []AccessRule    `json:"rules"`
	RulesVersion int             `json:"rules_version"`
}

// ─── Access Time Models ─────────────────────────────────────────────────────

type AccessTimeTemplate struct {
	ID          string               `json:"id"`
	CompanyID   string               `json:"company_id"`
	Name        string               `json:"name"`
	Description *string              `json:"description,omitempty"`
	Timezone    string               `json:"timezone"`
	IsActive    bool                 `json:"is_active"`
	CreatedBy   *string              `json:"created_by,omitempty"`
	TimeSlots   []AccessTimeSlot     `json:"time_slots,omitempty"`
	UserCount   int                  `json:"user_count,omitempty"` // For list view
	CreatedAt   time.Time            `json:"created_at"`
	UpdatedAt   time.Time            `json:"updated_at"`
}

type AccessTimeSlot struct {
	ID         string  `json:"id"`
	TemplateID string  `json:"template_id"`
	DayOfWeek  int     `json:"day_of_week"`  // 0=Sunday, 1=Monday, ..., 6=Saturday
	StartTime  string  `json:"start_time"`   // "08:00:00"
	EndTime    string  `json:"end_time"`     // "17:00:00"
	SlotName   *string `json:"slot_name,omitempty"`
	IsActive   bool    `json:"is_active"`
	CreatedAt  time.Time `json:"created_at"`
}

type UserAccessTime struct {
	ID            string               `json:"id"`
	CompanyID     string               `json:"company_id"`
	UserID        string               `json:"user_id"`
	TemplateID    string               `json:"template_id"`
	Template      *AccessTimeTemplate  `json:"template,omitempty"` // For detailed view
	EffectiveFrom time.Time            `json:"effective_from"`
	EffectiveTo   *time.Time           `json:"effective_to,omitempty"`
	AssignedBy    *string              `json:"assigned_by,omitempty"`
	CreatedAt     time.Time            `json:"created_at"`
	UpdatedAt     time.Time            `json:"updated_at"`
}

type AccessTimeValidation struct {
	ID            string               `json:"id"`
	CompanyID     string               `json:"company_id"`
	UserID        string               `json:"user_id"`
	TemplateID    *string              `json:"template_id,omitempty"`
	DoorID        *string              `json:"door_id,omitempty"`
	ValidationTime time.Time           `json:"validation_time"`
	RequestedTime time.Time            `json:"requested_time"`
	IsAllowed     bool                 `json:"is_allowed"`
	Reason        *string              `json:"reason,omitempty"`
	MatchedSlotID *string              `json:"matched_slot_id,omitempty"`
	CreatedAt     time.Time            `json:"created_at"`
}

// ─── Request/Response DTOs ──────────────────────────────────────────────────

type CreateAccessTimeTemplateRequest struct {
	Name        string           `json:"name" validate:"required,min=1,max=100"`
	Description *string          `json:"description,omitempty"`
	Timezone    string           `json:"timezone" validate:"required"`
	TimeSlots   []TimeSlotInput  `json:"time_slots" validate:"required,min=1"`
}

type UpdateAccessTimeTemplateRequest struct {
	Name        *string          `json:"name,omitempty" validate:"omitempty,min=1,max=100"`
	Description *string          `json:"description,omitempty"`
	Timezone    *string          `json:"timezone,omitempty"`
	IsActive    *bool            `json:"is_active,omitempty"`
	TimeSlots   []TimeSlotInput  `json:"time_slots,omitempty"`
}

type TimeSlotInput struct {
	DayOfWeek int     `json:"day_of_week" validate:"min=0,max=6"`
	StartTime string  `json:"start_time" validate:"required"`
	EndTime   string  `json:"end_time" validate:"required"`
	SlotName  *string `json:"slot_name,omitempty"`
	IsActive  bool    `json:"is_active"`
}

type AssignAccessTimeRequest struct {
	UserIDs       []string   `json:"user_ids" validate:"required,min=1"`
	TemplateID    string     `json:"template_id" validate:"required,uuid"`
	EffectiveFrom time.Time  `json:"effective_from" validate:"required"`
	EffectiveTo   *time.Time `json:"effective_to,omitempty"`
}

type ValidateAccessRequest struct {
	UserID        string    `json:"user_id" validate:"required,uuid"`
	RequestedTime time.Time `json:"requested_time" validate:"required"`
	DoorID        *string   `json:"door_id,omitempty"`
}

type ValidateAccessResponse struct {
	IsAllowed     bool                 `json:"is_allowed"`
	Reason        string               `json:"reason"`
	MatchedSlot   *AccessTimeSlot      `json:"matched_slot,omitempty"`
	Template      *AccessTimeTemplate  `json:"template,omitempty"`
	NextAllowed   *time.Time           `json:"next_allowed,omitempty"`  // When access will be allowed next
}

type AccessTimeStats struct {
	TemplatesActive   int `json:"templates_active"`
	TemplatesTotal    int `json:"templates_total"`
	UsersAssigned     int `json:"users_assigned"`
	ValidationsToday  int `json:"validations_today"`
	ValidationsAllowed int `json:"validations_allowed"`
	ValidationsDenied int `json:"validations_denied"`
}
