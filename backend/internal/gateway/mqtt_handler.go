package gateway

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"regexp"
	"strings"
	"time"

	"golang.org/x/sync/singleflight"

	"github.com/duali/dm3-backend/internal/models"
	"github.com/duali/dm3-backend/pkg/db"
	"github.com/duali/dm3-backend/pkg/natsutil"
)

var uuidRegex = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

// toUUIDPtr returns a *string if s is a valid UUID, otherwise nil.
func toUUIDPtr(s string) *string {
	if s == "" || !uuidRegex.MatchString(s) {
		return nil
	}
	return &s
}

// MQTTEnvelope is the standard message envelope from devices.
type MQTTEnvelope struct {
	Version int             `json:"v"`
	ID      string          `json:"id"`
	TS      int64           `json:"ts"`
	Src     string          `json:"src"`
	Type    string          `json:"type"`
	Data    json.RawMessage `json:"data"`
	// For command responses
	Ref    string `json:"ref,omitempty"`
	Status string `json:"status,omitempty"`
	Error  string `json:"error,omitempty"`
}

// ParsedTopic holds the extracted fields from an MQTT topic.
type ParsedTopic struct {
	TenantID string
	DeviceID string
	Category string // "evt", "sta", "cmd/resp", "cfg/ack"
}

// ParseTopic extracts tenant_id, device_id and category from MQTT topic.
// Topics: dm/{tenant_id}/device/{device_id}/{category}
func ParseTopic(topic string) (ParsedTopic, error) {
	parts := strings.Split(topic, "/")
	// dm/{cid}/device/{did}/evt          => 5 parts
	// dm/{cid}/device/{did}/cmd/resp     => 6 parts
	// dm/{cid}/device/{did}/cfg/ack      => 6 parts
	if len(parts) < 5 || parts[0] != "dm" || parts[2] != "device" {
		return ParsedTopic{}, fmt.Errorf("invalid topic: %s", topic)
	}
	pt := ParsedTopic{
		TenantID: parts[1],
		DeviceID: parts[3],
	}
	if len(parts) == 5 {
		pt.Category = parts[4]
	} else {
		pt.Category = strings.Join(parts[4:], "/")
	}
	return pt, nil
}

// MQTTHandler processes incoming MQTT messages and bridges to NATS + DB.
type MQTTHandler struct {
	db        *db.DB
	nats      *natsutil.Client
	hub       *EventHub
	sync      *SyncService
	appCtx    context.Context      // application-lifetime context for background goroutines
	syncGroup singleflight.Group   // deduplicates concurrent auto-syncs per device
}

func NewMQTTHandler(database *db.DB, natsClient *natsutil.Client, hub *EventHub) *MQTTHandler {
	return &MQTTHandler{db: database, nats: natsClient, hub: hub, appCtx: context.Background()}
}

// SetAppContext stores the application-lifetime context used by background goroutines.
// Call this from main() after creating the handler.
func (h *MQTTHandler) SetAppContext(ctx context.Context) {
	h.appCtx = ctx
}

// SetSyncService sets the sync service for auto-sync on heartbeat.
func (h *MQTTHandler) SetSyncService(s *SyncService) {
	h.sync = s
}

