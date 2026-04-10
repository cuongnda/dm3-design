package visitor

import (
	"context"
	"log/slog"
	"time"

	"github.com/duali/dm3-backend/pkg/audit"
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
			rows, err := h.db.Pool.Query(ctx, `
				SELECT id::text, tenant_id::text
				FROM dm3_identity.visits
				WHERE status = 'checked_in'
				  AND expected_arrival::date = CURRENT_DATE`)
			if err != nil {
				slog.Error("auto checkout query error", "error", err)
				continue
			}
			count := int64(0)
			for rows.Next() {
				var visitID, tenantID string
				if err := rows.Scan(&visitID, &tenantID); err != nil {
					slog.Error("auto checkout scan error", "error", err)
					continue
				}
				if _, err := h.autoCheckoutVisit(ctx, tenantID, visitID); err != nil {
					slog.Error("auto checkout error", "visit_id", visitID, "tenant_id", tenantID, "error", err)
					continue
				}
				count++
			}
			rows.Close()
			if err := rows.Err(); err != nil {
				slog.Error("auto checkout rows error", "error", err)
			}
			if count > 0 {
				slog.Info("auto checkout completed", "count", count)
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
			count, err := h.markNoShowCandidates(ctx)
			if err != nil {
				slog.Error("mark no shows error", "error", err)
				continue
			}
			if count > 0 {
				slog.Info("marked no shows", "count", count)
			}
		}
	}
}

func (h *VisitorHandlers) markNoShowCandidates(ctx context.Context) (int64, error) {
	rows, err := h.db.Pool.Query(ctx, `
		UPDATE dm3_identity.visits
		SET status     = 'no_show',
		    updated_at = now()
		WHERE status IN ('pre_registered', 'approved', 'waiting')
		  AND expected_arrival < now() - INTERVAL '2 hours'
		RETURNING id::text, tenant_id::text`)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	var count int64
	for rows.Next() {
		var visitID, tenantID string
		if err := rows.Scan(&visitID, &tenantID); err != nil {
			slog.Error("mark no show scan error", "error", err)
			continue
		}
		count++
		if h.audit != nil {
			h.audit.Log(audit.Entry{
				TenantID:   tenantID,
				Service:    "identity-svc",
				Action:     "visit.no_show",
				EntityType: "visit",
				EntityID:   visitID,
				Status:     "success",
				NewValues:  map[string]any{"reason": "auto: expected_arrival > 2 hours ago"},
			})
		}
	}
	return count, rows.Err()
}
