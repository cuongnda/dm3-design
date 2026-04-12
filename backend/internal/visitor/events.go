package visitor

import (
	"context"
	"encoding/json"
	"log/slog"
)

// publishEvent publishes a visitor event to NATS JetStream.
// Subject format: dm3.visitor.{tenant_id}.{event_type}
// Does nothing if NATS client is not configured.
func (h *VisitorHandlers) publishEvent(ctx context.Context, tenantID, eventType string, payload any) {
	if h.nats == nil {
		return
	}

	data, err := json.Marshal(payload)
	if err != nil {
		slog.Warn("visitor event marshal error", "event", eventType, "error", err)
		return
	}

	subject := "dm3.visitor." + tenantID + "." + eventType
	if err := h.nats.Publish(ctx, subject, data); err != nil {
		slog.Warn("visitor event publish error", "subject", subject, "error", err)
	}
}

// Visitor event types
const (
	EventVisitCreated    = "visit.created"
	EventVisitApproved   = "visit.approved"
	EventVisitRejected   = "visit.rejected"
	EventVisitCheckedIn  = "visit.checked_in"
	EventVisitCheckedOut = "visit.checked_out"
	EventVisitNoShow     = "visit.no_show"
	EventVisitReinvited  = "visit.reinvited"
	EventHostNotify      = "host.notify"
)
