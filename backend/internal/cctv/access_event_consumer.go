package cctv

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/duali/dm3-backend/pkg/db"
	"github.com/duali/dm3-backend/pkg/natsutil"
)

// uuidRegex matches a canonical UUID in string form. Package-private copy to
// avoid importing from internal/access (which would create a cross-service
// dependency).
var uuidRegex = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

// AccessEventConsumer subscribes to device access events on the DEVICES stream
// and creates placeholder rows in dm3_cctv.event_clips for every camera bound
// to the event's access point.
//
// Actual clip extraction (pre/post-roll encoding + MinIO upload) is intentionally
// out of scope for P0. This consumer only wires up the data plane so that
// downstream clip-playback and event-linking features have rows to read.
type AccessEventConsumer struct {
	db   *db.DB
	nats *natsutil.Client
}

// NewAccessEventConsumer constructs an AccessEventConsumer.
func NewAccessEventConsumer(database *db.DB, natsClient *natsutil.Client) *AccessEventConsumer {
	return &AccessEventConsumer{db: database, nats: natsClient}
}

// deviceEvent mirrors the envelope published by device-gateway to the DEVICES stream.
type deviceEvent struct {
	Version int             `json:"v"`
	ID      string          `json:"id"`
	TS      int64           `json:"ts"`
	Src     string          `json:"src"`
	Type    string          `json:"type"`
	Data    json.RawMessage `json:"data"`
}

// accessLogData is the subset of the access.log payload we care about.
type accessLogData struct {
	EventID string `json:"event_id"`
	DoorID  string `json:"door_id"`
}

// Start subscribes to dm3.devices.*.*.evt on the DEVICES stream with queue
// group "cctv-svc-access-events".
func (c *AccessEventConsumer) Start(ctx context.Context) error {
	handler := func(subject string, data []byte) error {
		return c.handleAccessEvent(ctx, subject, data)
	}
	const filter = "dm3.devices.*.*.evt"
	if err := c.nats.Subscribe(ctx, "DEVICES", "cctv-svc-access-events", filter, handler); err != nil {
		return fmt.Errorf("cctv: subscribe access events: %w", err)
	}
	slog.Info("cctv access-event consumer started", "subject", filter)
	return nil
}

func (c *AccessEventConsumer) handleAccessEvent(ctx context.Context, subject string, data []byte) error {
	var evt deviceEvent
	if err := json.Unmarshal(data, &evt); err != nil {
		slog.Warn("cctv: failed to unmarshal device event", "error", err, "subject", subject)
		return nil // ack bad messages
	}

	// Only react to access log events — other device events (heartbeat, etc.)
	// are not relevant for clip creation.
	if evt.Type != "access.log" {
		return nil
	}

	// Extract tenant_id from subject: dm3.devices.{tenant_id}.{device_id}.evt
	parts := strings.SplitN(subject, ".", 5)
	if len(parts) < 5 || !uuidRegex.MatchString(parts[2]) {
		slog.Warn("cctv: invalid subject format", "subject", subject)
		return nil
	}
	tenantID := parts[2]

	// Resolve the source (gateway device) UUID from src or subject.
	srcDeviceID := evt.Src
	if srcDeviceID == "" {
		srcDeviceID = parts[3]
	}

	var payload accessLogData
	if err := json.Unmarshal(evt.Data, &payload); err != nil {
		slog.Warn("cctv: failed to unmarshal access.log payload", "error", err)
		return nil
	}

	// Plugin-gate: skip silently if the tenant does not have the cctv plugin enabled.
	enabled, err := c.tenantHasCCTVPlugin(ctx, tenantID)
	if err != nil {
		slog.Error("cctv: plugin check failed", "error", err, "tenant_id", tenantID)
		return err
	}
	if !enabled {
		return nil
	}

	// Find the access_point_id associated with the source device. Access events
	// originate from readers/controllers — not cameras — so we map the source
	// device to its access point and then to any cameras bound to that point.
	accessPointID, err := c.resolveAccessPointID(ctx, tenantID, srcDeviceID, payload.DoorID)
	if err != nil {
		slog.Error("cctv: failed to resolve access_point_id", "error", err, "src", srcDeviceID)
		return err
	}
	if accessPointID == "" {
		// No access point mapped — nothing to link clips to.
		return nil
	}

	cameras, err := c.findCamerasForAccessPoint(ctx, tenantID, accessPointID)
	if err != nil {
		slog.Error("cctv: failed to find cameras for access point", "error", err, "access_point_id", accessPointID)
		return err
	}
	if len(cameras) == 0 {
		return nil
	}

	startedAt := time.UnixMilli(evt.TS)
	var eventUUID *string
	if evt.ID != "" && uuidRegex.MatchString(evt.ID) {
		eventUUID = &evt.ID
	} else if payload.EventID != "" && uuidRegex.MatchString(payload.EventID) {
		eventUUID = &payload.EventID
	}

	dbCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	for _, camDeviceID := range cameras {
		// TODO(cctv): replace placeholder object_key with the real key produced
		// by the clip-extraction pipeline (pre/post-roll encode + MinIO upload).
		// For now we write a deterministic placeholder so downstream features
		// can be wired against real rows.
		placeholderKey := fmt.Sprintf("pending/%s/%s/%d.mp4", tenantID, camDeviceID, startedAt.UnixNano())
		endedAt := startedAt // duration=0 until extractor fills in
		if _, err := c.db.Pool.Exec(dbCtx,
			`INSERT INTO dm3_cctv.event_clips
				(tenant_id, device_id, access_event_id, started_at, ended_at, duration_ms, object_key, trigger)
			 VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, 'access_event')`,
			tenantID, camDeviceID, eventUUID, startedAt, endedAt, 0, placeholderKey,
		); err != nil {
			slog.Error("cctv: insert event_clip failed", "error", err,
				"tenant_id", tenantID, "camera_id", camDeviceID)
			return err // Nak → JetStream redelivers
		}
	}

	slog.Debug("cctv: event_clips placeholders created",
		"tenant_id", tenantID, "access_point_id", accessPointID, "count", len(cameras))
	return nil
}

