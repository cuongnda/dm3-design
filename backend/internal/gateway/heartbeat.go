package gateway

import (
	"context"
	"log/slog"
	"time"

	"github.com/duali/dm3-backend/internal/models"
	"github.com/duali/dm3-backend/pkg/db"
)

const (
	// HeartbeatInterval is expected device heartbeat interval.
	HeartbeatInterval = 30 * time.Second
	// OfflineThreshold: device is offline if no heartbeat for 3x interval.
	OfflineThreshold = 3 * HeartbeatInterval
	// CheckInterval is how often we scan for offline devices.
	CheckInterval = 30 * time.Second
)

// StartHeartbeatChecker periodically marks devices as offline if they haven't been seen.
func StartHeartbeatChecker(ctx context.Context, database *db.DB, hub *EventHub) {
	ticker := time.NewTicker(CheckInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			threshold := time.Now().Add(-OfflineThreshold)

			// Capture which devices will be marked offline, then update.
			// CTE returns the affected rows so we can record device_events.
			rows, err := database.Pool.Query(ctx,
				`WITH expired AS (
					UPDATE dm3_devices.devices
					   SET status = $2, updated_at = now()
					 WHERE status = $3 AND last_seen < $1
					 RETURNING tenant_id, device_id
				) SELECT tenant_id::text, device_id FROM expired`,
				threshold, models.DeviceStatusOffline, models.DeviceStatusOnline)
			if err != nil {
				slog.Error("heartbeat checker: failed to update offline devices", "error", err)
				continue
			}

			var events []DeviceEvent
			for rows.Next() {
				var tid, did string
				if err := rows.Scan(&tid, &did); err != nil {
					slog.Error("heartbeat checker: scan failed", "error", err)
					continue
				}
				events = append(events, DeviceEvent{
					TenantID:    tid,
					DeviceID:    did,
					EventType:   "offline",
					Description: "Device offline (heartbeat timeout)",
				})
			}
			rows.Close()

			if len(events) > 0 {
				slog.Info("heartbeat checker: marked devices offline", "count", len(events))
				go InsertDeviceEventBatch(ctx, database.Pool, events)
			}
		}
	}
}
