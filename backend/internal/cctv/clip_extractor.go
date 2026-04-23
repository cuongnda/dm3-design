package cctv

import (
	"bytes"
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/duali/dm3-backend/pkg/db"
	"github.com/duali/dm3-backend/pkg/objectstore"
)

// ClipExtractor records video clips from camera RTSP streams when access events fire.
// After the AccessEventConsumer creates a placeholder event_clips row, it calls
// ExtractClip to asynchronously record the actual video, upload it to MinIO, and
// update the row with real metadata.
//
// RecordDir is the MediaMTX rolling-buffer root (env MEDIAMTX_RECORD_DIR).
// When set and the camera's segments cover the requested window, extraction
// uses a fast ffmpeg concat copy that preserves real pre-roll. When unset or
// the buffer doesn't cover the event (camera just came online, MediaMTX
// restart…), the extractor falls back to a live RTSP pull from "now".
type ClipExtractor struct {
	db          *db.DB
	objectStore objectstore.Store
	cipher      *CredentialCipher
	recordDir   string
}

// NewClipExtractor constructs a ClipExtractor.
// cipher may be nil — ExtractClip will skip extraction (log a warning) if it
// needs to decrypt a password but no cipher is available.
// recordDir empty → rolling-buffer path disabled (live pull only).
func NewClipExtractor(database *db.DB, objStore objectstore.Store, cipher *CredentialCipher, recordDir string) *ClipExtractor {
	return &ClipExtractor{
		db:          database,
		objectStore: objStore,
		cipher:      cipher,
		recordDir:   recordDir,
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

// ExtractClip records video for the coalesced window (started_at..end_at) of
// the clip row, uploads the resulting MP4 to MinIO, and transitions the row
// to 'finalized' (or 'failed' / 'degraded').
//
// Two paths, picked at runtime:
//   1. Rolling buffer — when MEDIAMTX_RECORD_DIR is configured and segments
//      overlapping [started_at, end_at] exist on disk. Runs ffmpeg concat
//      copy, preserves real pre-roll, never touches the live stream.
//   2. Live pull fallback — the original path. Used when no buffer is
//      available or it doesn't cover the window (camera just came online,
//      MediaMTX restart, buffer GC'd the segment).
//
// Runs asynchronously via the ExtractionWorkerPool. Never returns an error to
// the caller; failures are logged and persisted in the DB row.
func (e *ClipExtractor) ExtractClip(ctx context.Context, clipID, tenantID, cameraDeviceID string) {
	log := slog.With("clip_id", clipID, "tenant_id", tenantID, "camera_device_id", cameraDeviceID)

	if e.objectStore == nil {
		log.Warn("cctv: clip extractor skipped — object store not configured")
		e.markClipFailed(ctx, clipID, "object store not configured")
		return
	}

	startedAt, endAt, ok := e.fetchClipWindow(ctx, clipID)
	if !ok {
		log.Warn("cctv: clip extractor could not load clip window")
		e.markClipFailed(ctx, clipID, "clip row not found")
		return
	}

	info, err := e.fetchCameraRTSPInfo(ctx, tenantID, cameraDeviceID)
	if err != nil {
		log.Error("cctv: clip extractor failed to fetch camera info", "error", err)
		e.markClipFailed(ctx, clipID, fmt.Sprintf("fetch camera info: %v", err))
		return
	}

	tmpFile := filepath.Join(os.TempDir(), fmt.Sprintf("cctv-clip-%s.mp4", clipID))
	defer os.Remove(tmpFile)

	usedBuffer, duration := e.runBufferPath(ctx, log, cameraDeviceID, startedAt, endAt, tmpFile)
	if !usedBuffer {
		duration, err = e.runLivePullPath(ctx, log, clipID, info, startedAt, endAt, tmpFile)
		if err != nil {
			return // runLivePullPath already persisted the failure
		}
	}

	if err := e.uploadAndFinalize(ctx, log, clipID, tenantID, tmpFile, duration, usedBuffer); err != nil {
		return
	}
}

// runBufferPath attempts the rolling-buffer concat. Returns (used, duration)
// where used=true means ffmpeg wrote tmpFile successfully. All failure modes
// return false with duration=0 so the caller falls back to live pull.
func (e *ClipExtractor) runBufferPath(
	ctx context.Context,
	log *slog.Logger,
	cameraDeviceID string,
	startedAt, endAt time.Time,
	tmpFile string,
) (bool, int) {
	if e.recordDir == "" {
		return false, 0
	}

	// Wait for the post-roll tail segment to actually hit disk. MediaMTX
	// writes a segment when the next one starts, so our end_at may land mid-
	// segment; give it one segment-duration's worth of slack.
	ctxAwareWait(ctx, endAt.Add(12*time.Second))

	segs, err := listRollingSegments(e.recordDir, cameraDeviceID)
	if err != nil {
		log.Warn("cctv: rolling buffer scan failed — falling back to live pull", "error", err)
		return false, 0
	}
	// segmentMaxGap = segment duration + safety → covers a pre-roll start
	// that falls inside a segment that began shortly before started_at.
	const segmentMaxGap = 15 * time.Second
	pick := segmentsForWindow(segs, startedAt, endAt, segmentMaxGap)
	if len(pick) == 0 {
		log.Info("cctv: rolling buffer has no segment covering window — falling back to live pull",
			"window_start", startedAt, "window_end", endAt, "total_segments", len(segs))
		return false, 0
	}

	// Write ffmpeg concat demuxer manifest.
	listFile := tmpFile + ".list"
	defer os.Remove(listFile)
	var mf bytes.Buffer
	for _, s := range pick {
		// ffmpeg concat demuxer spec: line per file prefixed with "file ",
		// quote to tolerate spaces; our paths never have ' but escape just in
		// case.
		safe := strings.ReplaceAll(s.Path, "'", `'\''`)
		fmt.Fprintf(&mf, "file '%s'\n", safe)
	}
	if err := os.WriteFile(listFile, mf.Bytes(), 0o600); err != nil {
		log.Warn("cctv: rolling buffer list write failed — falling back", "error", err)
		return false, 0
	}

	offset := segmentRelativeOffset(pick[0], startedAt)
	duration := int(endAt.Sub(startedAt).Seconds())
	if duration < 1 {
		duration = 1
	}

	ffmpegCtx, cancel := context.WithTimeout(ctx, time.Duration(duration*2+30)*time.Second)
	defer cancel()

	// -ss before -i on the concat demuxer still fast-seeks on the first input
	// (ffmpeg treats the list as a single virtual file). -c copy keeps this
	// nearly-instant — no re-encode.
	args := []string{
		"-f", "concat", "-safe", "0",
	}
	if offset > 0.1 {
		args = append(args, "-ss", fmt.Sprintf("%.3f", offset))
	}
	args = append(args,
		"-i", listFile,
		"-t", fmt.Sprintf("%d", duration),
		"-c", "copy",
		"-an",
		"-movflags", "+faststart",
		"-y", tmpFile,
	)
	var stderr bytes.Buffer
	cmd := exec.CommandContext(ffmpegCtx, "ffmpeg", args...)
	cmd.Stderr = &stderr

	log.Info("cctv: rolling buffer concat starting",
		"segments", len(pick), "offset_sec", offset, "duration_sec", duration)

	if err := cmd.Run(); err != nil {
		log.Warn("cctv: rolling buffer concat failed — falling back to live pull",
			"error", err, "stderr", truncate(stderr.String(), 300))
		return false, 0
	}

	if fi, err := os.Stat(tmpFile); err != nil || fi.Size() == 0 {
		log.Warn("cctv: rolling buffer concat produced empty file — falling back")
		return false, 0
	}

	return true, duration
}

// runLivePullPath is the fallback extractor used when MediaMTX isn't writing
// a rolling buffer. Real pre-roll isn't possible here (RTSP can't rewind),
// but we still honour the rule's configured total duration (pre + post) so
// the clip length matches what the operator picked on the Event Rules page.
// The captured window shifts later by ~`pre_roll` relative to the event;
// event content still lands in the clip because ffmpeg starts right after
// the event fires.
func (e *ClipExtractor) runLivePullPath(
	ctx context.Context,
	log *slog.Logger,
	clipID string,
	info cameraRTSPInfo,
	startedAt, endAt time.Time,
	tmpFile string,
) (int, error) {
	if info.RTSPUrl == "" {
		log.Warn("cctv: clip extractor skipped — camera has no RTSP URL")
		e.markClipFailed(ctx, clipID, "camera has no rtsp_url")
		return 0, fmt.Errorf("no rtsp url")
	}

	var password string
	if len(info.RTSPPasswordEnc) > 0 {
		if e.cipher == nil {
			e.markClipFailed(ctx, clipID, "credential cipher not configured")
			return 0, fmt.Errorf("cipher missing")
		}
		var err error
		password, err = e.cipher.Decrypt(info.RTSPPasswordEnc)
		if err != nil {
			log.Error("cctv: clip extractor failed to decrypt RTSP password", "error", err)
			e.markClipFailed(ctx, clipID, fmt.Sprintf("decrypt password: %v", err))
			return 0, err
		}
	}
	username := ""
	if info.RTSPUsername != nil {
		username = *info.RTSPUsername
	}
	authedURL := composeRTSPURLWithAuth(info.RTSPUrl, username, password)

	// Honour the full (pre + post) duration the rule configured. Without a
	// rolling buffer we can't actually reach into the past, but ffmpeg still
	// captures that many seconds forward from "now" — giving the operator a
	// clip of the expected length instead of a 5-second stub.
	duration := int(endAt.Sub(startedAt).Seconds())
	if duration < 5 {
		duration = 5
	}

	ffmpegCtx, cancel := context.WithTimeout(ctx, time.Duration(duration*2+30)*time.Second)
	defer cancel()

	//nolint:gosec // authedURL derives from tenant-controlled DB values
	cmd := exec.CommandContext(ffmpegCtx, "ffmpeg",
		"-rtsp_transport", "tcp",
		"-i", authedURL,
		"-t", fmt.Sprintf("%d", duration),
		"-c:v", "copy",
		"-an",
		"-movflags", "+faststart",
		"-y", tmpFile,
	)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	log.Info("cctv: live pull ffmpeg starting",
		"duration_sec", duration, "rtsp_url", redactRTSPCredentials(authedURL))

	if err := cmd.Run(); err != nil {
		msg := truncate(stderr.String(), 500)
		log.Error("cctv: ffmpeg clip extraction failed", "error", err, "stderr", msg)
		e.markClipFailed(ctx, clipID, fmt.Sprintf("ffmpeg: %v — %s", err, msg))
		return 0, err
	}
	return duration, nil
}

// uploadAndFinalize uploads the tmp MP4 to MinIO and flips the row to
// finalized. Shared between rolling-buffer and live-pull paths.
func (e *ClipExtractor) uploadAndFinalize(
	ctx context.Context,
	log *slog.Logger,
	clipID, tenantID, tmpFile string,
	duration int,
	fromBuffer bool,
) error {
	fi, err := os.Stat(tmpFile)
	if err != nil {
		log.Error("cctv: clip extractor failed to stat temp file", "error", err)
		e.markClipFailed(ctx, clipID, fmt.Sprintf("stat temp file: %v", err))
		return err
	}

	objectKey := fmt.Sprintf("cctv-clips/%s/%s.mp4", tenantID, clipID)
	f, err := os.Open(tmpFile)
	if err != nil {
		log.Error("cctv: clip extractor failed to open temp file", "error", err)
		e.markClipFailed(ctx, clipID, fmt.Sprintf("open temp file: %v", err))
		return err
	}
	defer f.Close()

	uploadCtx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()
	if err := e.objectStore.PutObject(uploadCtx, objectKey, f, fi.Size(), "video/mp4"); err != nil {
		log.Error("cctv: clip extractor failed to upload to object store", "error", err)
		e.markClipFailed(ctx, clipID, fmt.Sprintf("upload: %v", err))
		return err
	}

	durationMs := duration * 1000
	endedAt := time.Now()
	updateCtx, updateCancel := context.WithTimeout(ctx, 5*time.Second)
	defer updateCancel()

	if _, err := e.db.Pool.Exec(updateCtx,
		`UPDATE dm3_cctv.event_clips
		 SET object_key = $1, duration_ms = $2, ended_at = $3, status = 'finalized', updated_at = now()
		 WHERE id = $4::uuid`,
		objectKey, durationMs, endedAt, clipID,
	); err != nil {
		log.Error("cctv: clip extractor failed to update event_clips row", "error", err)
		return err
	}

	log.Info("cctv: clip extraction complete",
		"object_key", objectKey, "duration_sec", duration,
		"file_size", fi.Size(), "from_rolling_buffer", fromBuffer)
	return nil
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

// markClipFailed records a clip extraction failure in the DB so operators can
// diagnose issues without trawling logs. Flips status to 'failed' so dashboards
// and list queries can filter broken captures.
func (e *ClipExtractor) markClipFailed(ctx context.Context, clipID, errMsg string) {
	updateCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	if len(errMsg) > 1000 {
		errMsg = errMsg[:1000]
	}

	_, err := e.db.Pool.Exec(updateCtx,
		`UPDATE dm3_cctv.event_clips
		 SET error_message = $1, status = 'failed', updated_at = now()
		 WHERE id = $2::uuid`,
		errMsg, clipID,
	)
	if err != nil {
		slog.Error("cctv: failed to record clip extraction error", "clip_id", clipID, "error", err)
	}
}

// fetchClipWindow reads started_at / end_at (the coalesced window written by
// the consumer) from the clip row. Returns ok=false when the row is missing.
func (e *ClipExtractor) fetchClipWindow(ctx context.Context, clipID string) (time.Time, time.Time, bool) {
	queryCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	var startedAt time.Time
	var endAt *time.Time
	err := e.db.Pool.QueryRow(queryCtx,
		`SELECT started_at, end_at FROM dm3_cctv.event_clips WHERE id = $1::uuid`,
		clipID,
	).Scan(&startedAt, &endAt)
	if err != nil {
		return time.Time{}, time.Time{}, false
	}
	if endAt == nil {
		// Pre-coalescing rows (manual exports etc.) — fall back to now + 10s
		// so extraction still proceeds with a sane tail.
		t := time.Now().Add(10 * time.Second)
		endAt = &t
	}
	return startedAt, *endAt, true
}
