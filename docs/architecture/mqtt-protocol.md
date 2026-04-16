# Duall Master 3.0 — MQTT Protocol Specification

> IoT Device ↔ Server Communication Protocol
> Version: 1.0 | Updated: 2026-02-19

---

## 1. Overview

All IoT devices (terminals, door controllers, sensors, cameras) communicate with the Duall Master platform via **MQTT 5.0** through an **EMQX** broker cluster. Messages are JSON-encoded with a standardized envelope format.

### Connection Details

| Parameter | Value |
|-----------|-------|
| **Broker** | EMQX 5.x cluster |
| **Transport** | TCP (1883) / TLS (8883) / WebSocket (8083/8084) |
| **Protocol** | MQTT 5.0 |
| **QoS Levels** | QoS 0 (telemetry), QoS 1 (events/status), QoS 2 (commands/config) |
| **Keep Alive** | 60 seconds |
| **Session Expiry** | 3600 seconds (persistent sessions) |
| **Max Payload** | 256 KB |
| **Auth** | Username/Password (JWT token) or X.509 client certificate |

### Authentication Flow

```
Device Boot → TLS Handshake → CONNECT(username=device_id, password=JWT)
  → Broker validates JWT (signed by platform, contains tenant_id + device_id + permissions)
  → CONNACK → Subscribe to relevant topics
```

**JWT Claims:**
```json
{
  "sub": "device:{device_id}",
  "tid": "{tenant_id}",
  "did": "{device_id}",
  "dtype": "terminal|controller|sensor|camera",
  "permissions": ["pub:evt", "pub:sta", "sub:cmd", "sub:cfg"],
  "exp": 1740000000,
  "iat": 1739900000
}
```

---

## 2. Device Bootstrap & Provisioning

Before a device has a JWT it cannot connect as `device:{rid}`. It must first
go through the bootstrap handshake to obtain credentials. Until a device
completes this flow it will **not** appear in the "pending devices" list,
and any heartbeats published outside the flow are silently dropped.

Firmware must mirror what the simulator (`simulator/src/dm3_simulator/device.py`) does.
Verified end-to-end against the simulator on 2026-04-13.

### 2.1 Bootstrap MQTT credentials

Before the device has a JWT it connects with *bootstrap* credentials:

```
username: bootstrap:{rid}
password: HMAC-SHA256(BOOTSTRAP_SECRET, "{rid}:{unix_minute}")  // hex
```

- `rid` = device RID, max 20 chars (DB constraint).
- `unix_minute` = `floor(unix_time_seconds / 60)`. Regenerate on each reconnect —
  the window is short, so the device clock must be roughly in sync.
- `BOOTSTRAP_SECRET` default (dev): `dm3-bootstrap-v1-dev-secret`.
  Production value comes from the backend env var `BOOTSTRAP_SECRET`.

Reference: `simulator/src/dm3_simulator/device.py:176-189`,
`backend/internal/config/config.go` (`BootstrapSecret`).

### 2.2 Subscribe to the response topic FIRST

Before publishing, subscribe:

```
dm/bootstrap/{rid}/response        QoS 1
```

The approval response (§2.5) arrives here, possibly minutes or hours later.
Do not unsubscribe until you have received `device.approved`.

### 2.3 Publish registration

```
topic:   dm/bootstrap/register   QoS 1
payload: JSON, UTF-8, no whitespace, keys sorted alphabetically
```

Payload fields (all required):

| Field | Type | Notes |
|---|---|---|
| `type` | string | constant `"device.register"` |
| `rid` | string | device RID |
| `device_type` | string | canonical model name (see §2.3.1). Exact match, case-sensitive. Unknown values are rejected with `device.register_nack`. |
| `firmware_version` | string | e.g. `"fw-1.2.3"` |
| `hardware_fingerprint` | object | `{android_id, mac_address, model, firmware_version}` — may carry `app_signature_hash` |
| `nonce` | string | fresh UUIDv4 per request; replay-checked against `dm3_devices.used_nonces` |
| `timestamp` | int | current unix seconds |
| `hmac` | string | see below |

#### 2.3.1 Accepted `device_type` values

The `device_type` field must be one of the canonical model names below —
**exact match, lowercase, no aliases, no case folding**. If the device
firmware uses a different casing or format (`"DQMiniPlus"`, `"ICU-300N"`,
`"dqmini+"`), it must be updated to emit the canonical string.
Unrecognized values are rejected at the MQTT bootstrap handler with:

```json
{
  "type": "device.register_nack",
  "status": "error",
  "message": "unknown device_type \"...\"; must be one of: ..."
}
```

Source of truth:
`backend/internal/gateway/provisioning.go` (`validDeviceModels`) and the
`chk_device_model` / `chk_device_type` CHECK constraints in
`backend/pkg/db/migrations/000001_initial.up.sql`.

| `device_type` | Resolved top-level `type` |
|---|---|
| `ra08` | terminal |
| `ba8300` | terminal |
| `df970` | terminal |
| `dq200` | terminal |
| `dq8500` | terminal |
| `icu970` | terminal |
| `icu300n` | terminal |
| `ipopx` | terminal |
| `itouch_pop_x` | terminal |
| `icu400` | terminal |
| `de960` | terminal |
| `de950` | terminal |
| `dqmini_plus` | terminal |
| `camera_dc` | camera |
| `cctv` | camera |
| `door_sensor` | sensor |

When `ApprovePending` persists the device it stores the canonical model
in `devices.model` and the resolved top-level type in `devices.type`.

**HMAC computation (critical — byte-exact):**

1. Build the payload object WITHOUT the `hmac` field.
2. Serialize as JSON with:
   - keys sorted alphabetically,
   - compact separators `,` and `:` (no spaces),
   - UTF-8.
   This must match Go's `json.Marshal` output byte-for-byte.
3. `hmac = hex(HMAC_SHA256(BOOTSTRAP_SECRET, canonical_json))`.
4. Add the `hmac` field and publish the full object
   (also serialized with sorted keys / compact separators).

The server recomputes by stripping `hmac`, re-marshalling with Go's
`json.Marshal`, and comparing. Any stray whitespace, key order, or
field-rename will fail verification silently (the row is rejected before
it reaches `pending_registrations`).

Reference: `simulator/src/dm3_simulator/device.py:211-239`,
`backend/internal/gateway/provisioning.go:708-714`.

**Optional: app signature.** If the backend is configured with
`KNOWN_APP_SIGNATURES`, include `hardware_fingerprint.app_signature_hash`
(hex-encoded SHA-256 of the APK signing cert). Devices whose hash isn't
on the allow-list land in pending with `signature_verified = false` and
require manual approval.

