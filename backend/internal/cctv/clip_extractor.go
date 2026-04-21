package cctv

import (
	"bytes"
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"time"

	"github.com/duali/dm3-backend/pkg/db"
	"github.com/duali/dm3-backend/pkg/objectstore"
)

// ClipExtractor records video clips from camera RTSP streams when access events fire.
// After the AccessEventConsumer creates a placeholder event_clips row, it calls
// ExtractClip to asynchronously record the actual video, upload it to MinIO, and
// update the row with real metadata.
type ClipExtractor struct {
	db          *db.DB
	objectStore objectstore.Store
	cipher      *CredentialCipher
}

// NewClipExtractor constructs a ClipExtractor.
// cipher may be nil — ExtractClip will skip extraction (log a warning) if it
// needs to decrypt a password but no cipher is available.
func NewClipExtractor(database *db.DB, objStore objectstore.Store, cipher *CredentialCipher) *ClipExtractor {
	return &ClipExtractor{
		db:          database,
		objectStore: objStore,
		cipher:      cipher,
	}
}

// cameraRTSPInfo holds the RTSP connection details fetched from dm3_cctv.cameras.
type cameraRTSPInfo struct {
	RTSPUrl        string
	RTSPUsername   *string
	RTSPPasswordEnc []byte // AES-encrypted; nil when no auth
	PreRollSec     int
	PostRollSec    int
}

// ExtractClip records pre_roll + post_roll seconds of video from a camera's RTSP
// stream, uploads the resulting MP4 to MinIO, and updates the event_clips row.
//
// This method runs asynchronously — it is designed to be called in a goroutine
// after the placeholder clip row has been inserted. It never returns an error
// to the caller; failures are logged and recorded in the DB row.
func (e *ClipExtractor) ExtractClip(ctx context.Context, clipID, tenantID, cameraDeviceID string) {
	log := slog.With("clip_id", clipID, "tenant_id", tenantID, "camera_device_id", cameraDeviceID)

	// Guard: object store is required for upload.
	if e.objectStore == nil {
		log.Warn("cctv: clip extractor skipped — object store not configured")
		return
	}

	// 1. Query camera RTSP URL + credentials + pre/post roll from DB.
	info, err := e.fetchCameraRTSPInfo(ctx, tenantID, cameraDeviceID)
	if err != nil {
		log.Error("cctv: clip extractor failed to fetch camera info", "error", err)
		e.markClipError(ctx, clipID, fmt.Sprintf("fetch camera info: %v", err))
		return
	}

	if info.RTSPUrl == "" {
		log.Warn("cctv: clip extractor skipped — camera has no RTSP URL")
		e.markClipError(ctx, clipID, "camera has no rtsp_url")
		return
	}

	// 2. Decrypt RTSP password if present.
	var password string
	if len(info.RTSPPasswordEnc) > 0 {
		if e.cipher == nil {
			log.Warn("cctv: clip extractor skipped — credential cipher not configured but camera has encrypted password")
			e.markClipError(ctx, clipID, "credential cipher not configured")
			return
		}
		password, err = e.cipher.Decrypt(info.RTSPPasswordEnc)
		if err != nil {
			log.Error("cctv: clip extractor failed to decrypt RTSP password", "error", err)
			e.markClipError(ctx, clipID, fmt.Sprintf("decrypt password: %v", err))
			return
		}
	}

	// 3. Build RTSP URL with credentials.
	var username string
	if info.RTSPUsername != nil {
		username = *info.RTSPUsername
	}
	authedURL := composeRTSPURLWithAuth(info.RTSPUrl, username, password)

	// 4. Calculate recording duration.
	duration := info.PreRollSec + info.PostRollSec
	if duration <= 0 {
		duration = 30 // sensible default: 30 seconds
	}

	// 5. Run ffmpeg to record the clip.
	tmpDir := os.TempDir()
	tmpFile := filepath.Join(tmpDir, fmt.Sprintf("cctv-clip-%s.mp4", clipID))
	defer os.Remove(tmpFile) // cleanup regardless of outcome

	// Give ffmpeg the recording duration plus a generous timeout for connection
	// setup and muxer finalization (2x duration + 30s).
	ffmpegTimeout := time.Duration(duration*2+30) * time.Second
	ffmpegCtx, ffmpegCancel := context.WithTimeout(ctx, ffmpegTimeout)
	defer ffmpegCancel()

	//nolint:gosec // authedURL contains user-supplied RTSP URL; validated at camera creation time
	cmd := exec.CommandContext(ffmpegCtx, "ffmpeg",
		"-rtsp_transport", "tcp",
		"-i", authedURL,
		"-t", fmt.Sprintf("%d", duration),
		"-c:v", "copy",
		"-an", // skip audio — pcm_alaw not supported in MP4 container
		"-movflags", "+faststart",
		"-y", // overwrite output file
		tmpFile,
	)
	var ffmpegStderr bytes.Buffer
	cmd.Stderr = &ffmpegStderr

	log.Info("cctv: clip extractor starting ffmpeg",
		"duration_sec", duration,
		"rtsp_url", redactRTSPCredentials(authedURL),
	)

	if err := cmd.Run(); err != nil {
		errMsg := ffmpegStderr.String()
		if len(errMsg) > 500 {
			errMsg = errMsg[:500]
		}
		log.Error("cctv: ffmpeg clip extraction failed",
			"error", err,
			"stderr", errMsg,
		)
		e.markClipError(ctx, clipID, fmt.Sprintf("ffmpeg: %v — %s", err, errMsg))
		return
	}

	// 6. Read the temp file and upload to MinIO.
	fileInfo, err := os.Stat(tmpFile)
	if err != nil {
		log.Error("cctv: clip extractor failed to stat temp file", "error", err)
		e.markClipError(ctx, clipID, fmt.Sprintf("stat temp file: %v", err))
		return
	}

	objectKey := fmt.Sprintf("cctv-clips/%s/%s.mp4", tenantID, clipID)

	f, err := os.Open(tmpFile)
	if err != nil {
		log.Error("cctv: clip extractor failed to open temp file", "error", err)
		e.markClipError(ctx, clipID, fmt.Sprintf("open temp file: %v", err))
		return
	}
	defer f.Close()

	uploadCtx, uploadCancel := context.WithTimeout(ctx, 2*time.Minute)
	defer uploadCancel()

	if err := e.objectStore.PutObject(uploadCtx, objectKey, f, fileInfo.Size(), "video/mp4"); err != nil {
		log.Error("cctv: clip extractor failed to upload to object store", "error", err)
		e.markClipError(ctx, clipID, fmt.Sprintf("upload: %v", err))
		return
	}

	// 7. Update the event_clips row with actual metadata.
	durationMs := duration * 1000
	endedAt := time.Now()

	updateCtx, updateCancel := context.WithTimeout(ctx, 5*time.Second)
	defer updateCancel()

	_, err = e.db.Pool.Exec(updateCtx,
		`UPDATE dm3_cctv.event_clips
		 SET object_key = $1, duration_ms = $2, ended_at = $3, updated_at = now()
		 WHERE id = $4::uuid`,
		objectKey, durationMs, endedAt, clipID,
	)
	if err != nil {
		log.Error("cctv: clip extractor failed to update event_clips row", "error", err)
		return
	}

	log.Info("cctv: clip extraction complete",
		"object_key", objectKey,
		"duration_sec", duration,
		"file_size", fileInfo.Size(),
	)
}

