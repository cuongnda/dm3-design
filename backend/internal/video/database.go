package video

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	"duall-master/pkg/db"

	"github.com/google/uuid"
	"github.com/lib/pq"
)

// Database operations for video service

func (h *Handlers) getCameras(ctx context.Context, tenantID uuid.UUID, query CameraListQuery) ([]Camera, int64, error) {
	if err := h.db.SetTenant(ctx, tenantID); err != nil {
		return nil, 0, err
	}

	var conditions []string
	var args []interface{}
	argCount := 0

	// Base condition for non-deleted records
	conditions = append(conditions, "deleted_at IS NULL")

	if query.Status != nil {
		argCount++
		conditions = append(conditions, fmt.Sprintf("status = $%d", argCount))
		args = append(args, *query.Status)
	}

	if query.Location != nil {
		argCount++
		conditions = append(conditions, fmt.Sprintf("location ILIKE $%d", argCount))
		args = append(args, "%"+*query.Location+"%")
	}

	if query.Type != nil {
		argCount++
		conditions = append(conditions, fmt.Sprintf("type = $%d", argCount))
		args = append(args, *query.Type)
	}

	if query.IsActive != nil {
		argCount++
		conditions = append(conditions, fmt.Sprintf("is_active = $%d", argCount))
		args = append(args, *query.IsActive)
	}

	if query.HasMotion != nil {
		argCount++
		conditions = append(conditions, fmt.Sprintf("has_motion_detection = $%d", argCount))
		args = append(args, *query.HasMotion)
	}

	whereClause := ""
	if len(conditions) > 0 {
		whereClause = "WHERE " + strings.Join(conditions, " AND ")
	}

	// Count query
	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM dm3_video.cameras %s", whereClause)
	var total int64
	if err := h.db.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	// Main query
	argCount++
	limitArg := argCount
	argCount++
	offsetArg := argCount

	mainQuery := fmt.Sprintf(`
		SELECT 
			id, tenant_id, name, description, location, type, brand, model,
			rtsp_url, rtsp_username, rtsp_password, resolution, fps, quality,
			status, is_active, is_recording, is_streaming_live, has_motion_detection,
			has_ptz_support, storage_quota, retention_days, position, config,
			metadata, last_seen, last_error, created_at, updated_at, created_by
		FROM dm3_video.cameras
		%s
		ORDER BY name ASC
		LIMIT $%d OFFSET $%d
	`, whereClause, limitArg, offsetArg)

	args = append(args, query.Limit, query.Offset)

	rows, err := h.db.Query(ctx, mainQuery, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var cameras []Camera
	for rows.Next() {
		var c Camera
		var position, config, metadata sql.NullString

		err := rows.Scan(
			&c.ID, &c.TenantID, &c.Name, &c.Description, &c.Location, &c.Type,
			&c.Brand, &c.Model, &c.RTSPUrl, &c.RTSPUsername, &c.RTSPPassword,
			&c.Resolution, &c.FPS, &c.Quality, &c.Status, &c.IsActive,
			&c.IsRecording, &c.IsStreamingLive, &c.HasMotionDetection,
			&c.HasPTZSupport, &c.StorageQuota, &c.RetentionDays,
			&position, &config, &metadata, &c.LastSeen, &c.LastError,
			&c.CreatedAt, &c.UpdatedAt, &c.CreatedBy,
		)
		if err != nil {
			return nil, 0, err
		}

		// Parse JSON fields
		if position.Valid && position.String != "" {
			if err := db.ParseJSONB(position.String, &c.Position); err != nil {
				c.Position = make(map[string]interface{})
			}
		}
		if config.Valid && config.String != "" {
			if err := db.ParseJSONB(config.String, &c.Config); err != nil {
				c.Config = make(map[string]interface{})
			}
		}
		if metadata.Valid && metadata.String != "" {
			if err := db.ParseJSONB(metadata.String, &c.Metadata); err != nil {
				c.Metadata = make(map[string]interface{})
			}
		}

		cameras = append(cameras, c)
	}

	return cameras, total, nil
}

func (h *Handlers) getCamera(ctx context.Context, tenantID, cameraID uuid.UUID) (*Camera, error) {
	if err := h.db.SetTenant(ctx, tenantID); err != nil {
		return nil, err
	}

	query := `
		SELECT 
			id, tenant_id, name, description, location, type, brand, model,
			rtsp_url, rtsp_username, rtsp_password, resolution, fps, quality,
			status, is_active, is_recording, is_streaming_live, has_motion_detection,
			has_ptz_support, storage_quota, retention_days, position, config,
			metadata, last_seen, last_error, created_at, updated_at, created_by
		FROM dm3_video.cameras
		WHERE id = $1 AND deleted_at IS NULL
	`

	var c Camera
	var position, config, metadata sql.NullString

	err := h.db.QueryRow(ctx, query, cameraID).Scan(
		&c.ID, &c.TenantID, &c.Name, &c.Description, &c.Location, &c.Type,
		&c.Brand, &c.Model, &c.RTSPUrl, &c.RTSPUsername, &c.RTSPPassword,
		&c.Resolution, &c.FPS, &c.Quality, &c.Status, &c.IsActive,
		&c.IsRecording, &c.IsStreamingLive, &c.HasMotionDetection,
		&c.HasPTZSupport, &c.StorageQuota, &c.RetentionDays,
		&position, &config, &metadata, &c.LastSeen, &c.LastError,
		&c.CreatedAt, &c.UpdatedAt, &c.CreatedBy,
	)

	if err != nil {
		return nil, err
	}

	// Parse JSON fields
	if position.Valid && position.String != "" {
		if err := db.ParseJSONB(position.String, &c.Position); err != nil {
			c.Position = make(map[string]interface{})
		}
	}
	if config.Valid && config.String != "" {
		if err := db.ParseJSONB(config.String, &c.Config); err != nil {
			c.Config = make(map[string]interface{})
		}
	}
	if metadata.Valid && metadata.String != "" {
		if err := db.ParseJSONB(metadata.String, &c.Metadata); err != nil {
			c.Metadata = make(map[string]interface{})
		}
	}

	return &c, nil
}

func (h *Handlers) createCamera(ctx context.Context, camera *Camera) error {
	if err := h.db.SetTenant(ctx, camera.TenantID); err != nil {
		return err
	}

	positionJSON, _ := db.ToJSONB(camera.Position)
	configJSON, _ := db.ToJSONB(camera.Config)
	metadataJSON, _ := db.ToJSONB(camera.Metadata)

	query := `
		INSERT INTO dm3_video.cameras (
			id, tenant_id, name, description, location, type, brand, model,
			rtsp_url, rtsp_username, rtsp_password, resolution, fps, quality,
			status, is_active, is_recording, is_streaming_live, has_motion_detection,
			has_ptz_support, storage_quota, retention_days, position, config,
			metadata, created_at, updated_at, created_by
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
			$17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28
		)
	`

	_, err := h.db.Exec(ctx, query,
		camera.ID, camera.TenantID, camera.Name, camera.Description, camera.Location,
		camera.Type, camera.Brand, camera.Model, camera.RTSPUrl, camera.RTSPUsername,
		camera.RTSPPassword, camera.Resolution, camera.FPS, camera.Quality,
		camera.Status, camera.IsActive, camera.IsRecording, camera.IsStreamingLive,
		camera.HasMotionDetection, camera.HasPTZSupport, camera.StorageQuota,
		camera.RetentionDays, positionJSON, configJSON, metadataJSON,
		camera.CreatedAt, camera.UpdatedAt, camera.CreatedBy,
	)

	return err
}

func (h *Handlers) updateCamera(ctx context.Context, camera *Camera) error {
	if err := h.db.SetTenant(ctx, camera.TenantID); err != nil {
		return err
	}

	positionJSON, _ := db.ToJSONB(camera.Position)
	configJSON, _ := db.ToJSONB(camera.Config)
	metadataJSON, _ := db.ToJSONB(camera.Metadata)

	query := `
		UPDATE dm3_video.cameras SET
			name = $2, description = $3, location = $4, type = $5, brand = $6,
			model = $7, rtsp_url = $8, rtsp_username = $9, rtsp_password = $10,
			resolution = $11, fps = $12, quality = $13, status = $14,
			is_active = $15, is_recording = $16, is_streaming_live = $17,
			has_motion_detection = $18, has_ptz_support = $19, storage_quota = $20,
			retention_days = $21, position = $22, config = $23, metadata = $24,
			last_seen = $25, last_error = $26, updated_at = $27, deleted_at = $28
		WHERE id = $1
	`

	_, err := h.db.Exec(ctx, query,
		camera.ID, camera.Name, camera.Description, camera.Location, camera.Type,
		camera.Brand, camera.Model, camera.RTSPUrl, camera.RTSPUsername,
		camera.RTSPPassword, camera.Resolution, camera.FPS, camera.Quality,
		camera.Status, camera.IsActive, camera.IsRecording, camera.IsStreamingLive,
		camera.HasMotionDetection, camera.HasPTZSupport, camera.StorageQuota,
		camera.RetentionDays, positionJSON, configJSON, metadataJSON,
		camera.LastSeen, camera.LastError, camera.UpdatedAt, camera.DeletedAt,
	)

	return err
}

// Recording operations

func (h *Handlers) getRecordings(ctx context.Context, tenantID uuid.UUID, query RecordingListQuery) ([]Recording, int64, error) {
	if err := h.db.SetTenant(ctx, tenantID); err != nil {
		return nil, 0, err
	}

	var conditions []string
	var args []interface{}
	argCount := 0

	conditions = append(conditions, "deleted_at IS NULL")

	if query.CameraID != nil {
		if cameraID, err := uuid.Parse(*query.CameraID); err == nil {
			argCount++
			conditions = append(conditions, fmt.Sprintf("camera_id = $%d", argCount))
			args = append(args, cameraID)
		}
	}

	if query.Type != nil {
		argCount++
		conditions = append(conditions, fmt.Sprintf("type = $%d", argCount))
		args = append(args, *query.Type)
	}

	if query.Status != nil {
		argCount++
		conditions = append(conditions, fmt.Sprintf("status = $%d", argCount))
		args = append(args, *query.Status)
	}

	if query.StartDate != nil {
		if date, err := time.Parse("2006-01-02", *query.StartDate); err == nil {
			argCount++
			conditions = append(conditions, fmt.Sprintf("start_time >= $%d", argCount))
			args = append(args, date)
		}
	}

	if query.EndDate != nil {
		if date, err := time.Parse("2006-01-02", *query.EndDate); err == nil {
			argCount++
			conditions = append(conditions, fmt.Sprintf("start_time < $%d", argCount))
			args = append(args, date.AddDate(0, 0, 1)) // Add 1 day to include the end date
		}
	}

	whereClause := ""
	if len(conditions) > 0 {
		whereClause = "WHERE " + strings.Join(conditions, " AND ")
	}

	// Count query
	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM dm3_video.recordings %s", whereClause)
	var total int64
	if err := h.db.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	// Main query
	argCount++
	limitArg := argCount
	argCount++
	offsetArg := argCount

	mainQuery := fmt.Sprintf(`
		SELECT 
			id, tenant_id, camera_id, camera_name, title, description, type,
			status, start_time, end_time, duration, file_path, file_size,
			format, resolution, fps, quality, trigger_type, trigger_data,
			metadata, created_at, updated_at, created_by
		FROM dm3_video.recordings
		%s
		ORDER BY start_time DESC
		LIMIT $%d OFFSET $%d
	`, whereClause, limitArg, offsetArg)

	args = append(args, query.Limit, query.Offset)

	rows, err := h.db.Query(ctx, mainQuery, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var recordings []Recording
	for rows.Next() {
		var r Recording
		var triggerData, metadata sql.NullString

		err := rows.Scan(
			&r.ID, &r.TenantID, &r.CameraID, &r.CameraName, &r.Title,
			&r.Description, &r.Type, &r.Status, &r.StartTime, &r.EndTime,
			&r.Duration, &r.FilePath, &r.FileSize, &r.Format, &r.Resolution,
			&r.FPS, &r.Quality, &r.TriggerType, &triggerData, &metadata,
			&r.CreatedAt, &r.UpdatedAt, &r.CreatedBy,
		)
		if err != nil {
			return nil, 0, err
		}

		// Parse JSON fields
		if triggerData.Valid && triggerData.String != "" {
			if err := db.ParseJSONB(triggerData.String, &r.TriggerData); err != nil {
				r.TriggerData = make(map[string]interface{})
			}
		}
		if metadata.Valid && metadata.String != "" {
			if err := db.ParseJSONB(metadata.String, &r.Metadata); err != nil {
				r.Metadata = make(map[string]interface{})
			}
		}

		recordings = append(recordings, r)
	}

	return recordings, total, nil
}

func (h *Handlers) getRecording(ctx context.Context, tenantID, recordingID uuid.UUID) (*Recording, error) {
	if err := h.db.SetTenant(ctx, tenantID); err != nil {
		return nil, err
	}

	query := `
		SELECT 
			id, tenant_id, camera_id, camera_name, title, description, type,
			status, start_time, end_time, duration, file_path, file_size,
			format, resolution, fps, quality, trigger_type, trigger_data,
			metadata, created_at, updated_at, created_by
		FROM dm3_video.recordings
		WHERE id = $1 AND deleted_at IS NULL
	`

	var r Recording
	var triggerData, metadata sql.NullString

	err := h.db.QueryRow(ctx, query, recordingID).Scan(
		&r.ID, &r.TenantID, &r.CameraID, &r.CameraName, &r.Title,
		&r.Description, &r.Type, &r.Status, &r.StartTime, &r.EndTime,
		&r.Duration, &r.FilePath, &r.FileSize, &r.Format, &r.Resolution,
		&r.FPS, &r.Quality, &r.TriggerType, &triggerData, &metadata,
		&r.CreatedAt, &r.UpdatedAt, &r.CreatedBy,
	)

	if err != nil {
		return nil, err
	}

	// Parse JSON fields
	if triggerData.Valid && triggerData.String != "" {
		if err := db.ParseJSONB(triggerData.String, &r.TriggerData); err != nil {
			r.TriggerData = make(map[string]interface{})
		}
	}
	if metadata.Valid && metadata.String != "" {
		if err := db.ParseJSONB(metadata.String, &r.Metadata); err != nil {
			r.Metadata = make(map[string]interface{})
		}
	}

	return &r, nil
}

func (h *Handlers) createRecording(ctx context.Context, recording *Recording) error {
	if err := h.db.SetTenant(ctx, recording.TenantID); err != nil {
		return err
	}

	triggerDataJSON, _ := db.ToJSONB(recording.TriggerData)
	metadataJSON, _ := db.ToJSONB(recording.Metadata)

	query := `
		INSERT INTO dm3_video.recordings (
			id, tenant_id, camera_id, camera_name, title, description, type,
			status, start_time, end_time, duration, file_path, file_size,
			format, resolution, fps, quality, trigger_type, trigger_data,
			metadata, created_at, updated_at, created_by
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
			$15, $16, $17, $18, $19, $20, $21, $22, $23
		)
	`

	_, err := h.db.Exec(ctx, query,
		recording.ID, recording.TenantID, recording.CameraID, recording.CameraName,
		recording.Title, recording.Description, recording.Type, recording.Status,
		recording.StartTime, recording.EndTime, recording.Duration, recording.FilePath,
		recording.FileSize, recording.Format, recording.Resolution, recording.FPS,
		recording.Quality, recording.TriggerType, triggerDataJSON, metadataJSON,
		recording.CreatedAt, recording.UpdatedAt, recording.CreatedBy,
	)

	return err
}

func (h *Handlers) updateRecording(ctx context.Context, recording *Recording) error {
	if err := h.db.SetTenant(ctx, recording.TenantID); err != nil {
		return err
	}

	triggerDataJSON, _ := db.ToJSONB(recording.TriggerData)
	metadataJSON, _ := db.ToJSONB(recording.Metadata)

	query := `
		UPDATE dm3_video.recordings SET
			status = $2, end_time = $3, duration = $4, file_path = $5,
			file_size = $6, trigger_data = $7, metadata = $8, updated_at = $9
		WHERE id = $1
	`

	_, err := h.db.Exec(ctx, query,
		recording.ID, recording.Status, recording.EndTime, recording.Duration,
		recording.FilePath, recording.FileSize, triggerDataJSON, metadataJSON,
		recording.UpdatedAt,
	)

	return err
}

// Motion zone operations

func (h *Handlers) getMotionZones(ctx context.Context, tenantID, cameraID uuid.UUID) ([]MotionZone, error) {
	if err := h.db.SetTenant(ctx, tenantID); err != nil {
		return nil, err
	}

	query := `
		SELECT id, tenant_id, camera_id, name, description, polygon, sensitivity,
			   is_active, is_armed, schedule, actions, metadata, created_at, updated_at
		FROM dm3_video.motion_zones
		WHERE camera_id = $1
		ORDER BY name
	`

	rows, err := h.db.Query(ctx, query, cameraID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var zones []MotionZone
	for rows.Next() {
		var mz MotionZone
		var polygon, schedule, actions, metadata sql.NullString

		err := rows.Scan(
			&mz.ID, &mz.TenantID, &mz.CameraID, &mz.Name, &mz.Description,
			&polygon, &mz.Sensitivity, &mz.IsActive, &mz.IsArmed,
			&schedule, &actions, &metadata, &mz.CreatedAt, &mz.UpdatedAt,
		)
		if err != nil {
			continue
		}

		// Parse JSON fields
		if polygon.Valid && polygon.String != "" {
			if err := db.ParseJSONB(polygon.String, &mz.Polygon); err != nil {
				mz.Polygon = make([]map[string]float64, 0)
			}
		}
		if schedule.Valid && schedule.String != "" {
			if err := db.ParseJSONB(schedule.String, &mz.Schedule); err != nil {
				mz.Schedule = make(map[string]interface{})
			}
		}
		if actions.Valid && actions.String != "" {
			var actionList pq.StringArray
			if err := actionList.Scan(actions.String); err == nil {
				mz.Actions = []string(actionList)
			}
		}
		if metadata.Valid && metadata.String != "" {
			if err := db.ParseJSONB(metadata.String, &mz.Metadata); err != nil {
				mz.Metadata = make(map[string]interface{})
			}
		}

		zones = append(zones, mz)
	}

	return zones, nil
}

func (h *Handlers) createMotionZone(ctx context.Context, zone *MotionZone) error {
	if err := h.db.SetTenant(ctx, zone.TenantID); err != nil {
		return err
	}

	polygonJSON, _ := db.ToJSONB(zone.Polygon)
	scheduleJSON, _ := db.ToJSONB(zone.Schedule)
	actionsJSON := pq.StringArray(zone.Actions)
	metadataJSON, _ := db.ToJSONB(zone.Metadata)

	query := `
		INSERT INTO dm3_video.motion_zones (
			id, tenant_id, camera_id, name, description, polygon, sensitivity,
			is_active, is_armed, schedule, actions, metadata, created_at, updated_at
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
		)
	`

	_, err := h.db.Exec(ctx, query,
		zone.ID, zone.TenantID, zone.CameraID, zone.Name, zone.Description,
		polygonJSON, zone.Sensitivity, zone.IsActive, zone.IsArmed,
		scheduleJSON, actionsJSON, metadataJSON, zone.CreatedAt, zone.UpdatedAt,
	)

	return err
}

// Video events

func (h *Handlers) getVideoEvents(ctx context.Context, tenantID uuid.UUID, query VideoEventsQuery) ([]VideoEvent, int64, error) {
	if err := h.db.SetTenant(ctx, tenantID); err != nil {
		return nil, 0, err
	}

	var conditions []string
	var args []interface{}
	argCount := 0

	if query.CameraID != nil {
		if cameraID, err := uuid.Parse(*query.CameraID); err == nil {
			argCount++
			conditions = append(conditions, fmt.Sprintf("camera_id = $%d", argCount))
			args = append(args, cameraID)
		}
	}

	if query.Type != nil {
		argCount++
		conditions = append(conditions, fmt.Sprintf("type = $%d", argCount))
		args = append(args, *query.Type)
	}

	if query.Severity != nil {
		argCount++
		conditions = append(conditions, fmt.Sprintf("severity = $%d", argCount))
		args = append(args, *query.Severity)
	}

	if query.IsAcknowledged != nil {
		argCount++
		conditions = append(conditions, fmt.Sprintf("is_acknowledged = $%d", argCount))
		args = append(args, *query.IsAcknowledged)
	}

	if query.StartDate != nil {
		if date, err := time.Parse("2006-01-02", *query.StartDate); err == nil {
			argCount++
			conditions = append(conditions, fmt.Sprintf("start_time >= $%d", argCount))
			args = append(args, date)
		}
	}

	if query.EndDate != nil {
		if date, err := time.Parse("2006-01-02", *query.EndDate); err == nil {
			argCount++
			conditions = append(conditions, fmt.Sprintf("start_time < $%d", argCount))
			args = append(args, date.AddDate(0, 0, 1))
		}
	}

	whereClause := ""
	if len(conditions) > 0 {
		whereClause = "WHERE " + strings.Join(conditions, " AND ")
	}

	// Count query
	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM dm3_video.video_events %s", whereClause)
	var total int64
	if err := h.db.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	// Main query
	argCount++
	limitArg := argCount
	argCount++
	offsetArg := argCount

	mainQuery := fmt.Sprintf(`
		SELECT 
			id, tenant_id, camera_id, camera_name, motion_zone_id, motion_zone_name,
			type, severity, title, description, snapshot_path, video_path,
			is_acknowledged, acknowledged_by, acknowledged_at, event_data,
			metadata, start_time, end_time, created_at, updated_at
		FROM dm3_video.video_events
		%s
		ORDER BY start_time DESC
		LIMIT $%d OFFSET $%d
	`, whereClause, limitArg, offsetArg)

	args = append(args, query.Limit, query.Offset)

	rows, err := h.db.Query(ctx, mainQuery, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var events []VideoEvent
	for rows.Next() {
		var ve VideoEvent
		var eventData, metadata sql.NullString

		err := rows.Scan(
			&ve.ID, &ve.TenantID, &ve.CameraID, &ve.CameraName,
			&ve.MotionZoneID, &ve.MotionZoneName, &ve.Type, &ve.Severity,
			&ve.Title, &ve.Description, &ve.SnapshotPath, &ve.VideoPath,
			&ve.IsAcknowledged, &ve.AcknowledgedBy, &ve.AcknowledgedAt,
			&eventData, &metadata, &ve.StartTime, &ve.EndTime,
			&ve.CreatedAt, &ve.UpdatedAt,
		)
		if err != nil {
			continue
		}

		// Parse JSON fields
		if eventData.Valid && eventData.String != "" {
			if err := db.ParseJSONB(eventData.String, &ve.EventData); err != nil {
				ve.EventData = make(map[string]interface{})
			}
		}
		if metadata.Valid && metadata.String != "" {
			if err := db.ParseJSONB(metadata.String, &ve.Metadata); err != nil {
				ve.Metadata = make(map[string]interface{})
			}
		}

		events = append(events, ve)
	}

	return events, total, nil
}

func (h *Handlers) createVideoEvent(ctx context.Context, event *VideoEvent) error {
	if err := h.db.SetTenant(ctx, event.TenantID); err != nil {
		return err
	}

	eventDataJSON, _ := db.ToJSONB(event.EventData)
	metadataJSON, _ := db.ToJSONB(event.Metadata)

	query := `
		INSERT INTO dm3_video.video_events (
			id, tenant_id, camera_id, camera_name, motion_zone_id, motion_zone_name,
			type, severity, title, description, snapshot_path, video_path,
			event_data, metadata, start_time, created_at, updated_at
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
		)
	`

	_, err := h.db.Exec(ctx, query,
		event.ID, event.TenantID, event.CameraID, event.CameraName,
		event.MotionZoneID, event.MotionZoneName, event.Type, event.Severity,
		event.Title, event.Description, event.SnapshotPath, event.VideoPath,
		eventDataJSON, metadataJSON, event.StartTime, event.CreatedAt, event.UpdatedAt,
	)

	return err
}

// Settings

func (h *Handlers) getVideoSettings(ctx context.Context, tenantID uuid.UUID) (*VideoSettings, error) {
	if err := h.db.SetTenant(ctx, tenantID); err != nil {
		return nil, err
	}

	query := `
		SELECT id, tenant_id, default_retention_days, max_storage_gb,
			   default_recording_quality, default_streaming_quality,
			   motion_detection_enabled, auto_record_motion, motion_recording_duration,
			   storage_path, thumbnail_interval, enable_cleanup_job,
			   notification_settings, advanced_settings, created_at, updated_at
		FROM dm3_video.video_settings
		WHERE tenant_id = $1
	`

	var settings VideoSettings
	var notificationSettings, advancedSettings sql.NullString

	err := h.db.QueryRow(ctx, query, tenantID).Scan(
		&settings.ID, &settings.TenantID, &settings.DefaultRetentionDays,
		&settings.MaxStorageGB, &settings.DefaultRecordingQuality,
		&settings.DefaultStreamingQuality, &settings.MotionDetectionEnabled,
		&settings.AutoRecordMotion, &settings.MotionRecordingDuration,
		&settings.StoragePath, &settings.ThumbnailInterval, &settings.EnableCleanupJob,
		&notificationSettings, &advancedSettings, &settings.CreatedAt, &settings.UpdatedAt,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			// Return default settings
			defaults := DefaultVideoSettings
			defaults.TenantID = tenantID
			return &defaults, nil
		}
		return nil, err
	}

	// Parse JSON fields
	if notificationSettings.Valid && notificationSettings.String != "" {
		if err := db.ParseJSONB(notificationSettings.String, &settings.NotificationSettings); err != nil {
			settings.NotificationSettings = make(map[string]interface{})
		}
	}
	if advancedSettings.Valid && advancedSettings.String != "" {
		if err := db.ParseJSONB(advancedSettings.String, &settings.AdvancedSettings); err != nil {
			settings.AdvancedSettings = make(map[string]interface{})
		}
	}

	return &settings, nil
}

// Helper functions

func (h *Handlers) hasActiveRecordings(ctx context.Context, cameraID uuid.UUID) bool {
	query := `
		SELECT COUNT(*) FROM dm3_video.recordings 
		WHERE camera_id = $1 AND status = 'recording' AND deleted_at IS NULL
	`

	var count int
	h.db.QueryRow(ctx, query, cameraID).Scan(&count)
	return count > 0
}

func (h *Handlers) getCameraStatus(ctx context.Context, tenantID, cameraID uuid.UUID) *CameraStatusResponse {
	// This would be implemented to get real-time camera status
	// For now, return basic status
	return &CameraStatusResponse{
		CameraID:       cameraID,
		Status:         CameraStatusOnline,
		IsRecording:    false,
		IsStreaming:    false,
		ViewerCount:    0,
		StorageUsed:    0,
		MotionDetected: false,
		EventCount:     0,
		RecordingCount: 0,
	}
}