### 2.4 Server responds with `register_ack`

Topic: `dm/bootstrap/{rid}/response`

```json
{
  "type": "device.register_ack",
  "rid": "...",
  "status": "pending_approval"
}
```

At this point the device exists in `dm3_devices.pending_registrations`
and is visible to the sysadmin console at
`GET /api/v1/gateway/devices/pending`.

The device must now **stay subscribed and wait**. Do not retry the
registration — the `nonce` replay check will reject the second attempt.

### 2.5 Sysadmin approves

```
POST /api/v1/gateway/devices/pending/{id}/approve
Authorization: Bearer <sysadmin JWT>
Body: { "tenant_id": "<uuid>", "name": "...", "location": "..." }
```

Note: the field is `tenant_id`, not `company_id`.

Gateway publishes on `dm/bootstrap/{rid}/response`:

```json
{
  "type": "device.approved",
  "rid": "840107",
  "status": "approved",
  "credentials": {
    "mqtt_username": "device:840107",
    "mqtt_token": "<JWT, 24h TTL>",
    "token_expires_at": "2026-04-14T03:07:09Z",
    "refresh_url": "/api/v1/gateway/devices/refresh-token"
  },
  "company": { "id": "<tenant uuid>" },
  "config": {
    "heartbeat_interval_sec": 30,
    "sync_url": "/api/v1",
    "tenant_id": "<tenant uuid>"
  }
}
```

**The tenant_id is a UUID.** Do not hardcode company codes like `"DUALI"`.
The firmware must persist `company.id` from this message and use it in
every subsequent MQTT topic.

### 2.6 Reconnect as a provisioned device

Disconnect the bootstrap MQTT session. Reconnect with:

```
username: device:{rid}
password: <mqtt_token from §2.5>
```

The device now uses the full topic hierarchy documented in §3 below.
`{tenant_id}` is the UUID from `company.id` in §2.5. Device-gateway
subscribes to `dm/+/device/+/sta` etc.; the `+` wildcard matches one
level, so any string works syntactically, but the handler will reject
heartbeats for a `(tenant_id, device_id)` pair it does not know about.

### 2.7 Token refresh

The JWT expires in 24h. Before expiry:

```
POST /api/v1/gateway/devices/refresh-token
Body: { "rid": "...", "token": "<current jwt>" }
```

This endpoint is on the gateway HTTP API and does NOT require a user
JWT. It accepts expired tokens within a 7-day grace window to tolerate
offline devices (see `backend/internal/gateway/provisioning.go:588`).

### 2.8 Legacy topics (NOT supported)

For firmware migrating from DM2:

| Old | New |
|---|---|
| `/topic/online` | `dm/{tenant_id}/device/{rid}/sta` |
| `/topic/auth_start/{rid}` | `dm/{tenant_id}/device/{rid}/evt` |
| `/topic/auth_stepN/{rid}` | single `evt` publish with payload `{type: "access_event", ...}` |
| `/topic/certificate/{rid}` | `dm/bootstrap/{rid}/response` |

Device-gateway does not subscribe to `/topic/*`.

### 2.9 Verifying against the simulator

```bash
# 1. Start stack: postgres-db-timescale, emqx, nats, device-gateway, auth-svc
# 2. Start simulator:
cd simulator && .venv/bin/dm3-simulator run \
    --devices 0 --broker mqtt://localhost:1884 --api-port 9090

# 3. Trigger a bootstrap:
curl -X POST http://localhost:9090/api/simulate/bootstrap \
  -H 'Content-Type: application/json' \
  -d '{"rid":"sim-test-01","device_type":"terminal"}'

# 4. Check pending list as sysadmin:
TOKEN=$(curl -s -X POST http://localhost:8005/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"sysadmin@duali.com","password":"admin123"}' \
  | jq -r .access_token)
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8002/api/v1/gateway/devices/pending

# 5. Approve — PENDING_ID from step 4:
curl -X POST "http://localhost:8002/api/v1/gateway/devices/pending/$PENDING_ID/approve" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"tenant_id":"00000000-0000-0000-0000-000000000001","name":"Sim Test"}'

# 6. Confirm online:
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8002/api/v1/gateway/devices | jq '.[] | select(.device_id=="sim-test-01")'
```

Full E2E script: `backend/scripts/e2e-provisioning-test.sh`.

---

## 3. Topic Hierarchy

```
dm/{tenant_id}/
├── device/{device_id}/
│   ├── evt          # Device → Server: events
│   ├── cmd          # Server → Device: commands
│   ├── cmd/resp     # Device → Server: command responses
│   ├── sta          # Device → Server: status/heartbeat
│   └── cfg          # Server → Device: configuration
│   └── cfg/ack      # Device → Server: config acknowledgment
├── zone/{zone_id}/
│   ├── alarm        # Zone alarm aggregation
│   └── occupancy    # Zone occupancy count
├── emergency/
│   └── broadcast    # Emergency broadcast to all tenant devices
└── $SYS/
    └── lwt/{device_id}  # Last Will & Testament (offline detection)
```

### Topic Access Control (ACL)

| Device Type | Publish | Subscribe |
|-------------|---------|-----------|
| Terminal | `dm/{tid}/device/{did}/evt`, `sta`, `cmd/resp`, `cfg/ack` | `dm/{tid}/device/{did}/cmd`, `cfg`, `dm/{tid}/emergency/#` |
| Controller | `dm/{tid}/device/{did}/evt`, `sta`, `cmd/resp` | `dm/{tid}/device/{did}/cmd`, `cfg` |
| Sensor | `dm/{tid}/device/{did}/evt`, `sta` | `dm/{tid}/device/{did}/cfg` |
| Server | `dm/{tid}/device/+/cmd`, `cfg`, `dm/{tid}/emergency/#` | `dm/{tid}/device/+/evt`, `sta`, `cmd/resp`, `cfg/ack` |

---

## 4. Message Envelope

All messages follow a standard envelope format:

```json
{
  "v": 1,                          // Protocol version
  "id": "msg-uuid-v7",            // Unique message ID (UUIDv7 for time-ordering)
  "ts": 1740000000000,            // Timestamp (Unix ms, device clock)
  "src": "device:{device_id}",    // Source identifier
  "type": "{message_type}",       // Message type (see sections below)
  "data": { ... }                 // Type-specific payload
}
```

**For command responses, add:**
```json
{
  "ref": "original-msg-id",       // Reference to the command message ID
  "status": "ok|error|timeout",   // Execution result
  "error": "optional error msg"   // Only present on error
}
```

---

