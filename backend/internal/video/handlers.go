package video

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"duall-master/pkg/db"
	"duall-master/pkg/httputil"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/nats-io/nats.go"
)

type Handlers struct {
	db   *db.DB
	nats *nats.Conn
	streaming *StreamingManager
}

func NewHandlers(database *db.DB, nc *nats.Conn) *Handlers {
	return &Handlers{
		db:   database,
		nats: nc,
		streaming: NewStreamingManager(),
	}
}

// Camera management

func (h *Handlers) ListCameras(w http.ResponseWriter, r *http.Request) {
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	query := CameraListQuery{
		Limit:  50,
		Offset: 0,
	}
	
	// Parse query parameters
	if limit := r.URL.Query().Get("limit"); limit != "" {
		if l, err := strconv.Atoi(limit); err == nil && l > 0 && l <= 200 {
			query.Limit = l
		}
	}
	
	if offset := r.URL.Query().Get("offset"); offset != "" {
		if o, err := strconv.Atoi(offset); err == nil && o >= 0 {
			query.Offset = o
		}
	}
	
	if status := r.URL.Query().Get("status"); status != "" {
		query.Status = &status
	}
	
	if location := r.URL.Query().Get("location"); location != "" {
		query.Location = &location
	}
	
	if cameraType := r.URL.Query().Get("type"); cameraType != "" {
		query.Type = &cameraType
	}
	
	if isActive := r.URL.Query().Get("is_active"); isActive != "" {
		if active, err := strconv.ParseBool(isActive); err == nil {
			query.IsActive = &active
		}
	}
	
	if hasMotion := r.URL.Query().Get("has_motion"); hasMotion != "" {
		if motion, err := strconv.ParseBool(hasMotion); err == nil {
			query.HasMotion = &motion
		}
	}
	
	cameras, total, err := h.getCameras(r.Context(), tenantID, query)
	if err != nil {
		slog.Error("failed to get cameras", "error", err)
		httputil.Error(w, "failed to get cameras", http.StatusInternalServerError)
		return
	}
	
	httputil.JSON(w, map[string]interface{}{
		"cameras": cameras,
		"total":   total,
		"limit":   query.Limit,
		"offset":  query.Offset,
	})
}

func (h *Handlers) CreateCamera(w http.ResponseWriter, r *http.Request) {
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	createdBy := h.getUserID(r)
	
	var req CreateCameraRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	
	// Validate RTSP URL format
	if !strings.HasPrefix(req.RTSPUrl, "rtsp://") && !strings.HasPrefix(req.RTSPUrl, "http://") {
		httputil.Error(w, "invalid RTSP URL format", http.StatusBadRequest)
		return
	}
	
	camera := &Camera{
		ID:               uuid.New(),
		TenantID:         tenantID,
		Name:             req.Name,
		Description:      req.Description,
		Location:         req.Location,
		Type:             req.Type,
		Brand:            req.Brand,
		Model:            req.Model,
		RTSPUrl:          req.RTSPUrl,
		RTSPUsername:     req.RTSPUsername,
		RTSPPassword:     req.RTSPPassword,
		Resolution:       getDefaultValue(req.Resolution, "1920x1080"),
		FPS:              getDefaultInt(req.FPS, 25),
		Quality:          getDefaultValue(req.Quality, QualityMedium),
		Status:           CameraStatusOffline,
		IsActive:         true,
		HasMotionDetection: req.HasMotionDetection,
		HasPTZSupport:    req.HasPTZSupport,
		StorageQuota:     getDefaultInt64(req.StorageQuota, 10240), // 10GB default
		RetentionDays:    getDefaultInt(req.RetentionDays, 7),
		Position:         req.Position,
		Config:           req.Config,
		CreatedAt:        time.Now(),
		UpdatedAt:        time.Now(),
		CreatedBy:        createdBy,
	}
	
	if err := h.createCamera(r.Context(), camera); err != nil {
		slog.Error("failed to create camera", "error", err)
		httputil.Error(w, "failed to create camera", http.StatusInternalServerError)
		return
	}
	
	// Test camera connection
	go h.testCameraConnection(camera)
	
	// Publish camera created event
	go h.publishCameraEvent(camera, "camera_created")
	
	httputil.JSON(w, camera)
}

