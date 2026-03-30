package video

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/nats-io/nats.go"
)

// NATS event consumers and background jobs for video service

func (h *Handlers) StartVideoConsumers(ctx context.Context) {
	go h.consumeDeviceEvents(ctx)
	go h.consumeMotionEvents(ctx)
	go h.consumeAccessEvents(ctx)
	go h.consumeAlarmEvents(ctx)

	slog.Info("video NATS consumers started")
}

// consumeDeviceEvents listens for device status changes
func (h *Handlers) consumeDeviceEvents(ctx context.Context) {
	subject := "dm.*.device.status.*"

	_, err := h.nats.Subscribe(subject, func(msg *nats.Msg) {
		var event struct {
			TenantID  uuid.UUID `json:"tenant_id"`
			DeviceID  string    `json:"device_id"`
			Status    string    `json:"status"` // online, offline, error
			Timestamp time.Time `json:"timestamp"`
			Metadata  map[string]interface{} `json:"metadata,omitempty"`
		}

		if err := json.Unmarshal(msg.Data, &event); err != nil {
			slog.Error("failed to unmarshal device event", "error", err)
			return
		}

		// Process device event for cameras
		if err := h.processDeviceEvent(ctx, &event); err != nil {
			slog.Error("failed to process device event", "error", err)
		}
	})

	if err != nil {
		slog.Error("failed to subscribe to device events", "error", err)
	}
}

// consumeMotionEvents listens for motion detection from cameras
func (h *Handlers) consumeMotionEvents(ctx context.Context) {
	subject := "dm.*.motion.detected"

	_, err := h.nats.Subscribe(subject, func(msg *nats.Msg) {
		var event struct {
			TenantID    uuid.UUID              `json:"tenant_id"`
			DeviceID    string                 `json:"device_id"`
			CameraID    *uuid.UUID             `json:"camera_id,omitempty"`
			ZoneID      *uuid.UUID             `json:"zone_id,omitempty"`
			Confidence  float64                `json:"confidence"`
			BoundingBox map[string]float64     `json:"bounding_box,omitempty"`
			Timestamp   time.Time              `json:"timestamp"`
			Metadata    map[string]interface{} `json:"metadata,omitempty"`
		}

		if err := json.Unmarshal(msg.Data, &event); err != nil {
			slog.Error("failed to unmarshal motion event", "error", err)
			return
		}

		// Process motion detection
		if err := h.processMotionEvent(ctx, &event); err != nil {
			slog.Error("failed to process motion event", "error", err)
		}
	})

	if err != nil {
		slog.Error("failed to subscribe to motion events", "error", err)
	}
}

// consumeAccessEvents listens for access events that might trigger recording
func (h *Handlers) consumeAccessEvents(ctx context.Context) {
	subject := "dm.*.access.log.*"

	_, err := h.nats.Subscribe(subject, func(msg *nats.Msg) {
		var event struct {
			TenantID   uuid.UUID              `json:"tenant_id"`
			DeviceID   string                 `json:"device_id"`
			PersonID   *uuid.UUID             `json:"person_id,omitempty"`
			Result     string                 `json:"result"` // granted, denied
			Zone       string                 `json:"zone"`
			Timestamp  time.Time              `json:"timestamp"`
			Metadata   map[string]interface{} `json:"metadata,omitempty"`
		}

		if err := json.Unmarshal(msg.Data, &event); err != nil {
			slog.Error("failed to unmarshal access event", "error", err)
			return
		}

		// Process access event for potential video recording
		if err := h.processAccessEventForVideo(ctx, &event); err != nil {
			slog.Error("failed to process access event for video", "error", err)
		}
	})

	if err != nil {
		slog.Error("failed to subscribe to access events", "error", err)
	}
}