// Handle is the callback for all MQTT subscriptions.
func (h *MQTTHandler) Handle(topic string, payload []byte) {
	pt, err := ParseTopic(topic)
	if err != nil {
		slog.Warn("mqtt: bad topic", "topic", topic, "error", err)
		return
	}

	var env MQTTEnvelope
	if err := json.Unmarshal(payload, &env); err != nil {
		slog.Warn("mqtt: bad envelope", "topic", topic, "error", err)
		return
	}

	slog.Debug("mqtt message", "topic", topic, "type", env.Type, "device", pt.DeviceID)

	ctx, cancel := context.WithTimeout(h.appCtx, 5*time.Second)
	defer cancel()

	switch pt.Category {
	case "evt":
		h.handleEvent(ctx, pt, env)
	case "sta":
		h.handleStatus(ctx, pt, env)
	case "cmd/resp":
		h.handleCommandResponse(ctx, pt, env)
	case "cfg/ack":
		h.handleConfigAck(ctx, pt, env)
	default:
		slog.Warn("mqtt: unknown category", "category", pt.Category, "topic", topic)
	}

	// Bridge all messages to NATS
	natsSubject := fmt.Sprintf("dm3.devices.%s.%s.%s", pt.TenantID, pt.DeviceID, strings.ReplaceAll(pt.Category, "/", "."))
	if err := h.nats.Publish(ctx, natsSubject, payload); err != nil {
		slog.Error("nats publish failed", "subject", natsSubject, "error", err)
	}

	// Broadcast to WebSocket hub
	h.hub.Broadcast(WSEvent{
		Type:     env.Type,
		DeviceID: pt.DeviceID,
		TenantID: pt.TenantID,
		Data:     env.Data,
		Time:     time.UnixMilli(env.TS),
	})
}

func (h *MQTTHandler) handleEvent(ctx context.Context, pt ParsedTopic, env MQTTEnvelope) {
	switch {
	case strings.HasPrefix(env.Type, "access."):
		h.handleAccessEvent(ctx, pt, env)
	case env.Type == "door.state":
		h.handleDoorState(ctx, pt, env)
	case env.Type == "alarm.triggered":
		h.handleAlarm(ctx, pt, env)
	default:
		slog.Info("mqtt: event", "type", env.Type, "device", pt.DeviceID)
	}
}

type accessLogData struct {
	Method         string  `json:"method"`
	DoorID         string  `json:"door_id"`
	Direction      string  `json:"direction"`
	Decision       string  `json:"decision"`
	UserID         string  `json:"user_id"`
	UserName       string  `json:"user_name"`
	Confidence     float64 `json:"confidence"`
	Reason         string  `json:"reason"`
	CredentialType string  `json:"credential_type"`
}

func (h *MQTTHandler) handleAccessEvent(ctx context.Context, pt ParsedTopic, env MQTTEnvelope) {
	// Access events are stored by access-svc via NATS consumer.
	// Gateway only logs and forwards to NATS (done in Handle()).
	slog.Info("access event received", "device", pt.DeviceID, "type", env.Type, "msg_id", env.ID)
}

func (h *MQTTHandler) handleDoorState(ctx context.Context, pt ParsedTopic, env MQTTEnvelope) {
	slog.Info("door state event", "device", pt.DeviceID, "type", env.Type)
}

func (h *MQTTHandler) handleAlarm(ctx context.Context, pt ParsedTopic, env MQTTEnvelope) {
	slog.Warn("alarm event", "device", pt.DeviceID, "type", env.Type)
}

type heartbeatData struct {
	Online         bool   `json:"online"`
	Firmware       string `json:"firmware"`
	IP             string `json:"ip"`
	CPUPct         int    `json:"cpu_pct"`
	MemPct         int    `json:"mem_pct"`
	DiskPct        int    `json:"disk_pct"`
	UptimeS        int64  `json:"uptime_s"`
	QueueDepth     int    `json:"queue_depth"`
	LocalDBVersion int    `json:"local_db_version"`
	LocalUserCount int    `json:"local_user_count"`
}

