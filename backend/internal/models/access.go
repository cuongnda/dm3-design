package models

import (
	"encoding/json"
	"time"
)

// ─── Access Group ─────────────────────────────────────────────────────────────

type AccessGroup struct {
	ID               string      `json:"id"`
	TenantID         string      `json:"tenant_id"`
	AccessTimeID     *string     `json:"access_time_id,omitempty"`
	Name             string      `json:"name"`
	Description      *string     `json:"description,omitempty"`
	IsDefault        bool        `json:"is_default"`
	Type             int         `json:"type"`
	AccessPointCount int         `json:"access_point_count,omitempty"`
	UserCount        int         `json:"user_count,omitempty"`
	AccessTime       *AccessTime `json:"access_time,omitempty"`
	CreatedAt        time.Time   `json:"created_at"`
	UpdatedAt        time.Time   `json:"updated_at"`
}

// ─── Zone ─────────────────────────────────────────────────────────────────────

type Zone struct {
	ID               string    `json:"id"`
	TenantID         string    `json:"tenant_id"`
	ParentID         *string   `json:"parent_id,omitempty"`
	Name             string    `json:"name"`
	Type             string    `json:"type"`
	Description      *string   `json:"description,omitempty"`
	Timezone         *string   `json:"timezone,omitempty"`
	Latitude         *float64  `json:"latitude,omitempty"`
	Longitude        *float64  `json:"longitude,omitempty"`
	Address          *string   `json:"address,omitempty"`
	Floor            *string   `json:"floor,omitempty"`
	Building         *string   `json:"building,omitempty"`
	MapImageURL      *string   `json:"map_image_url,omitempty"`
	MapWidth         *int      `json:"map_width,omitempty"`
	MapHeight        *int      `json:"map_height,omitempty"`
	AccessPointCount int       `json:"access_point_count,omitempty"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
}

// ─── Access Time ──────────────────────────────────────────────────────────────

type AccessTime struct {
	ID          string           `json:"id"`
	TenantID    string           `json:"tenant_id"`
	Name        string           `json:"name"`
	Description *string          `json:"description,omitempty"`
	Timezone    string           `json:"timezone"`
	IsActive    bool             `json:"is_active"`
	CreatedBy   *string          `json:"created_by,omitempty"`
	SlotCount   int              `json:"slot_count,omitempty"`
	GroupCount  int              `json:"group_count,omitempty"`
	Slots       []AccessTimeSlot `json:"slots,omitempty"`
	CreatedAt   time.Time        `json:"created_at"`
	UpdatedAt   time.Time        `json:"updated_at"`
}

type AccessTimeSlot struct {
	ID           string    `json:"id"`
	TenantID     string    `json:"tenant_id"`
	AccessTimeID string    `json:"access_time_id"`
	DayOfWeek    int       `json:"day_of_week"` // 0=Sunday ... 6=Saturday
	StartTime    string    `json:"start_time"`  // "08:00:00"
	EndTime      string    `json:"end_time"`    // "17:00:00"
	SlotName     *string   `json:"slot_name,omitempty"`
	IsActive     bool      `json:"is_active"`
	CreatedAt    time.Time `json:"created_at"`
}

// ─── Access Point ─────────────────────────────────────────────────────────────

// AccessPoint is a logical entry/exit point that groups physical access devices.
// access_time_id = nil means 24/7 unrestricted access.
type AccessPoint struct {
	ID                string      `json:"id"`
	TenantID          string      `json:"tenant_id"`
	ZoneID            *string     `json:"zone_id,omitempty"`
	AccessTimeID      *string     `json:"access_time_id,omitempty"`
	Name              string      `json:"name"`
	Description       *string     `json:"description,omitempty"`
	MapX              *float64    `json:"map_x,omitempty"`
	MapY              *float64    `json:"map_y,omitempty"`
	MapRotation       *float64    `json:"map_rotation,omitempty"`
	AccessDeviceCount int         `json:"access_device_count,omitempty"`
	DeviceStatus      *string     `json:"device_status,omitempty"`  // online/offline — worst-case from bound devices
	DoorState         *string     `json:"door_state,omitempty"`     // closed/open/held_open/forced/alarm — worst-case from bound devices
	ZoneName          *string     `json:"zone_name,omitempty"`
	InAnyGroup        bool        `json:"in_any_group"`             // true if this AP is bound to at least one access group
	Zone              *Zone       `json:"zone,omitempty"`
	AccessTime        *AccessTime `json:"access_time,omitempty"`
	CreatedAt         time.Time   `json:"created_at"`
	UpdatedAt         time.Time   `json:"updated_at"`
}

// ─── AccessDevice (physical access control device) ────────────────────────────

type AccessDevice struct {
	ID               string          `json:"id"`
	TenantID         string          `json:"tenant_id"`
	DeviceID         *string         `json:"device_id,omitempty"`
	Name             string          `json:"name"`
	Type             string          `json:"type"`
	Status           string          `json:"status"`
	State            string          `json:"state"`
	Mode             string          `json:"mode"`
	UnlockDurationMs int             `json:"unlock_duration_ms"`
	AntiPassback     bool            `json:"anti_passback"`
	EmergencyUnlock  bool            `json:"emergency_unlock"`
	FirmwareVersion  *string         `json:"firmware_version,omitempty"`
	IPAddress        *string         `json:"ip_address,omitempty"`
	LastEventAt      *time.Time      `json:"last_event_at,omitempty"`
	LastHeartbeatAt  *time.Time      `json:"last_heartbeat_at,omitempty"`
	ConfigVersion    int             `json:"config_version"`
	UserDBVersion    int             `json:"user_db_version"`
	RulesVersion     int             `json:"rules_version"`
	Source           *string         `json:"source,omitempty"`
	SourceRef        *string         `json:"source_ref,omitempty"`
	Metadata         json.RawMessage `json:"metadata,omitempty"`
	CreatedAt        time.Time       `json:"created_at"`
	UpdatedAt        time.Time       `json:"updated_at"`
}

// AccessPointDevice is one row in the access_point_devices junction.
type AccessPointDevice struct {
	ID             string        `json:"id"`
	TenantID       string        `json:"tenant_id"`
	AccessPointID  string        `json:"access_point_id"`
	AccessDeviceID string        `json:"access_device_id"`
	Role           string        `json:"role"` // reader_in | reader_out | controller | camera
	Device         *AccessDevice `json:"device,omitempty"`
	CreatedAt      time.Time     `json:"created_at"`
}

// AccessGroupAccessPoint is one row in the access_group_access_points junction.
type AccessGroupAccessPoint struct {
	ID            string       `json:"id"`
	TenantID      string       `json:"tenant_id"`
	AccessGroupID string       `json:"access_group_id"`
	AccessPointID string       `json:"access_point_id"`
	AccessPoint   *AccessPoint `json:"access_point,omitempty"`
	CreatedAt     time.Time    `json:"created_at"`
}

// AccessGroupUser is one row in the access_group_users junction (M:N user ↔ access group).
type AccessGroupUser struct {
	ID            string     `json:"id"`
	TenantID      string     `json:"tenant_id"`
	AccessGroupID string     `json:"access_group_id"`
	UserID        string     `json:"user_id"`
	EffectiveFrom time.Time  `json:"effective_from"`
	EffectiveTo   *time.Time `json:"effective_to,omitempty"`
	CreatedAt     time.Time  `json:"created_at"`
}

// ─── Access Rule (legacy, kept for sync package) ──────────────────────────────

type AccessRule struct {
	ID                string          `json:"id"`
	TenantID          string          `json:"tenant_id"`
	SiteID            *string         `json:"site_id,omitempty"`
	Name              string          `json:"name"`
	Description       *string         `json:"description,omitempty"`
	DoorIDs           []string        `json:"door_ids"`
	UserGroupIDs      []string        `json:"user_group_ids"`
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

// ─── Schedule (legacy, kept for existing rule handlers) ───────────────────────

type Schedule struct {
	ID                string          `json:"id"`
	TenantID          string          `json:"tenant_id"`
	Name              string          `json:"name"`
	Timezone          string          `json:"timezone"`
	Periods           json.RawMessage `json:"periods"`
	HolidaysExcluded  bool            `json:"holidays_excluded"`
	HolidayCalendarID *string         `json:"holiday_calendar_id,omitempty"`
	CreatedAt         time.Time       `json:"created_at"`
	UpdatedAt         time.Time       `json:"updated_at"`
}

// ─── Stats ────────────────────────────────────────────────────────────────────

type DashboardStats struct {
	AccessDevicesOnline  int           `json:"access_devices_online"`
	AccessDevicesOffline int           `json:"access_devices_offline"`
	AccessDevicesWarning int           `json:"access_devices_warning"`
	AccessDevicesTotal   int           `json:"access_devices_total"`
	EventsToday          int           `json:"events_today"`
	GrantedToday         int           `json:"granted_today"`
	DeniedToday          int           `json:"denied_today"`
	RecentEvents         []AccessEvent `json:"recent_events"`
}

type SyncPackage struct {
	AccessDeviceID string       `json:"access_device_id"`
	Rules          []AccessRule `json:"rules"`
	RulesVersion   int          `json:"rules_version"`
}

// ─── Legacy access time models (kept for existing handlers) ───────────────────

type AccessTimeTemplate = AccessTime

type UserAccessTime struct {
	ID            string      `json:"id"`
	TenantID      string      `json:"tenant_id"`
	UserID        string      `json:"user_id"`
	TemplateID    string      `json:"template_id"`
	Template      *AccessTime `json:"template,omitempty"`
	EffectiveFrom time.Time   `json:"effective_from"`
	EffectiveTo   *time.Time  `json:"effective_to,omitempty"`
	AssignedBy    *string     `json:"assigned_by,omitempty"`
	CreatedAt     time.Time   `json:"created_at"`
	UpdatedAt     time.Time   `json:"updated_at"`
}

type AccessTimeValidation struct {
	ID             string    `json:"id"`
	TenantID       string    `json:"tenant_id"`
	UserID         string    `json:"user_id"`
	TemplateID     *string   `json:"template_id,omitempty"`
	DoorID         *string   `json:"door_id,omitempty"`
	ValidationTime time.Time `json:"validation_time"`
	RequestedTime  time.Time `json:"requested_time"`
	IsAllowed      bool      `json:"is_allowed"`
	Reason         *string   `json:"reason,omitempty"`
	MatchedSlotID  *string   `json:"matched_slot_id,omitempty"`
	CreatedAt      time.Time `json:"created_at"`
}

// ─── Request/Response DTOs ────────────────────────────────────────────────────

type CreateAccessTimeTemplateRequest struct {
	Name        string          `json:"name" validate:"required,min=1,max=100"`
	Description *string         `json:"description,omitempty"`
	Timezone    string          `json:"timezone" validate:"required"`
	TimeSlots   []TimeSlotInput `json:"time_slots" validate:"required,min=1"`
}

type UpdateAccessTimeTemplateRequest struct {
	Name        *string         `json:"name,omitempty" validate:"omitempty,min=1,max=100"`
	Description *string         `json:"description,omitempty"`
	Timezone    *string         `json:"timezone,omitempty"`
	IsActive    *bool           `json:"is_active,omitempty"`
	TimeSlots   []TimeSlotInput `json:"time_slots,omitempty"`
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
	IsAllowed   bool            `json:"is_allowed"`
	Reason      string          `json:"reason"`
	MatchedSlot *AccessTimeSlot `json:"matched_slot,omitempty"`
	Template    *AccessTime     `json:"template,omitempty"`
	NextAllowed *time.Time      `json:"next_allowed,omitempty"`
}

type AccessTimeStats struct {
	TemplatesActive    int `json:"templates_active"`
	TemplatesTotal     int `json:"templates_total"`
	UsersAssigned      int `json:"users_assigned"`
	ValidationsToday   int `json:"validations_today"`
	ValidationsAllowed int `json:"validations_allowed"`
	ValidationsDenied  int `json:"validations_denied"`
}