func (h *Handlers) GetCamera(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	cameraID := uuid.MustParse(vars["id"])
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	camera, err := h.getCamera(r.Context(), tenantID, cameraID)
	if err != nil {
		if err.Error() == "no rows in result set" {
			httputil.Error(w, "camera not found", http.StatusNotFound)
			return
		}
		slog.Error("failed to get camera", "error", err)
		httputil.Error(w, "failed to get camera", http.StatusInternalServerError)
		return
	}
	
	// Get current status and analytics
	status := h.getCameraStatus(r.Context(), tenantID, cameraID)
	
	response := map[string]interface{}{
		"camera": camera,
		"status": status,
	}
	
	httputil.JSON(w, response)
}

func (h *Handlers) UpdateCamera(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	cameraID := uuid.MustParse(vars["id"])
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	var req UpdateCameraRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	
	camera, err := h.getCamera(r.Context(), tenantID, cameraID)
	if err != nil {
		httputil.Error(w, "camera not found", http.StatusNotFound)
		return
	}
	
	// Update fields
	if req.Name != nil {
		camera.Name = *req.Name
	}
	if req.Description != nil {
		camera.Description = *req.Description
	}
	if req.Location != nil {
		camera.Location = *req.Location
	}
	if req.RTSPUrl != nil {
		camera.RTSPUrl = *req.RTSPUrl
	}
	if req.RTSPUsername != nil {
		camera.RTSPUsername = req.RTSPUsername
	}
	if req.RTSPPassword != nil {
		camera.RTSPPassword = req.RTSPPassword
	}
	if req.Resolution != nil {
		camera.Resolution = *req.Resolution
	}
	if req.FPS != nil {
		camera.FPS = *req.FPS
	}
	if req.Quality != nil {
		camera.Quality = *req.Quality
	}
	if req.IsActive != nil {
		camera.IsActive = *req.IsActive
	}
	if req.HasMotionDetection != nil {
		camera.HasMotionDetection = *req.HasMotionDetection
	}
	if req.HasPTZSupport != nil {
		camera.HasPTZSupport = *req.HasPTZSupport
	}
	if req.StorageQuota != nil {
		camera.StorageQuota = *req.StorageQuota
	}
	if req.RetentionDays != nil {
		camera.RetentionDays = *req.RetentionDays
	}
	if req.Position != nil {
		camera.Position = req.Position
	}
	if req.Config != nil {
		camera.Config = req.Config
	}
	
	camera.UpdatedAt = time.Now()
	
	if err := h.updateCamera(r.Context(), camera); err != nil {
		slog.Error("failed to update camera", "error", err)
		httputil.Error(w, "failed to update camera", http.StatusInternalServerError)
		return
	}
	
	// If RTSP URL changed, test new connection
	if req.RTSPUrl != nil {
		go h.testCameraConnection(camera)
	}
	
	// Publish camera updated event
	go h.publishCameraEvent(camera, "camera_updated")
	
	httputil.JSON(w, camera)
}

func (h *Handlers) DeleteCamera(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	cameraID := uuid.MustParse(vars["id"])
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	camera, err := h.getCamera(r.Context(), tenantID, cameraID)
	if err != nil {
		httputil.Error(w, "camera not found", http.StatusNotFound)
		return
	}
	
	// Stop any active recordings/streams
	h.stopCameraRecordings(r.Context(), cameraID)
	h.stopCameraStreams(r.Context(), cameraID)
	
	// Soft delete camera
	now := time.Now()
	camera.DeletedAt = &now
	camera.IsActive = false
	camera.UpdatedAt = now
	
	if err := h.updateCamera(r.Context(), camera); err != nil {
		slog.Error("failed to delete camera", "error", err)
		httputil.Error(w, "failed to delete camera", http.StatusInternalServerError)
		return
	}
	
	// Publish camera deleted event
	go h.publishCameraEvent(camera, "camera_deleted")
	
	httputil.JSON(w, map[string]string{"message": "camera deleted successfully"})
}

