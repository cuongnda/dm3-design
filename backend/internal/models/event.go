package models

import "time"

type AccessEvent struct {
	ID             string         `json:"id"`
	CompanyID      string         `json:"company_id"`
	Time           time.Time      `json:"time"`
	DoorID         string         `json:"door_id,omitempty"`
	DeviceID       string         `json:"device_id,omitempty"`
	PersonID       string         `json:"person_id,omitempty"`
	PersonName     string         `json:"person_name,omitempty"`
	CredentialType string         `json:"credential_type,omitempty"`
	Direction      string         `json:"direction,omitempty"`
	Decision       string         `json:"decision"`
	Reason         string         `json:"reason,omitempty"`
	Metadata       map[string]any `json:"metadata,omitempty"`
}
