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
			tag, err := database.Pool.Exec(ctx,
				`UPDATE dm3_devices.devices SET status = $2, updated_at = now()
				 WHERE status = $3 AND last_seen < $1`, threshold, models.DeviceStatusOffline, models.DeviceStatusOnline)
			if err != nil {
				slog.Error("heartbeat checker: failed to update offline devices", "error", err)
				continue
			}
			if tag.RowsAffected() > 0 {
				slog.Info("heartbeat checker: marked devices offline", "count", tag.RowsAffected())
			}
		}
	}
}
