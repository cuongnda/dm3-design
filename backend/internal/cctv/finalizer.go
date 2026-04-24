package cctv

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"github.com/duali/dm3-backend/pkg/db"
)

// finalizerPollInterval governs how often we sweep for clips whose end_at
// has passed. 2s keeps the tail latency between the last coalesced event and
// the start of ffmpeg small (upper bound ≈ poll interval), without pounding
// the DB.
const finalizerPollInterval = 2 * time.Second

// ClipFinalizer drains the pending→recording→finalized pipeline for coalesced
// clips. Each tick it claims a batch of rows ready for extraction (end_at <
// now()) using an UPDATE ... RETURNING ... FOR UPDATE SKIP LOCKED so multiple
// cctv-svc replicas can run in parallel without double-extracting.
//
// TODO(refactor): move the claim batch size (currently hard-coded 32) into
// cctv_settings once we have real traffic to tune against.
type ClipFinalizer struct {
	db        *db.DB
	extractor *ClipExtractor
	workers   *ExtractionWorkerPool

	// inflight guards us from claiming a clip we're already processing in this
	// process — the DB lock scopes per transaction so once we commit the UPDATE
	// moving status → 'recording', another tick here would re-claim it. The
	// inflight set is cleared in the job's defer.
	mu       sync.Mutex
	inflight map[string]struct{}
}

// NewClipFinalizer wires the finalizer. Returns nil when either extractor
// or workers is nil — callers should treat nil as "feature disabled".
func NewClipFinalizer(database *db.DB, extractor *ClipExtractor, workers *ExtractionWorkerPool) *ClipFinalizer {
	if extractor == nil || workers == nil {
		return nil
	}
	return &ClipFinalizer{
		db:        database,
		extractor: extractor,
		workers:   workers,
		inflight:  make(map[string]struct{}),
	}
}

// Run blocks until ctx is cancelled, ticking every finalizerPollInterval.
// Intended to be called in a goroutine by cctv-svc main.
func (f *ClipFinalizer) Run(ctx context.Context) {
	if f == nil {
		return
	}
	// Purge stale in-flight rows before the ticker spins up. Anything still
	// pending/recording with updated_at older than our reclaim window is
	// either from a crashed previous run or from a JetStream replay that
	// shouldn't have happened (see pkg/natsutil.Subscribe docs). Deleting
	// them avoids creating thousands of zero-content mp4 files for events
	// that happened hours ago.
	f.purgeStaleClips(ctx)

	slog.Info("cctv finalizer started", "interval", finalizerPollInterval.String())
	t := time.NewTicker(finalizerPollInterval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			f.tick(ctx)
		}
	}
}

// purgeStaleClips deletes event_clips rows left in a non-terminal state
// (pending / recording) whose updated_at is older than 10 minutes. That gives
// the legitimate in-flight horizon (finalizer waits ≤ 12 s after end_at for
// segments to land; even generous retry windows finish well inside a couple
// of minutes) plenty of margin. Anything older is orphaned and safe to drop.
//
// Using DELETE rather than UPDATE status='failed' because the point is to
// avoid confusing operators with phantom rows — a junk pending clip wasn't a
// real event on this tenant's timeline.
func (f *ClipFinalizer) purgeStaleClips(ctx context.Context) {
	purgeCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	// Clear the junction first to avoid orphan rows. event_clip_events has
	// no declared FK to event_clips (by design — clip_id is nullable at the
	// app layer), so Postgres won't cascade for us.
	tag, err := f.db.Pool.Exec(purgeCtx, `
		WITH stale AS (
		  SELECT id FROM dm3_cctv.event_clips
		   WHERE status IN ('pending','recording')
		     AND updated_at < now() - interval '10 minutes'
		),
		_ AS (
		  DELETE FROM dm3_cctv.event_clip_events ece
		   USING stale
		   WHERE ece.clip_id = stale.id
		)
		DELETE FROM dm3_cctv.event_clips ec
		 USING stale
		 WHERE ec.id = stale.id`)
	if err != nil {
		slog.Warn("cctv finalizer: purge stale clips failed", "error", err)
		return
	}
	if n := tag.RowsAffected(); n > 0 {
		slog.Info("cctv finalizer: purged stale clips on startup", "rows", n)
	}
}

func (f *ClipFinalizer) tick(ctx context.Context) {
	claimCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	// Claim up to 32 ready clips per tick. We flip status to 'recording' here
	// so re-scans inside the same tick or in a sibling process skip them.
	//
	// The status='recording' branch in the WHERE clause reclaims rows stuck
	// after a crash: if the previous cctv-svc exited while extracting, the
	// row is stuck at 'recording' forever. We re-enqueue once updated_at is
	// older than 5 minutes (well beyond any legitimate ffmpeg run).
	//
	// TODO(refactor): replace the 5-minute heuristic with a heartbeat column
	// updated by the extractor so we can reclaim faster without risk of
	// racing a still-running worker.
	rows, err := f.db.Pool.Query(claimCtx, `
		WITH ready AS (
		  SELECT id FROM dm3_cctv.event_clips
		   WHERE media_type = 'clip'
		     AND end_at IS NOT NULL
		     AND (
		           (status = 'pending'   AND end_at <= now())
		        OR (status = 'recording' AND updated_at < now() - interval '5 minutes')
		         )
		   ORDER BY end_at ASC
		   LIMIT 32
		   FOR UPDATE SKIP LOCKED
		)
		UPDATE dm3_cctv.event_clips c
		   SET status = 'recording', updated_at = now()
		  FROM ready
		 WHERE c.id = ready.id
		RETURNING c.id::text, c.tenant_id::text, c.device_id::text`,
	)
	if err != nil {
		slog.Warn("cctv finalizer: claim failed", "error", err)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var clipID, tenantID, deviceID string
		if err := rows.Scan(&clipID, &tenantID, &deviceID); err != nil {
			slog.Warn("cctv finalizer: scan failed", "error", err)
			continue
		}

		f.mu.Lock()
		if _, dup := f.inflight[clipID]; dup {
			f.mu.Unlock()
			continue
		}
		f.inflight[clipID] = struct{}{}
		f.mu.Unlock()

		cid, tid, did := clipID, tenantID, deviceID
		f.workers.Submit(ctx, func(jobCtx context.Context) {
			defer func() {
				f.mu.Lock()
				delete(f.inflight, cid)
				f.mu.Unlock()
			}()
			f.extractor.ExtractClip(jobCtx, cid, tid, did)
		})
	}
}
