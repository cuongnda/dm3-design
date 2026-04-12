package visitor

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/duali/dm3-backend/pkg/db"
	"github.com/duali/dm3-backend/pkg/natsutil"
)

// CredentialConsumer subscribes to access-svc credential.created events and
// stores the temporary credential ID on the corresponding visit.
type CredentialConsumer struct {
	db   *db.DB
	nats *natsutil.Client
}

// NewCredentialConsumer constructs a CredentialConsumer.
func NewCredentialConsumer(database *db.DB, natsClient *natsutil.Client) *CredentialConsumer {
	return &CredentialConsumer{db: database, nats: natsClient}
}

type incomingCredentialCreated struct {
	TenantID     string `json:"tenant_id"`
	VisitID      string `json:"visit_id"`
	CredentialID string `json:"credential_id"`
}

// Start subscribes to dm3.access.*.credential.created on the ACCESS stream.
func (c *CredentialConsumer) Start(ctx context.Context) error {
	handler := func(subject string, data []byte) error {
		return c.handleCredentialCreated(ctx, data)
	}
	if err := c.nats.Subscribe(ctx, "ACCESS", "visitor-svc-credentials", "dm3.access.*.credential.created", handler); err != nil {
		return err
	}
	slog.Info("credential consumer started", "subject", "dm3.access.*.credential.created")
	return nil
}

func (c *CredentialConsumer) handleCredentialCreated(ctx context.Context, data []byte) error {
	var payload incomingCredentialCreated
	if err := json.Unmarshal(data, &payload); err != nil {
		slog.Warn("credential-consumer: failed to unmarshal credential.created", "error", err)
		return nil // ack bad messages
	}

	if payload.VisitID == "" || payload.CredentialID == "" {
		slog.Warn("credential-consumer: missing visit_id or credential_id in payload")
		return nil
	}

	dbCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	tag, err := c.db.Pool.Exec(dbCtx,
		`UPDATE dm3_visitor.visits SET temp_credential_id = $1::uuid, updated_at = now() WHERE id = $2::uuid`,
		payload.CredentialID, payload.VisitID,
	)
	if err != nil {
		slog.Error("credential-consumer: failed to update visit temp_credential_id",
			"error", err,
			"visit_id", payload.VisitID,
			"credential_id", payload.CredentialID,
		)
		return err
	}

	slog.Info("credential-consumer: visit temp_credential_id updated",
		"visit_id", payload.VisitID,
		"credential_id", payload.CredentialID,
		"rows_affected", tag.RowsAffected(),
	)
	return nil
}
