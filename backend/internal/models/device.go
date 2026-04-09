package models

import (
	"slices"
	"time"
)

// Device types
const (
	DeviceTypeTerminal   = "terminal"
	DeviceTypeController = "controller"
	DeviceTypeCamera     = "camera"
	DeviceTypeSensor     = "sensor"
)

// ValidDeviceTypes is the canonical set of device types.
var ValidDeviceTypes = []string{
	DeviceTypeTerminal,
	DeviceTypeController,
	DeviceTypeCamera,
	DeviceTypeSensor,
}

// Device connection statuses
const (
	DeviceStatusOnline  = "online"
	DeviceStatusOffline = "offline"
	DeviceStatusWarning = "warning"
)

// ValidDeviceStatuses is the canonical set of device connection statuses.
var ValidDeviceStatuses = []string{
	DeviceStatusOnline,
	DeviceStatusOffline,
	DeviceStatusWarning,
}

// Verify logic modes
const (
	VerifyLogicOr  = "or"
	VerifyLogicAnd = "and"
)

// IsValidDeviceType returns true if the given type is in the canonical set.
func IsValidDeviceType(t string) bool {
	return slices.Contains(ValidDeviceTypes, t)
}

// IsValidDeviceStatus returns true if the given status is in the canonical set.
func IsValidDeviceStatus(s string) bool {
	return slices.Contains(ValidDeviceStatuses, s)
}

type Device struct {
	ID              string         `json:"id"`
	TenantID        string         `json:"tenant_id"`
	DeviceID        string         `json:"device_id"`
	Name            string         `json:"name,omitempty"`
	Type            string         `json:"type"`
	Status          string         `json:"status"`
	Model           string         `json:"model,omitempty"`
	FirmwareVersion string         `json:"firmware_version,omitempty"`
	Location        string         `json:"location,omitempty"`
	IPAddress       *string        `json:"ip_address,omitempty"`
	MACAddress      *string        `json:"mac_address,omitempty"`
	Timezone        string         `json:"timezone,omitempty"`
	OpenRelayMs     int            `json:"open_relay_ms,omitempty"`
	VerifyMethods   []string       `json:"verify_methods,omitempty"`
	VerifyLogic     string         `json:"verify_logic,omitempty"`
	LastSeen        *time.Time     `json:"last_seen,omitempty"`
	Config          map[string]any `json:"config,omitempty"`
	CreatedAt       time.Time      `json:"created_at"`
	UpdatedAt       time.Time      `json:"updated_at"`
}
