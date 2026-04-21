package gateway

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
	"golang.org/x/sync/singleflight"

	"github.com/duali/dm3-backend/internal/models"
	"github.com/duali/dm3-backend/pkg/audit"
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

// MQTTEnvelope is the standard message envelope used in both directions.
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
	// Transmit-job tracking. Set on outbound sync messages so the device
	// echoes them back in acks, letting the server correlate progress.
	// Devices ignoring these fields keep working — they're additive.
	JobID string `json:"job_id,omitempty"`
	Index int    `json:"index,omitempty"` // 1-based position within the job
	Total int    `json:"total,omitempty"` // total messages the server intends to publish for this job
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
	audit     *audit.Logger
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

// SetAuditLogger wires in the audit logger used by handlers that change
// tenant-scoped identity state in response to device messages (e.g. the
// face_result ack that flips a credential from invalid to active).
func (h *MQTTHandler) SetAuditLogger(l *audit.Logger) {
	h.audit = l
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
		// Include a payload preview so operators can see what the firmware
		// is actually publishing. Legacy demasterpro firmware ships CSV /
		// comma-separated heartbeats that fail the DM3 envelope parse
		// here; without the raw bytes in the log it's impossible to tell
		// whether the device is silent or just non-compliant.
		preview := string(payload)
		const maxPreview = 300
		if len(preview) > maxPreview {
			preview = preview[:maxPreview] + "..."
		}
		slog.Warn("mqtt: bad envelope",
			"topic", topic,
			"error", err,
			"payload", preview,
		)
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
	case env.Type == "evt.face_result" || env.Type == "face.result" || env.Type == "face_result":
		h.handleFaceResult(ctx, pt, env)
	default:
		slog.Info("mqtt: event", "type", env.Type, "device", pt.DeviceID)
	}
}

// faceResultData is the payload on dm/{tid}/device/{did}/evt with
// type="evt.face_result". Devices reply with this after attempting to
// enrol a face template from the user's avatar URL they received via
// cfg.person_sync. The server uses it to flip the M_<user_code> face
// credential from 'invalid' to 'active' (on success) or 'failed'.
//
// See docs/architecture/mqtt-protocol.md §5.2.
type faceResultData struct {
	UserID          string   `json:"user_id"`          // dm3_identity.users.id (UUID)
	CredentialValue string   `json:"credential_value"` // "M_<user_code>"
	Status          string   `json:"status"`           // "success" | "failed"
	Reason          string   `json:"reason,omitempty"` // e.g. no_face_detected, low_quality, multiple_faces, bad_avatar_url
	Confidence      *float64 `json:"confidence,omitempty"`
	TemplateVersion string   `json:"template_version,omitempty"`
}