## 5. Device Events (`evt`)

### 4.1 Access Log Event (Offline-First)

**Topic:** `dm/{tid}/device/{did}/evt`
**QoS:** 1
**Direction:** Device → Server (event reporting only — decision already made locally)

> **IMPORTANT:** This is a log of what already happened on the device. The device made the access decision locally against its synced user DB. The server does NOT make access decisions.

```json
{
  "v": 1,
  "id": "019506a3-1234-7000-8000-000000000001",
  "ts": 1740000000000,
  "src": "device:term-001",
  "type": "access.log",
  "data": {
    "method": "face|card|qr|fingerprint|pin",
    "door_id": "door-001",
    "direction": "entry|exit",
    "decision": "granted|denied",
    "decided_locally": true,
    "decision_time_ms": 35,
    "user_id": "user-uuid",
    "user_name": "Nguyễn Văn A",
    "confidence": 0.97,
    "reason": "authorized|denied_expired|denied_zone|denied_time|denied_unknown|denied_blacklist|denied_invalid_card|denied_invalid_qr|denied_invalid_pin|denied_invalid_face|denied_invalid_fp|denied_no_credential|denied_anti_passback|denied_offline",
    "credentials": [                          // Ordered list of credentials presented in this scan (preferred)
      { "type": "qr_code",  "value": "123456789" },
      { "type": "card_uid", "value": "9A232AE9" }
    ],
    "credential_type": "qr_code",             // LEGACY — mirrors credentials[0].type for old consumers
    "credential_value": "123456789",          // LEGACY — mirrors credentials[0].value for old consumers
    "other_credential_value": [],             // LEGACY — extra factors for N-step verify, see below
    "person_detected": true,
    "temperature": 36.5,       // Optional: thermal reading (°C)
    "mask_detected": true,     // Optional: mask detection
    "photo": "base64_jpeg",    // Optional: snapshot (max 100KB, compressed)
    "local_db_version": 42,    // Current user DB version on device
    "local_person_count": 4998 // Number of users in local DB
  }
}
```

**Field notes:**

- **`user_id`** — must be the full 36-character UUID. Some legacy firmware truncates this to 30 chars; the server will reject the truncated value via `uuidRegex` and fall back to resolving the user via the credential value (see below). Firmware must send the complete UUID.
- **`user_name`** — optional. If empty, the server enriches the broadcast with the resolved user's full name from `dm3_identity.users`.
- **`credentials`** *(preferred — added 2026-04)* — an **ordered array** of every credential the device matched in this scan. Each entry is `{ "type": "<credential_type>", "value": "<raw_value>" }`. The order reflects the actual scan sequence in N-step verify, so a "QR then card" verify yields:
  ```json
  "credentials": [
    { "type": "qr_code",  "value": "123456789" },
    { "type": "card_uid", "value": "9A232AE9" }
  ]
  ```
  This is the **only field that carries the per-credential type** — the legacy `credential_type` is a single string and cannot describe a mixed-type verify chain. Devices supporting N-step verify must send `credentials`. Single-factor scans should send a 1-element array.

  Valid `type` values: `face_template`, `card_uid`, `qr_code`, `fp_template`, `pin`, `nfc`. Server-side defaults to `card_uid` if `type` is missing, since that's the most common case in the fleet.

- **`credential_type`** *(LEGACY)* — single credential type. Should mirror `credentials[0].type`. Kept so older servers, dashboards, and analytics that aren't `credentials`-aware continue to work during rollout.
- **`credential_value`** *(LEGACY)* — single raw credential value. Should mirror `credentials[0].value`. Used by the server as a fallback when `user_id` is missing or malformed: it looks up `dm3_identity.credentials` by `value` to recover the user. Also displayed on the monitoring page so unknown-card events still show what was scanned.
- **`other_credential_value`** *(LEGACY)* — additional credentials beyond the primary, used by old firmware that doesn't yet emit `credentials`. The server accepts any of these shapes for back-compat:
  - `""` / omitted — no extra factors
  - `"6F12AB34"` — single extra value as a string
  - `"6F12AB34,9A232AE9"` — comma-separated list
  - `["6F12AB34", "AB34CD56", "..."]` — JSON array

  When `credentials` is present, `other_credential_value` is ignored. When it isn't, the server reconstructs a `credentials` array from `credential_type` + `credential_value` + `other_credential_value`, marking every reconstructed entry with the same legacy `credential_type` (the per-entry type is unknown without firmware support).

**Server-side normalization:**

1. `credentials` — used as-is if present.
2. Otherwise — reconstructed from `credential_value` + `other_credential_value`, all entries inheriting `credential_type` as their type.
3. Persisted to `dm3_access.access_events.metadata.credentials` as a JSON array of `{type, value}` objects (jsonb column, no schema migration needed).
4. Returned on the WebSocket broadcast and the `GET /api/v1/gateway/events` API as `credentials: [{type, value}]` so the monitoring page can render the right icon per entry. The legacy `card_ids: string[]` field is also returned for any clients that haven't been updated to read the typed array.

**Server enrichment fields** (added by `device-gateway` before broadcasting on WebSocket; also written back on the REST API for backfill — devices do **not** send these):

| Field | Source | Purpose |
|---|---|---|
| `user_name` / `person_name` | `dm3_identity.users.first_name + last_name` | Filled when device sends an empty name |
| `user_code` | `dm3_identity.users.user_code` | For stacked name + code display |
| `avatar` | `dm3_identity.users.avatar` | Avatar URL for the live timeline |
| `department` | `dm3_identity.departments.name` via user → department | Monitoring page column |
| `card_id` | Primary card on the user's credentials, or `credential_value` for unknown cards | Monitoring page Card ID column |
| `card_ids` | Full list (primary + extras), see `other_credential_value` above | Monitoring page (stacked) |
| `device_name` | `dm3_devices.devices.name` (looked up by topic device id) | Monitoring page Device column |

**Note:** The old `access.scan` (device asks server) and `access.decision` (server responds) messages have been **removed**. Devices make all access decisions locally using their synced user DB and access rules. This event is purely for server-side logging, analytics, and dashboards.

### 4.2 Door State Event

```json
{
  "type": "door.state",
  "data": {
    "door_id": "door-001",
    "state": "open|closed|locked|unlocked|forced|held_open|held_closed|tampered",
    "source": "button|schedule|command|sensor|manual",
    "duration_ms": 0            // How long in current state (for held_open / held_closed alerts)
  }
}
```

### 4.4 Alarm Event

