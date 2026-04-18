package access

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/duali/dm3-backend/pkg/db"
	"github.com/duali/dm3-backend/pkg/natsutil"
)

// ParkingBarrierConsumer subscribes to parking zone barrier sync events and
// auto-registers barrier devices in dm3_access.access_devices, creating
// corresponding access_points linked to the access zone.
type ParkingBarrierConsumer struct {
	db   *db.DB
	nats *natsutil.Client
}

// NewParkingBarrierConsumer constructs a ParkingBarrierConsumer.
func NewParkingBarrierConsumer(database *db.DB, natsClient *natsutil.Client) *ParkingBarrierConsumer {
	return &ParkingBarrierConsumer{db: database, nats: natsClient}
}

type barrierSyncEvent struct {
	TenantID     string           `json:"tenant_id"`
	ZoneID       string           `json:"zone_id"`
	ZoneName     string           `json:"zone_name"`
	ZoneCode     string           `json:"zone_code"`
	AccessZoneID *string          `json:"access_zone_id,omitempty"`
	EntryDevices []map[string]any `json:"entry_devices"`
	ExitDevices  []map[string]any `json:"exit_devices"`
	Deleted      bool             `json:"deleted"`
}

// Start subscribes to dm3.parking.*.zone.barrier_sync on the PARKING stream.
func (c *ParkingBarrierConsumer) Start(ctx context.Context) error {
	handler := func(subject string, data []byte) error {
		return c.handleBarrierSync(ctx, subject, data)
	}
	if err := c.nats.Subscribe(ctx, "PARKING", "access-svc-barrier-sync", "dm3.parking.*.zone.barrier_sync", handler); err != nil {
		return err
	}
	slog.Info("parking barrier consumer started", "subject", "dm3.parking.*.zone.barrier_sync")
	return nil
}

func (c *ParkingBarrierConsumer) handleBarrierSync(ctx context.Context, subject string, data []byte) error {
	var evt barrierSyncEvent
	if err := json.Unmarshal(data, &evt); err != nil {
		slog.Warn("barrier-sync: failed to unmarshal event", "error", err, "subject", subject)
		return nil
	}

	// Extract tenant_id from subject: dm3.parking.{tenant_id}.zone.barrier_sync
	parts := strings.SplitN(subject, ".", 5)
	if len(parts) < 5 {
		slog.Warn("barrier-sync: invalid subject format", "subject", subject)
		return nil
	}
	tenantID := parts[2]
	if tenantID == "" || !uuidRegex.MatchString(tenantID) {
		slog.Warn("barrier-sync: invalid tenant_id in subject", "subject", subject)
		return nil
	}

	dbCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	if evt.Deleted {
		return c.handleBarrierDelete(dbCtx, tenantID, evt.ZoneID)
	}
	return c.handleBarrierUpsert(dbCtx, tenantID, evt)
}

// handleBarrierDelete removes access devices and access points that were
// auto-registered for the deleted parking zone.
func (c *ParkingBarrierConsumer) handleBarrierDelete(ctx context.Context, tenantID, zoneID string) error {
	sourcePrefix := "parking:" + zoneID + ":"

	// Delete access_point_devices referencing our barrier devices
	_, _ = c.db.Pool.Exec(ctx,
		`DELETE FROM dm3_access.access_point_devices
		 WHERE tenant_id = $1::uuid
		   AND access_device_id IN (
		       SELECT id::text FROM dm3_access.access_devices
		       WHERE tenant_id = $1::uuid AND source = 'parking' AND source_ref LIKE $2
		   )`,
		tenantID, sourcePrefix+"%")

	// Delete access points created for this zone
	_, _ = c.db.Pool.Exec(ctx,
		`DELETE FROM dm3_access.access_points
		 WHERE tenant_id = $1::uuid
		   AND id IN (
		       SELECT ap.id FROM dm3_access.access_points ap
		       WHERE ap.tenant_id = $1::uuid
		         AND ap.name LIKE $2
		         AND NOT EXISTS (
		             SELECT 1 FROM dm3_access.access_point_devices apd
		             WHERE apd.access_point_id = ap.id
		               AND apd.tenant_id = $1::uuid
		               AND apd.access_device_id NOT IN (
		                   SELECT id::text FROM dm3_access.access_devices
		                   WHERE source = 'parking' AND source_ref LIKE $3
		               )
		         )
		   )`,
		tenantID, "Parking: %", sourcePrefix+"%")

	// Delete the barrier devices themselves
	tag, err := c.db.Pool.Exec(ctx,
		`DELETE FROM dm3_access.access_devices
		 WHERE tenant_id = $1::uuid AND source = 'parking' AND source_ref LIKE $2`,
		tenantID, sourcePrefix+"%")
	if err != nil {
		slog.Error("barrier-sync: failed to delete barrier devices", "error", err, "zone_id", zoneID)
		return err
	}

	if tag.RowsAffected() > 0 {
		slog.Info("barrier-sync: deleted barrier devices for zone",
			"zone_id", zoneID, "count", tag.RowsAffected())
	}
	return nil
}