// Camera control

func (h *Handlers) TestCamera(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	cameraID := uuid.MustParse(vars["id"])
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	camera, err := h.getCamera(r.Context(), tenantID, cameraID)
	if err != nil {
		httputil.Error(w, "camera not found", http.StatusNotFound)
		return
	}
	
	// Test camera connection
	result := h.testCameraConnection(camera)
	
	httputil.JSON(w, map[string]interface{}{
		"camera_id": cameraID,
		"success":   result.Success,
		"message":   result.Message,
		"details":   result.Details,
		"tested_at": result.TestedAt,
	})
}

func (h *Handlers) StartCamera(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	cameraID := uuid.MustParse(vars["id"])
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	camera, err := h.getCamera(r.Context(), tenantID, cameraID)
	if err != nil {
		httputil.Error(w, "camera not found", http.StatusNotFound)
		return
	}
	
	if !camera.IsActive {
		httputil.Error(w, "camera is not active", http.StatusBadRequest)
		return
	}
	
	// Start camera connection
	if err := h.startCameraConnection(camera); err != nil {
		slog.Error("failed to start camera", "error", err)
		httputil.Error(w, "failed to start camera", http.StatusInternalServerError)
		return
	}
	
	// Update status
	camera.Status = CameraStatusOnline
	camera.LastSeen = timePtr(time.Now())
	camera.UpdatedAt = time.Now()
	h.updateCamera(r.Context(), camera)
	
	// Publish event
	go h.publishCameraEvent(camera, "camera_started")
	
	httputil.JSON(w, map[string]interface{}{
		"camera_id": cameraID,
		"status":    "started",
		"message":   "camera started successfully",
	})
}

func (h *Handlers) StopCamera(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	cameraID := uuid.MustParse(vars["id"])
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	camera, err := h.getCamera(r.Context(), tenantID, cameraID)
	if err != nil {
		httputil.Error(w, "camera not found", http.StatusNotFound)
		return
	}
	
	// Stop camera connection
	if err := h.stopCameraConnection(camera); err != nil {
		slog.Error("failed to stop camera", "error", err)
		httputil.Error(w, "failed to stop camera", http.StatusInternalServerError)
		return
	}
	
	// Update status
	camera.Status = CameraStatusOffline
	camera.IsRecording = false
	camera.IsStreamingLive = false
	camera.UpdatedAt = time.Now()
	h.updateCamera(r.Context(), camera)
	
	// Publish event
	go h.publishCameraEvent(camera, "camera_stopped")
	
	httputil.JSON(w, map[string]interface{}{
		"camera_id": cameraID,
		"status":    "stopped",
		"message":   "camera stopped successfully",
	})
}

func (h *Handlers) TakeSnapshot(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	cameraID := uuid.MustParse(vars["id"])
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	camera, err := h.getCamera(r.Context(), tenantID, cameraID)
	if err != nil {
		httputil.Error(w, "camera not found", http.StatusNotFound)
		return
	}
	
	if camera.Status != CameraStatusOnline {
		httputil.Error(w, "camera is not online", http.StatusBadRequest)
		return
	}
	
	// Capture snapshot
	snapshotPath, err := h.captureSnapshot(camera)
	if err != nil {
		slog.Error("failed to capture snapshot", "error", err)
		httputil.Error(w, "failed to capture snapshot", http.StatusInternalServerError)
		return
	}
	
	httputil.JSON(w, map[string]interface{}{
		"camera_id":     cameraID,
		"snapshot_path": snapshotPath,
		"captured_at":   time.Now(),
		"message":       "snapshot captured successfully",
	})
}

