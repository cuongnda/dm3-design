package access

import (
	"context"
	"encoding/json"
	"log/slog"
	"regexp"
	"time"

	"github.com/duali/dm3-backend/pkg/db"
	"github.com/duali/dm3-backend/pkg/natsutil"
)

var uuidRegex = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

func toUUIDPtr(s string) *string {
	if s == "" || !uuidRegex.MatchString(s) {
		return nil
	}
	return &s
}

type NATSConsumer struct {
	db   *db.DB
	nats *natsutil.Client
}

func NewNATSConsumer(database *db.DB, natsClient *natsutil.Client) *NATSConsumer {
	return &NATSConsumer{db: database, nats: natsClient}
}

type deviceEvent struct {
	Version int             `json:"version"`
	ID      string          `json:"id"`
	TS      int64           `json:"ts"`
	Src     string          `json:"src"`
	Type    string          `json:"type"`
	Data    json.RawMessage `json:"data"`
}

type accessLogData struct {
	DoorID         string         `json:"door_id"`
	UserID       string         `json:"user_id"`
	UserName     string         `json:"user_name"`
	CredentialType string         `json:"credential_type"`
	Direction      string         `json:"direction"`
	Decision       string         `json:"decision"`
	Reason         string         `json:"reason"`
	Confidence     *float64       `json:"confidence"`
	PhotoRef       string         `json:"photo_ref"`
	Temperature    *float64       `json:"temperature"`
	Metadata       map[string]any `json:"metadata"`
}

// Start subscribes to NATS device events and ingests access events into the DB.
func (c *NATSConsumer) Start(ctx context.Context) error {
	if err := c.nats.Subscribe(ctx, "DEVICES", "access-svc-events", "dm3.devices.*.*.evt", c.handleEvent); err != nil {
		return err
	}
	slog.Info("nats consumer started", "subject", "dm3.devices.*.*.evt")
	return nil
}

func (c *NATSConsumer) handleEvent(subject string, data []byte) error {
	var evt deviceEvent
	if err := json.Unmarshal(data, &evt); err != nil {
		slog.Warn("nats: failed to unmarshal event", "error", err, "subject", subject)
		return nil // ack bad messages to avoid redelivery
	}

	// Only process access.log events
	if evt.Type != "access.log" {
		return nil
	}

	var ald accessLogData
	if err := json.Unmarshal(evt.Data, &ald); err != nil {
		slog.Warn("nats: failed to unmarshal access.log data", "error", err)
		return nil
	}

	evtTime := time.UnixMilli(evt.TS)
	metadataJSON, _ := json.Marshal(ald.Metadata)

	// Extract device_id from source or subject
	deviceID := evt.Src

	_, err := c.db.Pool.Exec(context.Background(),
		`INSERT INTO dm3_access.access_events (time, door_id, device_id, user_id, user_name, credential_type, direction, decision, reason, confidence, photo_ref, temperature, metadata)
		 VALUES ($1, $2, $3, $4, NULLIF($5,''), NULLIF($6,''), NULLIF($7,''), $8, NULLIF($9,''), $10, NULLIF($11,''), $12, $13)`,
		evtTime, toUUIDPtr(ald.DoorID), toUUIDPtr(deviceID), toUUIDPtr(ald.UserID), ald.UserName, ald.CredentialType,
		ald.Direction, ald.Decision, ald.Reason, ald.Confidence, ald.PhotoRef, ald.Temperature, metadataJSON)
	if err != nil {
		slog.Error("nats: failed to insert access event", "error", err)
		return err
	}

	// Update door's last_event_at
	if doorUUID := toUUIDPtr(ald.DoorID); doorUUID != nil {
		_, _ = c.db.Pool.Exec(context.Background(),
			`UPDATE dm3_access.doors SET last_event_at = $1 WHERE id = $2::uuid`, evtTime, *doorUUID)
	}

	slog.Debug("access event ingested", "door", ald.DoorID, "decision", ald.Decision, "user", ald.UserName)
	return nil
}
