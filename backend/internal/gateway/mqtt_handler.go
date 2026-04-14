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

func containsStr(list []string, s string) bool {
	for _, v := range list {
		if v == s {
			return true
		}
	}
	return false
}

// buildCredentialEntries normalizes the device payload into the typed
// credentials list used by the WS broadcast and downstream consumers.
// Prefers `credentials[]` (preferred new field). Falls back to reconstructing
// from `credential_value` + `other_credential_value`, with every reconstructed
// entry inheriting the single legacy `credential_type`.
func buildCredentialEntries(m map[string]any, primaryValue string) []map[string]any {
	primaryType, _ := m["credential_type"].(string)
	primaryType = strings.TrimSpace(primaryType)

	out := make([]map[string]any, 0, 4)
	seen := make(map[string]struct{}, 4)
	add := func(t, v string) {
		v = strings.TrimSpace(v)
		if v == "" {
			return
		}
		t = strings.TrimSpace(t)
		if t == "" {
			t = primaryType
		}
		key := t + "\x00" + v
		if _, ok := seen[key]; ok {
			return
		}
		seen[key] = struct{}{}
		out = append(out, map[string]any{"type": t, "value": v})
	}

	// 1. Preferred: typed credentials[] from the device.
	if creds, ok := m["credentials"].([]any); ok {
		for _, item := range creds {
			entry, ok := item.(map[string]any)
			if !ok {
				continue
			}
			t, _ := entry["type"].(string)
			v, _ := entry["value"].(string)
			add(t, v)
		}
		return out
	}

	// 2. Legacy reconstruction.
	if primaryValue != "" {
		add(primaryType, primaryValue)
	}
	if other, ok := m["other_credential_value"]; ok && other != nil {
		switch v := other.(type) {
		case string:
			for _, p := range strings.Split(v, ",") {
				add(primaryType, p)
			}
		case []any:
			for _, item := range v {
				if s, ok := item.(string); ok {
					add(primaryType, s)
				}
			}
		}
	}
	return out
}

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

	// Enrich access events with identity context so the live monitoring
	// page can show name / department / card without an N+1 fetch per row.
	// We merge fields into env.Data (JSON object) and broadcast the
	// augmented payload. Non-access events pass through untouched.
	broadcastData := env.Data
	if strings.HasPrefix(env.Type, "access.") {
		broadcastData = h.enrichAccessData(ctx, env.Data, pt.TenantID, pt.DeviceID)
	}

	// Broadcast to WebSocket hub
	h.hub.Broadcast(WSEvent{
		Type:     env.Type,
		DeviceID: pt.DeviceID,
		TenantID: pt.TenantID,
		Data:     broadcastData,
		Time:     time.UnixMilli(env.TS),
	})
}

