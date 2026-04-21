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
// to the event's access point. When a ClipExtractor is configured, it also
// spawns async clip extraction (ffmpeg RTSP → MP4 → MinIO) for each placeholder.
type AccessEventConsumer struct {
	db        *db.DB
	nats      *natsutil.Client
	extractor *ClipExtractor // nil when clip extraction is disabled
}

// NewAccessEventConsumer constructs an AccessEventConsumer.
// extractor is optional — pass nil to create placeholder rows without extracting clips.
func NewAccessEventConsumer(database *db.DB, natsClient *natsutil.Client, extractor *ClipExtractor) *AccessEventConsumer {
	return &AccessEventConsumer{db: database, nats: natsClient, extractor: extractor}
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

	// Resolve the source device UUID. The src field may be a UUID directly
	// or "device:{rid}" format. Fall back to subject segment if empty.
	srcDeviceID := evt.Src
	if srcDeviceID == "" {
		srcDeviceID = parts[3]
	}
	// Strip "device:" prefix if present (e.g. "device:840107" → "840107")
	srcDeviceID = strings.TrimPrefix(srcDeviceID, "device:")
	// If srcDeviceID is a short rid (not UUID), resolve to device UUID from DB
	if !uuidRegex.MatchString(srcDeviceID) {
		var deviceUUID string
		err := c.db.Pool.QueryRow(ctx,
			`SELECT id::text FROM dm3_devices.devices WHERE device_id = $1 AND tenant_id = $2::uuid LIMIT 1`,
			srcDeviceID, tenantID,
		).Scan(&deviceUUID)
		if err != nil {
			// Device not found — skip silently (not every device has CCTV)
			return nil
		}
		srcDeviceID = deviceUUID
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

	// If the source device IS a camera, only create a clip for that camera
	// (e.g. TungSon face recognition events originate from the camera itself).
	// If the source is a terminal/controller, find all cameras on the same access point.
	var cameras []string
	if c.isCamera(ctx, tenantID, srcDeviceID) {
		cameras = []string{srcDeviceID}
	} else {
		accessPointID, err := c.resolveAccessPointID(ctx, tenantID, srcDeviceID, payload.DoorID)
		if err != nil {
			slog.Error("cctv: failed to resolve access_point_id", "error", err, "src", srcDeviceID)
			return err
		}
		if accessPointID == "" {
			return nil
		}
		cameras, err = c.findCamerasForAccessPoint(ctx, tenantID, accessPointID)
		if err != nil {
			slog.Error("cctv: failed to find cameras for access point", "error", err, "access_point_id", accessPointID)
			return err
		}
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
		placeholderKey := fmt.Sprintf("pending/%s/%s/%d.mp4", tenantID, camDeviceID, startedAt.UnixNano())
		var clipID string
		if err := c.db.Pool.QueryRow(dbCtx,
			`INSERT INTO dm3_cctv.event_clips
				(tenant_id, device_id, access_event_id, started_at, duration_ms, object_key, trigger)
			 VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, 'access_event')
			 RETURNING id::text`,
			tenantID, camDeviceID, eventUUID, startedAt, 0, placeholderKey,
		).Scan(&clipID); err != nil {
			slog.Error("cctv: insert event_clip failed", "error", err,
				"tenant_id", tenantID, "camera_id", camDeviceID)
			return err // Nak → JetStream redelivers
		}

		// Spawn async clip extraction if the extractor is wired.
		if c.extractor != nil {
			go c.extractor.ExtractClip(ctx, clipID, tenantID, camDeviceID)
		}
	}

	slog.Debug("cctv: event_clips placeholders created",
		"tenant_id", tenantID, "count", len(cameras))
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

// isCamera returns true if the device is a camera (type='camera' in dm3_devices.devices).
func (c *AccessEventConsumer) isCamera(ctx context.Context, tenantID, deviceID string) bool {
	lookupCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	var isCamera bool
	_ = c.db.Pool.QueryRow(lookupCtx,
		`SELECT EXISTS(SELECT 1 FROM dm3_devices.devices WHERE id = $1::uuid AND tenant_id = $2::uuid AND type = 'camera')`,
		deviceID, tenantID,
	).Scan(&isCamera)
	return isCamera
}
