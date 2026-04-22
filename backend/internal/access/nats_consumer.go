package access

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/duali/dm3-backend/pkg/db"
	"github.com/duali/dm3-backend/pkg/natsutil"
)

var uuidRegex = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

func toUUIDPtr(s string) *string {
	if s == "" || !uuidRegex.MatchString(s) {
		return nil
	}
	return &s
}

// isOwnTenantMediaKey reports whether `key` is a server-issued media object
// key that belongs to (tenantID, deviceID). Accepts anything under
// `events/<tenant>/<device>/` — kind ("snapshot"|"clip") and filename are
// not re-validated here because media_handlers.go already enforces the
// allow-list at the presign endpoint. Legacy base64 payloads (no `events/`
// prefix) are NOT matched; callers decide whether to drop or keep them.
func isOwnTenantMediaKey(key, tenantID, deviceID string) bool {
	if key == "" || tenantID == "" || deviceID == "" {
		return false
	}
	// Accept both gateway media keys (events/) and cctv-svc media keys (cctv-faces/)
	return strings.HasPrefix(key, "events/"+tenantID+"/"+deviceID+"/") ||
		strings.HasPrefix(key, "cctv-faces/"+tenantID+"/"+deviceID+"/")
}

type NATSConsumer struct {
	db   *db.DB
	nats *natsutil.Client
}

func NewNATSConsumer(database *db.DB, natsClient *natsutil.Client) *NATSConsumer {
	return &NATSConsumer{db: database, nats: natsClient}
}

type deviceEvent struct {
	Version int             `json:"v"`
	ID      string          `json:"id"`
	TS      int64           `json:"ts"`
	Src     string          `json:"src"`
	Type    string          `json:"type"`
	Data    json.RawMessage `json:"data"`
}

// CredentialEntry is one element of the typed credentials array. Each scan
// in an N-step verify chain produces one entry, so a "QR then card" verify
// yields two entries with different types.
type CredentialEntry struct {
	Type  string `json:"type"`
	Value string `json:"value"`
}

type accessLogData struct {
	DoorID               string            `json:"door_id"` // legacy field, may still arrive from older firmware
	UserID               string            `json:"user_id"`
	UserName             string            `json:"user_name"`
	Credentials          []CredentialEntry `json:"credentials"`            // PREFERRED: ordered list of typed credentials
	CredentialType       string            `json:"credential_type"`        // LEGACY mirror of credentials[0].type
	CredentialValue      string            `json:"credential_value"`       // LEGACY mirror of credentials[0].value
	OtherCredentialValue json.RawMessage   `json:"other_credential_value"` // LEGACY: 2nd+ factors when credentials[] absent
	Direction            string            `json:"direction"`
	Decision             string            `json:"decision"`
	Reason               string            `json:"reason"`
	Confidence           *float64          `json:"confidence"`
	// The wire field is `photo` (mqtt-protocol.md §4.1). The Go field name and
	// DB column stay `photo_ref` for backward compat — only the JSON tag needs
	// to match what devices actually send.
	PhotoRef             string            `json:"photo"`
	// ClipObjectKey is the MinIO object key for an optional video clip
	// attached to the access event (mqtt-protocol.md §4.1). There is no
	// dedicated DB column — it is persisted under metadata.clip_object_key
	// and fetched by the same presigned-GET flow as photo_ref.
	ClipObjectKey        string            `json:"clip_object_key"`
	Temperature          *float64          `json:"temperature"`
	DecidedLocally       *bool             `json:"decided_locally"`
	Metadata             map[string]any    `json:"metadata"`
}