// tenantHasCCTVPlugin returns true when the tenant's enabled_plugins column
// includes "cctv".
func (c *AccessEventConsumer) tenantHasCCTVPlugin(ctx context.Context, tenantID string) (bool, error) {
	lookupCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	var enabled bool
	err := c.db.Pool.QueryRow(lookupCtx,
		`SELECT 'cctv' = ANY(enabled_plugins) FROM dm3_auth.tenants WHERE id = $1::uuid`,
		tenantID,
	).Scan(&enabled)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return false, nil
		}
		return false, err
	}
	return enabled, nil
}

// resolveAccessPointID maps a source device or legacy door_id to its access_point.
// Tenant-scoped. Returns "" when no mapping exists.
func (c *AccessEventConsumer) resolveAccessPointID(ctx context.Context, tenantID, srcDeviceID, doorID string) (string, error) {
	lookupCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	// Preferred path: source device UUID → access_device → access_point.
	if srcDeviceID != "" {
		var apID string
		err := c.db.Pool.QueryRow(lookupCtx,
			`SELECT ap.id::text
			   FROM dm3_access.access_points ap
			   JOIN dm3_access.access_point_devices apd ON apd.access_point_id = ap.id
			   JOIN dm3_access.access_devices ad ON ad.id::text = apd.access_device_id
			  WHERE ad.device_id = $1::uuid AND ap.tenant_id = $2::uuid
			  LIMIT 1`,
			srcDeviceID, tenantID,
		).Scan(&apID)
		if err == nil {
			return apID, nil
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return "", err
		}
	}

	// Fallback: door_id field from payload is an access_point UUID (legacy shape).
	if uuidRegex.MatchString(doorID) {
		var apID string
		err := c.db.Pool.QueryRow(lookupCtx,
			`SELECT id::text FROM dm3_access.access_points WHERE id = $1::uuid AND tenant_id = $2::uuid`,
			doorID, tenantID,
		).Scan(&apID)
		if err == nil {
			return apID, nil
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return "", err
		}
	}

	return "", nil
}

// findCamerasForAccessPoint returns camera device IDs bound to the given access
// point for the tenant. Cameras are identified as devices of type 'camera'
// that are also linked as access_devices on that access point.
func (c *AccessEventConsumer) findCamerasForAccessPoint(ctx context.Context, tenantID, accessPointID string) ([]string, error) {
	lookupCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	rows, err := c.db.Pool.Query(lookupCtx,
		`SELECT d.id::text
		   FROM dm3_access.access_point_devices apd
		   JOIN dm3_access.access_devices ad ON ad.id::text = apd.access_device_id AND ad.tenant_id = apd.tenant_id
		   JOIN dm3_devices.devices d ON d.id = ad.device_id AND d.tenant_id = ad.tenant_id
		  WHERE apd.access_point_id = $1::uuid AND apd.tenant_id = $2::uuid AND d.type = 'camera'`,
		accessPointID, tenantID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}
