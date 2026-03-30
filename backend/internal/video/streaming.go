package video

import (
	"context"
	"fmt"
	"log/slog"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"time"

	"github.com/google/uuid"
)

// StreamingManager manages video streams and recording processes
type StreamingManager struct {
	streams    map[uuid.UUID]*StreamSession
	recordings map[uuid.UUID]*RecordingSession
	mutex      sync.RWMutex
}

// StreamSession represents an active video stream
type StreamSession struct {
	CameraID     uuid.UUID
	Type         string // webrtc, hls, mjpeg
	Quality      string
	StartTime    time.Time
	ViewerCount  int
	Process      *exec.Cmd
	StreamURL    string
	IsActive     bool
	LastViewed   time.Time
}

// RecordingSession represents an active recording process
type RecordingSession struct {
	RecordingID  uuid.UUID
	CameraID     uuid.UUID
	Process      *exec.Cmd
	FilePath     string
	StartTime    time.Time
	IsActive     bool
	FileSize     int64
}

// TestResult represents camera connection test result
type TestResult struct {
	Success   bool                   `json:"success"`
	Message   string                 `json:"message"`
	Details   map[string]interface{} `json:"details,omitempty"`
	TestedAt  time.Time              `json:"tested_at"`
}

func NewStreamingManager() *StreamingManager {
	return &StreamingManager{
		streams:    make(map[uuid.UUID]*StreamSession),
		recordings: make(map[uuid.UUID]*RecordingSession),
	}
}

// Camera connection management

func (h *Handlers) testCameraConnection(camera *Camera) *TestResult {
	result := &TestResult{
		TestedAt: time.Now(),
		Details:  make(map[string]interface{}),
	}

	// Parse RTSP URL
	rtspURL, err := url.Parse(camera.RTSPUrl)
	if err != nil {
		result.Success = false
		result.Message = fmt.Sprintf("Invalid RTSP URL: %v", err)
		return result
	}

	// Add authentication if provided
	if camera.RTSPUsername != nil && camera.RTSPPassword != nil {
		rtspURL.User = url.UserPassword(*camera.RTSPUsername, *camera.RTSPPassword)
	}

	// Test connection using FFprobe
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams", rtspURL.String())
	output, err := cmd.Output()

	if err != nil {
		result.Success = false
		result.Message = fmt.Sprintf("Failed to connect to camera: %v", err)
		result.Details["error"] = err.Error()
		
		// Update camera status
		camera.Status = CameraStatusError
		camera.LastError = &result.Message
		h.updateCamera(context.Background(), camera)
		return result
	}

	result.Success = true
	result.Message = "Camera connection successful"
	result.Details["response_size"] = len(output)
	result.Details["rtsp_url"] = camera.RTSPUrl

	// Update camera status
	camera.Status = CameraStatusOnline
	camera.LastSeen = &result.TestedAt
	camera.LastError = nil
	h.updateCamera(context.Background(), camera)

	return result
}

func (h *Handlers) startCameraConnection(camera *Camera) error {
	// Test connection first
	result := h.testCameraConnection(camera)
	if !result.Success {
		return fmt.Errorf("camera connection test failed: %s", result.Message)
	}

	slog.Info("camera connection started", "camera_id", camera.ID, "name", camera.Name)
	return nil
}

func (h *Handlers) stopCameraConnection(camera *Camera) error {
	// Stop all streams for this camera
	h.stopCameraStreams(context.Background(), camera.ID)
	
	// Stop all recordings for this camera
	h.stopCameraRecordings(context.Background(), camera.ID)
	
	slog.Info("camera connection stopped", "camera_id", camera.ID, "name", camera.Name)
	return nil
}

// Live streaming

func (h *Handlers) getStreamInfo(camera *Camera) *StreamInfoResponse {
	h.streaming.mutex.RLock()
	session, exists := h.streaming.streams[camera.ID]
	h.streaming.mutex.RUnlock()

	response := &StreamInfoResponse{
		CameraID:    camera.ID,
		IsActive:    exists && session.IsActive,
		Quality:     camera.Quality,
		Resolution:  camera.Resolution,
		FPS:         camera.FPS,
		ViewerCount: 0,
	}

	if exists && session.IsActive {
		response.ViewerCount = session.ViewerCount
		response.StreamURL = &session.StreamURL

		// Generate URLs for different stream types
		baseURL := fmt.Sprintf("/api/v1/public/video")
		
		webrtcURL := fmt.Sprintf("%s/webrtc/%s", baseURL, camera.ID)
		response.WebRTCURL = &webrtcURL

		hlsURL := fmt.Sprintf("%s/hls/%s/playlist.m3u8", baseURL, camera.ID)
		response.HLSURL = &hlsURL

		mjpegURL := fmt.Sprintf("%s/mjpeg/%s", baseURL, camera.ID)
		response.MJPEGURL = &mjpegURL

		thumbnailURL := fmt.Sprintf("%s/thumbnails/%s/live.jpg", baseURL, camera.ID)
		response.ThumbnailURL = &thumbnailURL
	}

	return response
}