// normalizeCredentials returns the typed credentials list for an event.
// It prefers the new `credentials` array if the device sent one; otherwise it
// reconstructs the list from the legacy `credential_value` + `other_credential_value`
// fields, marking every reconstructed entry with `credential_type` as its type.
// The returned list is deduped on (type, value).
func normalizeCredentials(ald accessLogData) []CredentialEntry {
	dedupKey := func(e CredentialEntry) string { return e.Type + "\x00" + e.Value }

	if len(ald.Credentials) > 0 {
		out := make([]CredentialEntry, 0, len(ald.Credentials))
		seen := make(map[string]struct{}, len(ald.Credentials))
		for _, e := range ald.Credentials {
			e.Type = strings.TrimSpace(e.Type)
			e.Value = strings.TrimSpace(e.Value)
			if e.Value == "" {
				continue
			}
			if e.Type == "" {
				e.Type = ald.CredentialType // fall back to the legacy single type
			}
			k := dedupKey(e)
			if _, ok := seen[k]; ok {
				continue
			}
			seen[k] = struct{}{}
			out = append(out, e)
		}
		return out
	}

	// Legacy reconstruction — every entry inherits the same credential_type
	// because the per-entry type isn't available without firmware support.
	primaryType := ald.CredentialType
	out := make([]CredentialEntry, 0, 4)
	seen := make(map[string]struct{}, 4)
	if ald.CredentialValue != "" {
		e := CredentialEntry{Type: primaryType, Value: ald.CredentialValue}
		out = append(out, e)
		seen[dedupKey(e)] = struct{}{}
	}
	for _, v := range parseCredentialList(ald.OtherCredentialValue) {
		e := CredentialEntry{Type: primaryType, Value: v}
		k := dedupKey(e)
		if _, ok := seen[k]; ok {
			continue
		}
		seen[k] = struct{}{}
		out = append(out, e)
	}
	return out
}

// parseCredentialList collapses the device's `other_credential_value` field
// into a flat slice. Firmwares vary: some send a single string, some send a
// comma-separated string, and some send a JSON array. Any of those is fine.
func parseCredentialList(raw json.RawMessage) []string {
	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}
	var arr []string
	if err := json.Unmarshal(raw, &arr); err == nil {
		out := make([]string, 0, len(arr))
		for _, v := range arr {
			v = strings.TrimSpace(v)
			if v != "" {
				out = append(out, v)
			}
		}
		return out
	}
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		s = strings.TrimSpace(s)
		if s == "" {
			return nil
		}
		out := make([]string, 0, 4)
		for _, p := range strings.Split(s, ",") {
			p = strings.TrimSpace(p)
			if p != "" {
				out = append(out, p)
			}
		}
		return out
	}
	return nil
}

// Start subscribes to NATS device events and ingests access events into the DB.
func (c *NATSConsumer) Start(ctx context.Context) error {
	handler := func(subject string, data []byte) error {
		return c.handleEvent(ctx, subject, data)
	}
	if err := c.nats.Subscribe(ctx, "DEVICES", "access-svc-events", "dm3.devices.*.*.evt", handler); err != nil {
		return err
	}
	slog.Info("nats consumer started", "subject", "dm3.devices.*.*.evt")
	return nil
}

