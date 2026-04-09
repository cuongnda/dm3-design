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

## 2. Topic Hierarchy

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

## 3. Message Envelope

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

## 4. Device Events (`evt`)

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
    "reason": "authorized|denied_expired|denied_zone|denied_time|denied_unknown|denied_blacklist",
    "credential_type": "face_template|card_uid|qr_code|fp_template|pin",
    "person_detected": true,
    "temperature": 36.5,       // Optional: thermal reading (°C)
    "mask_detected": true,     // Optional: mask detection
    "photo": "base64_jpeg",    // Optional: snapshot (max 100KB, compressed)
    "local_db_version": 42,    // Current user DB version on device
    "local_person_count": 4998 // Number of users in local DB
  }
}
```

**Note:** The old `access.scan` (device asks server) and `access.decision` (server responds) messages have been **removed**. Devices make all access decisions locally using their synced user DB and access rules. This event is purely for server-side logging, analytics, and dashboards.

### 4.2 Door State Event

```json
{
  "type": "door.state",
  "data": {
    "door_id": "door-001",
    "state": "open|closed|locked|unlocked|forced|held_open|tampered",
    "source": "button|schedule|command|sensor|manual",
    "duration_ms": 0            // How long in current state (for held_open alerts)
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

## 5. Device Status (`sta`)

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

## 6. Commands (`cmd`)

**Topic:** `dm/{tid}/device/{did}/cmd`
**QoS:** 2
**Direction:** Server → Device
**Timeout:** 10 seconds (device must respond within)

### 6.1 Door Control

```json
{
  "type": "cmd.door",
  "data": {
    "action": "unlock|lock|hold_open|release",
    "door_id": "door-001",
    "duration_ms": 5000,         // For unlock/hold_open
    "reason": "remote_command",
    "operator_id": "user-uuid"   // Who issued the command
  }
}
```

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

## 7. Configuration (`cfg`)

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

### 7.3 User Database Sync

For offline/hybrid mode — push user credentials to device local storage.

```json
{
  "type": "cfg.person_sync",
  "data": {
    "action": "upsert|delete|full_sync",
    "users": [
      {
        "user_id": "user-uuid",
        "name": "Nguyễn Văn A",
        "credentials": [
          {"type": "card", "uid": "AABBCCDD"},
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

### 7.4 Blacklist Push (Priority Sync)

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

### 7.5 Access Rules Sync

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

### 7.6 Firmware Update

```json
{
  "type": "cfg.firmware",
  "data": {
    "version": "3.3.0",
    "url": "https://ota.duallmaster.com/firmware/term/3.3.0.bin",
    "checksum": "sha256:def456...",
    "size_bytes": 52428800,
    "release_notes": "Bug fixes, improved face recognition",
    "force": false,              // true = update immediately
    "schedule": "02:00"          // Preferred update time (device local)
  }
}
```

---

## 8. Offline-First Architecture & Sync

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

## 9. Message Flow Diagrams

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

## 10. QoS & Reliability Matrix

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

## 11. Security Considerations

1. **TLS 1.3** mandatory for all MQTT connections
2. **JWT rotation**: Device tokens expire every 24h, auto-refreshed via `cfg` topic
3. **Topic ACL**: Strict per-device, per-tenant isolation (EMQX built-in ACL)
4. **Payload encryption**: Optional AES-256-GCM for sensitive fields (biometric templates)
5. **Rate limiting**: Max 100 msg/sec per device, 10,000 msg/sec per tenant
6. **Anti-replay**: Message ID (UUIDv7) + timestamp checked server-side (±5min window)
7. **Biometric data**: Face/fingerprint templates transmitted only during person_sync, never stored in MQTT logs
8. **Audit trail**: All commands logged with operator ID, timestamp, device response

---

## 12. Error Codes

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

## 13. Bandwidth Estimation

| Scenario | Devices | Events/day | Bandwidth |
|----------|---------|-----------|-----------|
| Small office | 5 doors, 50 people | ~500 access + heartbeats | ~5 MB/day |
| Medium building | 50 doors, 500 people | ~5,000 access + sensors | ~50 MB/day |
| Large campus | 200 doors, 5,000 people | ~50,000 access + full telemetry | ~500 MB/day |

*Excludes photo attachments. With snapshots: multiply by 3-5x.*