func (h *Handlers) PTZControl(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	cameraID := uuid.MustParse(vars["id"])
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	camera, err := h.getCamera(r.Context(), tenantID, cameraID)
	if err != nil {
		httputil.Error(w, "camera not found", http.StatusNotFound)
		return
	}
	
	if !camera.HasPTZSupport {
		httputil.Error(w, "camera does not support PTZ", http.StatusBadRequest)
		return
	}
	
	var req PTZControlRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	
	// Execute PTZ command
	if err := h.executePTZCommand(camera, &req); err != nil {
		slog.Error("failed to execute PTZ command", "error", err)
		httputil.Error(w, "failed to execute PTZ command", http.StatusInternalServerError)
		return
	}
	
	httputil.JSON(w, map[string]interface{}{
		"camera_id": cameraID,
		"action":    req.Action,
		"status":    "executed",
		"message":   "PTZ command executed successfully",
	})
}

// Live streaming

func (h *Handlers) GetStreamInfo(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	cameraID := uuid.MustParse(vars["id"])
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	camera, err := h.getCamera(r.Context(), tenantID, cameraID)
	if err != nil {
		httputil.Error(w, "camera not found", http.StatusNotFound)
		return
	}
	
	streamInfo := h.getStreamInfo(camera)
	httputil.JSON(w, streamInfo)
}

func (h *Handlers) StartStream(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	cameraID := uuid.MustParse(vars["id"])
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	var req struct {
		Type    string `json:"type"` // webrtc, hls, mjpeg
		Quality string `json:"quality"`
	}
	
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	
	camera, err := h.getCamera(r.Context(), tenantID, cameraID)
	if err != nil {
		httputil.Error(w, "camera not found", http.StatusNotFound)
		return
	}
	
	if camera.Status != CameraStatusOnline {
		httputil.Error(w, "camera is not online", http.StatusBadRequest)
		return
	}
	
	// Start live stream
	streamURL, err := h.startLiveStream(camera, req.Type, req.Quality)
	if err != nil {
		slog.Error("failed to start live stream", "error", err)
		httputil.Error(w, "failed to start live stream", http.StatusInternalServerError)
		return
	}
	
	// Update camera streaming status
	camera.IsStreamingLive = true
	camera.UpdatedAt = time.Now()
	h.updateCamera(r.Context(), camera)
	
	httputil.JSON(w, map[string]interface{}{
		"camera_id":  cameraID,
		"stream_url": streamURL,
		"type":       req.Type,
		"quality":    req.Quality,
		"status":     "started",
		"message":    "live stream started successfully",
	})
}

func (h *Handlers) StopStream(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	cameraID := uuid.MustParse(vars["id"])
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	camera, err := h.getCamera(r.Context(), tenantID, cameraID)
	if err != nil {
		httputil.Error(w, "camera not found", http.StatusNotFound)
		return
	}
	
	// Stop live streams
	h.stopLiveStream(camera)
	
	// Update camera streaming status
	camera.IsStreamingLive = false
	camera.UpdatedAt = time.Now()
	h.updateCamera(r.Context(), camera)
	
	httputil.JSON(w, map[string]interface{}{
		"camera_id": cameraID,
		"status":    "stopped",
		"message":   "live stream stopped successfully",
	})
}

// Recording management

func (h *Handlers) ListRecordings(w http.ResponseWriter, r *http.Request) {
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	query := RecordingListQuery{
		Limit:  50,
		Offset: 0,
	}
	
	// Parse query parameters
	if limit := r.URL.Query().Get("limit"); limit != "" {
		if l, err := strconv.Atoi(limit); err == nil && l > 0 && l <= 200 {
			query.Limit = l
		}
	}
	
	if offset := r.URL.Query().Get("offset"); offset != "" {
		if o, err := strconv.Atoi(offset); err == nil && o >= 0 {
			query.Offset = o
		}
	}
	
	if cameraID := r.URL.Query().Get("camera_id"); cameraID != "" {
		query.CameraID = &cameraID
	}
	
	if recordingType := r.URL.Query().Get("type"); recordingType != "" {
		query.Type = &recordingType
	}
	
	if status := r.URL.Query().Get("status"); status != "" {
		query.Status = &status
	}
	
	if startDate := r.URL.Query().Get("start_date"); startDate != "" {
		query.StartDate = &startDate
	}
	
	if endDate := r.URL.Query().Get("end_date"); endDate != "" {
		query.EndDate = &endDate
	}
	
	recordings, total, err := h.getRecordings(r.Context(), tenantID, query)
	if err != nil {
		slog.Error("failed to get recordings", "error", err)
		httputil.Error(w, "failed to get recordings", http.StatusInternalServerError)
		return
	}
	
	httputil.JSON(w, map[string]interface{}{
		"recordings": recordings,
		"total":      total,
		"limit":      query.Limit,
		"offset":     query.Offset,
	})
}