```json
{
  "type": "alarm.triggered",
  "data": {
    "alarm_type": "intrusion|fire|tamper|duress|door_forced|door_held|panic",
    "severity": "critical|warning|info",
    "zone_id": "zone-001",
    "door_id": "door-001",      // Optional
    "sensor_id": "sensor-001",  // Optional
    "details": "Door forced open without authorization",
    "photo": "base64_jpeg"      // Optional: snapshot at alarm time
  }
}
```

### 4.5 Visitor Event

```json
{
  "type": "visitor.checkin",
  "data": {
    "visitor_id": "visitor-uuid",
    "action": "checkin|checkout|pre_registered_arrival",
    "name": "Trần Thị B",
    "id_number": "0123456789",  // Masked in transit
    "host_id": "user-uuid",
    "photo": "base64_jpeg",
    "badge_printed": true,
    "access_zones": ["zone-lobby", "zone-meeting"],
    "valid_until": 1740003600000
  }
}
```

### 4.6 Sensor Reading

```json
{
  "type": "sensor.reading",
  "data": {
    "sensor_type": "temperature|humidity|motion|smoke|co2|noise|light",
    "value": 23.5,
    "unit": "°C|%|bool|ppm|dB|lux",
    "threshold_exceeded": false,
    "battery_pct": 85           // For wireless sensors
  }
}
```

### 4.7 Parking Event

```json
{
  "type": "parking.plate",
  "data": {
    "action": "entry|exit",
    "plate_number": "30A-12345",
    "plate_photo": "base64_jpeg",
    "confidence": 0.98,
    "vehicle_type": "car|motorcycle|truck",
    "lane_id": "lane-001",
    "local_match": {
      "matched": true,
      "user_id": "user-uuid",
      "slot_assigned": "B2-015"
    }
  }
}
```

---

## 6. Device Status (`sta`)

**Topic:** `dm/{tid}/device/{did}/sta`
**QoS:** 1
**Interval:** Every 30 seconds (heartbeat) + on significant change

### 5.1 Heartbeat

```json
{
  "type": "status.heartbeat",
  "data": {
    "online": true,
    "uptime_s": 86400,
    "firmware": "3.2.1",
    "ip": "192.168.1.100",
    "cpu_pct": 35,
    "mem_pct": 60,
    "disk_pct": 45,
    "temperature_c": 42,        // Device internal temp
    "network": {
      "type": "ethernet|wifi|4g",
      "signal_dbm": -45,        // WiFi/4G signal
      "latency_ms": 12          // MQTT broker latency
    },
    "peripherals": {
      "camera": "ok|error|disconnected",
      "reader": "ok|error|disconnected",
      "lock": "ok|error|disconnected",
      "printer": "ok|error|disconnected|na"
    },
    "queue_depth": 0,           // Offline event queue (pending sync)
    "last_access_ts": 1740000000000
  }
}
```

### 5.2 Last Will & Testament (LWT)

**Set on CONNECT, published by broker on unexpected disconnect:**

**Topic:** `dm/{tid}/device/{did}/sta`

```json
{
  "type": "status.offline",
  "data": {
    "reason": "unexpected_disconnect",
    "last_seen": 1740000000000
  }
}
```

---

## 7. Commands (`cmd`)

**Topic:** `dm/{tid}/device/{did}/cmd`
**QoS:** 2
**Direction:** Server → Device
**Timeout:** 10 seconds (device must respond within)

### 6.1 Door Control

```json
{
  "type": "cmd.door",
  "data": {
    "action": "unlock|lock|hold_open|hold_close|release",
    "door_id": "door-001",
    "duration_ms": 5000,         // For unlock/hold_open; omit for hold_close (indefinite)
    "reason": "remote_command",
    "operator_id": "user-uuid"   // Who issued the command
  }
}
```

**Actions:**
- `unlock` — momentary unlock for `duration_ms` (pulse the relay).
- `lock` — momentary re-lock, returning the door to its default state.
- `hold_open` — keep the door unlocked until an explicit `release` (lockdown → open).
- `hold_close` — keep the door locked and refuse all credential reads until an explicit `release` (lockdown → closed). Device reports state as `held_closed` in `door.state` events.
- `release` — exit either hold mode and return the door to its schedule-driven default.

`hold_open` and `hold_close` are mutually exclusive. Sending one while the other is active replaces the mode; the device should not need a `release` in between.

**Response** (`dm/{tid}/device/{did}/cmd/resp`):
```json
{
  "type": "cmd.door.resp",
  "ref": "original-msg-id",
  "status": "ok",
  "data": {
    "door_id": "door-001",
    "current_state": "unlocked",
    "executed_at": 1740000000500
  }
}
```

### 6.2 Device Reboot

```json
{
  "type": "cmd.reboot",
  "data": {
    "delay_ms": 5000,           // Graceful shutdown delay
    "reason": "maintenance|firmware_update|remote"
  }
}
```

### 6.3 Display Message

```json
{
  "type": "cmd.display",
  "data": {
    "message": "Hệ thống bảo trì từ 22:00",
    "duration_ms": 30000,
    "priority": "normal|high",  // high = interrupt current display
    "color": "blue|yellow|red",
    "sound": "info|warning|none"
  }
}
```

### 6.4 Capture Snapshot

```json
{
  "type": "cmd.snapshot",
  "data": {
    "camera": "main|secondary",
    "quality": 85,               // JPEG quality
    "max_width": 1280
  }
}
```

**Response:**
```json
{
  "type": "cmd.snapshot.resp",
  "ref": "original-msg-id",
  "status": "ok",
  "data": {
    "photo": "base64_jpeg",
    "width": 1280,
    "height": 720,
    "captured_at": 1740000001000
  }
}
```

### 6.5 Emergency Lockdown

**Topic:** `dm/{tid}/emergency/broadcast`
**QoS:** 2

```json
{
  "type": "cmd.lockdown",
  "data": {
    "action": "activate|deactivate",
    "level": "full|zone",
    "zone_ids": ["zone-001"],    // Empty = all zones
    "message": "Khẩn cấp: Toàn bộ cửa đã khóa",
    "operator_id": "user-uuid",
    "override_code": "hash_of_code"  // Required for deactivate
  }
}
```

---

## 8. Configuration (`cfg`)

**Topic:** `dm/{tid}/device/{did}/cfg`
**QoS:** 2
**Direction:** Server → Device

### 7.1 Full Config Push

Sent after device first connects or on major config change.