// handleBarrierUpsert creates or updates barrier devices and access points.
func (c *ParkingBarrierConsumer) handleBarrierUpsert(ctx context.Context, tenantID string, evt barrierSyncEvent) error {
	// Upsert an access point for this parking zone
	accessPointID, err := c.upsertAccessPoint(ctx, tenantID, evt)
	if err != nil {
		slog.Error("barrier-sync: failed to upsert access point", "error", err, "zone_id", evt.ZoneID)
		return err
	}

	// Upsert entry barrier devices
	for i, dev := range evt.EntryDevices {
		sourceRef := fmt.Sprintf("parking:%s:entry:%d", evt.ZoneID, i)
		deviceName := fmt.Sprintf("Parking: %s Entry #%d", evt.ZoneName, i+1)
		if name, ok := dev["name"].(string); ok && name != "" {
			deviceName = name
		}
		deviceID, err := c.upsertBarrierDevice(ctx, tenantID, sourceRef, deviceName, "barrier")
		if err != nil {
			slog.Error("barrier-sync: failed to upsert entry device", "error", err, "index", i)
			continue
		}
		c.linkDeviceToAccessPoint(ctx, tenantID, accessPointID, deviceID, "reader_in")
	}

	// Upsert exit barrier devices
	for i, dev := range evt.ExitDevices {
		sourceRef := fmt.Sprintf("parking:%s:exit:%d", evt.ZoneID, i)
		deviceName := fmt.Sprintf("Parking: %s Exit #%d", evt.ZoneName, i+1)
		if name, ok := dev["name"].(string); ok && name != "" {
			deviceName = name
		}
		deviceID, err := c.upsertBarrierDevice(ctx, tenantID, sourceRef, deviceName, "barrier")
		if err != nil {
			slog.Error("barrier-sync: failed to upsert exit device", "error", err, "index", i)
			continue
		}
		c.linkDeviceToAccessPoint(ctx, tenantID, accessPointID, deviceID, "reader_out")
	}

	slog.Info("barrier-sync: synced barrier devices",
		"zone_id", evt.ZoneID,
		"entry_count", len(evt.EntryDevices),
		"exit_count", len(evt.ExitDevices),
	)
	return nil
}

// upsertAccessPoint creates or updates an access point for the parking zone.
func (c *ParkingBarrierConsumer) upsertAccessPoint(ctx context.Context, tenantID string, evt barrierSyncEvent) (string, error) {
	apName := "Parking: " + evt.ZoneName
	description := fmt.Sprintf("Auto-registered access point for parking zone %s", evt.ZoneCode)

	var accessPointID string
	err := c.db.Pool.QueryRow(ctx,
		`INSERT INTO dm3_access.access_points (tenant_id, zone_id, name, description)
		 VALUES ($1::uuid, $2::uuid, $3, $4)
		 ON CONFLICT ON CONSTRAINT access_points_pkey DO NOTHING
		 RETURNING id::text`,
		tenantID, evt.AccessZoneID, apName, description,
	).Scan(&accessPointID)

	if err != nil {
		// Access point may already exist — look it up by name + tenant
		err = c.db.Pool.QueryRow(ctx,
			`SELECT id::text FROM dm3_access.access_points
			 WHERE tenant_id = $1::uuid AND name = $2
			 LIMIT 1`,
			tenantID, apName,
		).Scan(&accessPointID)
		if err != nil {
			return "", fmt.Errorf("failed to find or create access point: %w", err)
		}
		// Update zone_id if it changed
		if evt.AccessZoneID != nil {
			_, _ = c.db.Pool.Exec(ctx,
				`UPDATE dm3_access.access_points SET zone_id = $2::uuid, updated_at = now()
				 WHERE id = $1::uuid AND tenant_id = $3::uuid`,
				accessPointID, *evt.AccessZoneID, tenantID)
		}
	}

	return accessPointID, nil
}

// upsertBarrierDevice creates or updates a barrier device using the source/source_ref
// unique index for idempotent operations.
func (c *ParkingBarrierConsumer) upsertBarrierDevice(ctx context.Context, tenantID, sourceRef, name, deviceType string) (string, error) {
	var deviceID string

	// Try to find existing device by source_ref
	err := c.db.Pool.QueryRow(ctx,
		`SELECT id::text FROM dm3_access.access_devices
		 WHERE tenant_id = $1::uuid AND source = 'parking' AND source_ref = $2`,
		tenantID, sourceRef,
	).Scan(&deviceID)

	if err == nil {
		// Update existing device name
		_, _ = c.db.Pool.Exec(ctx,
			`UPDATE dm3_access.access_devices SET name = $2, updated_at = now()
			 WHERE id = $1::uuid`,
			deviceID, name)
		return deviceID, nil
	}

	// Insert new device
	err = c.db.Pool.QueryRow(ctx,
		`INSERT INTO dm3_access.access_devices (tenant_id, name, type, source, source_ref)
		 VALUES ($1::uuid, $2, $3, 'parking', $4)
		 RETURNING id::text`,
		tenantID, name, deviceType, sourceRef,
	).Scan(&deviceID)
	if err != nil {
		return "", fmt.Errorf("failed to insert barrier device: %w", err)
	}

	return deviceID, nil
}

// linkDeviceToAccessPoint creates the junction between access_point and access_device.
func (c *ParkingBarrierConsumer) linkDeviceToAccessPoint(ctx context.Context, tenantID, accessPointID, deviceID, role string) {
	_, _ = c.db.Pool.Exec(ctx,
		`INSERT INTO dm3_access.access_point_devices (tenant_id, access_point_id, access_device_id, role)
		 VALUES ($1::uuid, $2::uuid, $3, $4)
		 ON CONFLICT ON CONSTRAINT uq_ap_access_device DO UPDATE SET role = EXCLUDED.role`,
		tenantID, accessPointID, deviceID, role)
}
