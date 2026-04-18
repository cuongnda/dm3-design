# Device Specification: Access Control Device Simulator

> Domain: SECURE / PLATFORM | Priority: P1
> Status: Implemented | Owner: Platform Team
> Device Type: Virtual (Testing Tool)

---

## 1. Overview & Purpose

The DM3 Device Simulator (`dm3-simulator`) is a testing and load-testing tool that simulates virtual access control devices in a single process. Each virtual device behaves identically to a real device — maintaining its own MQTT connection, local SQLite database, access decision engine, and event loop.

**Use cases:**
- Load testing the DM3 server (MQTT broker, sync orchestration, event ingestion)
- Development and integration testing without physical hardware
- CI/CD pipeline validation of MQTT protocol compliance
- Demonstrating offline-first access decisions with network disconnect/reconnect
- Web dashboard for real-time monitoring and control of simulated devices

---

## 2. Project Structure

```
simulator/
├── Dockerfile
├── docker-compose.yml
├── requirements.txt
├── pyproject.toml / setup.py
├── src/
│   └── dm3_simulator/
│       ├── __init__.py
│       ├── __main__.py
│       ├── cli.py              # Click CLI commands (run, seed)
│       ├── config.py           # YAML config loader
│       ├── device.py           # VirtualDevice class
│       ├── access_engine.py    # Offline access decision engine
│       ├── database.py         # SQLite schema and operations
│       ├── mqtt_client.py      # MQTT client with LWT, reconnect
│       ├── sync.py             # Sync protocol handler
│       ├── api.py              # aiohttp REST API
│       ├── event_generator.py  # Mock data generation (Vietnamese names)
│       ├── models.py           # Pydantic models and config
│       ├── metrics.py          # Prometheus metrics definitions
│       └── static/
│           └── index.html      # Web dashboard (single-page, Tailwind CSS)
└── tests/
    ├── __init__.py
    ├── test_access_engine.py   # 11 tests
    ├── test_database.py        # 11 tests
    └── test_device.py          # 3 tests
```

---

## 3. Architecture

### 3.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    dm3-simulator process                         │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Virtual Device Pool (asyncio)                │   │
│  │                                                           │   │
│  │  ┌──────────┐  ┌──────────┐       ┌──────────┐          │   │
│  │  │ Device 1 │  │ Device 2 │  ...  │Device N  │          │   │
│  │  │┌────────┐│  │┌────────┐│       │┌────────┐│          │   │
│  │  ││MQTT Clt││  ││MQTT Clt││       ││MQTT Clt││          │   │
│  │  │├────────┤│  │├────────┤│       │├────────┤│          │   │
│  │  ││SQLite  ││  ││SQLite  ││       ││SQLite  ││          │   │
│  │  │├────────┤│  │├────────┤│       │├────────┤│          │   │
│  │  ││Access  ││  ││Access  ││       ││Access  ││          │   │
│  │  ││Engine  ││  ││Engine  ││       ││Engine  ││          │   │
│  │  │└────────┘│  │└────────┘│       │└────────┘│          │   │
│  │  └──────────┘  └──────────┘       └──────────┘          │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │          REST API + Web Dashboard (port 9090)             │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Prometheus Metrics (/metrics)                │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
          │                                        │
          │ MQTT (1 connection per device)          │ HTTP
          ▼                                        ▼
   ┌──────────────┐                        ┌──────────────┐
   │  EMQX 5.8    │                        │   Browser    │
   │  (port 1884) │                        │  Dashboard   │
   └──────────────┘                        └──────────────┘