func (h *MQTTHandler) handleStatus(ctx context.Context, pt ParsedTopic, env MQTTEnvelope) {
	now := time.Now()

	switch env.Type {
	case "status.heartbeat":
		var data heartbeatData
		if err := json.Unmarshal(env.Data, &data); err != nil {
			slog.Warn("mqtt: bad heartbeat data", "error", err)
			return
		}
		status := models.DeviceStatusOnline
		if !data.Online {
			status = models.DeviceStatusOffline
		}
		tag, err := h.db.Pool.Exec(ctx,
			`UPDATE dm3_devices.devices SET status = $1, last_seen = $2, firmware_version = COALESCE(NULLIF($3,''), firmware_version), updated_at = $2 WHERE device_id = $4`,
			status, now, data.Firmware, pt.DeviceID)
		if err != nil {
			slog.Error("failed to update device heartbeat", "error", err, "device", pt.DeviceID)
			return
		}
		if tag.RowsAffected() == 0 {
			// Unknown device — not provisioned. Ignore heartbeat.
			slog.Debug("ignoring heartbeat from unprovisioned device", "device", pt.DeviceID)
		}
		slog.Debug("heartbeat processed", "device", pt.DeviceID, "status", status)

		// Auto-sync: if device reports local_db_version == 0, push config.
		// singleflight ensures at most one in-flight sync per device at a time,
		// preventing goroutine explosion when a fleet of reset devices comes online.
		if data.LocalDBVersion == 0 && data.Online && h.sync != nil {
			deviceID := pt.DeviceID
			go func() {
				_, _, _ = h.syncGroup.Do(deviceID, func() (any, error) {
					var companyID string
					lookupCtx, lookupCancel := context.WithTimeout(h.appCtx, 5*time.Second)
					defer lookupCancel()
					if err := h.db.Pool.QueryRow(lookupCtx,
						`SELECT tenant_id FROM dm3_devices.devices WHERE device_id = $1`, deviceID,
					).Scan(&companyID); err != nil {
						slog.Warn("sync: could not find company for device", "device", deviceID, "error", err)
						return nil, err
					}
					syncCtx, syncCancel := context.WithTimeout(h.appCtx, 10*time.Second)
					defer syncCancel()
					if err := h.sync.PushSyncToDevice(syncCtx, companyID, deviceID); err != nil {
						slog.Error("sync: auto-push failed", "device", deviceID, "error", err)
						return nil, err
					}
					return nil, nil
				})
			}()
		}

	case "status.offline":
		_, err := h.db.Pool.Exec(ctx,
			`UPDATE dm3_devices.devices SET status = $3, updated_at = $1 WHERE device_id = $2`,
			now, pt.DeviceID, models.DeviceStatusOffline)
		if err != nil {
			slog.Error("failed to mark device offline", "error", err, "device", pt.DeviceID)
		}
		slog.Info("device offline (LWT)", "device", pt.DeviceID)
	}
}

func (h *MQTTHandler) handleCommandResponse(ctx context.Context, pt ParsedTopic, env MQTTEnvelope) {
	slog.Info("command response", "device", pt.DeviceID, "type", env.Type, "ref", env.Ref, "status", env.Status)
}

func (h *MQTTHandler) handleConfigAck(_ context.Context, pt ParsedTopic, env MQTTEnvelope) {
	switch env.Type {
	case "cfg.person_sync.ack":
		var data struct {
			SyncedCount int    `json:"synced_count"`
			FailedCount int    `json:"failed_count"`
			LocalTotal  int    `json:"local_total"`
			SyncToken   string `json:"sync_token"`
		}
		if err := json.Unmarshal(env.Data, &data); err == nil {
			slog.Info("person_sync ack",
				"device", pt.DeviceID,
				"synced", data.SyncedCount,
				"failed", data.FailedCount,
				"local_total", data.LocalTotal,
				"status", env.Status,
			)
		}

	case "cfg.access_rules.ack":
		var data struct {
			RulesVersion int `json:"rules_version"`
			RulesCount   int `json:"rules_count"`
		}
		if err := json.Unmarshal(env.Data, &data); err == nil {
			slog.Info("access_rules ack",
				"device", pt.DeviceID,
				"rules_version", data.RulesVersion,
				"rules_count", data.RulesCount,
				"status", env.Status,
			)
		}

	case "cfg.blacklist.ack":
		slog.Info("blacklist ack",
			"device", pt.DeviceID,
			"ref", env.Ref,
			"status", env.Status,
		)

	default:
		slog.Info("config ack", "device", pt.DeviceID, "type", env.Type, "ref", env.Ref, "status", env.Status)
	}
}