// fetchCameraRTSPInfo loads the RTSP connection details from dm3_cctv.cameras.
func (e *ClipExtractor) fetchCameraRTSPInfo(ctx context.Context, tenantID, cameraDeviceID string) (cameraRTSPInfo, error) {
	queryCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	var info cameraRTSPInfo
	err := e.db.Pool.QueryRow(queryCtx,
		`SELECT c.rtsp_url, c.rtsp_username, c.rtsp_password_enc, c.pre_roll_sec, c.post_roll_sec
		 FROM dm3_cctv.cameras c
		 WHERE c.device_id = $1::uuid AND c.tenant_id = $2::uuid`,
		cameraDeviceID, tenantID,
	).Scan(&info.RTSPUrl, &info.RTSPUsername, &info.RTSPPasswordEnc, &info.PreRollSec, &info.PostRollSec)
	if err != nil {
		return cameraRTSPInfo{}, fmt.Errorf("query camera RTSP info: %w", err)
	}
	return info, nil
}

// markClipError records a clip extraction failure in the DB so operators can
// diagnose issues without trawling logs. The clip row keeps its placeholder
// state but gains an error_message.
func (e *ClipExtractor) markClipError(ctx context.Context, clipID, errMsg string) {
	updateCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	// Truncate very long error messages to avoid blowing column limits.
	if len(errMsg) > 1000 {
		errMsg = errMsg[:1000]
	}

	_, err := e.db.Pool.Exec(updateCtx,
		`UPDATE dm3_cctv.event_clips
		 SET error_message = $1, updated_at = now()
		 WHERE id = $2::uuid`,
		errMsg, clipID,
	)
	if err != nil {
		slog.Error("cctv: failed to record clip extraction error", "clip_id", clipID, "error", err)
	}
}