// consumeAlarmEvents listens for alarm events that should trigger recording
func (h *Handlers) consumeAlarmEvents(ctx context.Context) {
	subject := "dm.*.alarm.*"

	_, err := h.nats.Subscribe(subject, func(msg *nats.Msg) {
		var event struct {
			TenantID    uuid.UUID              `json:"tenant_id"`
			AlarmType   string                 `json:"alarm_type"`
			Severity    string                 `json:"severity"`
			DeviceID    string                 `json:"device_id"`
			Zone        string                 `json:"zone"`
			Timestamp   time.Time              `json:"timestamp"`
			Description string                 `json:"description"`
			Metadata    map[string]interface{} `json:"metadata,omitempty"`
		}

		if err := json.Unmarshal(msg.Data, &event); err != nil {
			slog.Error("failed to unmarshal alarm event", "error", err)
			return
		}

		// Process alarm event for emergency recording
		if err := h.processAlarmEvent(ctx, &event); err != nil {
			slog.Error("failed to process alarm event", "error", err)
		}
	})

	if err != nil {
		slog.Error("failed to subscribe to alarm events", "error", err)
	}
}

// Event processors

func (h *Handlers) processDeviceEvent(ctx context.Context, event *struct {
	TenantID  uuid.UUID `json:"tenant_id"`
	DeviceID  string    `json:"device_id"`
	Status    string    `json:"status"`
	Timestamp time.Time `json:"timestamp"`
	Metadata  map[string]interface{} `json:"metadata,omitempty"`
}) error {
	// Find cameras associated with this device
	cameras, _, err := h.getCameras(ctx, event.TenantID, CameraListQuery{Limit: 100})
	if err != nil {
		return err
	}

	for _, camera := range cameras {
		// Check if this camera is associated with the device
		if deviceID, ok := camera.Config["device_id"].(string); ok && deviceID == event.DeviceID {
			// Update camera status based on device status
			var newStatus string
			switch event.Status {
			case "online":
				newStatus = CameraStatusOnline
			case "offline":
				newStatus = CameraStatusOffline
			case "error":
				newStatus = CameraStatusError
			default:
				continue
			}

			if camera.Status != newStatus {
				camera.Status = newStatus
				camera.LastSeen = &event.Timestamp
				camera.UpdatedAt = event.Timestamp

				if err := h.updateCamera(ctx, &camera); err != nil {
					slog.Error("failed to update camera status", "error", err, "camera_id", camera.ID)
					continue
				}

				// Publish camera event
				go h.publishCameraEvent(&camera, "status_changed")

				// Create video event
				go h.createVideoEventFromDevice(&camera, event.Status, event.Timestamp)
			}
		}
	}

	return nil
}

