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

// SnapshotExtractor captures a single-frame JPG from a camera's RTSP stream
// and persists it into object storage under `cctv-snapshots/{tenant}/{id}.jpg`.
//
// Why a separate type from ClipExtractor?
//   - Different object prefix + content type so retention & auth rules can
//     diverge (snapshots tend to be kept longer than clips, for example).
//   - ffmpeg arguments differ enough that sharing a function would be churn.
//
// TODO(refactor): when the rolling-buffer path lands in ClipExtractor, have
// the snapshot extractor pull a single frame from the buffer instead of
// opening a fresh RTSP session — that dramatically reduces latency from
// event → snapshot ready (currently ~1-3s of RTSP handshake).
type SnapshotExtractor struct {
	db          *db.DB
	objectStore objectstore.Store
	cipher      *CredentialCipher
}

func NewSnapshotExtractor(database *db.DB, objStore objectstore.Store, cipher *CredentialCipher) *SnapshotExtractor {
	return &SnapshotExtractor{
		db:          database,
		objectStore: objStore,
		cipher:      cipher,
	}
}

// ExtractSnapshot pulls one JPG frame from the camera and uploads it. Designed
// to run on the shared extraction worker pool. Failures are persisted to the
// event_clips row (status='failed'); never returned to the caller.
func (s *SnapshotExtractor) ExtractSnapshot(ctx context.Context, clipID, tenantID, cameraDeviceID string) {
	log := slog.With("clip_id", clipID, "tenant_id", tenantID, "camera_device_id", cameraDeviceID, "media_type", "snapshot")

	if s.objectStore == nil {
		log.Warn("cctv: snapshot skipped — object store not configured")
		s.markFailed(ctx, clipID, "object store not configured")
		return
	}

	info, err := s.fetchCameraInfo(ctx, tenantID, cameraDeviceID)
	if err != nil {
		log.Error("cctv: snapshot fetch camera failed", "error", err)
		s.markFailed(ctx, clipID, fmt.Sprintf("fetch camera info: %v", err))
		return
	}
	if info.RTSPUrl == "" {
		log.Warn("cctv: snapshot skipped — camera has no RTSP URL")
		s.markFailed(ctx, clipID, "camera has no rtsp_url")
		return
	}

	// RTSP credentials, if required, are part of info.RTSPUrl.
	authedURL := info.RTSPUrl

	tmpDir := os.TempDir()
	tmpFile := filepath.Join(tmpDir, fmt.Sprintf("cctv-snap-%s.jpg", clipID))
	defer os.Remove(tmpFile)

	// 15s is generous for a single frame — most cameras hand over the first
	// keyframe within a couple of seconds, so this mostly protects against
	// unreachable hosts.
	ffmpegCtx, ffmpegCancel := context.WithTimeout(ctx, 15*time.Second)
	defer ffmpegCancel()

	//nolint:gosec // authedURL derives from tenant-controlled DB values; validation applied at write time
	cmd := exec.CommandContext(ffmpegCtx, "ffmpeg",
		"-rtsp_transport", "tcp",
		"-i", authedURL,
		"-frames:v", "1",
		"-q:v", "4", // quality scale 2 (best) → 31 (worst); 4 is sensible default
		"-y",
		tmpFile,
	)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	log.Info("cctv: snapshot starting ffmpeg", "rtsp_url", redactRTSPCredentials(authedURL))
	if err := cmd.Run(); err != nil {
		msg := stderr.String()
		if len(msg) > 500 {
			msg = msg[:500]
		}
		log.Error("cctv: snapshot ffmpeg failed", "error", err, "stderr", msg)
		s.markFailed(ctx, clipID, fmt.Sprintf("ffmpeg: %v — %s", err, msg))
		return
	}

	fileInfo, err := os.Stat(tmpFile)
	if err != nil {
		s.markFailed(ctx, clipID, fmt.Sprintf("stat temp file: %v", err))
		return
	}

	objectKey := fmt.Sprintf("cctv-snapshots/%s/%s.jpg", tenantID, clipID)
	f, err := os.Open(tmpFile)
	if err != nil {
		s.markFailed(ctx, clipID, fmt.Sprintf("open temp file: %v", err))
		return
	}
	defer f.Close()

	uploadCtx, uploadCancel := context.WithTimeout(ctx, 30*time.Second)
	defer uploadCancel()
	if err := s.objectStore.PutObject(uploadCtx, objectKey, f, fileInfo.Size(), "image/jpeg"); err != nil {
		s.markFailed(ctx, clipID, fmt.Sprintf("upload: %v", err))
		return
	}

	updateCtx, updateCancel := context.WithTimeout(ctx, 5*time.Second)
	defer updateCancel()
	_, err = s.db.Pool.Exec(updateCtx,
		`UPDATE dm3_cctv.event_clips
		 SET object_key = $1, status = 'finalized', updated_at = now()
		 WHERE id = $2::uuid`,
		objectKey, clipID,
	)
	if err != nil {
		log.Error("cctv: snapshot update row failed", "error", err)
		return
	}

	log.Info("cctv: snapshot complete", "object_key", objectKey, "file_size", fileInfo.Size())
}