```

### 3.2 Component Details

| Component | Responsibility |
|-----------|---------------|
| **VirtualDevice** | Self-contained unit with own MQTT client, DB, access engine, event loop |
| **DeviceMqttClient** | `aiomqtt` async client per device, LWT, auto-reconnect with exponential backoff |
| **DeviceDatabase** | In-memory or file-backed SQLite per device (aiosqlite) |
| **AccessEngine** | Offline-first access decision algorithm — all decisions against local DB |
| **SyncHandler** | Processes cfg.full, person_sync, access_rules, blacklist messages |
| **SimulatorAPI** | aiohttp REST API + web dashboard serving |
| **EventGenerator** | Generates mock users (Vietnamese names) and access rules |
| **Metrics** | Prometheus counters/gauges/summaries via prometheus_client |

---

## 4. Software Requirements

| Requirement | Specification |
|-------------|---------------|
| **Language** | Python 3.12+ |
| **Async framework** | asyncio |
| **MQTT library** | aiomqtt (async wrapper for paho-mqtt) |
| **Database** | SQLite (aiosqlite — one per virtual device) |
| **REST API** | aiohttp |
| **Metrics** | prometheus_client |
| **Models** | Pydantic v2 |
| **CLI** | Click |
| **Logging** | structlog |
| **Packaging** | Docker image |
| **OS** | Linux (Docker), macOS (development) |

---

## 5. CLI Interface

The CLI is built with Click and has two commands: `run` and `seed`.

### 5.1 `run` — Start the Simulator

```bash
dm3-simulator run \
  --devices 10 \
  --broker "mqtt://localhost:1883" \
  --tenant-id "tenant-001" \
  --site-id "site-001" \
  --device-prefix "sim" \
  --mode normal \
  --event-rate 1.0 \
  --users 50 \
  --db-mode memory \
  --api-port 9090 \
  --log-level info \
  --heartbeat-interval 30 \
  --connect-delay 0.1 \
  --config dm3-simulator.yaml \
  --broker-username "user" \
  --broker-password "pass"
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `--devices` | int | 10 | Number of virtual devices to simulate |
| `--broker` | str | `mqtt://localhost:1883` | MQTT broker URL |
| `--tenant-id` | str | `tenant-001` | Tenant ID for MQTT topic hierarchy |
| `--site-id` | str | `site-001` | Site ID |
| `--device-prefix` | str | `sim` | Device ID prefix (not used in IDs — see Device ID Format) |
| `--mode` | choice | `normal` | `normal` \| `stress` \| `chaos` |
| `--event-rate` | float | 1.0 | Events per second per device |
| `--users` | int | 50 | Mock users per device |
| `--db-mode` | choice | `memory` | `memory` \| `file` |
| `--api-port` | int | 9090 | REST API + dashboard port |
| `--log-level` | choice | `info` | `debug` \| `info` \| `warning` \| `error` |
| `--heartbeat-interval` | int | 30 | Heartbeat interval in seconds |
| `--connect-delay` | float | 0.1 | Delay between device connections (stagger) |
| `--config` | path | — | Optional YAML config file |
| `--broker-username` | str | — | MQTT username |
| `--broker-password` | str | — | MQTT password |

### 5.2 `seed` — Pre-populate Device Databases

