package cctv

import (
	"bytes"
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/duali/dm3-backend/pkg/db"
	"github.com/duali/dm3-backend/pkg/objectstore"
)

// probeMP4DurationSeconds returns the playable duration of an mp4 as seen by
// ffprobe, in seconds. A short timeout is hard-coded because ffprobe is a
// lightweight header read; we never want a hung probe to block a clip upload.
func probeMP4DurationSeconds(ctx context.Context, path string) (float64, error) {
	probeCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	cmd := exec.CommandContext(probeCtx, "ffprobe",
		"-v", "error",
		"-show_entries", "format=duration",
		"-of", "default=noprint_wrappers=1:nokey=1",
		path,
	)
	var out bytes.Buffer
	cmd.Stdout = &out
	if err := cmd.Run(); err != nil {
		return 0, fmt.Errorf("ffprobe: %w", err)
	}
	s := strings.TrimSpace(out.String())
	if s == "" || s == "N/A" {
		return 0, fmt.Errorf("ffprobe returned empty duration")
	}
	return strconv.ParseFloat(s, 64)
}

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
	pick := segmentsForWindow(segs, startedAt, endAt)
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

	// No `-ss` seeking. On fmp4 with `-c copy`, input-side -ss snaps to the
	// nearest keyframe, which on MediaMTX's 1-second record parts can land
	// one keyframe AFTER the requested offset — dropping the first second
	// of the window, which is often the event frame itself. Instead we
	// accept the leading slack of the first segment: clip starts at segment
	// boundary and the event lands `leadingSlack` seconds in. Duration is
	// extended so the tail still reaches end_at.
	//
	// Worst case leading slack ≈ segment part duration (~10s max) — harmless
	// extra context for the operator and guaranteed to keep the event frame
	// visible. Use the wider window from the first segment's start.
	leadingSlack := startedAt.Sub(pick[0].Start).Seconds()
	if leadingSlack < 0 {
		leadingSlack = 0
	}
	duration := int(endAt.Sub(pick[0].Start).Seconds())
	if duration < 1 {
		duration = 1
	}

	ffmpegCtx, cancel := context.WithTimeout(ctx, time.Duration(duration*2+30)*time.Second)
	defer cancel()

	// Re-encode instead of `-c copy`. MediaMTX fmp4 segments stored via the
	// record feature carry per-file timebases and may have inter-segment PTS
	// gaps (each segment restarts near 0). The concat demuxer + `-c copy`
	// combination preserves those quirks into the output — the player then
	// sees huge time jumps or stops decoding mid-stream. Decoding through
	// ffmpeg and re-encoding with ultrafast x264 produces a monotonically
	// increasing PTS at the cost of ~1-2 s extra CPU per 30 s clip, which
	// is acceptable for post-event clips (not a hot path).
	//
	// -fflags +genpts + -avoid_negative_ts handle the occasional segment
	// whose header PTS rolls back; -vsync cfr enforces a constant frame
	// cadence so the output plays smoothly even if an input had dropped
	// frames.
	args := []string{
		"-fflags", "+genpts",
		"-f", "concat", "-safe", "0",
		"-i", listFile,
		"-t", fmt.Sprintf("%d", duration),
		"-c:v", "libx264", "-preset", "ultrafast", "-crf", "23",
		"-vsync", "cfr",
		"-avoid_negative_ts", "make_zero",
		"-an",
		"-movflags", "+faststart",
		"-y", tmpFile,
	}
	var stderr bytes.Buffer
	cmd := exec.CommandContext(ffmpegCtx, "ffmpeg", args...)
	cmd.Stderr = &stderr

	log.Info("cctv: rolling buffer concat starting",
		"segments", len(pick), "leading_slack_sec", leadingSlack, "duration_sec", duration)

	if err := cmd.Run(); err != nil {
		log.Warn("cctv: rolling buffer concat ffmpeg failed — falling back to live pull",
			"error", err, "stderr", truncate(stderr.String(), 300))
		return false, 0
	}
	fi, err := os.Stat(tmpFile)
	if err != nil || fi.Size() < 50*1024 {
		var size int64
		if fi != nil {
			size = fi.Size()
		}
		log.Warn("cctv: rolling buffer concat produced too small a file — falling back to live pull",
			"size_bytes", size)
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

	// Probe the actual playable duration from the container header. Requested
	// duration is what we asked ffmpeg for, not what landed — rolling-buffer
	// gaps, truncated segments, or ffmpeg exiting early can all produce a file
	// much shorter than the window. Trusting the requested value is how we
	// ended up with rows that said 30 s but the player could only decode 4 s.
	actualSec, probeErr := probeMP4DurationSeconds(ctx, tmpFile)
	if probeErr != nil {
		log.Warn("cctv: ffprobe failed — falling back to requested duration", "error", probeErr)
		actualSec = float64(duration)
	}
	if actualSec < 1 {
		log.Warn("cctv: extracted clip is shorter than 1 second, marking as degraded",
			"requested_sec", duration, "actual_sec", actualSec, "file_size", fi.Size())
		// Still upload so the operator can see what we got, but flag status.
	}

	uploadCtx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()
	if err := e.objectStore.PutObject(uploadCtx, objectKey, f, fi.Size(), "video/mp4"); err != nil {
		log.Error("cctv: clip extractor failed to upload to object store", "error", err)
		e.markClipFailed(ctx, clipID, fmt.Sprintf("upload: %v", err))
		return err
	}

	// Prefer the probed value; fall back to requested only when probe fails.
	durationMs := int(actualSec * 1000)
	if durationMs <= 0 {
		durationMs = duration * 1000
	}
	// Mark as 'degraded' if the playable length is noticeably shorter than
	// what the rule asked for — the file will still open but the operator
	// should know the clip is partial (rolling-buffer gap or early ffmpeg
	// exit). Threshold: ≥ 1 s and ≥ 50 % of requested.
	status := "finalized"
	if actualSec < 1 || (duration > 0 && actualSec < float64(duration)*0.5) {
		status = "degraded"
	}
	endedAt := time.Now()
	updateCtx, updateCancel := context.WithTimeout(ctx, 5*time.Second)
	defer updateCancel()

	if _, err := e.db.Pool.Exec(updateCtx,
		`UPDATE dm3_cctv.event_clips
		 SET object_key = $1, duration_ms = $2, ended_at = $3, status = $4, updated_at = now()
		 WHERE id = $5::uuid`,
		objectKey, durationMs, endedAt, status, clipID,
	); err != nil {
		log.Error("cctv: clip extractor failed to update event_clips row", "error", err)
		return err
	}

	log.Info("cctv: clip extraction complete",
		"object_key", objectKey, "requested_sec", duration, "actual_sec", actualSec,
		"status", status, "file_size", fi.Size(), "from_rolling_buffer", fromBuffer)
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