```json
{
  "type": "cfg.full",
  "data": {
    "config_version": 42,
    "checksum": "sha256:abc123...",
    "access_control": {
      "mode": "offline_first",
      "local_db_max_persons": 10000,
      "anti_passback": true,
      "door_unlock_duration_ms": 5000,
      "max_failed_attempts": 5,
      "lockout_duration_ms": 300000
    },
    "recognition": {
      "face_threshold": 0.75,
      "face_liveness": true,
      "face_mask_check": false,
      "temperature_check": false,
      "temperature_max": 37.5,
      "methods_enabled": ["face", "card", "qr"],
      "multi_factor": false      // Require 2+ methods
    },
    "display": {
      "language": "vi|en",
      "idle_message": "Chào mừng đến Duall Master",
      "logo_url": "https://...",
      "theme": "dark|light",
      "screensaver_timeout_ms": 60000
    },
    "schedule": {
      "timezone": "Asia/Ho_Chi_Minh",
      "auto_lock_cron": "0 22 * * *",
      "auto_unlock_cron": "0 6 * * 1-5"
    },
    "network": {
      "heartbeat_interval_ms": 30000,
      "offline_queue_max": 5000,
      "retry_interval_ms": 5000,
      "ntp_server": "pool.ntp.org"
    }
  }
}
```

### 7.2 Partial Config Update

```json
{
  "type": "cfg.patch",
  "data": {
    "config_version": 43,
    "path": "recognition.face_threshold",
    "value": 0.80
  }
}
```

### 7.3 Device Settings Update (`cfg.device_update`)

Pushed by `device-gateway` immediately after a successful
`PUT /api/v1/gateway/devices/{id}` (company-scoped) or
`PUT /api/v1/gateway/system/devices/{id}` (sysadmin). Carries the
flat set of fields editable on the console EditDevicePage so running
firmware can apply the change without waiting for a reconnect or a
full `cfg.full` resync.

- **Topic:** `dm/{tid}/device/{did}/cfg`
- **QoS:** 2 (exactly-once — misapplying a config is worse than losing a heartbeat)
- **Retain:** false
- **Direction:** server → device
- **Best-effort:** a publish failure is logged but does NOT fail the HTTP update.
  Offline devices will pick up the change on their next full sync
  (`cfg.person_sync` / `cfg.full`).

```json
{
  "version": 1,
  "id": "b7f3d2a1-4c8e-11ef-9c4d-0242ac120002",
  "ts": 1776064500123,
  "src": "server:device-gateway",
  "type": "cfg.device_update",
  "data": {
    "device_id": "840107",
    "name": "DQ Mini+ Demo",
    "location": "Office Staff",
    "model": "dqmini_plus",
    "open_relay_ms": 3000,
    "timezone": "Asia/Ho_Chi_Minh",
    "verify_methods": ["face", "nfc", "pin"],
    "verify_logic": "or"
  }
}
```

**`data` fields** (all always present — no nulls, no omitted keys):

| Field | Type | Notes |
|---|---|---|
| `device_id` | string | Device RID — mirrors the topic. Firmware SHOULD compare to its local RID and drop the message if mismatched. |
| `name` | string | Display name. Empty string if unset. |
| `location` | string | Free-form location. Empty string if unset. |
| `model` | string | Canonical model name (see §2.3.1). Empty string if unset. |
| `open_relay_ms` | int | Door unlock duration in milliseconds. Column default 3000. |
| `timezone` | string | IANA TZ name. Column default `"Asia/Ho_Chi_Minh"`. |
| `verify_methods` | string[] | Enabled verification methods. Values: `face`, `fingerprint`, `iris`, `nfc`, `nfc_phone`, `pin`, `plate_number`, `qr`, `vnid`. Empty array if none. |
| `verify_logic` | string | `"or"` or `"and"` — how multiple methods combine when two or more are enabled. Column default `"or"`. |

Because every field is always present, firmware cannot distinguish
"unset" from "explicitly cleared." If you need that distinction later
(e.g. to avoid overwriting an unrelated field), switch to
`cfg.patch` (§7.2) for targeted updates.

**Optional ack.** Firmware MAY publish an acknowledgement on
`dm/{tid}/device/{did}/cfg/ack`:

```json
{
  "type": "cfg.device_update.ack",
  "ref": "<envelope id from the update>",
  "status": "ok",
  "data": { "applied_at": 1776064500456 }
}
```

`device-gateway` currently receives messages on `cfg/ack` but does not
yet process `cfg.device_update.ack` specifically. Producing the ack is
still useful for future observability and is cheap.

Source of truth: `backend/internal/gateway/handlers.go` → `pushDeviceConfig`.

### 7.4 User Database Sync

For offline/hybrid mode — push user credentials to device local storage.

```json
{
  "type": "cfg.person_sync",
  "data": {
    "action": "upsert|delete|clear|full_sync",
    "users": [
      {
        "user_id": "user-uuid",
        "name": "Nguyễn Văn A",
        "credentials": [
          {"type": "card", "uid": "AABBCCDD", "valid_from": 1739900000000, "valid_until": 1771436000000},
          {"type": "face", "template": "base64_encoded", "version": "arcface_v3"},
          {"type": "fingerprint", "template": "base64_encoded", "finger": "right_index"}
        ],
        "access_zones": ["zone-001", "zone-002"],
        "schedule_id": "sched-001",
        "valid_from": 1739900000000,
        "valid_until": 1771436000000,
        "active": true
      }
    ],
    "sync_token": "cursor-for-incremental-sync",
    "total_count": 5000,
    "batch": 1,
    "batch_total": 5
  }
}
```

**Action semantics:**

| Action | What the device must do | When it's used |
|---|---|---|
| `upsert` | Insert or update the listed users; leave all other locally stored users untouched. | Incremental delta sync. |
| `delete` | Remove the listed users from local storage by `user_id`. Other users untouched. | A user was removed from the tenant. |
| `clear` | **Drop every locally stored user.** The `users` array is always empty for this action. After `clear`, the device's local user DB MUST be empty until the next message arrives. | First half of the manual replace flow (see below). |
| `full_sync` | Treat the listed users as the **authoritative full set** for this device. The device SHOULD reconcile by removing any locally stored user not in the payload. If the device can't reliably do that reconciliation, the server protects against staleness by sending an explicit `clear` first — see "Manual replace flow" below. | Cold device sync, periodic resync, or the second half of a manual replace flow. |

**Manual replace flow** *(added 2026-04, used by the on-demand "Transmit Data" button)* — when an operator manually triggers a sync from the web console, the server uses a two-message flow to guarantee the device ends up with exactly the authorized set:

1. **`action: "clear"`** — empty users array. The device must drop every locally stored user.
2. **`action: "full_sync"`** — the authoritative full set, possibly across multiple batches if `total_count > batch size`. The device loads exactly these users.

