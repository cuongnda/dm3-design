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

// VisitorCredentialConsumer subscribes to visitor approval events and creates
// temporary credentials, then publishes back to visitor-svc.
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

// credentialCreatedPayload is published back to visitor-svc after credential creation.
type credentialCreatedPayload struct {
	TenantID     string `json:"tenant_id"`
	VisitID      string `json:"visit_id"`
	CredentialID string `json:"credential_id"`
}

// Start subscribes to dm3.visitor.*.visit.approved on the VISITOR stream.
func (c *VisitorCredentialConsumer) Start(ctx context.Context) error {
	handler := func(subject string, data []byte) error {
		return c.handleVisitApproved(ctx, subject, data)
	}
	if err := c.nats.Subscribe(ctx, "VISITOR", "access-svc-visitor-creds", "dm3.visitor.*.visit.approved", handler); err != nil {
		return err
	}
	slog.Info("visitor credential consumer started", "subject", "dm3.visitor.*.visit.approved")
	return nil
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
