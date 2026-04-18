package access

import (
	"context"
	"encoding/json"
	"log/slog"
	"strings"
	"time"

	"github.com/duali/dm3-backend/pkg/db"
	"github.com/duali/dm3-backend/pkg/natsutil"
)

// VisitorCredentialConsumer subscribes to visitor events and manages
// temporary credentials: creates on approval, revokes on visit end.
type VisitorCredentialConsumer struct {
	db   *db.DB
	nats *natsutil.Client
}

// NewVisitorCredentialConsumer constructs a VisitorCredentialConsumer.
func NewVisitorCredentialConsumer(database *db.DB, natsClient *natsutil.Client) *VisitorCredentialConsumer {
	return &VisitorCredentialConsumer{db: database, nats: natsClient}
}

// visitApprovedPayload is the event emitted by visitor-svc on visit approval.
type visitApprovedPayload struct {
	TenantID          string     `json:"tenant_id"`
	VisitID           string     `json:"visit_id"`
	VisitorID         string     `json:"visitor_id"`
	VisitorName       string     `json:"visitor_name"`
	AccessAreas       []string   `json:"access_areas"`
	ExpectedArrival   time.Time  `json:"expected_arrival"`
	ExpectedDeparture *time.Time `json:"expected_departure"`
}

// visitEndPayload is the event emitted by visitor-svc when a visit ends
// (checked_out, rejected, cancelled, no_show).
type visitEndPayload struct {
	TenantID         string  `json:"tenant_id"`
	VisitID          string  `json:"visit_id"`
	TempCredentialID *string `json:"temp_credential_id"`
	Reason           string  `json:"reason"`
}

// credentialCreatedPayload is published back to visitor-svc after credential creation.
type credentialCreatedPayload struct {
	TenantID     string `json:"tenant_id"`
	VisitID      string `json:"visit_id"`
	CredentialID string `json:"credential_id"`
}

// Start subscribes to dm3.visitor.*.visit.* on the VISITOR stream,
// routing approval events to credential creation and end events to revocation.
func (c *VisitorCredentialConsumer) Start(ctx context.Context) error {
	handler := func(subject string, data []byte) error {
		return c.handleVisitEvent(ctx, subject, data)
	}
	if err := c.nats.Subscribe(ctx, "VISITOR", "access-svc-visitor-creds", "dm3.visitor.*.visit.*", handler); err != nil {
		return err
	}
	slog.Info("visitor credential consumer started", "subject", "dm3.visitor.*.visit.*")
	return nil
}

// handleVisitEvent routes incoming visitor events by subject suffix.
func (c *VisitorCredentialConsumer) handleVisitEvent(ctx context.Context, subject string, data []byte) error {
	// subject format: dm3.visitor.{tenant_id}.visit.{action}
	// Extract action from the last token.
	lastDot := strings.LastIndex(subject, ".")
	if lastDot < 0 {
		slog.Warn("visitor-cred: unrecognised subject format", "subject", subject)
		return nil
	}
	action := subject[lastDot+1:]

	switch action {
	case "approved":
		return c.handleVisitApproved(ctx, subject, data)
	case "checked_out", "rejected", "cancelled":
		return c.handleVisitEnded(ctx, subject, data, action)
	default:
		// Other events (created, checked_in, no_show, etc.) — ignore.
		return nil
	}
}

func (c *VisitorCredentialConsumer) handleVisitApproved(ctx context.Context, subject string, data []byte) error {
	var payload visitApprovedPayload
	if err := json.Unmarshal(data, &payload); err != nil {
		slog.Warn("visitor-cred: failed to unmarshal visit.approved", "error", err, "subject", subject)
		return nil // ack bad messages
	}

	// Extract tenant_id from subject: dm3.visitor.{tenant_id}.visit.approved
	parts := strings.SplitN(subject, ".", 4)
	if len(parts) < 3 {
		slog.Warn("visitor-cred: cannot extract tenant_id from subject", "subject", subject)
		return nil
	}
	tenantID := parts[2]
	if tenantID == "" {
		tenantID = payload.TenantID
	}

	if payload.VisitID == "" || payload.VisitorID == "" {
		slog.Warn("visitor-cred: missing visit_id or visitor_id in payload", "subject", subject)
		return nil
	}

	dbCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	var credentialID string
	err := c.db.Pool.QueryRow(dbCtx,
		`INSERT INTO dm3_visitor.temp_credentials
		    (tenant_id, visit_id, visitor_id, type, holder_type, valid_from, valid_until)
		 VALUES ($1::uuid, $2::uuid, $3::uuid, 'temporary', 'visitor', $4, $5)
		 RETURNING id::text`,
		tenantID, payload.VisitID, payload.VisitorID,
		payload.ExpectedArrival, payload.ExpectedDeparture,
	).Scan(&credentialID)
	if err != nil {
		slog.Error("visitor-cred: failed to insert temp credential", "error", err, "visit_id", payload.VisitID)
		return err
	}

	slog.Info("visitor-cred: temp credential created",
		"credential_id", credentialID,
		"visit_id", payload.VisitID,
		"tenant_id", tenantID,
	)

	outPayload, _ := json.Marshal(credentialCreatedPayload{
		TenantID:     tenantID,
		VisitID:      payload.VisitID,
		CredentialID: credentialID,
	})

	pubSubject := "dm3.access." + tenantID + ".credential.created"
	if err := c.nats.Publish(ctx, pubSubject, outPayload); err != nil {
		slog.Warn("visitor-cred: failed to publish credential.created", "subject", pubSubject, "error", err)
	}

	return nil
}

func (c *VisitorCredentialConsumer) handleVisitEnded(ctx context.Context, subject string, data []byte, action string) error {
	var payload visitEndPayload
	if err := json.Unmarshal(data, &payload); err != nil {
		slog.Warn("visitor-cred: failed to unmarshal visit end event", "error", err, "subject", subject)
		return nil // ack bad messages
	}

	if payload.TempCredentialID == nil || *payload.TempCredentialID == "" {
		// No credential to revoke — nothing to do.
		return nil
	}

	dbCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	tag, err := c.db.Pool.Exec(dbCtx,
		`UPDATE dm3_visitor.temp_credentials
		 SET revoked_at = now(), revoked_reason = $2
		 WHERE id = $1::uuid AND revoked_at IS NULL`,
		*payload.TempCredentialID, action,
	)
	if err != nil {
		slog.Error("visitor-cred: failed to revoke temp credential",
			"error", err,
			"credential_id", *payload.TempCredentialID,
			"action", action,
		)
		return err
	}

	if tag.RowsAffected() > 0 {
		slog.Info("visitor-cred: temp credential revoked",
			"credential_id", *payload.TempCredentialID,
			"visit_id", payload.VisitID,
			"action", action,
		)
	}

	return nil
}
