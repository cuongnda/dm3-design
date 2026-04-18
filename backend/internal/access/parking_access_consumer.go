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

// ParkingAccessConsumer subscribes to parking access events and ingests them
// into dm3_access.access_events so that parking entry/exit appears in the
// unified access event log.
type ParkingAccessConsumer struct {
	db   *db.DB
	nats *natsutil.Client
}

// NewParkingAccessConsumer constructs a ParkingAccessConsumer.
func NewParkingAccessConsumer(database *db.DB, natsClient *natsutil.Client) *ParkingAccessConsumer {
	return &ParkingAccessConsumer{db: database, nats: natsClient}
}

// parkingAccessEvent mirrors the payload published by parking-svc.
type parkingAccessEvent struct {
	TenantID       string   `json:"tenant_id"`
	SessionID      string   `json:"session_id"`
	PlateNumber    string   `json:"plate_number"`
	VehicleID      *string  `json:"vehicle_id,omitempty"`
	UserID         *string  `json:"user_id,omitempty"`
	ZoneID         string   `json:"zone_id"`
	AccessZoneID   *string  `json:"access_zone_id,omitempty"`
	DeviceID       *string  `json:"device_id,omitempty"`
	MatchedBy      string   `json:"matched_by"`
	CredentialType string   `json:"credential_type"`
	Direction      string   `json:"direction"`
	Decision       string   `json:"decision"`
	Reason         string   `json:"reason"`
	Confidence     *float64 `json:"confidence,omitempty"`
	Time           int64    `json:"time"`
}

// Start subscribes to dm3.parking.*.access.* on the PARKING stream.
func (c *ParkingAccessConsumer) Start(ctx context.Context) error {
	handler := func(subject string, data []byte) error {
		return c.handleParkingAccessEvent(ctx, subject, data)
	}
	if err := c.nats.Subscribe(ctx, "PARKING", "access-svc-parking-events", "dm3.parking.*.access.*", handler); err != nil {
		return err
	}
	slog.Info("parking access consumer started", "subject", "dm3.parking.*.access.*")
	return nil
}

func (c *ParkingAccessConsumer) handleParkingAccessEvent(ctx context.Context, subject string, data []byte) error {
	var evt parkingAccessEvent
	if err := json.Unmarshal(data, &evt); err != nil {
		slog.Warn("parking-access: failed to unmarshal event", "error", err, "subject", subject)
		return nil // ack bad messages
	}

	// Extract tenant_id from subject: dm3.parking.{tenant_id}.access.{direction}
	parts := strings.SplitN(subject, ".", 5)
	if len(parts) < 5 {
		slog.Warn("parking-access: invalid subject format", "subject", subject)
		return nil
	}
	tenantID := parts[2]
	if tenantID == "" || !uuidRegex.MatchString(tenantID) {
		slog.Warn("parking-access: invalid tenant_id in subject", "subject", subject)
		return nil
	}

	evtTime := time.UnixMilli(evt.Time)

	// Resolve access_point_id from device_id if available
	var accessPointID *string
	if evt.DeviceID != nil && *evt.DeviceID != "" {
		lookupCtx, lookupCancel := context.WithTimeout(ctx, 2*time.Second)
		err := c.db.Pool.QueryRow(lookupCtx,
			`SELECT ap.id::text FROM dm3_access.access_points ap
			 JOIN dm3_access.access_point_devices apd ON apd.access_point_id = ap.id
			 WHERE apd.access_device_id = $1 AND ap.tenant_id = $2::uuid
			 LIMIT 1`,
			*evt.DeviceID, tenantID,
		).Scan(&accessPointID)
		lookupCancel()
		if err != nil {
			// No access point found for this device — that's OK for parking barriers
			// not yet registered as access devices.
			slog.Debug("parking-access: no access_point for device", "device_id", *evt.DeviceID)
		}
	}

	// Build metadata with parking-specific context
	metadata, _ := json.Marshal(map[string]any{
		"source":         "parking",
		"session_id":     evt.SessionID,
		"plate_number":   evt.PlateNumber,
		"vehicle_id":     evt.VehicleID,
		"parking_zone":   evt.ZoneID,
		"matched_by":     evt.MatchedBy,
		"access_zone_id": evt.AccessZoneID,
	})

	// Use access_zone_id as the door_id equivalent when no physical device maps
	var doorID *string
	if evt.AccessZoneID != nil && *evt.AccessZoneID != "" {
		doorID = evt.AccessZoneID
	}

	userName := "vehicle:" + evt.PlateNumber

	dbCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	_, err := c.db.Pool.Exec(dbCtx,
		`INSERT INTO dm3_access.access_events
			(time, tenant_id, access_point_id, door_id, user_id, user_name, credential_type, direction, decision, reason, confidence, photo_ref, temperature, decided_locally, metadata)
		 VALUES ($1, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6, $7, $8, $9, $10, $11, NULL, NULL, false, $12)`,
		evtTime, tenantID, accessPointID, doorID, toUUIDPtr(derefPtr(evt.UserID)),
		userName, evt.CredentialType, evt.Direction, evt.Decision, evt.Reason,
		evt.Confidence, metadata,
	)
	if err != nil {
		slog.Error("parking-access: failed to insert access event", "error", err, "session_id", evt.SessionID)
		return err
	}

	slog.Debug("parking access event ingested",
		"session_id", evt.SessionID,
		"direction", evt.Direction,
		"decision", evt.Decision,
		"plate", evt.PlateNumber,
	)
	return nil
}

// derefPtr safely dereferences a *string, returning "" if nil.
func derefPtr(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