func (h *Handlers) processMotionEvent(ctx context.Context, event *struct {
	TenantID    uuid.UUID              `json:"tenant_id"`
	DeviceID    string                 `json:"device_id"`
	CameraID    *uuid.UUID             `json:"camera_id,omitempty"`
	ZoneID      *uuid.UUID             `json:"zone_id,omitempty"`
	Confidence  float64                `json:"confidence"`
	BoundingBox map[string]float64     `json:"bounding_box,omitempty"`
	Timestamp   time.Time              `json:"timestamp"`
	Metadata    map[string]interface{} `json:"metadata,omitempty"`
}) error {
	var cameraID uuid.UUID

	// Get camera ID from event or find by device ID
	if event.CameraID != nil {
		cameraID = *event.CameraID
	} else {
		cameras, _, err := h.getCameras(ctx, event.TenantID, CameraListQuery{Limit: 100})
		if err != nil {
			return err
		}

		for _, camera := range cameras {
			if deviceID, ok := camera.Config["device_id"].(string); ok && deviceID == event.DeviceID {
				cameraID = camera.ID
				break
			}
		}

		if cameraID == uuid.Nil {
			return nil // No associated camera found
		}
	}

	// Get camera details
	camera, err := h.getCamera(ctx, event.TenantID, cameraID)
	if err != nil {
		return err
	}

	// Check if motion detection is enabled
	if !camera.HasMotionDetection {
		return nil
	}

	// Get motion zones for this camera
	motionZones, err := h.getMotionZones(ctx, event.TenantID, cameraID)
	if err != nil {
		return err
	}

	var triggeredZone *MotionZone
	if event.ZoneID != nil {
		for _, zone := range motionZones {
			if zone.ID == *event.ZoneID && zone.IsActive && zone.IsArmed {
				triggeredZone = &zone
				break
			}
		}
	}

	// Create motion event
	videoEvent := &VideoEvent{
		ID:            uuid.New(),
		TenantID:      event.TenantID,
		CameraID:      cameraID,
		CameraName:    camera.Name,
		Type:          EventTypeMotion,
		Severity:      h.getMotionSeverity(event.Confidence),
		Title:         "Motion Detected",
		Description:   h.generateMotionDescription(camera, triggeredZone, event.Confidence),
		StartTime:     event.Timestamp,
		CreatedAt:     time.Now(),
		UpdatedAt:     time.Now(),
		EventData: map[string]interface{}{
			"confidence":    event.Confidence,
			"bounding_box":  event.BoundingBox,
			"device_id":     event.DeviceID,
		},
	}

	if triggeredZone != nil {
		videoEvent.MotionZoneID = &triggeredZone.ID
		videoEvent.MotionZoneName = &triggeredZone.Name
	}

	// Capture snapshot
	if snapshotPath, err := h.captureSnapshot(camera); err == nil {
		videoEvent.SnapshotPath = &snapshotPath
	}

	// Create video event in database
	if err := h.createVideoEvent(ctx, videoEvent); err != nil {
		slog.Error("failed to create motion video event", "error", err)
	}

	// Check motion zone actions and video settings
	settings, _ := h.getVideoSettings(ctx, event.TenantID)

	shouldRecord := false
	if triggeredZone != nil {
		for _, action := range triggeredZone.Actions {
			if action == "record" {
				shouldRecord = true
				break
			}
		}
	} else if settings != nil && settings.AutoRecordMotion {
		shouldRecord = true
	}

	// Start motion-triggered recording
	if shouldRecord && camera.Status == CameraStatusOnline {
		recording := &Recording{
			ID:          uuid.New(),
			TenantID:    event.TenantID,
			CameraID:    cameraID,
			CameraName:  camera.Name,
			Title:       "Motion Recording",
			Type:        RecordingTypeMotion,
			Status:      RecordingStatusRecording,
			StartTime:   time.Now(),
			Format:      "mp4",
			Resolution:  camera.Resolution,
			FPS:         camera.FPS,
			Quality:     camera.Quality,
			TriggerType: stringPtr("motion"),
			TriggerData: map[string]interface{}{
				"motion_event_id": videoEvent.ID,
				"confidence":      event.Confidence,
				"zone_id":         event.ZoneID,
			},
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
		}

		// Start recording
		if filePath, err := h.startRecording(camera, recording); err == nil {
			recording.FilePath = &filePath
			h.createRecording(ctx, recording)

			// Update video event with recording reference
			videoEvent.VideoPath = &filePath
			h.updateVideoEvent(ctx, videoEvent)

			// Schedule recording stop based on settings
			duration := int64(60) // Default 1 minute
			if settings != nil {
				duration = int64(settings.MotionRecordingDuration)
			}
			go h.scheduleRecordingStop(recording, duration)

			slog.Info("motion-triggered recording started", "camera_id", cameraID, "recording_id", recording.ID)
		}
	}

	// Publish motion event
	go h.publishMotionEvent(videoEvent, event)

	return nil
}