func (h *Handlers) StartRecording(w http.ResponseWriter, r *http.Request) {
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	createdBy := h.getUserID(r)
	
	var req StartRecordingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	
	camera, err := h.getCamera(r.Context(), tenantID, req.CameraID)
	if err != nil {
		httputil.Error(w, "camera not found", http.StatusNotFound)
		return
	}
	
	if camera.Status != CameraStatusOnline {
		httputil.Error(w, "camera is not online", http.StatusBadRequest)
		return
	}
	
	// Create recording record
	recording := &Recording{
		ID:          uuid.New(),
		TenantID:    tenantID,
		CameraID:    req.CameraID,
		CameraName:  camera.Name,
		Title:       req.Title,
		Description: req.Description,
		Type:        RecordingTypeManual,
		Status:      RecordingStatusRecording,
		StartTime:   time.Now(),
		Format:      "mp4",
		Resolution:  camera.Resolution,
		FPS:         camera.FPS,
		Quality:     getDefaultValue(req.Quality, camera.Quality),
		Metadata:    req.Metadata,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
		CreatedBy:   createdBy,
	}
	
	// Start recording process
	filePath, err := h.startRecording(camera, recording)
	if err != nil {
		slog.Error("failed to start recording", "error", err)
		httputil.Error(w, "failed to start recording", http.StatusInternalServerError)
		return
	}
	
	recording.FilePath = &filePath
	
	if err := h.createRecording(r.Context(), recording); err != nil {
		slog.Error("failed to create recording record", "error", err)
		httputil.Error(w, "failed to create recording record", http.StatusInternalServerError)
		return
	}
	
	// Update camera recording status
	camera.IsRecording = true
	camera.UpdatedAt = time.Now()
	h.updateCamera(r.Context(), camera)
	
	// Publish recording started event
	go h.publishRecordingEvent(recording, "recording_started")
	
	// Schedule recording stop if duration specified
	if req.Duration != nil {
		go h.scheduleRecordingStop(recording, *req.Duration)
	}
	
	httputil.JSON(w, recording)
}

func (h *Handlers) StopRecording(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	recordingID := uuid.MustParse(vars["id"])
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	recording, err := h.getRecording(r.Context(), tenantID, recordingID)
	if err != nil {
		httputil.Error(w, "recording not found", http.StatusNotFound)
		return
	}
	
	if recording.Status != RecordingStatusRecording {
		httputil.Error(w, "recording is not active", http.StatusBadRequest)
		return
	}
	
	// Stop recording process
	fileSize, duration, err := h.stopRecording(recording)
	if err != nil {
		slog.Error("failed to stop recording", "error", err)
		httputil.Error(w, "failed to stop recording", http.StatusInternalServerError)
		return
	}
	
	// Update recording record
	endTime := time.Now()
	recording.EndTime = &endTime
	recording.Duration = duration
	recording.FileSize = fileSize
	recording.Status = RecordingStatusCompleted
	recording.UpdatedAt = endTime
	
	if err := h.updateRecording(r.Context(), recording); err != nil {
		slog.Error("failed to update recording", "error", err)
		httputil.Error(w, "failed to update recording", http.StatusInternalServerError)
		return
	}
	
	// Update camera recording status if no other active recordings
	if !h.hasActiveRecordings(r.Context(), recording.CameraID) {
		camera, _ := h.getCamera(r.Context(), tenantID, recording.CameraID)
		if camera != nil {
			camera.IsRecording = false
			camera.UpdatedAt = time.Now()
			h.updateCamera(r.Context(), camera)
		}
	}
	
	// Publish recording stopped event
	go h.publishRecordingEvent(recording, "recording_stopped")
	
	httputil.JSON(w, recording)
}