func (h *MQTTHandler) handleFaceResult(ctx context.Context, pt ParsedTopic, env MQTTEnvelope) {
	var data faceResultData
	if err := json.Unmarshal(env.Data, &data); err != nil {
		slog.Warn("mqtt: bad face_result data", "error", err, "device", pt.DeviceID)
		return
	}
	if !uuidRegex.MatchString(data.UserID) {
		slog.Warn("mqtt: face_result missing/invalid user_id", "device", pt.DeviceID, "user_id", data.UserID)
		return
	}
	if !strings.HasPrefix(data.CredentialValue, "M_") {
		slog.Warn("mqtt: face_result credential_value must start with M_", "device", pt.DeviceID, "value", data.CredentialValue)
		return
	}

	var newStatus string
	switch data.Status {
	case "success":
		newStatus = "active"
	case "failed", "failure", "error":
		newStatus = "failed"
	default:
		slog.Warn("mqtt: face_result unknown status", "device", pt.DeviceID, "status", data.Status)
		return
	}

	// Tenant-scoped update guards against a rogue device that learned
	// another tenant's user_id: the UPDATE matches zero rows and the
	// handler is a no-op. Join users with is_deleted guard so stale acks
	// for soft-deleted users are dropped silently. The status='invalid'
	// guard prevents a late-arriving 'failed' ack from regressing a
	// credential that a different device already enrolled as 'active'.
	var credID string
	err := h.db.Pool.QueryRow(ctx, `
		UPDATE dm3_identity.credentials c
		   SET status = $1, updated_at = now()
		  FROM dm3_identity.users u
		 WHERE u.id        = c.user_id
		   AND c.tenant_id = $2::uuid
		   AND c.user_id   = $3::uuid
		   AND c.type      = 'face'
		   AND c.value     = $4
		   AND c.status    = 'invalid'
		   AND (u.is_deleted = false OR u.is_deleted IS NULL)
		RETURNING c.id
	`, newStatus, pt.TenantID, data.UserID, data.CredentialValue).Scan(&credID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			slog.Info("mqtt: face_result dropped (no matching invalid credential)",
				"tenant", pt.TenantID, "device", pt.DeviceID, "user_id", data.UserID, "value", data.CredentialValue)
			return
		}
		slog.Error("mqtt: face_result update failed", "error", err, "device", pt.DeviceID)
		return
	}

	slog.Info("face enrollment result",
		"device", pt.DeviceID, "tenant", pt.TenantID, "user_id", data.UserID,
		"credential", data.CredentialValue, "status", newStatus, "reason", data.Reason,
	)

	metaOK := map[string]any{
		"user_id":          data.UserID,
		"credential_value": data.CredentialValue,
		"credential_id":    credID,
		"status":           data.Status,
	}
	if data.Reason != "" {
		metaOK["reason"] = data.Reason
	}
	if data.Confidence != nil {
		metaOK["confidence"] = *data.Confidence
	}
	if data.TemplateVersion != "" {
		metaOK["template_version"] = data.TemplateVersion
	}
	eventType := "face_enrolled"
	description := "Face template enrolled from avatar"
	if newStatus == "failed" {
		eventType = "face_enroll_failed"
		description = "Face enrollment failed: " + data.Reason
	}
	go InsertDeviceEvent(h.appCtx, h.db.Pool, DeviceEvent{
		TenantID:    pt.TenantID,
		DeviceID:    pt.DeviceID,
		EventType:   eventType,
		Description: description,
		Metadata:    metaOK,
	})

	if h.audit != nil {
		action := "identity.credential.face_enrolled"
		if newStatus == "failed" {
			action = "identity.credential.face_failed"
		}
		actorEmail := "device:" + pt.DeviceID
		h.audit.Log(audit.Entry{
			TenantID:   pt.TenantID,
			ActorEmail: actorEmail,
			Action:     action,
			EntityType: "credential",
			EntityID:   credID,
			EntityName: data.CredentialValue,
			Status:     "success",
			NewValues:  metaOK,
		})
	}

	// On success, re-publish person.changed so IdentityConsumer fans the
	// now-active credential back out to every online device in the tenant
	// (including the enrolling one — its local upsert is idempotent).
	if newStatus == "active" && h.nats != nil {
		payload, _ := json.Marshal(map[string]string{
			"tenant_id": pt.TenantID,
			"user_id":   data.UserID,
			"reason":    "face_enrolled",
		})
		pubCtx, cancel := context.WithTimeout(h.appCtx, 5*time.Second)
		defer cancel()
		if err := h.nats.Publish(pubCtx, "dm3.identity.person.changed", payload); err != nil {
			slog.Warn("mqtt: face_result person.changed publish failed", "error", err)
		}
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

func (h *MQTTHandler) handleDoorState(_ context.Context, pt ParsedTopic, env MQTTEnvelope) {
	var data struct {
		State string `json:"state"` // closed, open, held_open, forced, alarm
	}
	if err := json.Unmarshal(env.Data, &data); err != nil {
		slog.Warn("mqtt: bad door.state data", "error", err)
		return
	}
	state := data.State
	if state == "" {
		state = "open"
	}

	// Only update + record event if state actually changed.
	var prevState *string
	err := h.db.Pool.QueryRow(h.appCtx,
		`WITH old AS (
			SELECT door_state FROM dm3_devices.devices WHERE device_id = $2 AND tenant_id = $3::uuid
		)
		UPDATE dm3_devices.devices SET door_state = $1, updated_at = now()
		 WHERE device_id = $2 AND tenant_id = $3::uuid
		 RETURNING (SELECT door_state FROM old)`,
		state, pt.DeviceID, pt.TenantID,
	).Scan(&prevState)
	if err != nil {
		slog.Error("failed to update door_state", "error", err, "device", pt.DeviceID)
		return
	}

	// Skip event if state unchanged
	if prevState != nil && *prevState == state {
		return
	}

	slog.Info("door state changed", "device", pt.DeviceID, "from", prevState, "to", state)

	var meta map[string]any
	_ = json.Unmarshal(env.Data, &meta)
	go InsertDeviceEvent(h.appCtx, h.db.Pool, DeviceEvent{
		TenantID:    pt.TenantID,
		DeviceID:    pt.DeviceID,
		EventType:   "door_state",
		Description: fmt.Sprintf("Door state: %s", state),
		Metadata:    meta,
	})
}

func (h *MQTTHandler) handleAlarm(_ context.Context, pt ParsedTopic, env MQTTEnvelope) {
	slog.Warn("alarm event", "device", pt.DeviceID, "type", env.Type)

	// Set door_state to alarm on the device.
	_, _ = h.db.Pool.Exec(h.appCtx,
		`UPDATE dm3_devices.devices SET door_state = 'alarm', updated_at = now()
		  WHERE device_id = $1 AND tenant_id = $2::uuid`,
		pt.DeviceID, pt.TenantID)

	var data map[string]any
	_ = json.Unmarshal(env.Data, &data)
	// Same cross-tenant media-reference guard the access-svc consumer does.
	// A compromised device publishing an alarm with data.photo pointing at
	// another tenant's object key would otherwise plant a leak into
	// device_events.metadata. Clear the field; keep the alarm row.
	// Canonical impl lives in internal/access/nats_consumer.go
	// (isOwnTenantMediaKey) — duplicated here because the two packages can't
	// cleanly share internal helpers (uuidRegex is similarly duplicated).
	if photo, _ := data["photo"].(string); photo != "" {
		prefix := "events/" + pt.TenantID + "/" + pt.DeviceID + "/"
		if !strings.HasPrefix(photo, prefix) {
			slog.Warn("mqtt: rejecting cross-tenant media reference on alarm",
				"tenant", pt.TenantID, "device", pt.DeviceID, "photo", photo)
			delete(data, "photo")
		}
	}
	go InsertDeviceEvent(h.appCtx, h.db.Pool, DeviceEvent{
		TenantID:    pt.TenantID,
		DeviceID:    pt.DeviceID,
		EventType:   "emergency",
		Description: fmt.Sprintf("Alarm triggered: %s", env.Type),
		Metadata:    data,
	})
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
		// Scope by tenant_id from topic to prevent a rogue device (that learned
		// another tenant's device_id) from spoofing heartbeats on behalf of a
		// device it doesn't own. Rogue updates will hit 0 rows and be ignored.
		//
		// CTE captures old status before the UPDATE so we only record a
		// device_event on actual transitions (offline→online), not every 30s
		// heartbeat.
		var prevStatus string
		err := h.db.Pool.QueryRow(ctx,
			`WITH old AS (
				SELECT status FROM dm3_devices.devices WHERE device_id = $4 AND tenant_id = $5::uuid
			)
			UPDATE dm3_devices.devices
			   SET status = $1, last_seen = $2,
			       firmware_version = COALESCE(NULLIF($3,''), firmware_version),
			       updated_at = $2
			 WHERE device_id = $4 AND tenant_id = $5::uuid
			 RETURNING (SELECT status FROM old)`,
			status, now, data.Firmware, pt.DeviceID, pt.TenantID,
		).Scan(&prevStatus)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				slog.Debug("ignoring heartbeat from unprovisioned device", "device", pt.DeviceID)
			} else {
				slog.Error("failed to update device heartbeat", "error", err, "device", pt.DeviceID)
			}
			return
		}

		// Record event only on status transitions.
		if data.Online && prevStatus != string(models.DeviceStatusOnline) {
			go InsertDeviceEvent(h.appCtx, h.db.Pool, DeviceEvent{
				TenantID:    pt.TenantID,
				DeviceID:    pt.DeviceID,
				EventType:   "online",
				Description: "Device came online",
				Metadata:    map[string]any{"firmware": data.Firmware, "ip": data.IP},
			})
		} else if !data.Online && prevStatus == string(models.DeviceStatusOnline) {
			go InsertDeviceEvent(h.appCtx, h.db.Pool, DeviceEvent{
				TenantID:    pt.TenantID,
				DeviceID:    pt.DeviceID,
				EventType:   "offline",
				Description: "Device reported offline via heartbeat",
			})
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
		// Tenant-scoped to prevent cross-tenant status spoofing (see heartbeat above).
		tag, err := h.db.Pool.Exec(ctx,
			`UPDATE dm3_devices.devices SET status = $3, updated_at = $1 WHERE device_id = $2 AND tenant_id = $4::uuid AND status != $3`,
			now, pt.DeviceID, models.DeviceStatusOffline, pt.TenantID)
		if err != nil {
			slog.Error("failed to mark device offline", "error", err, "device", pt.DeviceID)
		} else if tag.RowsAffected() > 0 {
			go InsertDeviceEvent(h.appCtx, h.db.Pool, DeviceEvent{
				TenantID:    pt.TenantID,
				DeviceID:    pt.DeviceID,
				EventType:   "offline",
				Description: "Device disconnected (LWT)",
			})
		}
		slog.Info("device offline (LWT)", "device", pt.DeviceID)

	default:
		// Unknown sta envelope type. Before this branch existed the message
		// was silently consumed — devices with non-spec firmware (e.g. a
		// custom 'heartbeat' / 'online' / 'status' envelope) would publish
		// but the server never updated last_seen, so the heartbeat checker
		// perpetually marked them offline. Warn with the raw type + a
		// preview of the payload so on-call can see what firmware is
		// actually sending and decide whether to adapt the firmware or the
		// server to match. Preview is truncated to keep the log readable.
		preview := string(env.Data)
		const maxPreview = 200
		if len(preview) > maxPreview {
			preview = preview[:maxPreview] + "..."
		}
		slog.Warn("mqtt sta: unknown envelope type",
			"device", pt.DeviceID,
			"tenant", pt.TenantID,
			"type", env.Type,
			"payload", preview,
		)
	}
}

