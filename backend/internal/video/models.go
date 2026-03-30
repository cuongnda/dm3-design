package video

import (
	"time"

	"github.com/google/uuid"
)

// Camera represents an IP camera or video source
type Camera struct {
	ID               uuid.UUID              `json:"id" db:"id"`
	TenantID         uuid.UUID              `json:"tenant_id" db:"tenant_id"`
	Name             string                 `json:"name" db:"name"`
	Description      string                 `json:"description" db:"description"`
	Location         string                 `json:"location" db:"location"`
	Type             string                 `json:"type" db:"type"` // ip_camera, usb_camera, rtsp_stream, etc.
	Brand            string                 `json:"brand" db:"brand"`
	Model            string                 `json:"model" db:"model"`
	RTSPUrl          string                 `json:"rtsp_url" db:"rtsp_url"`
	RTSPUsername     *string                `json:"rtsp_username,omitempty" db:"rtsp_username"`
	RTSPPassword     *string                `json:"rtsp_password,omitempty" db:"rtsp_password"`
	Resolution       string                 `json:"resolution" db:"resolution"` // 1920x1080, 1280x720, etc.
	FPS              int                    `json:"fps" db:"fps"`
	Quality          string                 `json:"quality" db:"quality"` // high, medium, low
	Status           string                 `json:"status" db:"status"` // online, offline, error, connecting
	IsActive         bool                   `json:"is_active" db:"is_active"`
	IsRecording      bool                   `json:"is_recording" db:"is_recording"`
	IsStreamingLive  bool                   `json:"is_streaming_live" db:"is_streaming_live"`
	HasMotionDetection bool                 `json:"has_motion_detection" db:"has_motion_detection"`
	HasPTZSupport    bool                   `json:"has_ptz_support" db:"has_ptz_support"`
	StorageQuota     int64                  `json:"storage_quota" db:"storage_quota"` // MB
	RetentionDays    int                    `json:"retention_days" db:"retention_days"`
	Position         map[string]interface{} `json:"position,omitempty" db:"position"` // {lat, lng, floor, zone}
	Config           map[string]interface{} `json:"config,omitempty" db:"config"` // camera-specific settings
	Metadata         map[string]interface{} `json:"metadata,omitempty" db:"metadata"`
	LastSeen         *time.Time             `json:"last_seen,omitempty" db:"last_seen"`
	LastError        *string                `json:"last_error,omitempty" db:"last_error"`
	CreatedAt        time.Time              `json:"created_at" db:"created_at"`
	UpdatedAt        time.Time              `json:"updated_at" db:"updated_at"`
	CreatedBy        uuid.UUID              `json:"created_by" db:"created_by"`
	DeletedAt        *time.Time             `json:"deleted_at,omitempty" db:"deleted_at"`
}

// Recording represents a video recording session
type Recording struct {
	ID           uuid.UUID              `json:"id" db:"id"`
	TenantID     uuid.UUID              `json:"tenant_id" db:"tenant_id"`
	CameraID     uuid.UUID              `json:"camera_id" db:"camera_id"`
	CameraName   string                 `json:"camera_name" db:"camera_name"`
	Title        string                 `json:"title" db:"title"`
	Description  *string                `json:"description,omitempty" db:"description"`
	Type         string                 `json:"type" db:"type"` // manual, scheduled, motion, event
	Status       string                 `json:"status" db:"status"` // recording, stopped, processing, completed, failed
	StartTime    time.Time              `json:"start_time" db:"start_time"`
	EndTime      *time.Time             `json:"end_time,omitempty" db:"end_time"`
	Duration     int64                  `json:"duration" db:"duration"` // seconds
	FilePath     *string                `json:"file_path,omitempty" db:"file_path"`
	FileSize     int64                  `json:"file_size" db:"file_size"` // bytes
	Format       string                 `json:"format" db:"format"` // mp4, avi, mkv
	Resolution   string                 `json:"resolution" db:"resolution"`
	FPS          int                    `json:"fps" db:"fps"`
	Quality      string                 `json:"quality" db:"quality"`
	TriggerType  *string                `json:"trigger_type,omitempty" db:"trigger_type"` // motion, alarm, schedule
	TriggerData  map[string]interface{} `json:"trigger_data,omitempty" db:"trigger_data"`
	Metadata     map[string]interface{} `json:"metadata,omitempty" db:"metadata"`
	CreatedAt    time.Time              `json:"created_at" db:"created_at"`
	UpdatedAt    time.Time              `json:"updated_at" db:"updated_at"`
	CreatedBy    *uuid.UUID             `json:"created_by,omitempty" db:"created_by"`
	DeletedAt    *time.Time             `json:"deleted_at,omitempty" db:"deleted_at"`
}

