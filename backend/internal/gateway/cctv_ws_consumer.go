package gateway

import (
	"encoding/json"
	"log/slog"
	"strings"
	"time"

	"github.com/duali/dm3-backend/pkg/db"
	"github.com/duali/dm3-backend/pkg/natsutil"

	"context"
)

// CCTVWebSocketConsumer subscribes to CCTV-originated device events on NATS
// and broadcasts them to the WebSocket hub. This bridges events that cctv-svc
// publishes directly to NATS (e.g. TungSon face recognition/unknown face)
// into the realtime WebSocket stream that the monitoring UI consumes.
//
// Events that originate from MQTT devices are already broadcast by MQTTHandler
// and should NOT be re-broadcast here. To avoid duplication, cctv-svc publishes
// events meant for WebSocket delivery on a dedicated NATS subject:
//
//	dm3.cctv.ws.{tenant_id}.{device_id}
//
// This consumer listens on that subject only.
type CCTVWebSocketConsumer struct {
	db   *db.DB
	nats *natsutil.Client
	hub  *EventHub
}

// NewCCTVWebSocketConsumer constructs a CCTVWebSocketConsumer.
func NewCCTVWebSocketConsumer(database *db.DB, natsClient *natsutil.Client, hub *EventHub) *CCTVWebSocketConsumer {
	return &CCTVWebSocketConsumer{db: database, nats: natsClient, hub: hub}
}

// Start subscribes to dm3.cctv.ws.*.* on the CCTV stream.
func (c *CCTVWebSocketConsumer) Start(ctx context.Context) error {
	// Ensure the CCTV stream exists (cctv-svc normally creates it, but
	// device-gateway may start first).
	if err := c.nats.EnsureStream(ctx, "CCTV", []string{"dm3.cctv.>"}); err != nil {
		return err
	}
	return c.nats.Subscribe(ctx, "CCTV", "device-gateway-cctv-ws",
		"dm3.cctv.ws.*.*", c.handle)
}

// cctvWSEvent is the envelope cctv-svc publishes on dm3.cctv.ws.{tid}.{did}.
type cctvWSEvent struct {
	Type     string          `json:"type"`
	DeviceID string          `json:"device_id"`
	TenantID string          `json:"tenant_id"`
	Data     json.RawMessage `json:"data"`
	Time     int64           `json:"time_ms"` // Unix millis
}

func (c *CCTVWebSocketConsumer) handle(subject string, data []byte) error {
	// Parse subject: dm3.cctv.ws.{tenant_id}.{device_id}
	parts := strings.SplitN(subject, ".", 5)
	if len(parts) < 5 {
		slog.Warn("cctv_ws_consumer: invalid subject", "subject", subject)
		return nil
	}
	tenantID := parts[3]
	deviceID := parts[4]

	var evt cctvWSEvent
	if err := json.Unmarshal(data, &evt); err != nil {
		slog.Warn("cctv_ws_consumer: bad payload", "error", err, "subject", subject)
		return nil // ack bad messages
	}

	// Enrich with identity data if this is an access event.
	broadcastData := evt.Data
	if strings.HasPrefix(evt.Type, "access.") && c.db != nil {
		enrichCtx, enrichCancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer enrichCancel()
		broadcastData = c.enrichAccessData(enrichCtx, evt.Data, tenantID, deviceID)
	}

	ts := time.UnixMilli(evt.Time)
	if ts.IsZero() || evt.Time == 0 {
		ts = time.Now()
	}

	c.hub.Broadcast(WSEvent{
		Type:     evt.Type,
		DeviceID: deviceID,
		TenantID: tenantID,
		Data:     broadcastData,
		Time:     ts,
	})

	slog.Debug("cctv_ws_consumer: broadcast event",
		"type", evt.Type, "tenant_id", tenantID, "device_id", deviceID)
	return nil
}

// enrichAccessData mirrors the MQTTHandler enrichment logic for access events.
// It resolves user name, department, card, and device name so the monitoring
// page can display complete rows without additional API calls.
func (c *CCTVWebSocketConsumer) enrichAccessData(ctx context.Context, data json.RawMessage, tenantID, deviceID string) json.RawMessage {
	if len(data) == 0 {
		return data
	}
	var m map[string]any
	if err := json.Unmarshal(data, &m); err != nil {
		return data
	}
	userID, _ := m["user_id"].(string)

	// Resolve user identity
	if uuidRegex.MatchString(userID) {
		var fullName, userCode, avatar, department, cardID string
		err := c.db.Pool.QueryRow(ctx,
			`SELECT TRIM(CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.last_name,''))),
			        COALESCE(u.user_code,''), COALESCE(u.avatar,''),
			        COALESCE(dep.name,''), COALESCE(c.value,'')
			 FROM dm3_identity.users u
			 LEFT JOIN dm3_identity.departments dep ON dep.id = u.department_id
			 LEFT JOIN LATERAL (
				 SELECT value FROM dm3_identity.credentials
				 WHERE user_id = u.id AND type = 'card' AND status = 'active'
				 ORDER BY created_at ASC
				 LIMIT 1
			 ) c ON true
			 WHERE u.id = $1::uuid`, userID,
		).Scan(&fullName, &userCode, &avatar, &department, &cardID)
		if err == nil {
			if existing, _ := m["user_name"].(string); existing == "" && fullName != "" {
				m["user_name"] = fullName
			}
			if existing, _ := m["person_name"].(string); existing == "" && fullName != "" {
				m["person_name"] = fullName
			}
			m["user_code"] = userCode
			m["avatar"] = avatar
			m["department"] = department
			if cardID != "" {
				m["card_id"] = cardID
			}
		}
	}

	// Resolve device name
	if deviceID != "" {
		var deviceName string
		_ = c.db.Pool.QueryRow(ctx,
			`SELECT COALESCE(name,'') FROM dm3_devices.devices
			 WHERE device_id = $1 AND tenant_id = $2::uuid`,
			deviceID, tenantID,
		).Scan(&deviceName)
		m["device_name"] = deviceName
	}

	out, jerr := json.Marshal(m)
	if jerr != nil {
		return data
	}
	return out
}