func (h *MQTTHandler) handleCommandResponse(_ context.Context, pt ParsedTopic, env MQTTEnvelope) {
	slog.Info("command response", "device", pt.DeviceID, "type", env.Type, "ref", env.Ref, "status", env.Status)

	desc := fmt.Sprintf("Command response: %s — %s", env.Type, env.Status)
	if env.Error != "" {
		desc = fmt.Sprintf("Command response: %s — %s (%s)", env.Type, env.Status, env.Error)
	}
	go InsertDeviceEvent(h.appCtx, h.db.Pool, DeviceEvent{
		TenantID:    pt.TenantID,
		DeviceID:    pt.DeviceID,
		EventType:   "command_response",
		Description: desc,
		Metadata:    map[string]any{"type": env.Type, "ref": env.Ref, "status": env.Status, "error": env.Error},
	})
}

func (h *MQTTHandler) handleConfigAck(_ context.Context, pt ParsedTopic, env MQTTEnvelope) {
	// If the device echoed back our job_id, advance the SyncJob registry so
	// the live progress UI sees the ack land.
	if env.JobID != "" && h.sync != nil && h.sync.Jobs != nil {
		h.sync.Jobs.IncrementAcked(env.JobID)
	}
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

	case "cfg.visitor_sync.ack":
		var data struct {
			SyncedCount int `json:"synced_count"`
			FailedCount int `json:"failed_count"`
			LocalTotal  int `json:"local_total"`
		}
		if err := json.Unmarshal(env.Data, &data); err == nil {
			slog.Info("visitor_sync ack",
				"device", pt.DeviceID,
				"synced", data.SyncedCount,
				"failed", data.FailedCount,
				"local_total", data.LocalTotal,
				"status", env.Status,
			)
		}

	case "cfg.kiosk_config.ack":
		// Device confirms it persisted the new api_base_url / company_code /
		// kiosk_token triple. We don't echo the token back in the ack — the
		// device just reports the applied version so the server log shows
		// the roundtrip landed.
		var data struct {
			Applied bool  `json:"applied"`
			Version int64 `json:"version"`
		}
		if err := json.Unmarshal(env.Data, &data); err == nil {
			slog.Info("kiosk_config ack",
				"device", pt.DeviceID,
				"applied", data.Applied,
				"version", data.Version,
				"status", env.Status,
			)
		}

	case "cfg.firmware.ack":
		// Device reports firmware update progress/result.
		// Expected statuses: downloading, installing, success, failed
		var fwAck struct {
			DeploymentID    string `json:"deployment_id"`
			Status          string `json:"status"`           // downloading | installing | success | failed | rolled_back
			ProgressPct     int    `json:"progress_pct"`     // 0-100
			Error           string `json:"error"`
			Version         string `json:"version"`          // current version (rolled-back version when status=rolled_back)
			PreviousVersion string `json:"previous_version"` // version before update attempt
		}
		if err := json.Unmarshal(env.Data, &fwAck); err == nil && fwAck.DeploymentID != "" {
			slog.Info("firmware ack", "device", pt.DeviceID, "deployment", fwAck.DeploymentID, "status", fwAck.Status, "progress", fwAck.ProgressPct)

			// Update deployment status — always scoped by tenant_id from the MQTT topic
			// to prevent a rogue device from updating another tenant's deployment.
			switch fwAck.Status {
			case "downloading":
				_, _ = h.db.Pool.Exec(h.appCtx,
					`UPDATE dm3_devices.firmware_deployments SET status='downloading', download_started_at=COALESCE(download_started_at,now()), progress_pct=$2, updated_at=now() WHERE id=$1::uuid AND tenant_id=$3::uuid`,
					fwAck.DeploymentID, fwAck.ProgressPct, pt.TenantID)
			case "installing":
				_, _ = h.db.Pool.Exec(h.appCtx,
					`UPDATE dm3_devices.firmware_deployments SET status='installing', install_started_at=COALESCE(install_started_at,now()), progress_pct=$2, updated_at=now() WHERE id=$1::uuid AND tenant_id=$3::uuid`,
					fwAck.DeploymentID, fwAck.ProgressPct, pt.TenantID)
			case "success":
				_, _ = h.db.Pool.Exec(h.appCtx,
					`UPDATE dm3_devices.firmware_deployments SET status='success', completed_at=now(), progress_pct=100, updated_at=now() WHERE id=$1::uuid AND tenant_id=$2::uuid`,
					fwAck.DeploymentID, pt.TenantID)
			case "failed":
				_, _ = h.db.Pool.Exec(h.appCtx,
					`UPDATE dm3_devices.firmware_deployments SET status='failed', completed_at=now(), error_message=$2, updated_at=now() WHERE id=$1::uuid AND tenant_id=$3::uuid`,
					fwAck.DeploymentID, fwAck.Error, pt.TenantID)
			case "rolled_back":
				_, _ = h.db.Pool.Exec(h.appCtx,
					`UPDATE dm3_devices.firmware_deployments SET status='rolled_back', completed_at=now(), error_message=$2, progress_pct=0, updated_at=now() WHERE id=$1::uuid AND tenant_id=$3::uuid`,
					fwAck.DeploymentID, fwAck.Error, pt.TenantID)
			default:
				_, _ = h.db.Pool.Exec(h.appCtx,
					`UPDATE dm3_devices.firmware_deployments SET progress_pct=$2, updated_at=now() WHERE id=$1::uuid AND tenant_id=$3::uuid`,
					fwAck.DeploymentID, fwAck.ProgressPct, pt.TenantID)
			}

			// Update device firmware_version on success or rolled_back
			if (fwAck.Status == "success" || fwAck.Status == "rolled_back") && fwAck.Version != "" {
				_, _ = h.db.Pool.Exec(h.appCtx,
					`UPDATE dm3_devices.devices SET firmware_version=$1, updated_at=now()
					  WHERE device_id=$2 AND tenant_id=$3::uuid`,
					fwAck.Version, pt.DeviceID, pt.TenantID)
			}

			// Device history event
			evtType := "firmware_update"
			var desc string
			switch fwAck.Status {
			case "rolled_back":
				desc = fmt.Sprintf("Firmware rollback: %s → %s", fwAck.PreviousVersion, fwAck.Version)
				if fwAck.Error != "" {
					desc += " (" + fwAck.Error + ")"
				}
			default:
				desc = fmt.Sprintf("Firmware update %s", fwAck.Status)
				if fwAck.Error != "" {
					desc += ": " + fwAck.Error
				}
			}
			go InsertDeviceEvent(h.appCtx, h.db.Pool, DeviceEvent{
				TenantID:  pt.TenantID,
				DeviceID:  pt.DeviceID,
				EventType: evtType,
				Description: desc,
				Metadata: map[string]any{
					"deployment_id": fwAck.DeploymentID, "status": fwAck.Status,
					"progress_pct": fwAck.ProgressPct, "version": fwAck.Version,
					"previous_version": fwAck.PreviousVersion,
				},
			})
		}

	default:
		slog.Info("config ack", "device", pt.DeviceID, "type", env.Type, "ref", env.Ref, "status", env.Status)
	}

	// Record config ack as device history event.
	var meta map[string]any
	_ = json.Unmarshal(env.Data, &meta)
	if meta == nil {
		meta = map[string]any{}
	}
	meta["ack_type"] = env.Type
	meta["status"] = env.Status
	if env.JobID != "" {
		meta["job_id"] = env.JobID
	}
	go InsertDeviceEvent(h.appCtx, h.db.Pool, DeviceEvent{
		TenantID:    pt.TenantID,
		DeviceID:    pt.DeviceID,
		EventType:   "config_ack",
		Description: fmt.Sprintf("Config acknowledged: %s — %s", env.Type, env.Status),
		Metadata:    meta,
	})
}
