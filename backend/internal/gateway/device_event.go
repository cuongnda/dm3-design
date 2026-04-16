package gateway

import (
	"context"
	"encoding/json"
	"log/slog"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// DeviceEvent represents a single lifecycle event for a device (on/off,
// command, sync, emergency, error, etc.). Inserted into
// dm3_devices.device_events by the various hook points in the gateway.
type DeviceEvent struct {
	TenantID    string
	DeviceID    string // devices.device_id (human-readable)
	EventType   string // online, offline, restart, command, door_command, sync, emergency, config_ack, error
	Description string
	ActorID     *string // nil for device/system-initiated
	ActorEmail  *string
	Metadata    map[string]any
}

const insertDeviceEventSQL = `INSERT INTO dm3_devices.device_events
	(tenant_id, device_id, event_type, description, actor_id, actor_email, metadata)
	VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::jsonb, '{}'::jsonb))`

// InsertDeviceEvent writes a lifecycle event row. Errors are logged but not
// propagated — callers should not fail their primary operation because
// history recording failed.
func InsertDeviceEvent(ctx context.Context, pool *pgxpool.Pool, evt DeviceEvent) {
	metaJSON := marshalJSONBSafe(evt.Metadata)

	_, err := pool.Exec(ctx, insertDeviceEventSQL,
		evt.TenantID,
		evt.DeviceID,
		evt.EventType,
		evt.Description,
		nullableStr(evt.ActorID),
		nullableStr(evt.ActorEmail),
		metaJSON,
	)
	if err != nil {
		slog.Error("device_event: insert failed",
			"error", err,
			"tenant", evt.TenantID,
			"device", evt.DeviceID,
			"type", evt.EventType,
		)
	}
}

// InsertDeviceEventBatch inserts multiple events in a single round-trip.
func InsertDeviceEventBatch(ctx context.Context, pool *pgxpool.Pool, events []DeviceEvent) {
	if len(events) == 0 {
		return
	}
	batch := &pgx.Batch{}
	for _, evt := range events {
		metaJSON := marshalJSONBSafe(evt.Metadata)
		batch.Queue(insertDeviceEventSQL,
			evt.TenantID,
			evt.DeviceID,
			evt.EventType,
			evt.Description,
			nullableStr(evt.ActorID),
			nullableStr(evt.ActorEmail),
			metaJSON,
		)
	}
	br := pool.SendBatch(ctx, batch)
	defer br.Close()
	for range events {
		if _, err := br.Exec(); err != nil {
			slog.Error("device_event: batch insert failed", "error", err)
		}
	}
}

// marshalJSONBSafe returns JSON bytes from a map, falling back to "{}".
func marshalJSONBSafe(m map[string]any) []byte {
	if len(m) == 0 {
		return []byte("{}")
	}
	b, err := json.Marshal(m)
	if err != nil {
		slog.Warn("device_event: failed to marshal metadata", "error", err)
		return []byte("{}")
	}
	return b
}

// nullableStr returns nil for pgx NULL binding if ptr is nil or empty.
func nullableStr(ptr *string) any {
	if ptr == nil || *ptr == "" {
		return nil
	}
	return *ptr
}

// strPtr returns a *string from a string, or nil if empty.
func strPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