func (h *Handlers) processAccessEventForVideo(ctx context.Context, event *struct {
	TenantID  uuid.UUID              `json:"tenant_id"`
	DeviceID  string                 `json:"device_id"`
	PersonID  *uuid.UUID             `json:"person_id,omitempty"`
	Result    string                 `json:"result"`
	Zone      string                 `json:"zone"`
	Timestamp time.Time              `json:"timestamp"`
	Metadata  map[string]interface{} `json:"metadata,omitempty"`
}) error {
	// Find cameras near the access point
	cameras, _, err := h.getCameras(ctx, event.TenantID, CameraListQuery{
		Location: &event.Zone,
		IsActive: boolPtr(true),
		Limit:    10,
	})
	if err != nil {
		return err
	}

	// Get video settings
	settings, _ := h.getVideoSettings(ctx, event.TenantID)

	for _, camera := range cameras {
		// Check if this camera should record access events
		if camera.Config != nil {
			if recordAccess, ok := camera.Config["record_access_events"].(bool); !ok || !recordAccess {
				continue
			}
		}

		// Create access video event
		videoEvent := &VideoEvent{
			ID:          uuid.New(),
			TenantID:    event.TenantID,
			CameraID:    camera.ID,
			CameraName:  camera.Name,
			Type:        "access",
			Severity:    h.getAccessSeverity(event.Result),
			Title:       "Access Event",
			Description: h.generateAccessDescription(event.Result, event.Zone),
			StartTime:   event.Timestamp,
			CreatedAt:   time.Now(),
			UpdatedAt:   time.Now(),
			EventData: map[string]interface{}{
				"device_id": event.DeviceID,
				"result":    event.Result,
				"zone":      event.Zone,
				"person_id": event.PersonID,
			},
		}

		// Capture snapshot for access events
		if snapshotPath, err := h.captureSnapshot(&camera); err == nil {
			videoEvent.SnapshotPath = &snapshotPath
		}

		// Create video event
		h.createVideoEvent(ctx, videoEvent)

		// Start access-triggered recording for denied access
		if event.Result == "denied" && camera.Status == CameraStatusOnline {
			recording := &Recording{
				ID:          uuid.New(),
				TenantID:    event.TenantID,
				CameraID:    camera.ID,
				CameraName:  camera.Name,
				Title:       "Access Denied Recording",
				Type:        RecordingTypeEvent,
				Status:      RecordingStatusRecording,
				StartTime:   time.Now(),
				Format:      "mp4",
				Resolution:  camera.Resolution,
				FPS:         camera.FPS,
				Quality:     camera.Quality,
				TriggerType: stringPtr("access_denied"),
				TriggerData: map[string]interface{}{
					"access_event": event,
				},
				CreatedAt: time.Now(),
				UpdatedAt: time.Now(),
			}

			if filePath, err := h.startRecording(&camera, recording); err == nil {
				recording.FilePath = &filePath
				h.createRecording(ctx, recording)

				// Schedule recording stop
				duration := int64(30) // 30 seconds for access events
				if settings != nil && settings.MotionRecordingDuration > 0 {
					duration = int64(settings.MotionRecordingDuration / 2)
				}
				go h.scheduleRecordingStop(recording, duration)
			}
		}
	}

	return nil
}

func (h *Handlers) processAlarmEvent(ctx context.Context, event *struct {
	TenantID    uuid.UUID              `json:"tenant_id"`
	AlarmType   string                 `json:"alarm_type"`
	Severity    string                 `json:"severity"`
	DeviceID    string                 `json:"device_id"`
	Zone        string                 `json:"zone"`
	Timestamp   time.Time              `json:"timestamp"`
	Description string                 `json:"description"`
	Metadata    map[string]interface{} `json:"metadata,omitempty"`
}) error {
	// Get all active cameras for emergency recording
	cameras, _, err := h.getCameras(ctx, event.TenantID, CameraListQuery{
		IsActive: boolPtr(true),
		Limit:    100,
	})
	if err != nil {
		return err
	}

	for _, camera := range cameras {
		// Create alarm video event
		videoEvent := &VideoEvent{
			ID:          uuid.New(),
			TenantID:    event.TenantID,
			CameraID:    camera.ID,
			CameraName:  camera.Name,
			Type:        EventTypeAlarm,
			Severity:    event.Severity,
			Title:       "Alarm Triggered",
			Description: event.Description,
			StartTime:   event.Timestamp,
			CreatedAt:   time.Now(),
			UpdatedAt:   time.Now(),
			EventData: map[string]interface{}{
				"alarm_type": event.AlarmType,
				"device_id":  event.DeviceID,
				"zone":       event.Zone,
			},
		}

		h.createVideoEvent(ctx, videoEvent)

		// Start emergency recording
		if camera.Status == CameraStatusOnline {
			recording := &Recording{
				ID:          uuid.New(),
				TenantID:    event.TenantID,
				CameraID:    camera.ID,
				CameraName:  camera.Name,
				Title:       "Emergency Recording - " + event.AlarmType,
				Type:        RecordingTypeAlarm,
				Status:      RecordingStatusRecording,
				StartTime:   time.Now(),
				Format:      "mp4",
				Resolution:  camera.Resolution,
				FPS:         camera.FPS,
				Quality:     QualityHigh, // Use highest quality for alarms
				TriggerType: stringPtr("alarm"),
				TriggerData: map[string]interface{}{
					"alarm_event": event,
				},
				CreatedAt: time.Now(),
				UpdatedAt: time.Now(),
			}

			if filePath, err := h.startRecording(&camera, recording); err == nil {
				recording.FilePath = &filePath
				h.createRecording(ctx, recording)

				// Record for 5 minutes during alarms
				go h.scheduleRecordingStop(recording, 300)

				slog.Info("emergency recording started", "camera_id", camera.ID, "alarm_type", event.AlarmType)
			}
		}
	}

	return nil
}