func (h *Handlers) startLiveStream(camera *Camera, streamType, quality string) (string, error) {
	h.streaming.mutex.Lock()
	defer h.streaming.mutex.Unlock()

	// Check if stream already exists
	if session, exists := h.streaming.streams[camera.ID]; exists && session.IsActive {
		session.ViewerCount++
		session.LastViewed = time.Now()
		return session.StreamURL, nil
	}

	// Create stream directory
	streamDir := fmt.Sprintf("/tmp/dm3-video/streams/%s", camera.ID)
	if err := os.MkdirAll(streamDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create stream directory: %v", err)
	}

	// Build RTSP URL with auth
	rtspURL, err := url.Parse(camera.RTSPUrl)
	if err != nil {
		return "", fmt.Errorf("invalid RTSP URL: %v", err)
	}

	if camera.RTSPUsername != nil && camera.RTSPPassword != nil {
		rtspURL.User = url.UserPassword(*camera.RTSPUsername, *camera.RTSPPassword)
	}

	var cmd *exec.Cmd
	var streamURL string

	switch streamType {
	case StreamTypeHLS:
		// HLS streaming
		playlistPath := filepath.Join(streamDir, "playlist.m3u8")
		segmentPattern := filepath.Join(streamDir, "segment%d.ts")
		
		args := []string{
			"-i", rtspURL.String(),
			"-c:v", "libx264",
			"-preset", "veryfast",
			"-tune", "zerolatency",
			"-c:a", "aac",
			"-f", "hls",
			"-hls_time", "2",
			"-hls_list_size", "10",
			"-hls_flags", "delete_segments",
			playlistPath,
		}
		
		// Adjust quality
		switch quality {
		case QualityLow:
			args = append(args[:4], append([]string{"-s", "640x480", "-b:v", "500k"}, args[4:]...)...)
		case QualityMedium:
			args = append(args[:4], append([]string{"-s", "1280x720", "-b:v", "1500k"}, args[4:]...)...)
		case QualityHigh:
			args = append(args[:4], append([]string{"-s", "1920x1080", "-b:v", "3000k"}, args[4:]...)...)
		}
		
		cmd = exec.Command("ffmpeg", args...)
		streamURL = fmt.Sprintf("/api/v1/public/video/hls/%s/playlist.m3u8", camera.ID)

	case StreamTypeMJPEG:
		// MJPEG streaming
		mjpegPath := filepath.Join(streamDir, "stream.mjpeg")
		
		args := []string{
			"-i", rtspURL.String(),
			"-vcodec", "mjpeg",
			"-q:v", "3",
			"-r", "10", // 10 FPS for MJPEG
			"-f", "mjpeg",
			mjpegPath,
		}
		
		cmd = exec.Command("ffmpeg", args...)
		streamURL = fmt.Sprintf("/api/v1/public/video/mjpeg/%s", camera.ID)

	default:
		return "", fmt.Errorf("unsupported stream type: %s", streamType)
	}

	// Start FFmpeg process
	if err := cmd.Start(); err != nil {
		return "", fmt.Errorf("failed to start stream: %v", err)
	}

	// Create stream session
	session := &StreamSession{
		CameraID:    camera.ID,
		Type:        streamType,
		Quality:     quality,
		StartTime:   time.Now(),
		ViewerCount: 1,
		Process:     cmd,
		StreamURL:   streamURL,
		IsActive:    true,
		LastViewed:  time.Now(),
	}

	h.streaming.streams[camera.ID] = session

	// Monitor process
	go h.monitorStreamProcess(session)

	slog.Info("live stream started", "camera_id", camera.ID, "type", streamType, "quality", quality)
	return streamURL, nil
}

func (h *Handlers) stopLiveStream(camera *Camera) {
	h.streaming.mutex.Lock()
	defer h.streaming.mutex.Unlock()

	if session, exists := h.streaming.streams[camera.ID]; exists {
		if session.Process != nil && session.Process.Process != nil {
			session.Process.Process.Kill()
		}
		session.IsActive = false
		delete(h.streaming.streams, camera.ID)

		slog.Info("live stream stopped", "camera_id", camera.ID)
	}
}

