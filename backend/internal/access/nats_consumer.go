package access

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

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
	Version int             `json:"v"`
	ID      string          `json:"id"`
	TS      int64           `json:"ts"`
	Src     string          `json:"src"`
	Type    string          `json:"type"`
	Data    json.RawMessage `json:"data"`
}

type accessLogData struct {
	DoorID          string         `json:"door_id"` // legacy field, may still arrive from older firmware
	UserID          string         `json:"user_id"`
	UserName        string         `json:"user_name"`
	CredentialType  string         `json:"credential_type"`
	Direction       string         `json:"direction"`
	Decision        string         `json:"decision"`
	Reason          string         `json:"reason"`
	Confidence      *float64       `json:"confidence"`
	PhotoRef        string         `json:"photo_ref"`
	Temperature     *float64       `json:"temperature"`
	DecidedLocally  *bool          `json:"decided_locally"`
	Metadata        map[string]any `json:"metadata"`
}

// Start subscribes to NATS device events and ingests access events into the DB.
func (c *NATSConsumer) Start(ctx context.Context) error {
	handler := func(subject string, data []byte) error {
		return c.handleEvent(ctx, subject, data)
	}
	if err := c.nats.Subscribe(ctx, "DEVICES", "access-svc-events", "dm3.devices.*.*.evt", handler); err != nil {
		return err
	}
	slog.Info("nats consumer started", "subject", "dm3.devices.*.*.evt")
	return nil
}

func (c *NATSConsumer) handleEvent(ctx context.Context, subject string, data []byte) error {
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

	// Extract tenant_id from NATS subject: dm3.devices.{tenant_id}.{device_id}.evt
	parts := strings.SplitN(subject, ".", 5)
	if len(parts) < 4 || !uuidRegex.MatchString(parts[2]) {
		slog.Warn("nats: cannot extract tenant_id from subject", "subject", subject)
		return nil
	}
	tenantID := parts[2]

	// Extract device_id from source or subject
	deviceID := evt.Src
	if deviceID == "" {
		deviceID = parts[3]
	}

	// Resolve access_point_id from device_id via access_point_devices junction table
	var accessPointID *string
	if deviceID != "" {
		lookupCtx, lookupCancel := context.WithTimeout(ctx, 2*time.Second)
		err := c.db.Pool.QueryRow(lookupCtx,
			`SELECT ap.id::text FROM dm3_access.access_points ap
			 JOIN dm3_access.access_point_devices apd ON apd.access_point_id = ap.id
			 WHERE apd.access_device_id = $1 AND ap.tenant_id = $2::uuid
			 LIMIT 1`,
			deviceID, tenantID,
		).Scan(&accessPointID)
		lookupCancel()
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			slog.Error("nats: failed to resolve access_point_id", "error", err, "device_id", deviceID, "tenant_id", tenantID)
		}
	}

	// Use a bounded context for DB operations so they cannot hang indefinitely.
	dbCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	decidedLocally := true
	if ald.DecidedLocally != nil {
		decidedLocally = *ald.DecidedLocally
	}

	_, err := c.db.Pool.Exec(dbCtx,
		`INSERT INTO dm3_access.access_events (time, tenant_id, access_point_id, door_id, user_id, user_name, credential_type, direction, decision, reason, confidence, photo_ref, temperature, decided_locally, metadata)
		 VALUES ($1, $2::uuid, $3::uuid, $4::uuid, $5::uuid, NULLIF($6,''), NULLIF($7,''), NULLIF($8,''), $9, NULLIF($10,''), $11, NULLIF($12,''), $13, $14, $15)`,
		evtTime, tenantID, accessPointID, toUUIDPtr(ald.DoorID), toUUIDPtr(ald.UserID), ald.UserName, ald.CredentialType,
		ald.Direction, ald.Decision, ald.Reason, ald.Confidence, ald.PhotoRef, ald.Temperature, decidedLocally, metadataJSON)
	if err != nil {
		slog.Error("nats: failed to insert access event", "error", err)
		return err
	}

	// Update access device's last_event_at using the actual device ID (from subject/src),
	// not ald.DoorID which is the door/access-point identifier.
	if deviceUUID := toUUIDPtr(deviceID); deviceUUID != nil {
		updateCtx, updateCancel := context.WithTimeout(ctx, 5*time.Second)
		if _, err := c.db.Pool.Exec(updateCtx,
			`UPDATE dm3_access.access_devices SET last_event_at = $1 WHERE id = $2::uuid`, evtTime, *deviceUUID); err != nil {
			slog.Warn("nats: failed to update access device last_event_at", "error", err, "device", *deviceUUID)
		}
		updateCancel()
	}

	slog.Debug("access event ingested", "device", ald.DoorID, "decision", ald.Decision, "user", ald.UserName)
	return nil
}
