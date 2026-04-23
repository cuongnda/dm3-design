package cctv

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
)

// Rolling-buffer segment support.
//
// MediaMTX records each camera path to /recordings/{camera_uuid}/<start>.mp4
// using the template in mediamtx_record.pathRecordDefaults. Files are retained
// for `rolling_buffer_sec + 60s` then auto-purged. When a coalesced clip
// finalizes, the extractor can build a real-pre-roll MP4 by concatenating the
// segments that cover [started_at, end_at] with `ffmpeg -c copy` — no
// re-encode, fast (~1s even for 60s output).
//
// Filename shape written by MediaMTX (%Y-%m-%d_%H-%M-%S-%f):
//   2026-04-23_10-15-30-123456.mp4
// Parsed as local time because MediaMTX's default formatting has no TZ.
// TODO(refactor): force MediaMTX to UTC in mediamtx.yml (runOn*? global?) so
// DST and host-TZ shifts can't skew segment selection.

// segmentFilenamePattern parses the MediaMTX default filename template.
// Leading "2026-04-23_10-15-30-123456" plus either ".ts" (mpegts, current) or
// ".mp4" (legacy fmp4) extension.
var segmentFilenamePattern = regexp.MustCompile(`^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})-(\d{1,6})\.(ts|mp4)$`)

// segment is a single rolling-buffer file with its start time parsed out.
type segment struct {
	Path  string
	Start time.Time
}

// listRollingSegments returns every segment file on disk for the given
// camera, sorted by start time ascending. Non-matching filenames (dotfiles,
// temp files, fmp4 chunk metadata) are skipped silently — safer than erroring
// on one weird file.
func listRollingSegments(rootDir, cameraUUID string) ([]segment, error) {
	if rootDir == "" {
		return nil, nil
	}
	dir := filepath.Join(rootDir, cameraUUID)
	entries, err := os.ReadDir(dir)
	if err != nil {
		// Missing dir == "no buffer for this camera" — not an error, just a miss.
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("read segment dir: %w", err)
	}

	out := make([]segment, 0, len(entries))
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		if !strings.HasSuffix(e.Name(), ".ts") && !strings.HasSuffix(e.Name(), ".mp4") {
			continue
		}
		t, ok := parseSegmentStart(e.Name())
		if !ok {
			continue
		}
		out = append(out, segment{
			Path:  filepath.Join(dir, e.Name()),
			Start: t,
		})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Start.Before(out[j].Start) })
	return out, nil
}

// parseSegmentStart extracts the start timestamp from a MediaMTX segment
// filename. The fractional component is microseconds per MediaMTX's %f spec.
// Returns ok=false when the filename doesn't match — the caller skips the
// file rather than blowing up.
func parseSegmentStart(name string) (time.Time, bool) {
	m := segmentFilenamePattern.FindStringSubmatch(name)
	if m == nil {
		return time.Time{}, false
	}
	// The regex already matched the suffix; reuse captured groups so we don't
	// have to branch on extension here.
	var y, mo, d, h, mi, s, us int
	var ext string
	_, err := fmt.Sscanf(name, "%04d-%02d-%02d_%02d-%02d-%02d-%d.%s",
		&y, &mo, &d, &h, &mi, &s, &us, &ext)
	if err != nil {
		return time.Time{}, false
	}
	// MediaMTX writes in the container's local timezone (default UTC in the
	// official image unless TZ env is set).
	return time.Date(y, time.Month(mo), d, h, mi, s, us*1000, time.UTC), true
}

// segmentsForWindow picks the subset of `all` that overlaps [from, to].
// `all` must be sorted ascending by Start.
//
// Algorithm: the segment whose Start is the latest value ≤ from is guaranteed
// to be the one that *contains* (or leads into) the window's first frame —
// its content runs until the next segment's Start regardless of its own
// duration. From that segment, include every subsequent one whose Start is
// strictly before `to`.
//
// The previous implementation used a fixed `maxSegmentGap = 15s` lower-bound
// heuristic that silently dropped the immediate-before segment whenever
// MediaMTX wrote a longer-than-15s segment — exactly the case where the
// event time ended up in a segment that started >15s earlier, producing
// clips that skipped the event frames.
func segmentsForWindow(all []segment, from, to time.Time) []segment {
	if len(all) == 0 || !to.After(from) {
		return nil
	}

	// Walk forward to find the latest segment whose Start ≤ from. If every
	// segment starts after `from` (e.g. fresh MediaMTX, no history), fall
	// back to the first segment that overlaps the window.
	firstIdx := -1
	for i, s := range all {
		if s.Start.After(from) {
			break
		}
		firstIdx = i
	}
	if firstIdx < 0 {
		// No segment started at/before `from`. Start from the first segment
		// whose Start is before `to` (i.e. overlaps the window's tail).
		for i, s := range all {
			if s.Start.Before(to) {
				firstIdx = i
				break
			}
		}
	}
	if firstIdx < 0 {
		return nil
	}

	out := make([]segment, 0, 8)
	for i := firstIdx; i < len(all); i++ {
		if !all[i].Start.Before(to) {
			break
		}
		out = append(out, all[i])
	}
	return out
}

// segmentRelativeOffset returns how many seconds into the first segment the
// window starts. Used as ffmpeg's `-ss` so the concatenated output starts at
// the actual event boundary instead of the segment boundary.
func segmentRelativeOffset(first segment, windowStart time.Time) float64 {
	if windowStart.Before(first.Start) {
		return 0
	}
	return windowStart.Sub(first.Start).Seconds()
}

// ctxAwareWait sleeps until t unless ctx is cancelled first. Used by the
// finalizer path to wait for post-roll segments to land on disk before
// running the concat.
func ctxAwareWait(ctx context.Context, until time.Time) {
	d := time.Until(until)
	if d <= 0 {
		return
	}
	select {
	case <-time.After(d):
	case <-ctx.Done():
	}
}