// Video analytics and reports

func (h *Handlers) GetVideoAnalytics(w http.ResponseWriter, r *http.Request) {
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	analytics, err := h.generateVideoAnalytics(r.Context(), tenantID)
	if err != nil {
		slog.Error("failed to generate video analytics", "error", err)
		httputil.Error(w, "failed to generate video analytics", http.StatusInternalServerError)
		return
	}
	
	httputil.JSON(w, analytics)
}

func (h *Handlers) GetCameraAnalytics(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	cameraID := uuid.MustParse(vars["id"])
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	analytics, err := h.generateCameraAnalytics(r.Context(), tenantID, cameraID)
	if err != nil {
		slog.Error("failed to generate camera analytics", "error", err)
		httputil.Error(w, "failed to generate camera analytics", http.StatusInternalServerError)
		return
	}
	
	httputil.JSON(w, analytics)
}

func (h *Handlers) GetStorageStatus(w http.ResponseWriter, r *http.Request) {
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	status, err := h.getStorageStatus(r.Context(), tenantID)
	if err != nil {
		slog.Error("failed to get storage status", "error", err)
		httputil.Error(w, "failed to get storage status", http.StatusInternalServerError)
		return
	}
	
	httputil.JSON(w, status)
}

// Motion zones

func (h *Handlers) ListMotionZones(w http.ResponseWriter, r *http.Request) {
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	cameraIDStr := r.URL.Query().Get("camera_id")
	
	if cameraIDStr == "" {
		httputil.Error(w, "camera_id parameter required", http.StatusBadRequest)
		return
	}
	
	cameraID, err := uuid.Parse(cameraIDStr)
	if err != nil {
		httputil.Error(w, "invalid camera_id", http.StatusBadRequest)
		return
	}
	
	zones, err := h.getMotionZones(r.Context(), tenantID, cameraID)
	if err != nil {
		slog.Error("failed to get motion zones", "error", err)
		httputil.Error(w, "failed to get motion zones", http.StatusInternalServerError)
		return
	}
	
	httputil.JSON(w, map[string]interface{}{
		"motion_zones": zones,
		"camera_id":    cameraID,
	})
}

func (h *Handlers) CreateMotionZone(w http.ResponseWriter, r *http.Request) {
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	var req CreateMotionZoneRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	
	zone := &MotionZone{
		ID:          uuid.New(),
		TenantID:    tenantID,
		CameraID:    req.CameraID,
		Name:        req.Name,
		Description: req.Description,
		Polygon:     req.Polygon,
		Sensitivity: req.Sensitivity,
		IsActive:    true,
		IsArmed:     true,
		Actions:     req.Actions,
		Schedule:    req.Schedule,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}
	
	if err := h.createMotionZone(r.Context(), zone); err != nil {
		slog.Error("failed to create motion zone", "error", err)
		httputil.Error(w, "failed to create motion zone", http.StatusInternalServerError)
		return
	}
	
	httputil.JSON(w, zone)
}

// Video events

func (h *Handlers) ListVideoEvents(w http.ResponseWriter, r *http.Request) {
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	query := VideoEventsQuery{
		Limit:  50,
		Offset: 0,
	}
	
	// Parse query parameters
	if limit := r.URL.Query().Get("limit"); limit != "" {
		if l, err := strconv.Atoi(limit); err == nil && l > 0 && l <= 200 {
			query.Limit = l
		}
	}
	
	if offset := r.URL.Query().Get("offset"); offset != "" {
		if o, err := strconv.Atoi(offset); err == nil && o >= 0 {
			query.Offset = o
		}
	}
	
	// Add other query filters...
	if cameraID := r.URL.Query().Get("camera_id"); cameraID != "" {
		query.CameraID = &cameraID
	}
	
	if eventType := r.URL.Query().Get("type"); eventType != "" {
		query.Type = &eventType
	}
	
	if severity := r.URL.Query().Get("severity"); severity != "" {
		query.Severity = &severity
	}
	
	events, total, err := h.getVideoEvents(r.Context(), tenantID, query)
	if err != nil {
		slog.Error("failed to get video events", "error", err)
		httputil.Error(w, "failed to get video events", http.StatusInternalServerError)
		return
	}
	
	httputil.JSON(w, map[string]interface{}{
		"events": events,
		"total":  total,
		"limit":  query.Limit,
		"offset": query.Offset,
	})
}

