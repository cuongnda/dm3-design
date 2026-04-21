package gateway

import (
	"context"
	"encoding/json"
	"log/slog"
	"strings"
	"time"

	"golang.org/x/sync/singleflight"

	"github.com/duali/dm3-backend/pkg/db"
	"github.com/duali/dm3-backend/pkg/natsutil"
)

// VisitorConsumer listens on NATS for visit lifecycle events published by
// visitor-svc and pushes a full VisitorSync to every online device in the
// affected tenant. Mirrors IdentityConsumer — visits are low-volume enough
// that a full resync per event is simpler than diffing.
type VisitorConsumer struct {
	db          *db.DB
	nats        *natsutil.Client
	syncService *SyncService
	group       singleflight.Group
}

func NewVisitorConsumer(database *db.DB, nats *natsutil.Client, sync *SyncService) *VisitorConsumer {
	return &VisitorConsumer{db: database, nats: nats, syncService: sync}
}

// Start subscribes to dm3.visitor.*.visit.* on the VISITOR stream. The stream
// is owned by visitor-svc; EnsureStream here is defensive in case device-gateway
// boots first.
func (c *VisitorConsumer) Start(ctx context.Context) error {
	if err := c.nats.EnsureStream(ctx, "VISITOR", []string{"dm3.visitor.>"}); err != nil {
		return err
	}
	return c.nats.Subscribe(ctx, "VISITOR", "device-gateway-visitor-sync",
		"dm3.visitor.*.visit.*", c.handle)
}

// visitEvent is the minimal shape we need from any visitor lifecycle event.
// Extra fields in the payload (host, purpose, etc.) are ignored.
type visitEvent struct {
	TenantID string `json:"tenant_id"`
	VisitID  string `json:"visit_id"`
}

func (c *VisitorConsumer) handle(subject string, data []byte) error {
	// Only react to events that change which visits are active on devices.
	// visit.created / visit.checked_in / host.notify do not affect the
	// authoritative set — access is granted at approval, and check-in
	// doesn't change the visit's active window.
	action := actionFromSubject(subject)
	switch action {
	case "approved", "reinvited",
		"checked_out", "rejected", "cancelled", "no_show":
		// handled below
	default:
		return nil
	}

	var evt visitEvent
	if err := json.Unmarshal(data, &evt); err != nil {
		slog.Warn("visitor_consumer: bad payload", "subject", subject, "error", err)
		return nil // ack — redelivery won't fix a malformed event
	}
	tenantID := evt.TenantID
	if tenantID == "" {
		// Subject format: dm3.visitor.{tenant_id}.visit.{action}
		parts := strings.SplitN(subject, ".", 4)
		if len(parts) >= 3 {
			tenantID = parts[2]
		}
	}
	if tenantID == "" {
		slog.Warn("visitor_consumer: missing tenant_id", "subject", subject)
		return nil
	}

	go c.fanOut(tenantID, evt.VisitID, action)
	return nil
}

func actionFromSubject(subject string) string {
	idx := strings.LastIndex(subject, ".")
	if idx < 0 {
		return ""
	}
	return subject[idx+1:]
}

func (c *VisitorConsumer) fanOut(tenantID, visitID, action string) {
	lookupCtx, lookupCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer lookupCancel()

	rows, err := c.db.Pool.Query(lookupCtx,
		`SELECT device_id FROM dm3_devices.devices
		 WHERE tenant_id = $1::uuid AND status = 'online'`,
		tenantID,
	)
	if err != nil {
		slog.Error("visitor_consumer: list devices failed",
			"error", err, "tenant_id", tenantID)
		return
	}
	defer rows.Close()

	deviceIDs := make([]string, 0, 8)
	for rows.Next() {
		var did string
		if err := rows.Scan(&did); err != nil {
			slog.Error("visitor_consumer: scan device failed", "error", err)
			continue
		}
		deviceIDs = append(deviceIDs, did)
	}

	if len(deviceIDs) == 0 {
		slog.Debug("visitor_consumer: no online devices to sync",
			"tenant_id", tenantID, "action", action)
		return
	}

	slog.Info("visitor_consumer: fanning out visitor sync",
		"tenant_id", tenantID, "visit_id", visitID,
		"action", action, "device_count", len(deviceIDs))

	for _, deviceID := range deviceIDs {
		key := tenantID + "/" + deviceID
		go func() {
			_, _, _ = c.group.Do(key, func() (any, error) {
				syncCtx, syncCancel := context.WithTimeout(context.Background(), 15*time.Second)
				defer syncCancel()
				if err := c.syncService.Visitors.PushVisitorSync(syncCtx, tenantID, deviceID); err != nil {
					slog.Error("visitor_consumer: push visitor sync failed",
						"error", err, "tenant_id", tenantID, "device_id", deviceID)
					return nil, err
				}
				return nil, nil
			})
		}()
	}
}