// Background jobs

func (h *Handlers) StartVideoJobs() {
	// Camera health check job - every 5 minutes
	go h.runCameraHealthCheckJob()

	// Storage cleanup job - daily at 2 AM
	go h.runStorageCleanupJob()

	// Stream cleanup job - every 15 minutes
	go h.runStreamCleanupJob()

	slog.Info("video background jobs started")
}

func (h *Handlers) runCameraHealthCheckJob() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			if err := h.processCameraHealthCheck(context.Background()); err != nil {
				slog.Error("camera health check job failed", "error", err)
			}
		}
	}
}

func (h *Handlers) runStorageCleanupJob() {
	// Calculate time until 2 AM
	now := time.Now()
	next2AM := time.Date(now.Year(), now.Month(), now.Day()+1, 2, 0, 0, 0, now.Location())
	timeUntil2AM := next2AM.Sub(now)

	time.Sleep(timeUntil2AM)

	ticker := time.NewTicker(24 * time.Hour)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			if err := h.processStorageCleanup(context.Background()); err != nil {
				slog.Error("storage cleanup job failed", "error", err)
			}
		}
	}
}

func (h *Handlers) runStreamCleanupJob() {
	ticker := time.NewTicker(15 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			h.processStreamCleanup()
		}
	}
}

func (h *Handlers) processCameraHealthCheck(ctx context.Context) error {
	// Get all active cameras from all tenants
	// This would require iterating through tenants or using a global query
	slog.Info("running camera health check")
	return nil
}

func (h *Handlers) processStorageCleanup(ctx context.Context) error {
	slog.Info("running storage cleanup")
	// TODO: Implement storage cleanup based on retention policies
	return nil
}

func (h *Handlers) processStreamCleanup() {
	h.streaming.mutex.Lock()
	defer h.streaming.mutex.Unlock()

	now := time.Now()
	
	// Clean up inactive streams (no viewers for 10 minutes)
	for cameraID, session := range h.streaming.streams {
		if session.ViewerCount == 0 && now.Sub(session.LastViewed) > 10*time.Minute {
			if session.Process != nil && session.Process.Process != nil {
				session.Process.Process.Kill()
			}
			delete(h.streaming.streams, cameraID)
			slog.Info("cleaned up inactive stream", "camera_id", cameraID)
		}
	}
}

// Event publishers

func (h *Handlers) publishCameraEvent(camera *Camera, action string) {
	event := CameraEvent{
		Type:       "camera",
		TenantID:   camera.TenantID,
		CameraID:   camera.ID,
		CameraName: camera.Name,
		Action:     action,
		Timestamp:  time.Now(),
		Status:     camera.Status,
		Metadata: map[string]interface{}{
			"location":         camera.Location,
			"is_recording":     camera.IsRecording,
			"is_streaming":     camera.IsStreamingLive,
			"has_motion":       camera.HasMotionDetection,
		},
	}

	eventJSON, _ := json.Marshal(event)

	// Publish to tenant-specific subject
	subject := fmt.Sprintf("dm.%s.video.camera.%s", camera.TenantID, action)
	if err := h.nats.Publish(subject, eventJSON); err != nil {
		slog.Error("failed to publish camera event", "error", err)
	}
}

