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

func (f *ClipFinalizer) tick(ctx context.Context) {
	claimCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	// Claim up to 32 ready clips per tick. We flip status to 'recording' here
	// so re-scans inside the same tick or in a sibling process skip them.
	rows, err := f.db.Pool.Query(claimCtx, `
		WITH ready AS (
		  SELECT id FROM dm3_cctv.event_clips
		   WHERE media_type = 'clip'
		     AND status = 'pending'
		     AND end_at IS NOT NULL
		     AND end_at <= now()
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