// ExtractThumbnail captures a single JPG frame and writes its key to
// event_clips.thumbnail_ref for an already-existing clip row. This is the
// path used when a rule enables BOTH record and snapshot — one event_clips
// row carries the video + a thumbnail, rather than producing a separate
// snapshot row. Failures are logged but do not touch the clip row's status:
// missing a thumbnail is a soft degrade, the clip itself is independent.
func (s *SnapshotExtractor) ExtractThumbnail(ctx context.Context, clipID, tenantID, cameraDeviceID string) {
	log := slog.With("clip_id", clipID, "tenant_id", tenantID, "camera_device_id", cameraDeviceID, "media_type", "thumbnail")

	if s.objectStore == nil {
		return
	}

	info, err := s.fetchCameraInfo(ctx, tenantID, cameraDeviceID)
	if err != nil {
		log.Warn("cctv: thumbnail fetch camera failed", "error", err)
		return
	}
	if info.RTSPUrl == "" {
		return
	}

	// RTSP credentials, if required, are already embedded in info.RTSPUrl.
	authedURL := info.RTSPUrl

	tmpFile := filepath.Join(os.TempDir(), fmt.Sprintf("cctv-thumb-%s.jpg", clipID))
	defer os.Remove(tmpFile)

	ffmpegCtx, ffmpegCancel := context.WithTimeout(ctx, 15*time.Second)
	defer ffmpegCancel()

	//nolint:gosec // authedURL derives from tenant-controlled DB values
	cmd := exec.CommandContext(ffmpegCtx, "ffmpeg",
		"-rtsp_transport", "tcp",
		"-i", authedURL,
		"-frames:v", "1",
		"-q:v", "4",
		"-y", tmpFile,
	)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	log.Info("cctv: thumbnail starting ffmpeg", "rtsp_url", redactRTSPCredentials(authedURL))
	if err := cmd.Run(); err != nil {
		log.Warn("cctv: thumbnail ffmpeg failed (non-fatal)",
			"error", err, "stderr", truncate(stderr.String(), 500))
		return
	}

	fi, err := os.Stat(tmpFile)
	if err != nil {
		return
	}
	f, err := os.Open(tmpFile)
	if err != nil {
		return
	}
	defer f.Close()

	objectKey := fmt.Sprintf("cctv-thumbnails/%s/%s.jpg", tenantID, clipID)
	uploadCtx, uploadCancel := context.WithTimeout(ctx, 30*time.Second)
	defer uploadCancel()
	if err := s.objectStore.PutObject(uploadCtx, objectKey, f, fi.Size(), "image/jpeg"); err != nil {
		log.Warn("cctv: thumbnail upload failed (non-fatal)", "error", err)
		return
	}

	updateCtx, updateCancel := context.WithTimeout(ctx, 5*time.Second)
	defer updateCancel()
	if _, err := s.db.Pool.Exec(updateCtx,
		`UPDATE dm3_cctv.event_clips
		 SET thumbnail_ref = $1, updated_at = now()
		 WHERE id = $2::uuid`,
		objectKey, clipID,
	); err != nil {
		log.Warn("cctv: thumbnail persist failed", "error", err)
		return
	}
	log.Info("cctv: thumbnail complete", "object_key", objectKey, "file_size", fi.Size())
}

// truncate is a small helper used to keep stderr excerpts in logs bounded.
func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}

func (s *SnapshotExtractor) fetchCameraInfo(ctx context.Context, tenantID, cameraDeviceID string) (cameraRTSPInfo, error) {
	queryCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	var info cameraRTSPInfo
	err := s.db.Pool.QueryRow(queryCtx,
		`SELECT c.rtsp_url, c.pre_roll_sec, c.post_roll_sec
		 FROM dm3_cctv.cameras c
		 WHERE c.device_id = $1::uuid AND c.tenant_id = $2::uuid`,
		cameraDeviceID, tenantID,
	).Scan(&info.RTSPUrl, &info.PreRollSec, &info.PostRollSec)
	if err != nil {
		return cameraRTSPInfo{}, fmt.Errorf("query camera info: %w", err)
	}
	return info, nil
}

func (s *SnapshotExtractor) markFailed(ctx context.Context, clipID, errMsg string) {
	updateCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if len(errMsg) > 1000 {
		errMsg = errMsg[:1000]
	}
	_, err := s.db.Pool.Exec(updateCtx,
		`UPDATE dm3_cctv.event_clips
		 SET error_message = $1, status = 'failed', updated_at = now()
		 WHERE id = $2::uuid`,
		errMsg, clipID,
	)
	if err != nil {
		slog.Error("cctv: snapshot failure persist failed", "clip_id", clipID, "error", err)
	}
}