func (h *Handlers) stopCameraStreams(ctx context.Context, cameraID uuid.UUID) {
	h.streaming.mutex.Lock()
	defer h.streaming.mutex.Unlock()

	if session, exists := h.streaming.streams[cameraID]; exists {
		if session.Process != nil && session.Process.Process != nil {
			session.Process.Process.Kill()
		}
		session.IsActive = false
		delete(h.streaming.streams, cameraID)
	}
}

// Recording management

func (h *Handlers) startRecording(camera *Camera, recording *Recording) (string, error) {
	// Create recording directory
	recordingDir := fmt.Sprintf("/var/lib/dm3/video/recordings/%s", camera.TenantID)
	if err := os.MkdirAll(recordingDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create recording directory: %v", err)
	}

	// Generate filename
	filename := fmt.Sprintf("%s-%s-%s.mp4", 
		camera.Name, 
		recording.ID.String()[:8], 
		time.Now().Format("20060102-150405"))
	filePath := filepath.Join(recordingDir, filename)

	// Build RTSP URL with auth
	rtspURL, err := url.Parse(camera.RTSPUrl)
	if err != nil {
		return "", fmt.Errorf("invalid RTSP URL: %v", err)
	}

	if camera.RTSPUsername != nil && camera.RTSPPassword != nil {
		rtspURL.User = url.UserPassword(*camera.RTSPUsername, *camera.RTSPPassword)
	}

	// Build FFmpeg command
	args := []string{
		"-i", rtspURL.String(),
		"-c:v", "libx264",
		"-preset", "medium",
		"-c:a", "aac",
		"-movflags", "+faststart",
		filePath,
	}

	// Adjust quality settings
	switch recording.Quality {
	case QualityLow:
		args = append(args[:4], append([]string{"-s", "640x480", "-b:v", "500k"}, args[4:]...)...)
	case QualityMedium:
		args = append(args[:4], append([]string{"-s", "1280x720", "-b:v", "1500k"}, args[4:]...)...)
	case QualityHigh:
		args = append(args[:4], append([]string{"-s", "1920x1080", "-b:v", "3000k"}, args[4:]...)...)
	}

	cmd := exec.Command("ffmpeg", args...)

	// Start recording process
	if err := cmd.Start(); err != nil {
		return "", fmt.Errorf("failed to start recording: %v", err)
	}

	// Store recording session
	h.streaming.mutex.Lock()
	h.streaming.recordings[recording.ID] = &RecordingSession{
		RecordingID: recording.ID,
		CameraID:    camera.ID,
		Process:     cmd,
		FilePath:    filePath,
		StartTime:   time.Now(),
		IsActive:    true,
	}
	h.streaming.mutex.Unlock()

	// Monitor recording process
	go h.monitorRecordingProcess(recording.ID)

	slog.Info("recording started", "camera_id", camera.ID, "recording_id", recording.ID, "file_path", filePath)
	return filePath, nil
}

func (h *Handlers) stopRecording(recording *Recording) (int64, int64, error) {
	h.streaming.mutex.Lock()
	session, exists := h.streaming.recordings[recording.ID]
	if !exists {
		h.streaming.mutex.Unlock()
		return 0, 0, fmt.Errorf("recording session not found")
	}
	h.streaming.mutex.Unlock()

	// Stop FFmpeg process
	if session.Process != nil && session.Process.Process != nil {
		session.Process.Process.Kill()
		session.Process.Wait() // Wait for process to finish
	}

	// Get file information
	var fileSize int64
	var duration int64

	if stat, err := os.Stat(session.FilePath); err == nil {
		fileSize = stat.Size()
		duration = int64(time.Since(session.StartTime).Seconds())
	}

	// Remove from active recordings
	h.streaming.mutex.Lock()
	session.IsActive = false
	delete(h.streaming.recordings, recording.ID)
	h.streaming.mutex.Unlock()

	slog.Info("recording stopped", "recording_id", recording.ID, "duration", duration, "file_size", fileSize)
	return fileSize, duration, nil
}

func (h *Handlers) stopCameraRecordings(ctx context.Context, cameraID uuid.UUID) {
	h.streaming.mutex.Lock()
	defer h.streaming.mutex.Unlock()

	for recordingID, session := range h.streaming.recordings {
		if session.CameraID == cameraID && session.IsActive {
			if session.Process != nil && session.Process.Process != nil {
				session.Process.Process.Kill()
			}
			session.IsActive = false
			delete(h.streaming.recordings, recordingID)
		}
	}
}