// Settings management

func (h *Handlers) GetVideoSettings(w http.ResponseWriter, r *http.Request) {
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	settings, err := h.getVideoSettings(r.Context(), tenantID)
	if err != nil {
		slog.Error("failed to get video settings", "error", err)
		httputil.Error(w, "failed to get video settings", http.StatusInternalServerError)
		return
	}
	
	httputil.JSON(w, settings)
}

func (h *Handlers) UpdateVideoSettings(w http.ResponseWriter, r *http.Request) {
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	var req map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	
	// Update video settings logic would go here
	// For now, return the current settings
	settings, err := h.getVideoSettings(r.Context(), tenantID)
	if err != nil {
		httputil.Error(w, "failed to get video settings", http.StatusInternalServerError)
		return
	}
	
	httputil.JSON(w, settings)
}

// Streaming endpoints

func (h *Handlers) WebRTCOffer(w http.ResponseWriter, r *http.Request) {
	// WebRTC signaling endpoint
	httputil.JSON(w, map[string]string{"message": "WebRTC offer handling not yet implemented"})
}

func (h *Handlers) WebRTCAnswer(w http.ResponseWriter, r *http.Request) {
	// WebRTC signaling endpoint  
	httputil.JSON(w, map[string]string{"message": "WebRTC answer handling not yet implemented"})
}

func (h *Handlers) WebRTCICE(w http.ResponseWriter, r *http.Request) {
	// WebRTC ICE candidate endpoint
	httputil.JSON(w, map[string]string{"message": "WebRTC ICE handling not yet implemented"})
}

func (h *Handlers) HLSPlaylist(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	cameraID := vars["camera_id"]
	
	// Serve HLS playlist file
	playlistPath := fmt.Sprintf("/tmp/dm3-video/streams/%s/playlist.m3u8", cameraID)
	http.ServeFile(w, r, playlistPath)
}

func (h *Handlers) HLSSegment(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	cameraID := vars["camera_id"]
	segment := vars["segment"]
	
	// Serve HLS segment file
	segmentPath := fmt.Sprintf("/tmp/dm3-video/streams/%s/%s.ts", cameraID, segment)
	http.ServeFile(w, r, segmentPath)
}

func (h *Handlers) LiveThumbnail(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	cameraID := vars["camera_id"]
	
	// Serve live thumbnail
	thumbnailPath := fmt.Sprintf("/tmp/dm3-video/thumbnails/%s/live.jpg", cameraID)
	http.ServeFile(w, r, thumbnailPath)
}

func (h *Handlers) MJPEGStream(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	cameraID := vars["camera_id"]
	
	// Serve MJPEG stream
	streamPath := fmt.Sprintf("/tmp/dm3-video/streams/%s/stream.mjpeg", cameraID)
	http.ServeFile(w, r, streamPath)
}

// Placeholder analytics methods

func (h *Handlers) generateVideoAnalytics(ctx context.Context, tenantID uuid.UUID) (*VideoAnalyticsResponse, error) {
	// Placeholder analytics
	return &VideoAnalyticsResponse{
		TenantID:             tenantID,
		TotalCameras:         0,
		OnlineCameras:        0,
		OfflineCameras:       0,
		RecordingCameras:     0,
		StreamingCameras:     0,
		TotalRecordings:      0,
		TotalEvents:          0,
		UnacknowledgedEvents: 0,
		StorageUsedGB:        0,
		StorageQuotaGB:       1000,
		StorageUsagePercent:  0,
		ByStatus:             make(map[string]int64),
		ByType:               make(map[string]int64),
		ByLocation:           make(map[string]int64),
		EventsByType:         make(map[string]int64),
		EventsBySeverity:     make(map[string]int64),
		TopCamerasByEvents:   []CameraEventStats{},
	}, nil
}