```bash
dm3-simulator seed --devices 10 --users 50 --output-dir /tmp/dm3-sim
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `--devices` | int | 10 | Number of device databases to seed |
| `--users` | int | 50 | Users per device |
| `--output-dir` | str | `/tmp/dm3-sim` | Output directory for SQLite files |

Creates `{device_id}.db` files with seeded users, credentials, access rules, and user groups.

### 5.3 Device ID Format

Device IDs are 6-digit zero-padded numeric strings: `000001` through `999999`.

Generated as: `f"{i + 1:06d}"` — so 10 devices = `000001`, `000002`, ..., `000010`.

Door IDs follow the pattern: `{device_id}-door-{n:03d}` (e.g., `000001-door-001`).

---

## 6. REST API (Control Plane)

All endpoints are served on the configured `--api-port` (default 9090).

### 6.1 Dashboard & Static Files

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Web dashboard (index.html) |
| `GET` | `/static/*` | Static file serving |

### 6.2 Status & Metrics

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/status` | Overall simulation status |
| `GET` | `/stats` | Detailed metrics for dashboard |
| `GET` | `/api/status` | Same as `/status` |
| `GET` | `/api/stats` | Same as `/stats` |
| `GET` | `/metrics` | Prometheus metrics (text/plain) |
| `GET` | `/api/metrics` | Same as `/metrics` |

#### `GET /status` Response

```json
{
  "status": "running",
  "uptime_s": 3600,
  "devices": { "total": 10, "connected": 8, "disconnected": 2 }
}
```

#### `GET /stats` Response

```json
{
  "uptime_s": 3600,
  "devices": {
    "total": 10, "connected": 8, "disconnected": 2,
    "network_off": 1, "stopped": 1, "error": 0
  },
  "events": {
    "total_published": 5000, "events_per_second": 1.4,
    "granted": 120, "denied": 30, "grant_rate_pct": 80.0,
    "recent_count": 150
  },
  "latency": { "avg_ms": 0.15, "min_ms": 0.05, "max_ms": 2.1, "p99_ms": 1.8 },
  "offline": { "devices_offline": 1, "queued_events": 42 },
  "throughput": {
    "avg_eps_per_device": 0.14, "max_eps_per_device": 0.2, "total_eps": 1.4
  }
}
```

### 6.3 Device Operations

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/devices` | List all virtual devices |
| `GET` | `/api/devices/{device_id}` | Single device detail |
| `POST` | `/api/devices/{device_id}/start` | Start a stopped device |
| `POST` | `/api/devices/{device_id}/stop` | Stop a running device |
| `POST` | `/api/devices/{device_id}/trigger` | Trigger access event on device |
| `POST` | `/api/devices/{device_id}/network/disconnect` | Simulate network disconnection |
| `POST` | `/api/devices/{device_id}/network/reconnect` | Restore network connection |
| `POST` | `/api/devices/{device_id}/auto-trigger` | Toggle auto event generation |

#### `GET /api/devices` Response

```json
{
  "devices": [
    {
      "device_id": "000001", "state": "ready", "door_state": "locked",
      "door_ids": ["000001-door-001"], "mqtt_connected": true,
      "events_published": 500, "uptime_s": 3600, "lockdown_active": false,
      "network_disabled": false, "auto_trigger": true, "running": true
    }
  ],
  "count": 10
}
```

#### `POST /api/devices/{device_id}/trigger` Request/Response

Optional JSON body:
```json
{ "credential_type": "card", "credential_value": "AABBCCDD", "door_id": "000001-door-001" }
```

Response: `AccessDecision` object
```json
{
  "granted": true, "reason": "authorized",
  "user_id": "uuid", "user_name": "Nguyễn Văn An",
  "rule_id": "rule-001", "decision_time_ms": 0.15,
  "confidence": null, "pending_multi_factor": false
}
```

#### `POST /api/devices/{device_id}/auto-trigger` Request

```json
{ "enabled": true }
```
Omit `enabled` to toggle. Response: `{"status": "ok", "device_id": "000001", "auto_trigger": true}`

### 6.4 Device Data Inspection

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/devices/{device_id}/users` | Users in device's local DB (paginated: `?limit=50&offset=0`) |
| `GET` | `/api/devices/{device_id}/credentials` | Credentials in device's local DB (limit 100) |
| `GET` | `/api/devices/{device_id}/rules` | Access rules in device's local DB |
| `GET` | `/api/devices/{device_id}/events-queue` | Pending events in offline queue (limit 50) |
| `GET` | `/api/devices/{device_id}/config` | Device config + sync state |

### 6.5 Event Feed

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/events/recent` | Last N events across all devices (`?limit=100`) |
| `POST` | `/trigger/event` | Trigger event via body with `device_id` field |

### 6.6 Simulation Control

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/simulation/status` | Simulation running status |
| `POST` | `/api/simulation/start` | Start simulation (creates devices from config) |
| `POST` | `/api/simulation/stop` | Stop all devices and clear |

#### `POST /api/simulation/start` Request

```json
{
  "broker": "mqtt://localhost:1883",
  "site_id": "site-001",
  "tenant_id": "tenant-001",
  "num_devices": 10,
  "mode": "normal",
  "event_rate": 1.0
}
```

---

## 7. Web Dashboard

Single-page HTML dashboard served at `http://localhost:9090/` with Tailwind CSS styling (dark theme).

### 7.1 Layout

Four-column layout:
1. **Left panel** — Configuration form + Metrics panel
2. **Center panel** (2 columns) — Device grid with checkboxes
3. **Right panel** — Live event feed

### 7.2 Configuration Panel

- MQTT Broker URL input
- Site ID input
- Device count slider (1–1000)
- Mode selector (Normal/Stress/Chaos)
- Event rate slider
- Start / Stop buttons

### 7.3 Device Grid

Each device row shows: checkbox, Device ID, State (with colored dot), Network status, Auto-trigger status, Doors, Events count, Queue depth, and a trigger button.

**Select All** checkbox at the top. Selected count displayed.

**Batch operation buttons:**
- ⚡ Trigger — trigger access event on all selected
- 🔄 Auto On — enable auto-trigger on selected
- ⏸ Auto Off — disable auto-trigger on selected
- 📡 Off — disconnect network on selected
- 📡 On — reconnect network on selected
- ⏹ Stop — stop selected devices
- ▶ Start — start selected devices

Clicking a device row opens the **Device Detail Modal**.

### 7.4 Device Detail Modal

Header with device ID and control buttons: Trigger, Auto On/Off, Network Disconnect/Reconnect, Start/Stop.

**5 tabs:**
1. **⚙️ Config** — Device configuration and sync state
2. **👥 Users** — User records in local DB (paginated table)
3. **🔑 Credentials** — Credential records (truncated values)
4. **📋 Rules** — Access rules with priority, doors, groups, schedules
5. **📤 Event Queue** — Pending offline events

### 7.5 Metrics Panel (5 sections)

1. **Throughput** — Total EPS, Per Device EPS, Total Events
2. **Access Decisions** — Granted count, Denied count, Grant Rate % with green/red bar
3. **Decision Latency** — Average, P99, Min/Max
4. **Offline & Sync** — Offline device count, Queued events count
5. **System** — Uptime, Broker URL

### 7.6 Live Event Feed

Real-time scrolling feed of access events with color-coded borders (green = granted, red = denied). Shows timestamp, device ID, user name, decision, and reason.

---

## 8. VirtualDevice

Each device (`device.py`) is a self-contained unit with:

### 8.1 Components

- **DeviceDatabase** — SQLite (in-memory or file-backed)
- **DeviceMqttClient** — MQTT connection with LWT and auto-reconnect
- **AccessEngine** — Offline decision engine
- **SyncHandler** — Processes sync messages

### 8.2 State Machine

```python
class DeviceState(str, Enum):
    INIT = "init"
    CONNECTING = "connecting"
    SYNCING = "syncing"
    READY = "ready"
    OFFLINE = "offline"
    ERROR = "error"

class DoorState(str, Enum):
    LOCKED = "locked"
    UNLOCKED = "unlocked"
    OPEN = "open"
    HELD_OPEN = "held_open"
    FORCED = "forced"
    TAMPERED = "tampered"
```

### 8.3 Background Tasks

Each device runs 4 async tasks:
1. **Listen task** — processes incoming MQTT messages
2. **Heartbeat loop** — publishes `status.heartbeat` every N seconds
3. **Event loop** — auto-generates access events at configured rate (when `auto_trigger=True`)
4. **Queue drain loop** — drains offline event queue when connected (every 5s, batch of 100)

### 8.4 Per-Device Controls

| Control | Method | Description |
|---------|--------|-------------|
| Start | `device.start()` | Connect MQTT, start background tasks |
| Stop | `device.stop()` | Cancel tasks, disconnect MQTT, close DB |
| Network disconnect | `device.disconnect_network()` | Drop MQTT, set `_network_disabled=True`, state → OFFLINE |
| Network reconnect | `device.reconnect_network()` | Reconnect MQTT, re-subscribe, state → READY |
| Auto-trigger on/off | `device.auto_trigger = True/False` | Toggle automatic event generation |
| Manual trigger | `device.trigger_access()` | Generate a single access event |

### 8.5 Offline Behavior

When network is disconnected:
1. Device continues running (state = OFFLINE, `_network_disabled = True`)
2. Event loop continues generating access events if `auto_trigger=True`
3. Access decisions are made against local SQLite DB (no change in behavior)
4. Events are queued in `event_queue` table instead of publishing to MQTT
5. On reconnect, queue drain loop picks up and publishes queued events in chronological order
6. Events are marked `sent` after successful publish

### 8.6 Event Loop Timing

- **Normal mode:** Gaussian-distributed delay around `1/event_rate` seconds (min 0.5s)
- **Stress mode:** Constant delay of `1/event_rate` seconds
- Direction alternates randomly between "entry" and "exit"

---

## 9. Access Decision Engine

The engine (`access_engine.py`) evaluates credentials against the local SQLite DB. All decisions are made locally.

### 9.1 Algorithm

```
1. Check lockdown → if active, deny with "lockdown_active"
2. Lookup credential (type + value) → join credentials + users tables
   → if not found, deny with "denied_unknown"
3. Check blacklist (with effective_from/until window)
   → if blacklisted, deny with "denied_blacklist"
4. Check user status → if not "active", deny with "denied_inactive"
5. Check user validity window (valid_from/valid_until)
   → if outside window, deny with "denied_expired"
6. Check failed attempt lockout (locked_until > now)
   → if locked out, deny with "denied_lockout"
7. Find matching access rules for door_id (sorted by priority DESC)
   → if no rules match door, deny with "denied_zone"
8. For each rule (priority order):
   a. Skip if disabled
   b. Skip if outside rule validity window
   c. Skip if door_id not in rule's door_ids
   d. Skip if user not in any of rule's user_group_ids
   e. Skip if schedule_json defined and current time outside schedule
   f. If anti_passback enabled and last_direction == current direction
      → deny with "denied_anti_passback"
   g. GRANTED — first matching rule wins, return "authorized"
9. No rule matched → deny with "denied_time"
```

### 9.2 Schedule Evaluation

```python
def evaluate_schedule(schedule_json, now_ms):
    tz = pytz.timezone(schedule_json["timezone"])  # e.g., "Asia/Ho_Chi_Minh"
    now_local = datetime.fromtimestamp(now_ms / 1000, tz=tz)
    weekday = now_local.isoweekday()  # 1=Mon, 7=Sun
    current_time = now_local.strftime("%H:%M")
    for period in schedule_json["periods"]:
        if weekday in period["days"]:
            if period["start"] <= current_time <= period["end"]:
                return True
    return False
```

### 9.3 Post-Decision Actions

- **Granted:** Reset failed attempts, update anti-passback state
- **Denied (with user_id):** Increment failed attempts (lockout after 5 failures for 5 minutes)
- **Always:** Build `access.log` event, publish via MQTT or queue if offline

### 9.4 Decision Reasons

| Reason | Description |
|--------|-------------|
| `authorized` | Access granted — rule matched |
| `lockdown_active` | Device in lockdown mode |
| `denied_unknown` | Credential not found in local DB |
| `denied_blacklist` | User is on the blacklist |
| `denied_inactive` | User status is not "active" |
| `denied_expired` | Outside user's validity window |
| `denied_lockout` | Too many failed attempts (5 failures → 5 min lockout) |
| `denied_zone` | No access rule covers this door |
| `denied_time` | No rule matched current time schedule |
| `denied_anti_passback` | Same direction as last access |

---

## 10. SQLite Schema

Each virtual device maintains its own SQLite database.

### 10.1 `users`

```sql
CREATE TABLE users (
    user_id   TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    status      TEXT DEFAULT 'active',    -- active | suspended | terminated
    valid_from  INTEGER,                  -- Unix ms
    valid_until INTEGER,                  -- Unix ms
    created_at  INTEGER DEFAULT (strftime('%s','now') * 1000),
    updated_at  INTEGER DEFAULT (strftime('%s','now') * 1000)
);
```

### 10.2 `credentials`

```sql
CREATE TABLE credentials (
    id          TEXT PRIMARY KEY,
    user_id   TEXT NOT NULL REFERENCES users(user_id),
    type        TEXT NOT NULL,             -- face | card | pin | qr | fingerprint | uhf
    value       TEXT NOT NULL,
    status      TEXT DEFAULT 'active',
    valid_from  INTEGER,
    valid_until INTEGER,
    UNIQUE(type, value)
);
CREATE INDEX idx_credentials_type_value ON credentials(type, value);
CREATE INDEX idx_credentials_person ON credentials(user_id);
```

### 10.3 `access_rules`

```sql
CREATE TABLE access_rules (
    rule_id          TEXT PRIMARY KEY,
    name             TEXT NOT NULL,
    door_ids         TEXT NOT NULL,          -- JSON array
    user_group_ids TEXT NOT NULL,          -- JSON array
    schedule_json    TEXT,                   -- JSON: {timezone, periods: [{days, start, end}]}
    anti_passback    INTEGER DEFAULT 0,
    multi_factor     INTEGER DEFAULT 0,
    priority         INTEGER DEFAULT 0,
    enabled          INTEGER DEFAULT 1,
    valid_from       INTEGER,
    valid_until      INTEGER
);
```

### 10.4 `user_groups`

```sql
CREATE TABLE user_groups (
    group_id    TEXT PRIMARY KEY,
    user_ids  TEXT NOT NULL              -- JSON array of user_id strings
);
CREATE INDEX idx_user_groups_lookup ON user_groups(group_id);
```

### 10.5 `blacklist`

```sql
CREATE TABLE blacklist (
    user_id       TEXT PRIMARY KEY,
    name            TEXT,
    reason          TEXT,
    effective_from  INTEGER,
    effective_until INTEGER,
    credentials     TEXT                   -- JSON array
);
```

### 10.6 `event_queue`

```sql
CREATE TABLE event_queue (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id    TEXT NOT NULL UNIQUE,
    timestamp_ms  INTEGER NOT NULL,
    topic         TEXT NOT NULL,
    payload_json  TEXT NOT NULL,
    retry_count   INTEGER DEFAULT 0,
    status        TEXT DEFAULT 'pending',  -- pending | sent | failed
    created_at    INTEGER DEFAULT (strftime('%s','now') * 1000)
);
CREATE INDEX idx_event_queue_status ON event_queue(status, timestamp_ms);
```

### 10.7 `sync_state`

```sql
CREATE TABLE sync_state (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at INTEGER DEFAULT (strftime('%s','now') * 1000)
);
-- Keys: person_db_version, rules_version, blacklist_version, sync_token, config_version
```

### 10.8 `config`

```sql
CREATE TABLE config (
    key        TEXT PRIMARY KEY,
    value_json TEXT NOT NULL
);
```

### 10.9 `anti_passback_state`

```sql
CREATE TABLE anti_passback_state (
    user_id      TEXT PRIMARY KEY,
    last_direction TEXT NOT NULL,           -- entry | exit
    last_door_id   TEXT NOT NULL,
    timestamp_ms   INTEGER NOT NULL
);
```

### 10.10 `failed_attempts`

```sql
CREATE TABLE failed_attempts (
    user_id    TEXT PRIMARY KEY,
    count        INTEGER DEFAULT 0,
    locked_until INTEGER DEFAULT 0          -- Unix ms, 0 = not locked
);
```

---

## 11. MQTT Topics

### 11.1 Subscriptions (Server → Device)

Each device subscribes to:

| Topic | QoS | Purpose |
|-------|-----|---------|
| `dm/{tenant_id}/device/{device_id}/cmd` | 2 | Commands: `cmd.door`, `cmd.lockdown` |
| `dm/{tenant_id}/device/{device_id}/cfg` | 2 | Config sync: `cfg.full`, `cfg.person_sync`, `cfg.access_rules`, `cfg.blacklist` |
| `dm/{tenant_id}/emergency/broadcast` | 2 | Emergency lockdown broadcasts |

### 11.2 Publications (Device → Server)

| Topic | QoS | Message Types |
|-------|-----|---------------|
| `dm/{tid}/device/{did}/evt` | 1 | `access.log` events |
| `dm/{tid}/device/{did}/sta` | 0 | `status.heartbeat` (periodic) |
| `dm/{tid}/device/{did}/cmd/resp` | 2 | `cmd.door.resp` |
| `dm/{tid}/device/{did}/cfg/ack` | 2 | `cfg.full.ack`, `cfg.person_sync.ack`, `cfg.access_rules.ack` |

### 11.3 LWT (Last Will & Testament)

Set on CONNECT:
- **Topic:** `dm/{tid}/device/{did}/sta`
- **Payload:** `{"v":1, "id":"...", "ts":0, "src":"device:{did}", "type":"status.offline", "data":{"reason":"unexpected_disconnect"}}`
- **QoS:** 1
- **Retain:** false

### 11.4 Message Envelope

All messages use the standard envelope:

```json
{
  "v": 1,
  "id": "<UUIDv7>",
  "ts": 1708300000000,
  "src": "device:000001",
  "type": "access.log",
  "data": { ... },
  "ref": "<optional reference to request id>",
  "status": "<optional: ok>"
}
```

### 11.5 MQTT Client Details

- Client ID: `dm3-{device_id}`
- Keepalive: 60 seconds
- Auto-reconnect: exponential backoff (1s → 2s → 4s → ... → 60s max), up to 10 retries
- TLS: supported via `mqtts://` URL scheme

---

## 12. Sync Protocol

### 12.1 Handled Message Types

| Message Type | Handler | Action |
|-------------|---------|--------|
| `cfg.full` | `SyncHandler.handle_config()` | Store all config sections, update config_version |
| `cfg.person_sync` | `SyncHandler.handle_person_sync()` | Upsert/delete users + credentials, increment person_db_version |
| `cfg.access_rules` | `SyncHandler.handle_access_rules()` | Upsert rules, update rules_version |
| `cfg.blacklist` | `SyncHandler.handle_blacklist()` | Add/remove blacklist entries, update blacklist_version |
| `cmd.lockdown` | `VirtualDevice._on_message()` | Activate/deactivate lockdown mode |
| `cmd.door` | `VirtualDevice._handle_door_command()` | Unlock/lock/hold_open door, publish response |

### 12.2 Acknowledgments

Config messages (`cfg.full`, `cfg.person_sync`, `cfg.access_rules`) are acknowledged via `cfg/ack` topic with sync state (version numbers, counts).

---

## 13. Mock Data Generation

### 13.1 Vietnamese Names

Names are generated from pools of Vietnamese last names (16), middle names (14), and first names (33):
- Format: `{Last} {Middle} {First}` (e.g., "Nguyễn Văn An", "Trần Thị Hạnh")

### 13.2 Users (default: 50 per device)

Each user gets:
- UUID user_id
- Vietnamese name
- Active status
- 2–3 credentials:
  - **Card** — 8-char hex UID (always)
  - **Face** — 32-char SHA256 hash (always)
  - **PIN** — 4 or 6 digit (60% chance)

### 13.3 Access Rules (default: 5 per device)

- Users split into 5 groups
- Each rule maps one group to door(s) with a schedule
- Schedules use `Asia/Ho_Chi_Minh` timezone
- Pre-defined schedules: weekday office hours, 24/7, morning shift, weekend, evening
- Rule 4 has anti-passback enabled
- Priorities: 50, 40, 30, 20, 10

---

## 14. Prometheus Metrics

Available at `GET /metrics` (or `/api/metrics`).

```
# Device metrics
dm3_sim_devices_total{state="connected|disconnected|error"}
dm3_sim_devices_online_ratio

# Event metrics
dm3_sim_events_total{type, decision}
dm3_sim_events_per_second
dm3_sim_event_publish_latency_ms

# Sync metrics
dm3_sim_sync_person_count{device_id}
dm3_sim_sync_latency_ms{sync_type}
dm3_sim_sync_failures_total

# Queue metrics
dm3_sim_queue_depth{device_id}
dm3_sim_queue_depth_total

# Decision metrics
dm3_sim_decision_time_ms
dm3_sim_decisions_total{result="granted|denied"}
```

---

## 15. Pydantic Models

### 15.1 SimulationConfig

```python
class SimulationConfig(BaseModel):
    devices: int = 10
    tenant_id: str = "tenant-001"
    site_id: str = "site-001"
    broker: str = "mqtt://localhost:1883"
    broker_username: str | None = None
    broker_password: str | None = None
    device_prefix: str = "sim"
    device_type: str = "terminal"
    doors_per_device: int = 1
    mode: str = "normal"              # normal | stress | chaos
    event_rate: float = 1.0
    event_mix: dict[str, int]         # default: grant:70, deny:20, alarm:5, tamper:3, door_held:2
    users: int = 50
    db_mode: str = "memory"
    api_port: int = 9090
    metrics_port: int = 9091
    heartbeat_interval: int = 30
    connect_delay: float = 0.1
    log_level: str = "info"
```

### 15.2 Other Models

- **AccessDecision** — `granted`, `reason`, `user_id`, `user_name`, `rule_id`, `decision_time_ms`, `confidence`, `pending_multi_factor`
- **PersonRecord** — `user_id`, `name`, `status`, `valid_from`, `valid_until`
- **CredentialRecord** — `id`, `user_id`, `type`, `value`, `status`, `valid_from`, `valid_until`
- **AccessRule** — `rule_id`, `name`, `door_ids`, `user_group_ids`, `schedule_json`, `anti_passback`, `multi_factor`, `priority`, `enabled`, `valid_from`, `valid_until`
- **MqttMessage** — Standard MQTT message envelope (`v`, `id`, `ts`, `src`, `type`, `data`, `ref`, `status`)

---

## 16. Docker Setup

### 16.1 Dockerfile

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN pip install --no-cache-dir -e .
ENTRYPOINT ["dm3-simulator"]
```

### 16.2 Docker Compose

EMQX 5.8 broker + simulator:

```yaml
version: "3.8"
services:
  emqx:
    image: emqx/emqx:5.8
    container_name: dm3-emqx
    ports:
      - "1884:1883"      # MQTT (1884 external to avoid conflicts)
      - "8083:8083"      # WebSocket
      - "8084:8084"      # WSS
      - "18083:18083"    # EMQX Dashboard
    environment:
      - EMQX_ALLOW_ANONYMOUS=true
    healthcheck:
      test: ["CMD", "emqx", "ctl", "status"]
      interval: 10s
      timeout: 5s
      retries: 5

  simulator:
    build: .
    container_name: dm3-simulator
    ports:
      - "9090:9090"
    depends_on:
      emqx:
        condition: service_healthy
    command: run --devices 10 --broker mqtt://emqx:1883 --site-id site-001
    restart: unless-stopped
```

### 16.3 Running

```bash
# Start everything
docker compose up -d

# Access dashboard
open http://localhost:9090

# Access EMQX dashboard
open http://localhost:18083  # admin/public

# MQTT on external port 1884
mosquitto_sub -h localhost -p 1884 -t "dm/#" -v
```

---

## 17. Simulation Modes

### 17.1 Normal Mode

Realistic simulation with human-like timing:
- Events generated with Gaussian-distributed delay around `1/event_rate` (std dev = 30% of mean, minimum 0.5s)
- Heartbeat every 30 seconds
- Proper MQTT reconnect behavior

### 17.2 Stress Mode

Maximum throughput:
- Constant delay of `1/event_rate` seconds (no jitter)
- All devices publish at maximum configured rate

### 17.3 Chaos Mode

Listed in CLI choices but chaos-specific fault injection (random disconnects, latency injection, clock drift) is not yet implemented. Devices run in normal mode when chaos is selected.

---

## 18. Tests

25 tests across 3 test files:

| File | Tests | Coverage |
|------|-------|----------|
| `test_access_engine.py` | 11 | Decision engine: granted, denied (unknown, blacklist, inactive, expired, lockout, zone, time, anti-passback), lockdown, schedule evaluation |
| `test_database.py` | 11 | SQLite operations: users CRUD, credentials, access rules, blacklist, event queue, sync state, failed attempts, user groups |
| `test_device.py` | 3 | VirtualDevice: model creation, state machine, door states |

Run tests:
```bash
cd simulator
python -m pytest tests/ -v
```

---

## 19. Security Considerations

| Concern | Mitigation |
|---------|-----------|
| MQTT credentials in CLI args | Support environment variables and config file |
| Broker overload | Connection stagger via `--connect-delay` |
| SQLite data | In-memory by default |
| REST API access | Binds to `0.0.0.0` — restrict via Docker networking |
| TLS | Supported via `mqtts://` URL scheme |

---

## 20. Integration Points

- **Depends on:** EMQX broker (or any MQTT 5 broker)
- **Consumed by:** CI/CD pipelines, QA team, performance testing, demos
- **Protocol:** Compatible with DM3 MQTT protocol (see `mqtt-protocol.md`)
