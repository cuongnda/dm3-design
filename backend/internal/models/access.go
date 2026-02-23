package models

import (
	"encoding/json"
	"time"
)

type Door struct {
	ID               string          `json:"id"`
	TenantID         string          `json:"tenant_id"`
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
	TenantID          string          `json:"tenant_id"`
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
	TenantID          string          `json:"tenant_id"`
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