// enrichAccessData looks up the acting user's department and primary
// card from dm3_identity and merges those fields into the JSON payload
// as `department` and `card_id`. Called on every access event, so it's
// kept cheap — a single LEFT JOIN query with a LIMIT 1 subquery. If
// the lookup fails or the user isn't found, the original payload is
// returned unchanged.
func (h *MQTTHandler) enrichAccessData(ctx context.Context, data json.RawMessage, tenantID, deviceID string) json.RawMessage {
	if len(data) == 0 {
		return data
	}
	var m map[string]any
	if err := json.Unmarshal(data, &m); err != nil {
		return data
	}
	userID, _ := m["user_id"].(string)
	credValue, _ := m["credential_value"].(string)
	var fullName, userCode, avatar, department, cardID string
	var err error
	switch {
	case uuidRegex.MatchString(userID):
		err = h.db.Pool.QueryRow(ctx,
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
	case credValue != "":
		// Device sent a malformed user_id (e.g. truncated UUID) but a valid
		// credential_value. Resolve the user via the credential row.
		err = h.db.Pool.QueryRow(ctx,
			`SELECT TRIM(CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.last_name,''))),
			        COALESCE(u.user_code,''), COALESCE(u.avatar,''),
			        COALESCE(dep.name,''), cr.value
			 FROM dm3_identity.credentials cr
			 JOIN dm3_identity.users u ON u.id = cr.user_id
			 LEFT JOIN dm3_identity.departments dep ON dep.id = u.department_id
			 WHERE cr.value = $1 AND cr.status = 'active'
			 ORDER BY cr.created_at ASC LIMIT 1`, credValue,
		).Scan(&fullName, &userCode, &avatar, &department, &cardID)
	}
	_ = err // lookup misses are expected for unknown cards — fall through
	if cardID == "" {
		cardID = credValue
	}

	// Resolve device name from devices table — independent of the user lookup.
	var deviceName string
	if deviceID != "" {
		_ = h.db.Pool.QueryRow(ctx,
			`SELECT COALESCE(name,'') FROM dm3_devices.devices
			 WHERE device_id = $1 AND tenant_id = $2::uuid`,
			deviceID, tenantID,
		).Scan(&deviceName)
	}

	// Only fill name fields if the device didn't already send one.
	if existing, _ := m["user_name"].(string); existing == "" && fullName != "" {
		m["user_name"] = fullName
	}
	if existing, _ := m["person_name"].(string); existing == "" && fullName != "" {
		m["person_name"] = fullName
	}
	m["user_code"] = userCode
	m["avatar"] = avatar
	m["department"] = department
	m["card_id"] = cardID

	// Build the typed credentials list. Prefer the new credentials[] field
	// from the device; otherwise reconstruct from the legacy fields.
	credEntries := buildCredentialEntries(m, credValue)
	if len(credEntries) > 0 {
		m["credentials"] = credEntries
		// Legacy mirror so older frontends still see card_ids.
		flat := make([]string, len(credEntries))
		for i, e := range credEntries {
			flat[i] = e["value"].(string)
		}
		m["card_ids"] = flat
	}
	m["device_name"] = deviceName
	out, jerr := json.Marshal(m)
	if jerr != nil {
		return data
	}
	return out
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
	Method           string   `json:"method"`
	DoorID           string   `json:"door_id"`
	Direction        string   `json:"direction"`
	Decision         string   `json:"decision"`
	DecidedLocally   bool     `json:"decided_locally"`
	DecisionTimeMS   int      `json:"decision_time_ms"`
	UserID           string   `json:"user_id"`
	UserName         string   `json:"user_name"`
	Confidence       *float64 `json:"confidence"`
	Reason           string   `json:"reason"`
	CredentialType   string   `json:"credential_type"`
	PersonDetected   bool     `json:"person_detected"`
	Temperature      *float64 `json:"temperature"`
	MaskDetected     *bool    `json:"mask_detected"`
	Photo            string   `json:"photo"`
	LocalDBVersion   int      `json:"local_db_version"`
	LocalPersonCount int      `json:"local_person_count"`
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

type heartbeatNetwork struct {
	Type      string `json:"type"`
	SignalDBM int    `json:"signal_dbm"`
	LatencyMS int    `json:"latency_ms"`
}

type heartbeatPeripherals struct {
	Camera  string `json:"camera"`
	Reader  string `json:"reader"`
	Lock    string `json:"lock"`
	Printer string `json:"printer"`
}

type heartbeatData struct {
	Online         bool                  `json:"online"`
	Firmware       string                `json:"firmware"`
	IP             string                `json:"ip"`
	CPUPct         int                   `json:"cpu_pct"`
	MemPct         int                   `json:"mem_pct"`
	DiskPct        int                   `json:"disk_pct"`
	TemperatureC   *float64              `json:"temperature_c"`
	UptimeS        int64                 `json:"uptime_s"`
	QueueDepth     int                   `json:"queue_depth"`
	LocalDBVersion int                   `json:"local_db_version"`
	LocalUserCount int                   `json:"local_user_count"`
	LastAccessTS   *int64                `json:"last_access_ts"`
	Network        *heartbeatNetwork     `json:"network"`
	Peripherals    *heartbeatPeripherals `json:"peripherals"`
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
