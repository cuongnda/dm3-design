package models

import "time"

type Device struct {
	ID              string          `json:"id"`
	TenantID        string          `json:"tenant_id"`
	DeviceID        string          `json:"device_id"`
	Name            string          `json:"name,omitempty"`
	Type            string          `json:"type"`
	Status          string          `json:"status"`
	FirmwareVersion string          `json:"firmware_version,omitempty"`
	SiteID          string          `json:"site_id,omitempty"`
	Location        string          `json:"location,omitempty"`
	LastSeen        *time.Time      `json:"last_seen,omitempty"`
	Config          map[string]any  `json:"config,omitempty"`
	CreatedAt       time.Time       `json:"created_at"`
	UpdatedAt       time.Time       `json:"updated_at"`
}