func (h *Handlers) publishMotionEvent(videoEvent *VideoEvent, motionData *struct {
	TenantID    uuid.UUID              `json:"tenant_id"`
	DeviceID    string                 `json:"device_id"`
	CameraID    *uuid.UUID             `json:"camera_id,omitempty"`
	ZoneID      *uuid.UUID             `json:"zone_id,omitempty"`
	Confidence  float64                `json:"confidence"`
	BoundingBox map[string]float64     `json:"bounding_box,omitempty"`
	Timestamp   time.Time              `json:"timestamp"`
	Metadata    map[string]interface{} `json:"metadata,omitempty"`
}) {
	event := MotionEvent{
		Type:         "motion",
		TenantID:     videoEvent.TenantID,
		CameraID:     videoEvent.CameraID,
		CameraName:   videoEvent.CameraName,
		MotionZoneID: videoEvent.MotionZoneID,
		ZoneName:     videoEvent.MotionZoneName,
		Timestamp:    motionData.Timestamp,
		Confidence:   motionData.Confidence,
		BoundingBox:  motionData.BoundingBox,
		SnapshotPath: videoEvent.SnapshotPath,
		Metadata: map[string]interface{}{
			"event_id":   videoEvent.ID,
			"severity":   videoEvent.Severity,
		},
	}

	eventJSON, _ := json.Marshal(event)

	// Publish motion event
	subject := fmt.Sprintf("dm.%s.video.motion.detected", videoEvent.TenantID)
	h.nats.Publish(subject, eventJSON)

	// Publish to notification service for alerts
	notifEvent := map[string]interface{}{
		"type":          "motion_alert",
		"tenant_id":     videoEvent.TenantID,
		"camera_id":     videoEvent.CameraID,
		"camera_name":   videoEvent.CameraName,
		"confidence":    motionData.Confidence,
		"snapshot_path": videoEvent.SnapshotPath,
		"timestamp":     motionData.Timestamp,
		"message":       videoEvent.Description,
		"severity":      videoEvent.Severity,
	}

	notifJSON, _ := json.Marshal(notifEvent)
	h.nats.Publish("dm.notification.send", notifJSON)
}

func (h *Handlers) publishRecordingEvent(recording *Recording, action string) {
	event := map[string]interface{}{
		"type":        "recording",
		"tenant_id":   recording.TenantID,
		"camera_id":   recording.CameraID,
		"recording_id": recording.ID,
		"action":      action,
		"timestamp":   time.Now(),
		"title":       recording.Title,
		"type":        recording.Type,
		"status":      recording.Status,
		"duration":    recording.Duration,
		"file_size":   recording.FileSize,
	}

	eventJSON, _ := json.Marshal(event)

	// Publish recording event
	subject := fmt.Sprintf("dm.%s.video.recording.%s", recording.TenantID, action)
	h.nats.Publish(subject, eventJSON)
}

// Helper functions

func (h *Handlers) createVideoEventFromDevice(camera *Camera, status string, timestamp time.Time) {
	severity := SeverityLow
	eventType := EventTypeOnline

	switch status {
	case "offline":
		severity = SeverityMedium
		eventType = EventTypeOffline
	case "error":
		severity = SeverityHigh
		eventType = EventTypeError
	}

	event := &VideoEvent{
		ID:          uuid.New(),
		TenantID:    camera.TenantID,
		CameraID:    camera.ID,
		CameraName:  camera.Name,
		Type:        eventType,
		Severity:    severity,
		Title:       fmt.Sprintf("Camera %s", status),
		Description: fmt.Sprintf("Camera %s status changed to %s", camera.Name, status),
		StartTime:   timestamp,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
		EventData: map[string]interface{}{
			"previous_status": camera.Status,
			"new_status":      status,
		},
	}

	h.createVideoEvent(context.Background(), event)
}

func (h *Handlers) updateVideoEvent(ctx context.Context, event *VideoEvent) error {
	// Implementation would update video event in database
	return nil
}

func (h *Handlers) getMotionSeverity(confidence float64) string {
	if confidence >= 0.8 {
		return SeverityHigh
	} else if confidence >= 0.6 {
		return SeverityMedium
	}
	return SeverityLow
}

func (h *Handlers) getAccessSeverity(result string) string {
	if result == "denied" {
		return SeverityMedium
	}
	return SeverityLow
}

func (h *Handlers) generateMotionDescription(camera *Camera, zone *MotionZone, confidence float64) string {
	desc := fmt.Sprintf("Motion detected at %s (%.1f%% confidence)", camera.Name, confidence*100)
	if zone != nil {
		desc += fmt.Sprintf(" in zone '%s'", zone.Name)
	}
	return desc
}

func (h *Handlers) generateAccessDescription(result, zone string) string {
	return fmt.Sprintf("Access %s at %s", result, zone)
}

func stringPtr(s string) *string {
	return &s
}

func boolPtr(b bool) *bool {
	return &b
}