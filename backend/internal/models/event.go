package models

import "time"

type AccessEvent struct {
	ID             string         `json:"id"`
	TenantID       string         `json:"tenant_id"`
	Time           time.Time      `json:"time"`
	DoorID         string         `json:"door_id,omitempty"`
	DeviceID       string         `json:"device_id,omitempty"`
	UserID         string         `json:"user_id,omitempty"`
	UserName       string         `json:"user_name,omitempty"`
	CredentialType string         `json:"credential_type,omitempty"`
	Direction      string         `json:"direction,omitempty"`
	Decision       string         `json:"decision"`
	Reason         string         `json:"reason,omitempty"`
	Metadata       map[string]any `json:"metadata,omitempty"`
}
