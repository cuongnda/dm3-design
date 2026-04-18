package cctv

import (
	"encoding/json"
	"time"
)

// Camera is the joined view of dm3_devices.devices + dm3_cctv.cameras.
type Camera struct {
	// Device fields
	ID       string     `json:"id"`        // devices.id (UUID)
	DeviceID string     `json:"device_id"` // devices.device_id short code e.g. "CAMa1b2c3"
	TenantID string     `json:"tenant_id"`
	Name     string     `json:"name"`
	Status   string     `json:"status"`
	LastSeen *time.Time `json:"last_seen,omitempty"`

	// CCTV-specific fields
	Brand         *string          `json:"brand,omitempty"`
	Model         *string          `json:"model,omitempty"`
	Location      *string          `json:"location,omitempty"`
	RTSPUrl       string           `json:"rtsp_url"`
	RTSPUsername  *string          `json:"rtsp_username,omitempty"`
	RecordingMode string           `json:"recording_mode"`
	PreRollSec    int              `json:"pre_roll_sec"`
	PostRollSec   int              `json:"post_roll_sec"`
	StreamProfile *json.RawMessage `json:"stream_profile,omitempty"`
	LastCheckedAt *time.Time       `json:"last_checked_at,omitempty"`
	CreatedAt     time.Time        `json:"created_at"`
	UpdatedAt     time.Time        `json:"updated_at"`
}

// CameraInput is the DTO for create/update operations.
type CameraInput struct {
	Name          string           `json:"name"`
	Brand         *string          `json:"brand"`
	Model         *string          `json:"model"`
	Location      *string          `json:"location"`
	RTSPUrl       string           `json:"rtsp_url"`
	RTSPUsername  *string          `json:"rtsp_username"`
	RTSPPassword  *string          `json:"rtsp_password"`
	PreRollSec    *int             `json:"pre_roll_sec"`
	PostRollSec   *int             `json:"post_roll_sec"`
	RecordingMode *string          `json:"recording_mode"`
	StreamProfile *json.RawMessage `json:"stream_profile"`
}

// EventClip represents a recorded clip stored in object storage.
type EventClip struct {
	ID            string     `json:"id"`
	TenantID      string     `json:"tenant_id"`
	DeviceID      string     `json:"device_id"`
	AccessEventID *string    `json:"access_event_id,omitempty"`
	StartedAt     time.Time  `json:"started_at"`
	EndedAt       *time.Time `json:"ended_at,omitempty"`
	DurationMs    *int       `json:"duration_ms,omitempty"`
	ObjectKey     string     `json:"object_key"`
	Trigger       string     `json:"trigger"` // 'access_event' | 'manual' | 'api'
	CreatedAt     time.Time  `json:"created_at"`
}

// CCTVSettings stores per-tenant CCTV configuration.
type CCTVSettings struct {
	TenantID           string    `json:"tenant_id"`
	RetentionDays      int       `json:"retention_days"`
	RetentionDaysMax   int       `json:"retention_days_max"`
	PreRollSecDefault  int       `json:"pre_roll_sec_default"`
	PostRollSecDefault int       `json:"post_roll_sec_default"`
	StorageQuotaGB     int       `json:"storage_quota_gb"`
	CreatedAt          time.Time `json:"created_at"`
	UpdatedAt          time.Time `json:"updated_at"`
}
