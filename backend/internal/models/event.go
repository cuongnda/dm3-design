package models

import (
	"encoding/json"
	"time"
)

type AccessEvent struct {
	ID             string          `json:"id"`
	TenantID       string          `json:"tenant_id"`
	Time           time.Time       `json:"time"`
	AccessPointID  *string         `json:"access_point_id,omitempty"`
	DoorID         *string         `json:"door_id,omitempty"`
	UserID         *string         `json:"user_id,omitempty"`
	UserName       *string         `json:"user_name,omitempty"`
	CredentialType *string         `json:"credential_type,omitempty"`
	Direction      *string         `json:"direction,omitempty"`
	Decision       string          `json:"decision"`
	Reason         *string         `json:"reason,omitempty"`
	Confidence     *float64        `json:"confidence,omitempty"`
	PhotoRef       *string         `json:"photo_ref,omitempty"`
	Temperature    *float64        `json:"temperature,omitempty"`
	DecidedLocally bool            `json:"decided_locally"`
	Metadata       json.RawMessage `json:"metadata,omitempty"`
}