func (h *Handlers) generateCameraAnalytics(ctx context.Context, tenantID, cameraID uuid.UUID) (*CameraAnalyticsResponse, error) {
	camera, err := h.getCamera(ctx, tenantID, cameraID)
	if err != nil {
		return nil, err
	}
	
	return &CameraAnalyticsResponse{
		CameraID:          cameraID,
		CameraName:        camera.Name,
		Status:            camera.Status,
		UptimePercent:     95.5,
		TotalEvents:       0,
		MotionEvents:      0,
		TotalRecordings:   0,
		StorageUsedMB:     0,
		AvgRecordingSize:  0,
		HourlyEventStats:  make(map[string]int64),
		DailyEventStats:   make(map[string]int64),
	}, nil
}

func (h *Handlers) getStorageStatus(ctx context.Context, tenantID uuid.UUID) (*StorageStatusResponse, error) {
	return &StorageStatusResponse{
		TotalSpaceGB:    1000,
		UsedSpaceGB:     0,
		FreeSpaceGB:     1000,
		UsagePercent:    0,
		RecordingCount:  0,
		ByCameraUsage:   []CameraStorageUsage{},
		ByRetentionPolicy: make(map[string]StorageBucket),
	}, nil
}

// Missing handlers

func (h *Handlers) GetVideoEvent(w http.ResponseWriter, r *http.Request) {
	httputil.JSON(w, map[string]string{"message": "Get video event not yet implemented"})
}

func (h *Handlers) AcknowledgeEvent(w http.ResponseWriter, r *http.Request) {
	httputil.JSON(w, map[string]string{"message": "Acknowledge event not yet implemented"})
}

func (h *Handlers) UpdateMotionZone(w http.ResponseWriter, r *http.Request) {
	httputil.JSON(w, map[string]string{"message": "Update motion zone not yet implemented"})
}

func (h *Handlers) DeleteMotionZone(w http.ResponseWriter, r *http.Request) {
	httputil.JSON(w, map[string]string{"message": "Delete motion zone not yet implemented"})
}

func (h *Handlers) GetRecording(w http.ResponseWriter, r *http.Request) {
	httputil.JSON(w, map[string]string{"message": "Get recording not yet implemented"})
}

func (h *Handlers) DeleteRecording(w http.ResponseWriter, r *http.Request) {
	httputil.JSON(w, map[string]string{"message": "Delete recording not yet implemented"})
}

func (h *Handlers) DownloadRecording(w http.ResponseWriter, r *http.Request) {
	httputil.JSON(w, map[string]string{"message": "Download recording not yet implemented"})
}

func (h *Handlers) RestartCamera(w http.ResponseWriter, r *http.Request) {
	httputil.JSON(w, map[string]string{"message": "Restart camera not yet implemented"})
}

func (h *Handlers) CleanupStorage(w http.ResponseWriter, r *http.Request) {
	httputil.JSON(w, map[string]string{"message": "Cleanup storage not yet implemented"})
}

// Helper functions

func (h *Handlers) getUserID(r *http.Request) uuid.UUID {
	userIDStr := r.Header.Get("X-User-ID")
	if userIDStr == "" {
		return uuid.Nil
	}
	
	if userID, err := uuid.Parse(userIDStr); err == nil {
		return userID
	}
	
	return uuid.Nil
}

func getDefaultValue(value, defaultValue string) string {
	if value == "" {
		return defaultValue
	}
	return value
}

func getDefaultInt(value, defaultValue int) int {
	if value == 0 {
		return defaultValue
	}
	return value
}

func getDefaultInt64(value, defaultValue int64) int64 {
	if value == 0 {
		return defaultValue
	}
	return value
}

func timePtr(t time.Time) *time.Time {
	return &t
}

// Cleanup gracefully shuts down video resources
func (h *Handlers) Cleanup() {
	if h.streaming != nil {
		h.streaming.StopAll()
	}
	slog.Info("video service cleanup completed")
}