// MotionZone represents a motion detection zone within camera view
type MotionZone struct {
	ID          uuid.UUID              `json:"id" db:"id"`
	TenantID    uuid.UUID              `json:"tenant_id" db:"tenant_id"`
	CameraID    uuid.UUID              `json:"camera_id" db:"camera_id"`
	Name        string                 `json:"name" db:"name"`
	Description *string                `json:"description,omitempty" db:"description"`
	Polygon     []map[string]float64   `json:"polygon" db:"polygon"` // [{x:0.1, y:0.2}, {x:0.5, y:0.8}, ...]
	Sensitivity int                    `json:"sensitivity" db:"sensitivity"` // 1-100
	IsActive    bool                   `json:"is_active" db:"is_active"`
	IsArmed     bool                   `json:"is_armed" db:"is_armed"`
	Schedule    map[string]interface{} `json:"schedule,omitempty" db:"schedule"` // when to activate
	Actions     []string               `json:"actions" db:"actions"` // record, alert, snapshot
	Metadata    map[string]interface{} `json:"metadata,omitempty" db:"metadata"`
	CreatedAt   time.Time              `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time              `json:"updated_at" db:"updated_at"`
}

// VideoEvent represents a video-related event (motion, alarm, etc.)
type VideoEvent struct {
	ID            uuid.UUID              `json:"id" db:"id"`
	TenantID      uuid.UUID              `json:"tenant_id" db:"tenant_id"`
	CameraID      uuid.UUID              `json:"camera_id" db:"camera_id"`
	CameraName    string                 `json:"camera_name" db:"camera_name"`
	MotionZoneID  *uuid.UUID             `json:"motion_zone_id,omitempty" db:"motion_zone_id"`
	MotionZoneName *string               `json:"motion_zone_name,omitempty" db:"motion_zone_name"`
	Type          string                 `json:"type" db:"type"` // motion, alarm, offline, online, error
	Severity      string                 `json:"severity" db:"severity"` // low, medium, high, critical
	Title         string                 `json:"title" db:"title"`
	Description   string                 `json:"description" db:"description"`
	SnapshotPath  *string                `json:"snapshot_path,omitempty" db:"snapshot_path"`
	VideoPath     *string                `json:"video_path,omitempty" db:"video_path"`
	IsAcknowledged bool                  `json:"is_acknowledged" db:"is_acknowledged"`
	AcknowledgedBy *uuid.UUID            `json:"acknowledged_by,omitempty" db:"acknowledged_by"`
	AcknowledgedAt *time.Time            `json:"acknowledged_at,omitempty" db:"acknowledged_at"`
	EventData     map[string]interface{} `json:"event_data,omitempty" db:"event_data"`
	Metadata      map[string]interface{} `json:"metadata,omitempty" db:"metadata"`
	StartTime     time.Time              `json:"start_time" db:"start_time"`
	EndTime       *time.Time             `json:"end_time,omitempty" db:"end_time"`
	CreatedAt     time.Time              `json:"created_at" db:"created_at"`
	UpdatedAt     time.Time              `json:"updated_at" db:"updated_at"`
}

// LiveStream represents an active live stream session
type LiveStream struct {
	ID           uuid.UUID              `json:"id" db:"id"`
	TenantID     uuid.UUID              `json:"tenant_id" db:"tenant_id"`
	CameraID     uuid.UUID              `json:"camera_id" db:"camera_id"`
	Type         string                 `json:"type" db:"type"` // webrtc, hls, mjpeg, rtsp
	Quality      string                 `json:"quality" db:"quality"` // high, medium, low
	ViewerCount  int                    `json:"viewer_count" db:"viewer_count"`
	StartTime    time.Time              `json:"start_time" db:"start_time"`
	LastViewed   *time.Time             `json:"last_viewed,omitempty" db:"last_viewed"`
	StreamURL    *string                `json:"stream_url,omitempty" db:"stream_url"`
	SessionData  map[string]interface{} `json:"session_data,omitempty" db:"session_data"`
	IsActive     bool                   `json:"is_active" db:"is_active"`
	CreatedAt    time.Time              `json:"created_at" db:"created_at"`
	UpdatedAt    time.Time              `json:"updated_at" db:"updated_at"`
}

// VideoSettings represents tenant-wide video configuration
type VideoSettings struct {
	ID                     uuid.UUID              `json:"id" db:"id"`
	TenantID               uuid.UUID              `json:"tenant_id" db:"tenant_id"`
	DefaultRetentionDays   int                    `json:"default_retention_days" db:"default_retention_days"`
	MaxStorageGB           int64                  `json:"max_storage_gb" db:"max_storage_gb"`
	DefaultRecordingQuality string                `json:"default_recording_quality" db:"default_recording_quality"`
	DefaultStreamingQuality string               `json:"default_streaming_quality" db:"default_streaming_quality"`
	MotionDetectionEnabled bool                   `json:"motion_detection_enabled" db:"motion_detection_enabled"`
	AutoRecordMotion       bool                   `json:"auto_record_motion" db:"auto_record_motion"`
	MotionRecordingDuration int                   `json:"motion_recording_duration" db:"motion_recording_duration"` // seconds
	StoragePath            string                 `json:"storage_path" db:"storage_path"`
	ThumbnailInterval      int                    `json:"thumbnail_interval" db:"thumbnail_interval"` // seconds
	EnableCleanupJob       bool                   `json:"enable_cleanup_job" db:"enable_cleanup_job"`
	NotificationSettings   map[string]interface{} `json:"notification_settings,omitempty" db:"notification_settings"`
	AdvancedSettings       map[string]interface{} `json:"advanced_settings,omitempty" db:"advanced_settings"`
	CreatedAt              time.Time              `json:"created_at" db:"created_at"`
	UpdatedAt              time.Time              `json:"updated_at" db:"updated_at"`
}

// Request/Response types

type CreateCameraRequest struct {
	Name             string                 `json:"name" validate:"required"`
	Description      string                 `json:"description"`
	Location         string                 `json:"location" validate:"required"`
	Type             string                 `json:"type" validate:"required"`
	Brand            string                 `json:"brand"`
	Model            string                 `json:"model"`
	RTSPUrl          string                 `json:"rtsp_url" validate:"required"`
	RTSPUsername     *string                `json:"rtsp_username,omitempty"`
	RTSPPassword     *string                `json:"rtsp_password,omitempty"`
	Resolution       string                 `json:"resolution"`
	FPS              int                    `json:"fps"`
	Quality          string                 `json:"quality"`
	HasMotionDetection bool                 `json:"has_motion_detection"`
	HasPTZSupport    bool                   `json:"has_ptz_support"`
	StorageQuota     int64                  `json:"storage_quota"`
	RetentionDays    int                    `json:"retention_days"`
	Position         map[string]interface{} `json:"position,omitempty"`
	Config           map[string]interface{} `json:"config,omitempty"`
}

type UpdateCameraRequest struct {
	Name             *string                `json:"name,omitempty"`
	Description      *string                `json:"description,omitempty"`
	Location         *string                `json:"location,omitempty"`
	RTSPUrl          *string                `json:"rtsp_url,omitempty"`
	RTSPUsername     *string                `json:"rtsp_username,omitempty"`
	RTSPPassword     *string                `json:"rtsp_password,omitempty"`
	Resolution       *string                `json:"resolution,omitempty"`
	FPS              *int                   `json:"fps,omitempty"`
	Quality          *string                `json:"quality,omitempty"`
	IsActive         *bool                  `json:"is_active,omitempty"`
	HasMotionDetection *bool                `json:"has_motion_detection,omitempty"`
	HasPTZSupport    *bool                  `json:"has_ptz_support,omitempty"`
	StorageQuota     *int64                 `json:"storage_quota,omitempty"`
	RetentionDays    *int                   `json:"retention_days,omitempty"`
	Position         map[string]interface{} `json:"position,omitempty"`
	Config           map[string]interface{} `json:"config,omitempty"`
}

type StartRecordingRequest struct {
	CameraID    uuid.UUID              `json:"camera_id" validate:"required"`
	Title       string                 `json:"title" validate:"required"`
	Description *string                `json:"description,omitempty"`
	Duration    *int64                 `json:"duration,omitempty"` // seconds, null = manual stop
	Quality     string                 `json:"quality"`
	Metadata    map[string]interface{} `json:"metadata,omitempty"`
}

type PTZControlRequest struct {
	Action    string  `json:"action" validate:"required"` // pan_left, pan_right, tilt_up, tilt_down, zoom_in, zoom_out, preset
	Speed     *int    `json:"speed,omitempty"` // 1-100
	Preset    *int    `json:"preset,omitempty"` // preset number for preset action
	X         *float64 `json:"x,omitempty"` // relative position 0.0-1.0
	Y         *float64 `json:"y,omitempty"`
	Zoom      *float64 `json:"zoom,omitempty"` // zoom level 0.0-1.0
}

type CreateMotionZoneRequest struct {
	CameraID    uuid.UUID              `json:"camera_id" validate:"required"`
	Name        string                 `json:"name" validate:"required"`
	Description *string                `json:"description,omitempty"`
	Polygon     []map[string]float64   `json:"polygon" validate:"required"`
	Sensitivity int                    `json:"sensitivity"`
	Actions     []string               `json:"actions"`
	Schedule    map[string]interface{} `json:"schedule,omitempty"`
}

type CameraListQuery struct {
	Status    *string `query:"status"`
	Location  *string `query:"location"`
	Type      *string `query:"type"`
	IsActive  *bool   `query:"is_active"`
	HasMotion *bool   `query:"has_motion"`
	Limit     int     `query:"limit"`
	Offset    int     `query:"offset"`
}

type RecordingListQuery struct {
	CameraID   *string `query:"camera_id"`
	Type       *string `query:"type"`
	Status     *string `query:"status"`
	StartDate  *string `query:"start_date"`
	EndDate    *string `query:"end_date"`
	Limit      int     `query:"limit"`
	Offset     int     `query:"offset"`
}

type VideoEventsQuery struct {
	CameraID     *string `query:"camera_id"`
	Type         *string `query:"type"`
	Severity     *string `query:"severity"`
	IsAcknowledged *bool `query:"is_acknowledged"`
	StartDate    *string `query:"start_date"`
	EndDate      *string `query:"end_date"`
	Limit        int     `query:"limit"`
	Offset       int     `query:"offset"`
}

// Response types

type CameraStatusResponse struct {
	CameraID        uuid.UUID `json:"camera_id"`
	Status          string    `json:"status"`
	IsRecording     bool      `json:"is_recording"`
	IsStreaming     bool      `json:"is_streaming"`
	ViewerCount     int       `json:"viewer_count"`
	LastSeen        *time.Time `json:"last_seen,omitempty"`
	LastError       *string   `json:"last_error,omitempty"`
	StorageUsed     int64     `json:"storage_used_mb"`
	MotionDetected  bool      `json:"motion_detected"`
	EventCount      int64     `json:"event_count_today"`
	RecordingCount  int64     `json:"recording_count"`
}

type StreamInfoResponse struct {
	CameraID      uuid.UUID `json:"camera_id"`
	IsActive      bool      `json:"is_active"`
	StreamURL     *string   `json:"stream_url,omitempty"`
	WebRTCURL     *string   `json:"webrtc_url,omitempty"`
	HLSURL        *string   `json:"hls_url,omitempty"`
	MJPEGURL      *string   `json:"mjpeg_url,omitempty"`
	ThumbnailURL  *string   `json:"thumbnail_url,omitempty"`
	Quality       string    `json:"quality"`
	Resolution    string    `json:"resolution"`
	FPS           int       `json:"fps"`
	ViewerCount   int       `json:"viewer_count"`
}

type VideoAnalyticsResponse struct {
	TenantID           uuid.UUID                   `json:"tenant_id"`
	TotalCameras       int64                       `json:"total_cameras"`
	OnlineCameras      int64                       `json:"online_cameras"`
	OfflineCameras     int64                       `json:"offline_cameras"`
	RecordingCameras   int64                       `json:"recording_cameras"`
	StreamingCameras   int64                       `json:"streaming_cameras"`
	TotalRecordings    int64                       `json:"total_recordings"`
	TotalEvents        int64                       `json:"total_events"`
	UnacknowledgedEvents int64                     `json:"unacknowledged_events"`
	StorageUsedGB      float64                     `json:"storage_used_gb"`
	StorageQuotaGB     float64                     `json:"storage_quota_gb"`
	StorageUsagePercent float64                   `json:"storage_usage_percent"`
	ByStatus           map[string]int64            `json:"by_status"`
	ByType             map[string]int64            `json:"by_type"`
	ByLocation         map[string]int64            `json:"by_location"`
	EventsByType       map[string]int64            `json:"events_by_type"`
	EventsBySeverity   map[string]int64            `json:"events_by_severity"`
	TopCamerasByEvents []CameraEventStats          `json:"top_cameras_by_events"`
}

type CameraEventStats struct {
	CameraID    uuid.UUID `json:"camera_id"`
	CameraName  string    `json:"camera_name"`
	EventCount  int64     `json:"event_count"`
	LastEvent   *time.Time `json:"last_event,omitempty"`
}

type CameraAnalyticsResponse struct {
	CameraID          uuid.UUID             `json:"camera_id"`
	CameraName        string                `json:"camera_name"`
	Status            string                `json:"status"`
	UptimePercent     float64               `json:"uptime_percent"`
	TotalEvents       int64                 `json:"total_events"`
	MotionEvents      int64                 `json:"motion_events"`
	TotalRecordings   int64                 `json:"total_recordings"`
	StorageUsedMB     int64                 `json:"storage_used_mb"`
	AvgRecordingSize  float64               `json:"avg_recording_size_mb"`
	LastEventTime     *time.Time            `json:"last_event_time,omitempty"`
	HourlyEventStats  map[string]int64      `json:"hourly_event_stats"`
	DailyEventStats   map[string]int64      `json:"daily_event_stats"`
}

type StorageStatusResponse struct {
	TotalSpaceGB       float64                    `json:"total_space_gb"`
	UsedSpaceGB        float64                    `json:"used_space_gb"`
	FreeSpaceGB        float64                    `json:"free_space_gb"`
	UsagePercent       float64                    `json:"usage_percent"`
	RecordingCount     int64                      `json:"recording_count"`
	OldestRecording    *time.Time                 `json:"oldest_recording,omitempty"`
	ByCameraUsage      []CameraStorageUsage       `json:"by_camera_usage"`
	ByRetentionPolicy  map[string]StorageBucket   `json:"by_retention_policy"`
}

type CameraStorageUsage struct {
	CameraID     uuid.UUID `json:"camera_id"`
	CameraName   string    `json:"camera_name"`
	UsedSpaceMB  int64     `json:"used_space_mb"`
	RecordingCount int64   `json:"recording_count"`
	Percentage   float64   `json:"percentage"`
}

type StorageBucket struct {
	RetentionDays  int     `json:"retention_days"`
	UsedSpaceGB    float64 `json:"used_space_gb"`
	RecordingCount int64   `json:"recording_count"`
}

// Event types for NATS

type CameraEvent struct {
	Type       string                 `json:"type"`
	TenantID   uuid.UUID              `json:"tenant_id"`
	CameraID   uuid.UUID              `json:"camera_id"`
	CameraName string                 `json:"camera_name"`
	Action     string                 `json:"action"` // online, offline, recording_started, recording_stopped, motion_detected
	Timestamp  time.Time              `json:"timestamp"`
	Status     string                 `json:"status"`
	Metadata   map[string]interface{} `json:"metadata,omitempty"`
}

type MotionEvent struct {
	Type         string                 `json:"type"`
	TenantID     uuid.UUID              `json:"tenant_id"`
	CameraID     uuid.UUID              `json:"camera_id"`
	CameraName   string                 `json:"camera_name"`
	MotionZoneID *uuid.UUID             `json:"motion_zone_id,omitempty"`
	ZoneName     *string                `json:"zone_name,omitempty"`
	Timestamp    time.Time              `json:"timestamp"`
	Confidence   float64                `json:"confidence"`
	BoundingBox  map[string]float64     `json:"bounding_box,omitempty"`
	SnapshotPath *string                `json:"snapshot_path,omitempty"`
	Metadata     map[string]interface{} `json:"metadata,omitempty"`
}

// Constants

// Camera types
const (
	CameraTypeIP    = "ip_camera"
	CameraTypeUSB   = "usb_camera"
	CameraTypeRTSP  = "rtsp_stream"
	CameraTypeOnvif = "onvif_camera"
)

// Camera statuses
const (
	CameraStatusOnline     = "online"
	CameraStatusOffline    = "offline"
	CameraStatusConnecting = "connecting"
	CameraStatusError      = "error"
	CameraStatusMaintenance = "maintenance"
)

// Recording types
const (
	RecordingTypeManual    = "manual"
	RecordingTypeScheduled = "scheduled"
	RecordingTypeMotion    = "motion"
	RecordingTypeEvent     = "event"
	RecordingTypeAlarm     = "alarm"
)

// Recording statuses
const (
	RecordingStatusRecording  = "recording"
	RecordingStatusStopped    = "stopped"
	RecordingStatusProcessing = "processing"
	RecordingStatusCompleted  = "completed"
	RecordingStatusFailed     = "failed"
)

// Event types
const (
	EventTypeMotion    = "motion"
	EventTypeAlarm     = "alarm"
	EventTypeOffline   = "offline"
	EventTypeOnline    = "online"
	EventTypeError     = "error"
	EventTypeTamper    = "tamper"
	EventTypeStorage   = "storage"
)

// Event severities
const (
	SeverityLow      = "low"
	SeverityMedium   = "medium"
	SeverityHigh     = "high"
	SeverityCritical = "critical"
)

// Stream types
const (
	StreamTypeWebRTC = "webrtc"
	StreamTypeHLS    = "hls"
	StreamTypeMJPEG  = "mjpeg"
	StreamTypeRTSP   = "rtsp"
)

// Quality levels
const (
	QualityLow    = "low"     // 480p
	QualityMedium = "medium"  // 720p
	QualityHigh   = "high"    // 1080p
	QualityUltra  = "ultra"   // 4K
)

// Default settings
var DefaultVideoSettings = VideoSettings{
	DefaultRetentionDays:     7,
	MaxStorageGB:             1000,
	DefaultRecordingQuality:  QualityMedium,
	DefaultStreamingQuality:  QualityMedium,
	MotionDetectionEnabled:   true,
	AutoRecordMotion:         false,
	MotionRecordingDuration:  60, // 1 minute
	StoragePath:              "/var/lib/dm3/video",
	ThumbnailInterval:        10, // 10 seconds
	EnableCleanupJob:         true,
}