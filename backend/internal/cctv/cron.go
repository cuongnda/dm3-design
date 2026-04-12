package cctv

import (
	"context"
	"log/slog"
	"time"

	"github.com/duali/dm3-backend/pkg/db"
	"github.com/duali/dm3-backend/pkg/objectstore"
)

// RetentionWorker periodically deletes expired CCTV clips from object storage
// and the database. It runs on a configurable interval (default 1h).
//
// Deletion order is intentional: object storage first, DB row second.
// If the MinIO delete fails, the DB row is kept so the next run retries.
// If the DB delete fails after a successful MinIO delete, the row is orphaned
// (no object) — the next run will attempt to delete the already-absent object,
// which is a no-op in MinIO, and then retry the DB delete.
type RetentionWorker struct {
	db       *db.DB
	store    objectstore.Store
	interval time.Duration
}

// NewRetentionWorker creates a RetentionWorker.
// interval is how often the worker runs; pass 0 to use the default of 1 hour.
func NewRetentionWorker(database *db.DB, store objectstore.Store, interval time.Duration) *RetentionWorker {
	if interval <= 0 {
		interval = time.Hour
	}
	return &RetentionWorker{
		db:       database,
		store:    store,
		interval: interval,
	}
}

// Run starts the retention loop. It blocks until ctx is cancelled.
// Call as a goroutine: go worker.Run(ctx).
func (w *RetentionWorker) Run(ctx context.Context) {
	slog.Info("cctv retention worker starting", "interval", w.interval)
	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()

	// Run once immediately so the first tick fires at interval after startup.
	w.runOnce(ctx)

	for {
		select {
		case <-ctx.Done():
			slog.Info("cctv retention worker stopping")
			return
		case <-ticker.C:
			w.runOnce(ctx)
		}
	}
}

// runOnce fetches all distinct tenant IDs that have clips, reads each tenant's
// retention_days setting, and deletes expired clips in batches of 500.
func (w *RetentionWorker) runOnce(ctx context.Context) {
	// Collect distinct tenants that have at least one clip.
	rows, err := w.db.Pool.Query(ctx,
		`SELECT DISTINCT tenant_id::text FROM dm3_cctv.event_clips`)
	if err != nil {
		slog.Error("cctv retention: list tenants error", "error", err)
		return
	}

	var tenants []string
	func() {
		defer rows.Close()
		for rows.Next() {
			var tid string
			if err := rows.Scan(&tid); err != nil {
				slog.Error("cctv retention: scan tenant error", "error", err)
				return
			}
			tenants = append(tenants, tid)
		}
	}()
	if err := rows.Err(); err != nil {
		slog.Error("cctv retention: tenant rows error", "error", err)
		return
	}

	for _, tenantID := range tenants {
		w.purgeExpiredClips(ctx, tenantID)
	}
}

// purgeExpiredClips deletes clips older than retention_days for the given tenant.
// Batches of 500 rows are fetched and deleted per iteration to bound work.
func (w *RetentionWorker) purgeExpiredClips(ctx context.Context, tenantID string) {
	// Read retention_days; default 14 if the settings row doesn't exist.
	var retentionDays int
	err := w.db.Pool.QueryRow(ctx,
		`SELECT retention_days FROM dm3_cctv.cctv_settings WHERE tenant_id = $1::uuid`,
		tenantID,
	).Scan(&retentionDays)
	if err != nil {
		// No settings row — use default of 14 days.
		retentionDays = 14
	}

	// Fetch up to 500 expired clips in a single query.
	clipRows, err := w.db.Pool.Query(ctx, `
		SELECT id::text, object_key
		FROM dm3_cctv.event_clips
		WHERE tenant_id = $1::uuid
		  AND started_at < now() - make_interval(days => $2)
		LIMIT 500`,
		tenantID, retentionDays,
	)
	if err != nil {
		slog.Error("cctv retention: query expired clips error", "tenant_id", tenantID, "error", err)
		return
	}

	type clipRecord struct {
		id        string
		objectKey string
	}
	var clips []clipRecord
	func() {
		defer clipRows.Close()
		for clipRows.Next() {
			var c clipRecord
			if err := clipRows.Scan(&c.id, &c.objectKey); err != nil {
				slog.Error("cctv retention: scan clip error", "tenant_id", tenantID, "error", err)
				return
			}
			clips = append(clips, c)
		}
	}()
	if err := clipRows.Err(); err != nil {
		slog.Error("cctv retention: clip rows error", "tenant_id", tenantID, "error", err)
		return
	}

	deleted := 0
	for _, clip := range clips {
		// Delete from object storage first. On failure, skip DB delete so the
		// next run retries both steps.
		if err := w.store.DeleteObject(ctx, clip.objectKey); err != nil {
			slog.Error("cctv retention: delete object error — skipping DB row",
				"clip_id", clip.id, "object_key", clip.objectKey, "error", err)
			continue
		}

		// Delete the DB row. On failure, log and continue — the next run will
		// attempt the object delete again (MinIO no-ops on missing keys) then
		// retry the DB delete.
		if _, err := w.db.Pool.Exec(ctx,
			`DELETE FROM dm3_cctv.event_clips WHERE id = $1::uuid AND tenant_id = $2::uuid`,
			clip.id, tenantID,
		); err != nil {
			slog.Error("cctv retention: delete db row error",
				"clip_id", clip.id, "tenant_id", tenantID, "error", err)
			continue
		}

		deleted++
	}

	if deleted > 0 {
		slog.Info("cctv retention: deleted expired clips",
			"tenant_id", tenantID,
			"count", deleted,
			"retention_days", retentionDays,
		)
	}
}