func (c *NATSConsumer) handleEvent(ctx context.Context, subject string, data []byte) error {
	var evt deviceEvent
	if err := json.Unmarshal(data, &evt); err != nil {
		slog.Warn("nats: failed to unmarshal event", "error", err, "subject", subject)
		return nil // ack bad messages to avoid redelivery
	}

	// Only process access.log events
	if evt.Type != "access.log" {
		return nil
	}

	var ald accessLogData
	if err := json.Unmarshal(evt.Data, &ald); err != nil {
		slog.Warn("nats: failed to unmarshal access.log data", "error", err)
		return nil
	}

	evtTime := time.UnixMilli(evt.TS)
	// Always persist credential_value + device_id in metadata so the
	// monitoring page can display the raw card UID and the source device
	// even when the device isn't bound to an access_point yet (so
	// access_point_id is NULL on the row).
	if ald.Metadata == nil {
		ald.Metadata = map[string]any{}
	}
	// Normalize to a single typed credentials list:
	//   1. credentials[] from the device wins (preferred new field).
	//   2. Otherwise reconstruct from credential_value + other_credential_value,
	//      with every entry inheriting credential_type as its per-entry type.
	credEntries := normalizeCredentials(ald)
	if ald.CredentialValue != "" {
		ald.Metadata["credential_value"] = ald.CredentialValue
	}
	if len(credEntries) > 0 {
		ald.Metadata["credentials"] = credEntries
		// Legacy mirror: flat values list, kept for clients still reading card_ids.
		flat := make([]string, len(credEntries))
		for i, e := range credEntries {
			flat[i] = e.Value
		}
		ald.Metadata["credential_values"] = flat
	}

	// Extract tenant_id from NATS subject: dm3.devices.{tenant_id}.{device_id}.evt
	parts := strings.SplitN(subject, ".", 5)
	if len(parts) < 4 || !uuidRegex.MatchString(parts[2]) {
		slog.Warn("nats: cannot extract tenant_id from subject", "subject", subject)
		return nil
	}
	tenantID := parts[2]

	// Extract device_id from source or subject. evt.Src is sent as
	// "device:<id>" by some firmware — strip the prefix so it matches
	// dm3_devices.devices.device_id.
	deviceID := strings.TrimPrefix(evt.Src, "device:")
	if deviceID == "" {
		deviceID = parts[3]
	}

	// Resolve access_point_id AND the device UUID from the literal device_id.
	// apd.access_device_id is a text column storing dm3_devices.devices.id
	// (uuid as text), so we must translate the literal device_id ("840107")
	// to its uuid via devices. The UUID is also needed for the media-key
	// prefix check below: the media-url endpoint issues keys scoped by the
	// JWT `did` (UUID), but evt.Src carries the short device_id, so the two
	// never match without this lookup.
	var accessPointID *string
	var deviceUUID string
	if deviceID != "" {
		lookupCtx, lookupCancel := context.WithTimeout(ctx, 2*time.Second)
		err := c.db.Pool.QueryRow(lookupCtx,
			`SELECT ap.id::text, d.id::text FROM dm3_access.access_points ap
			 JOIN dm3_access.access_point_devices apd ON apd.access_point_id = ap.id
			 JOIN dm3_devices.devices d ON d.id::text = apd.access_device_id
			 WHERE d.device_id = $1 AND ap.tenant_id = $2::uuid
			 LIMIT 1`,
			deviceID, tenantID,
		).Scan(&accessPointID, &deviceUUID)
		lookupCancel()
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			slog.Error("nats: failed to resolve access_point_id", "error", err, "device_id", deviceID, "tenant_id", tenantID)
		}
		// Fallback: device may exist in dm3_devices but not yet be linked to
		// an access_point. We still want the UUID so media-key validation
		// passes on a freshly-provisioned device whose access-point wiring
		// is pending.
		if deviceUUID == "" {
			fbCtx, fbCancel := context.WithTimeout(ctx, 2*time.Second)
			err := c.db.Pool.QueryRow(fbCtx,
				`SELECT id::text FROM dm3_devices.devices
				 WHERE device_id = $1 AND tenant_id = $2::uuid
				 LIMIT 1`,
				deviceID, tenantID,
			).Scan(&deviceUUID)
			fbCancel()
			if err != nil && !errors.Is(err, pgx.ErrNoRows) {
				slog.Warn("nats: failed to resolve device uuid", "error", err, "device_id", deviceID, "tenant_id", tenantID)
			}
		}
	}

	if deviceID != "" {
		ald.Metadata["device_id"] = deviceID
	}

	// Guard against cross-tenant media references: a compromised device in
	// tenant A publishing access.log with data.photo pointing at tenant B's
	// object key would otherwise leak B's image to A's monitoring page via
	// the server-issued presigned GET. Media keys are always server-issued
	// as events/<tenant_id>/<device_uuid>/<kind>/<uuid>.<ext> (see
	// docs/architecture/mqtt-protocol.md §15 and internal/gateway/media_handlers.go),
	// so anything that doesn't match that prefix is either spoofed or legacy
	// base64. Clear the reference and keep the event — data loss beats a
	// silent tenant-leak, and legacy base64 rows are already tolerated as a
	// pass-through per §4.1 ("Existing rows with base64-encoded photo are
	// left untouched").
	//
	// The media-url endpoint scopes keys by the JWT `did` (UUID), but evt.Src
	// is the short device_id. Accept both prefixes so kiosks that publish
	// with the short id (e.g. LPR desktop app) still pass validation.
	mediaAcceptable := func(key string) bool {
		if isOwnTenantMediaKey(key, tenantID, deviceID) {
			return true
		}
		if deviceUUID != "" && isOwnTenantMediaKey(key, tenantID, deviceUUID) {
			return true
		}
		return false
	}

	if ald.PhotoRef != "" && !mediaAcceptable(ald.PhotoRef) {
		slog.Warn("nats: rejecting cross-tenant media reference on access.log",
			"tenant_id", tenantID, "device_id", deviceID, "device_uuid", deviceUUID,
			"photo_ref", ald.PhotoRef, "event_id", evt.ID)
		ald.PhotoRef = ""
	}
	if ald.ClipObjectKey != "" {
		if mediaAcceptable(ald.ClipObjectKey) {
			ald.Metadata["clip_object_key"] = ald.ClipObjectKey
		} else {
			slog.Warn("nats: rejecting cross-tenant clip reference on access.log",
				"tenant_id", tenantID, "device_id", deviceID,
				"clip_object_key", ald.ClipObjectKey, "event_id", evt.ID)
		}
	}

	metadataJSON, _ := json.Marshal(ald.Metadata)

	// Use a bounded context for DB operations so they cannot hang indefinitely.
	dbCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	decidedLocally := true
	if ald.DecidedLocally != nil {
		decidedLocally = *ald.DecidedLocally
	}

	// Resolve user from credential_value when the device's user_id is missing
	// or malformed (some firmware truncates UUIDs to 30 chars). We look up the
	// active credential matching the value the device actually scanned and
	// backfill user_id + user_name from there.
	resolvedUserID := toUUIDPtr(ald.UserID)
	resolvedUserName := ald.UserName
	if resolvedUserID == nil && ald.CredentialValue != "" {
		var uid, fullName string
		err := c.db.Pool.QueryRow(dbCtx,
			`SELECT u.id::text, TRIM(CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.last_name,'')))
			 FROM dm3_identity.credentials cr
			 JOIN dm3_identity.users u ON u.id = cr.user_id
			 WHERE cr.tenant_id = $1::uuid AND cr.value = $2 AND cr.status = 'active'
			 ORDER BY cr.created_at ASC LIMIT 1`,
			tenantID, ald.CredentialValue,
		).Scan(&uid, &fullName)
		if err == nil {
			resolvedUserID = toUUIDPtr(uid)
			if resolvedUserName == "" {
				resolvedUserName = fullName
			}
		} else if !errors.Is(err, pgx.ErrNoRows) {
			slog.Warn("nats: credential_value lookup failed", "error", err, "value", ald.CredentialValue)
		}
	}

	// event_id + ON CONFLICT makes this idempotent against JetStream
	// redelivery (consumer ack loss, crash, leader election). The unique
	// index is (tenant_id, time, event_id) WHERE event_id IS NOT NULL, so
	// events without an id still insert (legacy path), they just won't
	// dedupe.
	_, err := c.db.Pool.Exec(dbCtx,
		`INSERT INTO dm3_access.access_events (time, tenant_id, event_id, access_point_id, door_id, user_id, user_name, credential_type, direction, decision, reason, confidence, photo_ref, temperature, decided_locally, metadata)
		 VALUES ($1, $2::uuid, NULLIF($3,''), $4::uuid, $5::uuid, $6::uuid, NULLIF($7,''), NULLIF($8,''), NULLIF($9,''), $10, NULLIF($11,''), $12, NULLIF($13,''), $14, $15, $16)
		 ON CONFLICT (tenant_id, "time", event_id) WHERE event_id IS NOT NULL DO NOTHING`,
		evtTime, tenantID, evt.ID, accessPointID, toUUIDPtr(ald.DoorID), resolvedUserID, resolvedUserName, ald.CredentialType,
		ald.Direction, ald.Decision, ald.Reason, ald.Confidence, ald.PhotoRef, ald.Temperature, decidedLocally, metadataJSON)
	if err != nil {
		slog.Error("nats: failed to insert access event", "error", err)
		return err
	}

	// Update access device's last_event_at using the actual device ID (from subject/src),
	// not ald.DoorID which is the door/access-point identifier.
	if deviceUUID := toUUIDPtr(deviceID); deviceUUID != nil {
		updateCtx, updateCancel := context.WithTimeout(ctx, 5*time.Second)
		if _, err := c.db.Pool.Exec(updateCtx,
			`UPDATE dm3_access.access_devices SET last_event_at = $1 WHERE id = $2::uuid`, evtTime, *deviceUUID); err != nil {
			slog.Warn("nats: failed to update access device last_event_at", "error", err, "device", *deviceUUID)
		}
		updateCancel()
	}

	slog.Debug("access event ingested", "device", ald.DoorID, "decision", ald.Decision, "user", ald.UserName)
	return nil
}
