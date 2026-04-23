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

	// Optional binding to an access point via the dm3_access junction tables
	// (access_devices + access_point_devices). Nil when the camera is not
	// bound to any access point.
	AccessPointID *string `json:"access_point_id,omitempty"`

	// CCTV-specific fields
	Brand         *string          `json:"brand,omitempty"`
	Model         *string          `json:"model,omitempty"`
	Location      *string          `json:"location,omitempty"`
	RTSPUrl       string           `json:"rtsp_url"`
	RecordingMode string           `json:"recording_mode"`
	PreRollSec    int              `json:"pre_roll_sec"`
	PostRollSec   int              `json:"post_roll_sec"`
	StreamProfile *json.RawMessage `json:"stream_profile,omitempty"`
	LastCheckedAt *time.Time       `json:"last_checked_at,omitempty"`
	CreatedAt     time.Time        `json:"created_at"`
	UpdatedAt     time.Time        `json:"updated_at"`
}

// CameraInput is the DTO for create/update operations.
// Credentials (if the RTSP server requires them) are embedded directly in
// rtsp_url ("rtsp://user:pass@host/path") by the operator — we don't
// accept them as separate fields since URL shapes vary per camera brand.
type CameraInput struct {
	Name          string           `json:"name"`
	AccessPointID *string          `json:"access_point_id"`
	Brand         *string          `json:"brand"`
	Model         *string          `json:"model"`
	Location      *string          `json:"location"`
	RTSPUrl       string           `json:"rtsp_url"`
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
	EndAt         *time.Time `json:"end_at,omitempty"` // coalescing deadline
	DurationMs    *int       `json:"duration_ms,omitempty"`
	ObjectKey     string     `json:"object_key"`
	ThumbnailRef  *string    `json:"thumbnail_ref,omitempty"` // JPG preview for media_type=clip rows
	MediaType     string     `json:"media_type"`              // 'clip' | 'snapshot'
	Status        string     `json:"status"`                  // pending | recording | finalized | degraded | failed
	Trigger       string     `json:"trigger"`                 // 'access_event' | 'manual' | 'api'
	RuleID        *string    `json:"rule_id,omitempty"`
	CreatedAt     time.Time  `json:"created_at"`
}

// EventRule is a tenant-configurable directive for capturing media on an
// access event. See migration 000048 for scope precedence semantics.
type EventRule struct {
	ID              string    `json:"id"`
	TenantID        string    `json:"tenant_id"`
	ScopeKind       string    `json:"scope_kind"` // 'tenant' | 'access_point' | 'camera'
	AccessPointID   *string   `json:"access_point_id,omitempty"`
	CameraDeviceID  *string   `json:"camera_device_id,omitempty"`
	Decisions       []string  `json:"decisions"`   // empty = match any
	EventTypes      []string  `json:"event_types"` // empty = match any
	SnapshotEnabled bool      `json:"snapshot_enabled"`
	RecordEnabled   bool      `json:"record_enabled"`
	PreRollSec      int       `json:"pre_roll_sec"`
	PostRollSec     int       `json:"post_roll_sec"`
	Priority        int       `json:"priority"`
	Enabled         bool      `json:"enabled"`
	Notes           *string   `json:"notes,omitempty"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

// EffectiveRule is the resolver's output — the concrete decision applied to
// an event. Derived either from a matching EventRule row or from the tenant
// defaults in dm3_cctv.cctv_settings when nothing matched.
type EffectiveRule struct {
	SnapshotEnabled bool
	RecordEnabled   bool
	PreRollSec      int
	PostRollSec     int
	RuleID          *string // nil when derived from settings fallback
}

// CCTVSettings stores per-tenant CCTV configuration.
//
// Hanet tokens (client_secret, access_token, refresh_token) are encrypted at
// rest. On the wire we expose only presence flags (HasClientSecret, etc.) so
// the plaintext never leaves the handler. The client_id is a public
// identifier — fine to return in full. `HanetPlaceID` is the tenant's
// currently-selected place (a string as Hanet returns it).
type CCTVSettings struct {
	TenantID           string    `json:"tenant_id"`
	RetentionDays      int       `json:"retention_days"`
	RetentionDaysMax   int       `json:"retention_days_max"`
	PreRollSecDefault  int       `json:"pre_roll_sec_default"`
	PostRollSecDefault int       `json:"post_roll_sec_default"`
	StorageQuotaGB     int       `json:"storage_quota_gb"`

	// ─── Event capture rework (migration 000048) ──────────────────────────
	RollingBufferSec         int  `json:"rolling_buffer_sec"`
	MaxClipDurationSec       int  `json:"max_clip_duration_sec"`
	MaxConcurrentExtractions int  `json:"max_concurrent_extractions"`
	DefaultSnapshotEnabled   bool `json:"default_snapshot_enabled"`
	DefaultRecordEnabled     bool `json:"default_record_enabled"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`

	// ─── Hanet integration (2026-04) ────────────────────────────────────────
	HanetClientID     string `json:"hanet_client_id"`
	HanetServerURL    string `json:"hanet_server_url"`
	HanetPlaceID      string `json:"hanet_place_id"`
	HasClientSecret   bool   `json:"has_hanet_client_secret"`
	HasAccessToken    bool   `json:"has_hanet_access_token"`
	HasRefreshToken   bool   `json:"has_hanet_refresh_token"`
}

// HanetPlace is one entry from Hanet's /place/getPlaces endpoint, forwarded
// to the frontend as the option list for the placeId selector.
type HanetPlace struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}