func (h *Handlers) scheduleRecordingStop(recording *Recording, durationSeconds int64) {
	time.Sleep(time.Duration(durationSeconds) * time.Second)
	
	// Check if recording is still active
	h.streaming.mutex.RLock()
	session, exists := h.streaming.recordings[recording.ID]
	h.streaming.mutex.RUnlock()
	
	if exists && session.IsActive {
		h.stopRecording(recording)
		
		// Update recording in database
		ctx := context.Background()
		if updatedRecording, err := h.getRecording(ctx, recording.TenantID, recording.ID); err == nil {
			endTime := time.Now()
			updatedRecording.EndTime = &endTime
			updatedRecording.Status = RecordingStatusCompleted
			updatedRecording.UpdatedAt = endTime
			h.updateRecording(ctx, updatedRecording)
		}
	}
}

// Snapshot capture

func (h *Handlers) captureSnapshot(camera *Camera) (string, error) {
	// Create snapshot directory
	snapshotDir := fmt.Sprintf("/var/lib/dm3/video/snapshots/%s", camera.TenantID)
	if err := os.MkdirAll(snapshotDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create snapshot directory: %v", err)
	}

	// Generate filename
	filename := fmt.Sprintf("%s-snapshot-%s.jpg", 
		camera.Name, 
		time.Now().Format("20060102-150405"))
	filePath := filepath.Join(snapshotDir, filename)

	// Build RTSP URL with auth
	rtspURL, err := url.Parse(camera.RTSPUrl)
	if err != nil {
		return "", fmt.Errorf("invalid RTSP URL: %v", err)
	}

	if camera.RTSPUsername != nil && camera.RTSPPassword != nil {
		rtspURL.User = url.UserPassword(*camera.RTSPUsername, *camera.RTSPPassword)
	}

	// Capture single frame using FFmpeg
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "ffmpeg", 
		"-i", rtspURL.String(),
		"-vframes", "1",
		"-q:v", "2",
		"-y", // Overwrite output file
		filePath)

	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("failed to capture snapshot: %v", err)
	}

	slog.Info("snapshot captured", "camera_id", camera.ID, "file_path", filePath)
	return filePath, nil
}

// PTZ control

func (h *Handlers) executePTZCommand(camera *Camera, req *PTZControlRequest) error {
	// This would implement actual PTZ control via camera API
	// For now, just log the command
	
	slog.Info("PTZ command executed", 
		"camera_id", camera.ID, 
		"action", req.Action,
		"speed", req.Speed,
		"preset", req.Preset)
	
	// TODO: Implement actual PTZ control based on camera brand/model
	// - ONVIF PTZ commands
	// - Vendor-specific API calls
	// - Serial/RS-485 control
	
	return nil
}

// Process monitoring

func (h *Handlers) monitorStreamProcess(session *StreamSession) {
	if session.Process == nil {
		return
	}

	// Wait for process to finish
	err := session.Process.Wait()
	
	h.streaming.mutex.Lock()
	session.IsActive = false
	delete(h.streaming.streams, session.CameraID)
	h.streaming.mutex.Unlock()

	if err != nil {
		slog.Error("stream process died", "camera_id", session.CameraID, "error", err)
	} else {
		slog.Info("stream process finished", "camera_id", session.CameraID)
	}
}

func (h *Handlers) monitorRecordingProcess(recordingID uuid.UUID) {
	h.streaming.mutex.RLock()
	session, exists := h.streaming.recordings[recordingID]
	h.streaming.mutex.RUnlock()

	if !exists || session.Process == nil {
		return
	}

	// Wait for process to finish
	err := session.Process.Wait()

	h.streaming.mutex.Lock()
	session.IsActive = false
	delete(h.streaming.recordings, recordingID)
	h.streaming.mutex.Unlock()

	if err != nil {
		slog.Error("recording process died", "recording_id", recordingID, "error", err)
	} else {
		slog.Info("recording process finished", "recording_id", recordingID)
	}
}

// Cleanup

func (h *Handlers) StopAll() {
	h.streaming.mutex.Lock()
	defer h.streaming.mutex.Unlock()

	// Stop all streams
	for cameraID, session := range h.streaming.streams {
		if session.Process != nil && session.Process.Process != nil {
			session.Process.Process.Kill()
		}
		delete(h.streaming.streams, cameraID)
	}

	// Stop all recordings
	for recordingID, session := range h.streaming.recordings {
		if session.Process != nil && session.Process.Process != nil {
			session.Process.Process.Kill()
		}
		delete(h.streaming.recordings, recordingID)
	}

	slog.Info("all video streams and recordings stopped")
}