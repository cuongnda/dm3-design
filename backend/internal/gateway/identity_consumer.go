package gateway

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"golang.org/x/sync/singleflight"

	"github.com/duali/dm3-backend/pkg/db"
	"github.com/duali/dm3-backend/pkg/natsutil"
)

// IdentityConsumer listens on NATS for person/credential change events
// published by identity-svc and pushes a full PersonSync to every online
// device in the affected tenant. This is the real-time bridge that
// replaces the previous pull-only behavior (sync only on device reconnect
// with local_db_version == 0).
type IdentityConsumer struct {
	db          *db.DB
	nats        *natsutil.Client
	syncService *SyncService
	// singleflight per (tenant, device) prevents concurrent or duplicated
	// PushPersonSync calls when a burst of credential edits arrives.
	// Matches the existing pattern in mqtt_handler.go syncGroup.
	group singleflight.Group
}

func NewIdentityConsumer(database *db.DB, nats *natsutil.Client, sync *SyncService) *IdentityConsumer {
	return &IdentityConsumer{db: database, nats: nats, syncService: sync}
}

// Start subscribes to the dm3.identity.person.changed subject on the
// IDENTITY stream. Must be called after identity-svc has had a chance
// to create the stream (EnsureStream is idempotent so doing it here too
// is safe against startup-order races).
func (c *IdentityConsumer) Start(ctx context.Context) error {
	if err := c.nats.EnsureStream(ctx, "IDENTITY", []string{"dm3.identity.>"}); err != nil {
		return err
	}
	return c.nats.Subscribe(ctx, "IDENTITY", "device-gateway-identity-sync",
		"dm3.identity.person.changed", c.handle)
}

type personChangedEvent struct {
	TenantID string `json:"tenant_id"`
	UserID   string `json:"user_id"`
	Reason   string `json:"reason"`
}

func (c *IdentityConsumer) handle(_ string, data []byte) error {
	var evt personChangedEvent
	if err := json.Unmarshal(data, &evt); err != nil {
		slog.Warn("identity_consumer: bad payload", "error", err)
		// Ack and drop — malformed message, redelivery won't help.
		return nil
	}
	if evt.TenantID == "" {
		slog.Warn("identity_consumer: missing tenant_id")
		return nil
	}

	// Background fan-out so the NATS consumer goroutine isn't blocked
	// on per-device MQTT publishes. The singleflight group inside
	// fanOut still coalesces duplicate syncs for the same device.
	go c.fanOut(evt)
	return nil
}

func (c *IdentityConsumer) fanOut(evt personChangedEvent) {
	lookupCtx, lookupCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer lookupCancel()

	// Push to every device in the tenant that is currently online.
	// Offline devices will pick up the change when they reconnect
	// (existing auto-sync path in mqtt_handler.handleStatus).
	rows, err := c.db.Pool.Query(lookupCtx,
		`SELECT device_id FROM dm3_devices.devices
		 WHERE tenant_id = $1::uuid AND status = 'online'`,
		evt.TenantID,
	)
	if err != nil {
		slog.Error("identity_consumer: list devices failed",
			"error", err, "tenant_id", evt.TenantID)
		return
	}
	defer rows.Close()

	deviceIDs := make([]string, 0, 8)
	for rows.Next() {
		var did string
		if err := rows.Scan(&did); err != nil {
			slog.Error("identity_consumer: scan device failed", "error", err)
			continue
		}
		deviceIDs = append(deviceIDs, did)
	}

	if len(deviceIDs) == 0 {
		slog.Debug("identity_consumer: no online devices to sync",
			"tenant_id", evt.TenantID, "reason", evt.Reason)
		return
	}

	slog.Info("identity_consumer: fanning out person sync",
		"tenant_id", evt.TenantID, "user_id", evt.UserID,
		"reason", evt.Reason, "device_count", len(deviceIDs))

	for _, deviceID := range deviceIDs {
		deviceID := deviceID
		key := evt.TenantID + "/" + deviceID
		go func() {
			_, _, _ = c.group.Do(key, func() (any, error) {
				syncCtx, syncCancel := context.WithTimeout(context.Background(), 15*time.Second)
				defer syncCancel()
				if err := c.syncService.Persons.PushPersonSync(syncCtx, evt.TenantID, deviceID); err != nil {
					slog.Error("identity_consumer: push person sync failed",
						"error", err, "tenant_id", evt.TenantID, "device_id", deviceID)
					return nil, err
				}
				return nil, nil
			})
		}()
	}
}