The two messages share the same topic and arrive in publish order. The device MUST process them in the order they are received. Both messages produce their own `cfg.person_sync.ack` so the server can detect partial failure (e.g. `clear` succeeded but `full_sync` was lost — the operator would see only some users in the next status report).

**Auto sync flow** *(unchanged)* — credential edits, role changes, etc. fan out via NATS → `IdentityConsumer` → `PushPersonSync`, which sends a single `full_sync` message. No `clear` is sent on the auto path because the user is making one small change and a destructive clear-then-resync would briefly leave the device with an empty user DB on every keystroke.

**Credential-level validity** *(added 2026-04)* — each credential entry MAY carry its own `valid_from` / `valid_until` (epoch ms). Semantics:

- Both fields are **optional** and **omitted when null** in the DB. If absent, the credential inherits the user-level `valid_from` / `valid_until` from the parent object.
- When **both** user-level and credential-level dates are present, the **credential-level dates are authoritative** for that specific credential. So a user can have one card valid until 2027-12-31 and a second card valid until 2026-06-30, and the device must reject the second card after its own expiry even though the user is still valid overall.
- The server only sends credentials whose `valid_until` is `NULL` or in the future — already-expired rows are filtered out at query time, so the device never has to garbage-collect dead credentials. But the server **does** push the new `valid_until` whenever a credential is updated (via the `dm3.identity.person.changed` NATS event → `IdentityConsumer` fan-out → `cfg.person_sync` to every online device in the tenant), so the device receives the date change in real time.
- Firmware MUST honor credential-level dates locally. Without firmware support, editing a future expiry has no visible effect until the credential actually expires and disappears from the next sync.

**Ack** (`dm/{tid}/device/{did}/cfg/ack`):
```json
{
  "type": "cfg.person_sync.ack",
  "ref": "original-msg-id",
  "status": "ok",
  "data": {
    "synced_count": 1000,
    "failed_count": 2,
    "local_total": 4998,
    "sync_token": "next-cursor"
  }
}
```

### 7.5 Blacklist Push (Priority Sync)

Real-time blacklist updates pushed to devices with highest priority. Device must process immediately.

```json
{
  "type": "cfg.blacklist",
  "data": {
    "action": "add|remove|full_sync",
    "entries": [
      {
        "user_id": "user-uuid",
        "name": "Nguyễn Văn X",
        "credentials": [
          {"type": "card", "uid": "AABBCCDD"},
          {"type": "face", "template": "base64_encoded"}
        ],
        "reason": "terminated|security_threat|lost_credential",
        "effective_from": 1740000000000,
        "effective_until": null
      }
    ],
    "blacklist_version": 15
  }
}
```

**QoS:** 2 (exactly-once — critical for security)
**Priority:** Immediate — device must process before next access decision

### 7.6 Access Rules Sync

Push access rules to devices for local decision-making. The payload encodes:
- **`passage_time`**: when the AP is freely open for everyone (no credential check). Highest priority — device enforces autonomously.
- **`access_rules`**: per-user list of schedules derived from their active Access Group memberships for this AP. Device grants access if ANY schedule covers the current time (union/OR logic).

```json
{
  "type": "cfg.access_rules",
  "data": {
    "action": "full_sync|delta",
    "version": 42,
    "passage_time": {
      "timezone": "Asia/Ho_Chi_Minh",
      "slots": [
        { "day": 1, "start": "08:00", "end": "18:00" },
        { "day": 2, "start": "08:00", "end": "18:00" },
        { "day": 3, "start": "08:00", "end": "18:00" },
        { "day": 4, "start": "08:00", "end": "18:00" },
        { "day": 5, "start": "08:00", "end": "18:00" }
      ]
    },
    "access_rules": [
      {
        "user_id": "uuid",
        "credential": "card-A1B2C3",
        "schedules": [
          {
            "source": "IT Team",
            "timezone": "Asia/Ho_Chi_Minh",
            "slots": [
              { "day": 0, "start": "00:00", "end": "23:59" },
              { "day": 1, "start": "00:00", "end": "23:59" }
            ]
          },
          {
            "source": "Cleaning Crew",
            "timezone": "Asia/Ho_Chi_Minh",
            "slots": [
              { "day": 1, "start": "18:00", "end": "20:00" }
            ]
          }
        ]
      }
    ],
    "sync_token": "cursor-for-incremental"
  }
}
```

Device logic: if `passage_time` is active for the current time → open for all (no credential check). Otherwise → for each user presenting a credential, grant if ANY of their `schedules` covers the current time. A user with no entry in `access_rules` for this device is denied.

**Ack** (`dm/{tid}/device/{did}/cfg/ack`):
```json
{
  "type": "cfg.access_rules.ack",
  "ref": "original-msg-id",
  "status": "ok",
  "data": {
    "rules_version": 42,
    "rules_count": 150
  }
}
```

### 7.7 Firmware OTA Update

#### Flow

```
Admin uploads firmware → clicks Deploy → selects devices
    ↓
Server creates deployment record per device
    ↓
Server generates time-limited download token (5 min expiry)
    ↓
Server publishes cfg.firmware MQTT message (QoS 2) to each device
    ↓
Device receives message, downloads binary via token URL
    ↓
Device sends cfg.firmware.ack (status: downloading → installing → success/failed)
    ↓
Server updates deployment status, device firmware_version, device_event history
    ↓
Frontend shows real-time progress (3s polling)
```

#### Server → Device: `cfg.firmware`

Topic: `dm/{tenant_id}/device/{device_id}/cfg` (QoS 2)

