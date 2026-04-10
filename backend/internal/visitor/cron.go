package visitor

import (
	"context"
	"log/slog"
	"time"
)

// StartBackgroundJobs launches background goroutines for visitor lifecycle management.
// Call this once after the handler is initialized; pass a context that is cancelled
// on service shutdown to stop all jobs cleanly.
func (h *VisitorHandlers) StartBackgroundJobs(ctx context.Context) {
	go h.autoCheckout(ctx)
	go h.markNoShows(ctx)
}

// autoCheckout runs every minute and checks out any visits that are still
// checked_in after 22:00 local time. This ensures no visits remain open overnight.
func (h *VisitorHandlers) autoCheckout(ctx context.Context) {
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			now := time.Now()
			// Only trigger auto-checkout after 22:00
			if now.Hour() < 22 {
				continue
			}
			tag, err := h.db.Pool.Exec(ctx, `
				UPDATE dm3_identity.visits
				SET status          = 'checked_out',
				    actual_checkout = now(),
				    updated_at      = now()
				WHERE status = 'checked_in'
				  AND expected_arrival::date = CURRENT_DATE`)
			if err != nil {
				slog.Error("auto checkout error", "error", err)
				continue
			}
			if tag.RowsAffected() > 0 {
				slog.Info("auto checkout completed", "count", tag.RowsAffected())
			}
		}
	}
}

// markNoShows runs every 15 minutes and marks visits as no_show when the
// expected_arrival was more than 2 hours ago and the visit is still pre_registered,
// approved, or waiting.
func (h *VisitorHandlers) markNoShows(ctx context.Context) {
	ticker := time.NewTicker(15 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			tag, err := h.db.Pool.Exec(ctx, `
				UPDATE dm3_identity.visits
				SET status     = 'no_show',
				    updated_at = now()
				WHERE status IN ('pre_registered', 'approved', 'waiting')
				  AND expected_arrival < now() - INTERVAL '2 hours'`)
			if err != nil {
				slog.Error("mark no shows error", "error", err)
				continue
			}
			if tag.RowsAffected() > 0 {
				slog.Info("marked no shows", "count", tag.RowsAffected())
			}
		}
	}
}
