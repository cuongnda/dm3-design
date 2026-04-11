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
			// Use per-tenant auto_checkout_hour from visitor_settings (default 22)
			rows, err := h.db.Pool.Query(ctx, `
				SELECT v.id::text, v.tenant_id::text
				FROM dm3_visitor.visits v
				LEFT JOIN dm3_visitor.visitor_settings s ON s.tenant_id = v.tenant_id
				WHERE v.status = 'checked_in'
				  AND v.actual_checkout IS NULL
				  AND v.expected_arrival::date = CURRENT_DATE
				  AND EXTRACT(HOUR FROM now()) >= COALESCE(s.auto_checkout_hour, 22)
				LIMIT 500`)
			if err != nil {
				slog.Error("auto checkout query error", "error", err)
				continue
			}
			count := int64(0)
			func() {
				defer rows.Close()
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
			}()
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
	// Use per-tenant no_show_grace_minutes from visitor_settings (default 120 min)
	rows, err := h.db.Pool.Query(ctx, `
		UPDATE dm3_visitor.visits v
		SET status     = 'no_show',
		    updated_at = now()
		FROM (
			SELECT vis.id,
			       COALESCE(s.no_show_grace_minutes, 120) AS grace_minutes
			FROM dm3_visitor.visits vis
			LEFT JOIN dm3_visitor.visitor_settings s ON s.tenant_id = vis.tenant_id
			WHERE vis.status IN ('pre_registered', 'approved', 'waiting')
		) sub
		WHERE v.id = sub.id
		  AND v.expected_arrival < now() - make_interval(mins => sub.grace_minutes)
		RETURNING v.id::text, v.tenant_id::text`)
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
				Service:    "visitor-svc",
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