```json
{
  "v": 1,
  "type": "cfg.firmware",
  "data": {
    "version": "3.3.0",
    "url": "http://server:8002/api/v1/gateway/firmware/download/{token}",
    "checksum": "sha256:def456...",
    "size_bytes": 52428800,
    "deployment_id": "uuid",
    "force": false
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `version` | string | Target firmware version |
| `url` | string | Time-limited download URL (token-authenticated, no JWT needed, 5 min expiry) |
| `checksum` | string | `sha256:{hex}` — device must verify after download |
| `size_bytes` | int | Expected file size in bytes |
| `deployment_id` | string | Server-side deployment tracking ID — device must echo this in ack messages |
| `force` | bool | `true` = update immediately; `false` = device may schedule (e.g. 02:00 local) |

#### Device → Server: `cfg.firmware.ack`

Topic: `dm/{tenant_id}/device/{device_id}/cfg/ack` (QoS 1)

The device reports progress at each stage:

```json
{
  "v": 1,
  "type": "cfg.firmware.ack",
  "data": {
    "deployment_id": "uuid",
    "status": "downloading",
    "progress_pct": 45,
    "version": "3.3.0",
    "error": ""
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `deployment_id` | string | Must match the ID from the `cfg.firmware` message |
| `status` | string | One of: `downloading`, `installing`, `success`, `failed`, `rolled_back` |
| `progress_pct` | int | 0-100, updated during download/install |
| `version` | string | Firmware version being installed (or rolled-back-to version when `status=rolled_back`) |
| `error` | string | Error/reason message (set when `status=failed` or `status=rolled_back`) |
| `previous_version` | string | (optional) Previous firmware version before the update attempt. Set on `failed` and `rolled_back` |

**Status transitions:**

```
sent → downloading (device started download)
     → installing  (download complete, checksum verified, flashing to partition B)
     → success     (rebooted into new firmware, watchdog confirmed stable)
     → failed      (download/checksum/flash error — device stays on current firmware)
     → rolled_back (watchdog detected crash loop after reboot — auto-reverted to previous firmware)
```

#### Watchdog & Rollback

Devices implement a **hardware/software watchdog** that protects against bad firmware updates:

1. **Dual partition (A/B):** Device maintains two firmware partitions. The active partition runs the current firmware; OTA writes to the inactive partition.
2. **Install phase:** After download + checksum verification, the device flashes the new firmware to the inactive partition and sets a `pending_verification` boot flag.
3. **Reboot:** Device reboots into the new partition. The watchdog timer starts (typically 60–120s).
4. **Verification window:** The new firmware must call `watchdog_confirm()` (mark the new partition as "good") before the watchdog timer expires. This confirms basic functionality: MQTT connected, reader responsive, local DB accessible.
5. **Success path:** If `watchdog_confirm()` is called in time → the new partition becomes the active partition permanently. Device sends `cfg.firmware.ack` with `status: success`.
6. **Rollback path:** If the new firmware crashes, hangs, or fails to call `watchdog_confirm()` before the watchdog timer expires → the watchdog triggers a hard reset → bootloader reverts to the previous partition (A). Device boots with the old firmware and sends `cfg.firmware.ack` with `status: rolled_back`.

**Rollback ack message example:**

```json
{
  "v": 1,
  "type": "cfg.firmware.ack",
  "data": {
    "deployment_id": "uuid",
    "status": "rolled_back",
    "progress_pct": 0,
    "version": "3.2.1",
    "previous_version": "3.2.1",
    "error": "Watchdog timeout — new firmware failed to confirm within 120s. Reverted to v3.2.1."
  }
}
```

**Server handling on `rolled_back`:**
- Deployment status is set to `rolled_back`
- `devices.firmware_version` is updated to the rolled-back version (from `version` field, which now reports the old version)
- A `device_event` is recorded: `"Firmware rollback: v3.3.0 → v3.2.1 (watchdog timeout)"`
- An audit log entry is created with the rollback details
- The deployment is considered **terminal** (no retry without a new deploy action)

**Failure scenarios and device behavior:**

| Failure point | Device behavior | Status sent |
|---------------|----------------|-------------|
| Download fails (network/timeout) | Stays on current firmware, no reboot | `failed` (error: download reason) |
| Checksum mismatch after download | Discards downloaded file, no reboot | `failed` (error: checksum mismatch) |
| Flash write fails | Stays on current firmware, no reboot | `failed` (error: flash write failed) |
| New firmware boots but crashes within watchdog window | Watchdog hard-resets → boots old partition | `rolled_back` |
| New firmware boots but can't connect MQTT within watchdog window | Watchdog hard-resets → boots old partition | `rolled_back` (sent after reconnect) |
| New firmware boots and runs stable | Calls `watchdog_confirm()` | `success` |

If the device does not download within the token expiry (5 min), the server marks the deployment as `expired`.

#### Download endpoint

```
GET /api/v1/gateway/firmware/download/{token}
```

- **No JWT required** — the token itself is the authentication
- Server validates token exists + not expired + deployment status is `sent` or `downloading`
- On first access: marks deployment as `downloading`, records `download_started_at`
- Returns 410 Gone if token expired
- Streams the firmware binary as `application/octet-stream`

#### Deployment tracking

All deployments are stored in `dm3_devices.firmware_deployments` with per-device status, progress percentage, and timestamps for each phase (sent → download_started → install_started → completed).

Each status change also creates:
- A `device_event` record (type: `firmware_update`) in `dm3_devices.device_events`
- An audit log entry via `dm3.audit.device-gateway`

On `success`: the device's `firmware_version` in `dm3_devices.devices` is updated automatically.

---

## 9. Offline-First Architecture & Sync

> **Offline is the DEFAULT operating mode.** Devices always make access decisions locally using their synced user DB and access rules. Connectivity adds sync capabilities but is never required for access decisions.

### 8.1 Local Decision Engine (Always Active)

Every device operates a local decision engine:

1. **Local user DB** (SQLite) — synced from server via `cfg.person_sync`
2. **Local access rules** — synced from server via `cfg.access_rules` and `cfg.full`
3. **Local blacklist** — synced via `cfg.blacklist` (priority push)
4. **Local decision** — all credential matching and rule evaluation happens on-device in **< 50ms**
5. **Event logging** — access events queued locally, uploaded when connected

### 8.2 Sync Protocol

#### Sync Types

| Sync Type | Trigger | QoS | Content |
|-----------|---------|-----|---------|
| **Full sync** | Device provisioning, major rule change, admin request | 2 | Complete user DB + rules + blacklist |
| **Incremental sync** | Periodic (every 5 min when connected) | 2 | Delta updates via `sync_token` cursor |
| **Priority sync** | Blacklist update, emergency rule change | 2 | Immediate push, device must process before next access decision |
| **Event upload** | Continuous when connected, batch on reconnect | 1 | Access logs, door events, alarms → server for dashboards/audit |

#### Sync Flows

**Server → Device (rules & data):**
- `cfg.person_sync` — user credentials (face templates, card UIDs, etc.)
- `cfg.access_rules` — zone/schedule/group rules
- `cfg.blacklist` — real-time blacklist pushes
- `cfg.full` — full device configuration

**Device → Server (event logs):**
- `access.log` — what happened (decision already made locally)
- `door.state` — door open/closed/locked status
- `alarm.triggered` — alarm events
- `status.heartbeat` — device health + sync status

#### Sync Confirmation

Device acknowledges every sync with local DB version and counts:

```json
{
  "type": "cfg.person_sync.ack",
  "data": {
    "synced_count": 1000,
    "local_total": 4998,
    "local_db_version": 42,
    "sync_token": "next-cursor",
    "rules_version": 28,
    "blacklist_version": 15
  }
}
```

#### Conflict Resolution

**Server wins.** The server is the source of truth for rules and user data. If a device has stale data, the next sync overwrites it. Devices never modify user records — they only consume them.

### 8.3 Reconnection Flow

When connectivity restores after an outage:

```
1. CONNECT → CONNACK
2. Device publishes: status.heartbeat (with queue_depth > 0, local_db_version, rules_version)
3. Device publishes: queued access.log events (ordered by timestamp, throttled 100/sec)
4. Server publishes: cfg.person_sync (incremental, if user DB changed since device's sync_token)
5. Server publishes: cfg.access_rules (if rules_version changed)
6. Server publishes: cfg.blacklist (if blacklist_version changed)
7. Sync confirmed via ack messages
8. Device continues normal operation (which is identical to offline operation + sync)
```

### 8.4 Device Local Storage

```
Local SQLite Database on Device:
├── users          — synced user records with credentials
├── access_rules     — synced access rules and schedules
├── blacklist        — synced blacklist entries
├── event_queue      — pending events to upload (max 5000)
├── sync_state       — sync_token, db_version, last_sync_ts
└── config           — device configuration from cfg.full
```

---

## 10. Message Flow Diagrams

### 9.1 Normal Access Flow (Offline-First — Local Decision)

> **All access decisions are made on-device.** The server is only informed after the fact via event logs.

```
Terminal (Local)             EMQX                   access-svc              DB
   │                          │                         │                    │
   │── scan credential ──►    │                         │                    │
   │── match against ──►      │                         │                    │
   │   local user DB        │                         │                    │
   │── check local rules ──►  │                         │                    │
   │── DECISION (<50ms) ──►   │                         │                    │
   │── unlock/deny door ──►   │                         │                    │
   │── display result ──►     │                         │                    │
   │                          │                         │                    │
   │──── access.log ─────────►│────── NATS bridge ─────►│──── write log ────►│
   │     (QoS 1, async)      │                         │  (for dashboard/   │
   │                          │                         │   analytics only)  │
   │──── door.state ─────────►│────── NATS bridge ─────►│                    │
   │     (unlocked→locked)    │                         │                    │
   │                          │                         │                    │
   ◄── < 50ms local decision ►
```

### 9.2 Offline Access Flow (Same as Normal — Offline is Default)

> **Offline IS the normal mode.** When connectivity is available, it only adds event sync.

```
Terminal (Local)             EMQX (unavailable)     Local SQLite DB
   │                          ✗                         │
   │── scan credential ──►    │                         │
   │── match against ─────────────────────────────────►│
   │   local user DB        │                         │
   │◄────── user found ────────────────────────────-│
   │                          │                         │
   │── check local rules ──►  │                         │
   │── DECISION (<50ms) ──►   │                         │
   │── unlock/deny door ──►   │                         │
   │── display result ──►     │                         │
   │                          │                         │
   │── queue access.log ──────────────────────────────►│
   │   to local SQLite        │                    (queue_depth++)
   │   (syncs when online)    │                         │
```

### 9.3 Emergency Lockdown Flow

```
Guard Station              Server                 EMQX                  All Devices
     │                       │                      │                        │
     │── POST /lockdown ────►│                      │                        │
     │                       │── emergency.broadcast─►│── broadcast to ──────►│
     │                       │   (QoS 2, retain)    │   all subscribers     │
     │                       │                      │                        │
     │                       │                      │       ┌── lock all ──► │
     │                       │                      │       │   doors        │
     │                       │                      │       │── display ──► │
     │                       │                      │       │   warning     │
     │                       │                      │       │── sound ────► │
     │                       │                      │       │   alarm       │
     │◄── 200 OK ────────────│                      │                        │
     │   (lockdown active)   │                      │                        │
```

---

## 11. QoS & Reliability Matrix

| Message Type | QoS | Retain | Priority | Timeout | Retry |
|-------------|-----|--------|----------|---------|-------|
| `status.heartbeat` | 0 | No | Low | — | Next interval |
| `sensor.reading` | 0 | No | Low | — | Next interval |
| `access.log` | 1 | No | Normal | — | Auto (MQTT) |
| `door.state` | 1 | Yes | High | — | Auto (MQTT) |
| `alarm.triggered` | 1 | No | Critical | — | Auto (MQTT) |
| `cmd.*` | 2 | No | High | 10s | 3x |
| `cfg.full` | 2 | Yes | Normal | 60s | Until ack |
| `cfg.person_sync` | 2 | No | Normal | 300s | Until ack |
| `cfg.access_rules` | 2 | No | Normal | 60s | Until ack |
| `cfg.blacklist` | 2 | No | Critical | 5s | Until ack |
| `emergency.broadcast` | 2 | Yes | Critical | — | — |

---

## 12. Security Considerations

1. **TLS 1.3** mandatory for all MQTT connections
2. **JWT rotation**: Device tokens expire every 24h, auto-refreshed via `cfg` topic
3. **Topic ACL**: Strict per-device, per-tenant isolation (EMQX built-in ACL)
4. **Payload encryption**: Optional AES-256-GCM for sensitive fields (biometric templates)
5. **Rate limiting**: Max 100 msg/sec per device, 10,000 msg/sec per tenant
6. **Anti-replay**: Message ID (UUIDv7) + timestamp checked server-side (±5min window)
7. **Biometric data**: Face/fingerprint templates transmitted only during person_sync, never stored in MQTT logs
8. **Audit trail**: All commands logged with operator ID, timestamp, device response

---

## 13. Error Codes

| Code | Description |
|------|-------------|
| `E001` | Authentication failed (invalid/expired JWT) |
| `E002` | Unauthorized topic access |
| `E003` | Payload too large (>256KB) |
| `E004` | Invalid message format (schema validation) |
| `E005` | Command timeout (device didn't respond) |
| `E006` | Device busy (processing another command) |
| `E007` | Config version conflict |
| `E008` | User sync failed (storage full) |
| `E009` | Firmware download failed |
| `E010` | Peripheral error (camera/reader/lock) |

---

## 14. Bandwidth Estimation

| Scenario | Devices | Events/day | Bandwidth |
|----------|---------|-----------|-----------|
| Small office | 5 doors, 50 people | ~500 access + heartbeats | ~5 MB/day |
| Medium building | 50 doors, 500 people | ~5,000 access + sensors | ~50 MB/day |
| Large campus | 200 doors, 5,000 people | ~50,000 access + full telemetry | ~500 MB/day |

*Excludes photo attachments. With snapshots: multiply by 3-5x.*
