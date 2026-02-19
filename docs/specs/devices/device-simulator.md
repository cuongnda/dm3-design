# Device Specification: Access Control Device Simulator

> Domain: SECURE / PLATFORM | Priority: P1
> Status: Draft | Owner: Platform Team
> Device Type: Virtual (Testing Tool)

---

## 1. Overview & Purpose

The DM3 Device Simulator (`dm3-simulator`) is a testing and load-testing tool that simulates up to 10,000 virtual access control devices in a single process. Each virtual device behaves identically to a real device — maintaining its own MQTT connection, local SQLite database, state machine, and offline-first access decision engine.

**Use cases:**
- Load testing the DM3 server (MQTT broker, sync orchestration, event ingestion)
- Development and integration testing without physical hardware
- CI/CD pipeline validation of MQTT protocol compliance
- Stress testing person DB sync at scale (10K devices × 10K persons)
- Chaos engineering (random disconnects, delayed responses, network partitions)

---

## 2. Architecture

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    dm3-simulator process                         │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                  Simulation Controller                     │   │
│  │  CLI args → Config → Device Factory → Event Scheduler     │   │
│  └─────────────────────────┬────────────────────────────────┘   │
│                            │                                     │
│  ┌─────────────────────────┼────────────────────────────────┐   │
│  │              Virtual Device Pool (asyncio)                │   │
│  │                                                           │   │
│  │  ┌──────────┐  ┌──────────┐       ┌──────────┐          │   │
│  │  │ Device 1 │  │ Device 2 │  ...  │Device N  │          │   │
│  │  │┌────────┐│  │┌────────┐│       │┌────────┐│          │   │
│  │  ││MQTT Clt││  ││MQTT Clt││       ││MQTT Clt││          │   │
│  │  │├────────┤│  │├────────┤│       │├────────┤│          │   │
│  │  ││SQLite  ││  ││SQLite  ││       ││SQLite  ││          │   │
│  │  │├────────┤│  │├────────┤│       │├────────┤│          │   │
│  │  ││Decision││  ││Decision││       ││Decision││          │   │
│  │  ││Engine  ││  ││Engine  ││       ││Engine  ││          │   │
│  │  │├────────┤│  │├────────┤│       │├────────┤│          │   │
│  │  ││State   ││  ││State   ││       ││State   ││          │   │
│  │  ││Machine ││  ││Machine ││       ││Machine ││          │   │
│  │  │└────────┘│  │└────────┘│       │└────────┘│          │   │
│  │  └──────────┘  └──────────┘       └──────────┘          │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              REST API (Control Plane — port 9090)         │   │
│  │  /status  /devices  /trigger  /metrics  /start  /stop    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Metrics Collector (Prometheus /metrics)       │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
          │                                        │
          │ MQTT (1 connection per device)          │ HTTP
          ▼                                        ▼
   ┌──────────────┐                        ┌──────────────┐
   │  EMQX Broker │                        │  Prometheus  │
   └──────────────┘                        │  / Grafana   │
                                           └──────────────┘
```

### 2.2 Component Details

| Component | Responsibility |
|-----------|---------------|
| **Simulation Controller** | Parses CLI config, spawns virtual devices, manages lifecycle |
| **Virtual Device** | Self-contained unit with own MQTT client, DB, state machine, decision engine |
| **MQTT Client** | `aiomqtt` async client per device, persistent session, auto-reconnect |
| **Local SQLite DB** | In-memory or file-backed SQLite per device (configurable) |
| **Decision Engine** | Offline-first access decision algorithm — identical logic to real devices |
| **State Machine** | Door state (locked/unlocked/open/held_open/forced/tampered) |
| **Event Scheduler** | Generates simulated access events at configurable rates |
| **REST API** | Control plane for starting/stopping devices, triggering events, viewing stats |
| **Metrics Collector** | Prometheus-compatible metrics endpoint |

---

## 3. Software Requirements

| Requirement | Specification |
|-------------|---------------|
| **Language** | Python 3.11+ |
| **Async framework** | asyncio |
| **MQTT library** | aiomqtt (async wrapper for paho-mqtt) |
| **Database** | SQLite (aiosqlite — one per virtual device) |
| **REST API** | aiohttp or FastAPI (uvicorn) |
| **Metrics** | prometheus_client |
| **Packaging** | Docker image + PyPI package |
| **OS** | Linux (production), macOS (development) |
| **Memory** | ~10 MB per virtual device (10K devices ≈ 100 GB) |
| **CPU** | 1 core per ~500 devices at normal mode |

### Scaling Guidelines

| Device Count | RAM | CPU Cores | SQLite Mode | Notes |
|-------------|-----|-----------|-------------|-------|
| 1–100 | 1 GB | 1 | File-backed | Dev/test |
| 100–1,000 | 10 GB | 4 | In-memory | Integration test |
| 1,000–5,000 | 50 GB | 8 | In-memory | Load test |
| 5,000–10,000 | 100 GB | 16 | In-memory, shared person data | Stress test |

---

## 4. CLI Interface

```bash
# Basic usage
dm3-simulator \
  --devices 100 \
  --tenant-id "tenant-uuid" \
  --broker "mqtt://broker:1883" \
  --device-prefix "sim-term" \
  --device-type "terminal"

# Full options
dm3-simulator \
  --devices 1000 \
  --tenant-id "tenant-uuid" \
  --broker "mqtts://broker:8883" \
  --broker-username "sim-user" \
  --broker-password "token" \
  --tls-ca "/certs/ca.pem" \
  --device-prefix "sim-ctrl" \
  --device-type "controller" \
  --site-id "site-uuid" \
  --doors-per-device 2 \
  --mode normal \
  --event-rate 10 \
  --event-mix "grant:70,deny:20,alarm:5,tamper:5" \
  --persons 5000 \
  --db-mode "memory" \
  --api-port 9090 \
  --metrics-port 9091 \
  --log-level info
```

### CLI Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `--devices` | int | 10 | Number of virtual devices to simulate |
| `--tenant-id` | uuid | required | Tenant ID for MQTT topic hierarchy |
| `--broker` | url | required | MQTT broker URL (mqtt:// or mqtts://) |
| `--broker-username` | str | — | MQTT username |
| `--broker-password` | str | — | MQTT password / JWT token |
| `--tls-ca` | path | — | CA certificate for TLS |
| `--device-prefix` | str | "sim" | Prefix for device IDs (e.g., sim-001, sim-002) |
| `--device-type` | enum | "terminal" | terminal \| controller \| sensor |
| `--site-id` | uuid | auto | Site ID for access rules |
| `--doors-per-device` | int | 1 | Doors per controller device (1–4) |
| `--mode` | enum | "normal" | normal \| stress \| chaos |
| `--event-rate` | float | 1.0 | Events per second per device |
| `--event-mix` | str | "grant:80,deny:15,alarm:3,tamper:2" | Event type distribution |
| `--persons` | int | 1000 | Number of mock persons to pre-load |
| `--db-mode` | enum | "memory" | memory \| file |
| `--api-port` | int | 9090 | REST API control plane port |
| `--metrics-port` | int | 9091 | Prometheus metrics port |
| `--log-level` | enum | "info" | debug \| info \| warning \| error |
| `--heartbeat-interval` | int | 30 | Heartbeat interval in seconds |
| `--connect-delay` | float | 0.1 | Delay between device connections (stagger) |

---

## 5. Simulated Capabilities

Each virtual device simulates the following hardware capabilities:

| Capability | Simulation Method |
|------------|-------------------|
| **Face recognition** | Mock match: random person from local DB with configurable confidence (0.75–0.99) |
| **Card read** | Mock UID: select random card_uid from local person DB |
| **PIN input** | Mock PIN: select random pin from local person DB |
| **QR code** | Mock QR: generate UUID-based credential |
| **Door relay** | State machine transition: locked → unlocked (timed) → locked |
| **Door sensor** | Simulated open/close events with configurable timing |
| **Tamper switch** | Random tamper events at configured rate |
| **Temperature** | Random device temperature 35–55°C |
| **Network** | Simulated latency, disconnects (chaos mode) |

---

## 6. Local Database Schema

Each virtual device maintains its own SQLite database (in-memory or file-backed).

### 6.1 `persons` Table

```sql
CREATE TABLE persons (
    person_id       TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    status          TEXT DEFAULT 'active',   -- active | suspended | terminated
    valid_from      INTEGER,                 -- Unix ms
    valid_until     INTEGER,                 -- Unix ms
    created_at      INTEGER DEFAULT (strftime('%s','now') * 1000),
    updated_at      INTEGER DEFAULT (strftime('%s','now') * 1000)
);
```

### 6.2 `credentials` Table

```sql
CREATE TABLE credentials (
    id              TEXT PRIMARY KEY,
    person_id       TEXT NOT NULL REFERENCES persons(person_id),
    type            TEXT NOT NULL,            -- face | card | pin | qr | fingerprint
    value           TEXT NOT NULL,            -- face_template_hash | card_uid | pin_hash | qr_data
    status          TEXT DEFAULT 'active',
    valid_from      INTEGER,
    valid_until     INTEGER,
    UNIQUE(type, value)
);

CREATE INDEX idx_credentials_type_value ON credentials(type, value);
CREATE INDEX idx_credentials_person ON credentials(person_id);
```

### 6.3 `access_rules` Table

```sql
CREATE TABLE access_rules (
    rule_id         TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    door_ids        TEXT NOT NULL,            -- JSON array of door_id strings
    person_group_ids TEXT NOT NULL,           -- JSON array of group_id strings
    schedule_json   TEXT,                     -- JSON: {timezone, periods: [{days, start, end}]}
    anti_passback   INTEGER DEFAULT 0,
    multi_factor    INTEGER DEFAULT 0,
    priority        INTEGER DEFAULT 0,
    enabled         INTEGER DEFAULT 1,
    valid_from      INTEGER,
    valid_until     INTEGER
);
```

### 6.4 `person_groups` Table

```sql
CREATE TABLE person_groups (
    group_id        TEXT PRIMARY KEY,
    person_ids      TEXT NOT NULL             -- JSON array of person_id strings
);

CREATE INDEX idx_person_groups_lookup ON person_groups(group_id);
```

### 6.5 `blacklist` Table

```sql
CREATE TABLE blacklist (
    person_id       TEXT PRIMARY KEY,
    name            TEXT,
    reason          TEXT,
    effective_from  INTEGER,
    effective_until INTEGER,
    credentials     TEXT                      -- JSON array of credential objects
);
```

### 6.6 `event_queue` Table

```sql
CREATE TABLE event_queue (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id      TEXT NOT NULL UNIQUE,     -- UUIDv7
    timestamp_ms    INTEGER NOT NULL,
    topic           TEXT NOT NULL,
    payload_json    TEXT NOT NULL,
    retry_count     INTEGER DEFAULT 0,
    status          TEXT DEFAULT 'pending',   -- pending | sent | failed
    created_at      INTEGER DEFAULT (strftime('%s','now') * 1000)
);

CREATE INDEX idx_event_queue_status ON event_queue(status, timestamp_ms);
```

### 6.7 `sync_state` Table

```sql
CREATE TABLE sync_state (
    key             TEXT PRIMARY KEY,
    value           TEXT NOT NULL,
    updated_at      INTEGER DEFAULT (strftime('%s','now') * 1000)
);

-- Keys: person_db_version, rules_version, blacklist_version,
--        sync_token, config_version, last_sync_ts
```

### 6.8 `config` Table

```sql
CREATE TABLE config (
    key             TEXT PRIMARY KEY,
    value_json      TEXT NOT NULL
);

-- Stores the full cfg.full payload as key-value pairs
```

### 6.9 `anti_passback_state` Table

```sql
CREATE TABLE anti_passback_state (
    person_id       TEXT PRIMARY KEY,
    last_direction  TEXT NOT NULL,            -- entry | exit
    last_door_id    TEXT NOT NULL,
    timestamp_ms    INTEGER NOT NULL
);
```

---

## 7. MQTT Topics Consumed & Published

Reference: `mqtt-protocol.md`

### 7.1 Subscriptions (Server → Device)

Each virtual device subscribes to:

| Topic | QoS | Message Types | Handler |
|-------|-----|---------------|---------|
| `dm/{tid}/device/{did}/cmd` | 2 | `cmd.door`, `cmd.reboot`, `cmd.display`, `cmd.snapshot` | Command executor |
| `dm/{tid}/device/{did}/cfg` | 2 | `cfg.full`, `cfg.patch`, `cfg.person_sync`, `cfg.access_rules`, `cfg.blacklist`, `cfg.firmware` | Sync handler |
| `dm/{tid}/emergency/broadcast` | 2 | `cmd.lockdown` | Emergency handler |

### 7.2 Publications (Device → Server)

| Topic | QoS | Message Types | Trigger |
|-------|-----|---------------|---------|
| `dm/{tid}/device/{did}/evt` | 1 | `access.log`, `door.state`, `alarm.triggered`, `visitor.checkin`, `sensor.reading` | Event scheduler / access decision |
| `dm/{tid}/device/{did}/sta` | 0 | `status.heartbeat` | Every 30s (configurable) |
| `dm/{tid}/device/{did}/cmd/resp` | 2 | `cmd.door.resp`, `cmd.snapshot.resp` | After command execution |
| `dm/{tid}/device/{did}/cfg/ack` | 2 | `cfg.person_sync.ack`, `cfg.access_rules.ack` | After sync processing |

### 7.3 LWT (Last Will & Testament)

Set on CONNECT:
- **Topic:** `dm/{tid}/device/{did}/sta`
- **Payload:** `{"v":1, "type":"status.offline", "data":{"reason":"unexpected_disconnect"}}`
- **QoS:** 1
- **Retain:** false

---

## 8. Access Decision Algorithm

The simulator implements the same access decision engine as real devices. All decisions are made locally in < 50ms.

### 8.1 Pseudocode

```python
async def make_access_decision(device, credential_type, credential_value, door_id):
    """
    Core access decision engine — runs entirely on local data.
    Target: < 50ms decision time.
    """
    start_time = monotonic_ns()
    now_ms = current_time_ms()

    # Step 1: Check emergency/lockdown state
    if device.lockdown_active:
        if device.config.emergency_unlock and door_id in device.emergency_unlock_doors:
            return Decision(granted=True, reason="emergency_unlock")
        return Decision(granted=False, reason="lockdown_active")

    # Step 2: Look up credential in local DB
    person = await device.db.lookup_credential(credential_type, credential_value)

    if person is None:
        decision_time = (monotonic_ns() - start_time) / 1_000_000
        return Decision(
            granted=False,
            reason="denied_unknown",
            person_id=None,
            decision_time_ms=decision_time
        )

    # Step 3: Check blacklist (HIGHEST PRIORITY)
    if await device.db.is_blacklisted(person.person_id):
        return Decision(
            granted=False,
            reason="denied_blacklist",
            person_id=person.person_id,
            person_name=person.name
        )

    # Step 4: Check person active status
    if person.status != 'active':
        return Decision(granted=False, reason="denied_inactive", person_id=person.person_id)

    # Step 5: Check credential validity window
    if person.valid_from and now_ms < person.valid_from:
        return Decision(granted=False, reason="denied_expired", person_id=person.person_id)
    if person.valid_until and now_ms > person.valid_until:
        return Decision(granted=False, reason="denied_expired", person_id=person.person_id)

    # Step 6: Check failed attempt lockout
    if await device.db.is_locked_out(person.person_id):
        return Decision(granted=False, reason="denied_lockout", person_id=person.person_id)

    # Step 7: Find applicable access rules (sorted by priority DESC)
    rules = await device.db.get_matching_rules(door_id, person.person_id)

    if not rules:
        return Decision(granted=False, reason="denied_zone", person_id=person.person_id)

    # Step 8: Evaluate rules in priority order
    for rule in rules:
        if not rule.enabled:
            continue

        # Check rule validity window
        if rule.valid_from and now_ms < rule.valid_from:
            continue
        if rule.valid_until and now_ms > rule.valid_until:
            continue

        # Check if door is in rule's door_ids
        if door_id not in rule.door_ids:
            continue

        # Check if person is in any of the rule's person groups
        if not await device.db.person_in_groups(person.person_id, rule.person_group_ids):
            continue

        # Check time schedule
        if rule.schedule_json:
            if not evaluate_schedule(rule.schedule_json, now_ms):
                continue  # Outside schedule — try next rule

        # Check anti-passback
        if rule.anti_passback:
            last_direction = await device.db.get_last_direction(person.person_id)
            if last_direction == device.current_direction:  # Same direction = violation
                return Decision(
                    granted=False,
                    reason="denied_anti_passback",
                    person_id=person.person_id
                )

        # Check multi-factor requirement
        if rule.multi_factor:
            if not await device.check_multi_factor_window(person.person_id, credential_type):
                # First factor received — wait for second within 30s window
                await device.db.store_pending_factor(person.person_id, credential_type)
                return Decision(pending_multi_factor=True)

        # Check interlock (mantrap)
        if device.interlock_group:
            if not await device.check_interlock(door_id):
                return Decision(granted=False, reason="denied_interlock", person_id=person.person_id)

        # ✅ GRANTED — first matching rule wins
        decision_time = (monotonic_ns() - start_time) / 1_000_000
        return Decision(
            granted=True,
            reason="authorized",
            person_id=person.person_id,
            person_name=person.name,
            rule_id=rule.rule_id,
            decision_time_ms=decision_time
        )

    # No rule matched
    return Decision(granted=False, reason="denied_time", person_id=person.person_id)


def evaluate_schedule(schedule_json, now_ms):
    """Check if current time falls within any schedule period."""
    tz = pytz.timezone(schedule_json['timezone'])
    now_local = datetime.fromtimestamp(now_ms / 1000, tz=tz)
    weekday = now_local.isoweekday()  # 1=Mon, 7=Sun
    current_time = now_local.strftime('%H:%M')

    for period in schedule_json['periods']:
        if weekday in period['days']:
            if period['start'] <= current_time <= period['end']:
                return True
    return False
```

### 8.2 Post-Decision Actions

```python
async def post_decision(device, decision, credential_type, door_id):
    """Actions after access decision is made."""

    # 1. Trigger door relay (if granted)
    if decision.granted:
        await device.state_machine.unlock_door(door_id, duration_ms=device.config.unlock_duration_ms)
        await device.db.update_anti_passback(decision.person_id, device.current_direction, door_id)
        await device.db.reset_failed_attempts(decision.person_id)
    else:
        await device.db.increment_failed_attempts(decision.person_id)

    # 2. Create access.log event
    event = {
        "v": 1,
        "id": generate_uuidv7(),
        "ts": current_time_ms(),
        "src": f"device:{device.device_id}",
        "type": "access.log",
        "data": {
            "method": credential_type,
            "door_id": door_id,
            "direction": device.current_direction,
            "decision": "granted" if decision.granted else "denied",
            "decided_locally": True,
            "decision_time_ms": decision.decision_time_ms,
            "person_id": decision.person_id,
            "person_name": decision.person_name,
            "confidence": decision.confidence,
            "reason": decision.reason,
            "credential_type": credential_type,
            "local_db_version": await device.db.get_sync_state("person_db_version"),
            "local_person_count": await device.db.get_person_count()
        }
    }

    # 3. Publish or queue
    if device.mqtt_connected:
        await device.mqtt.publish(
            f"dm/{device.tenant_id}/device/{device.device_id}/evt",
            json.dumps(event),
            qos=1
        )
    else:
        await device.db.queue_event(event)
```

---

## 9. Sync Protocol

### 9.1 Initial Sync (Device Boot)

```
Virtual Device                     EMQX                      DM3 Server
     │                              │                              │
     │── CONNECT (JWT auth) ──────►│                              │
     │◄── CONNACK ─────────────────│                              │
     │                              │                              │
     │── SUBSCRIBE:                 │                              │
     │   dm/{tid}/device/{did}/cmd  │                              │
     │   dm/{tid}/device/{did}/cfg  │                              │
     │   dm/{tid}/emergency/#       │                              │
     │                              │                              │
     │── PUB status.heartbeat ─────►│──────────────────────────►│
     │   (db_version=0, queue=0)    │                              │
     │                              │                              │
     │                              │◄── cfg.full ────────────────│
     │◄── cfg.full ─────────────────│   (full device config)      │
     │── cfg.full.ack ─────────────►│──────────────────────────►│
     │                              │                              │
     │                              │◄── cfg.person_sync ─────────│
     │◄── cfg.person_sync ─────────│   (action=full_sync,        │
     │   (batch 1/5, 1000 persons)  │    batched)                 │
     │── cfg.person_sync.ack ──────►│──────────────────────────►│
     │                              │                              │
     │   ... repeat for batches 2-5 ...                            │
     │                              │                              │
     │                              │◄── cfg.access_rules ────────│
     │◄── cfg.access_rules ────────│   (action=full_sync)        │
     │── cfg.access_rules.ack ─────►│──────────────────────────►│
     │                              │                              │
     │                              │◄── cfg.blacklist ───────────│
     │◄── cfg.blacklist ───────────│   (action=full_sync)        │
     │                              │                              │
     │   [DEVICE READY — accepting access events]                  │
```

### 9.2 Incremental Sync

After initial sync, device receives delta updates:

- **Person changes:** `cfg.person_sync` with `action=upsert` or `action=delete`
- **Rule changes:** `cfg.access_rules` with `action=delta`
- **Blacklist updates:** `cfg.blacklist` with `action=add` or `action=remove` (QoS 2, immediate)

Each sync message is acknowledged with local version numbers.

### 9.3 Offline Event Queue

When MQTT connection is lost:
1. Access decisions continue using local DB (no change in behavior)
2. Events are written to `event_queue` table (SQLite)
3. On reconnect, heartbeat reports `queue_depth > 0`
4. Events are published in chronological order, throttled at 100/sec
5. After all events uploaded, `queue_depth` returns to 0

### 9.4 Conflict Resolution

**Server wins.** The server is the single source of truth. If the device has stale data, the next sync (full or incremental) overwrites local data. Devices never modify person records.

---

## 10. Simulation Modes

### 10.1 Normal Mode

Realistic simulation with human-like timing:
- Access events: 1 event per device per 30–120 seconds (configurable)
- Gaussian distribution around configured event rate
- Realistic door timing: unlock 3–5s, open 2–8s, close
- Heartbeat every 30 seconds
- Proper MQTT reconnect behavior

### 10.2 Stress Mode

Maximum throughput for load testing:
- Events generated at maximum configured rate (no artificial delays)
- All devices publish simultaneously
- No jitter or distribution — constant event stream
- Measures server's maximum ingestion capacity
- Reports events/sec, latency percentiles, dropped messages

### 10.3 Chaos Mode

Fault injection for resilience testing:
- Random disconnects (configurable probability per heartbeat interval)
- Delayed MQTT responses (50–5000ms added latency)
- Partial sync failures (ack with errors)
- Clock drift simulation (device timestamp skew)
- Network partition simulation (groups of devices go offline together)
- Slow consumer simulation (delayed message processing)
- Out-of-order event publishing

---

## 11. Event Generation

### 11.1 Configurable Event Mix

```bash
--event-mix "grant:70,deny:20,alarm:5,tamper:3,door_held:2"
```

| Event Type | Default % | Generated Event |
|------------|-----------|-----------------|
| `grant` | 70% | `access.log` with `decision=granted` |
| `deny` | 20% | `access.log` with `decision=denied` + random reason |
| `alarm` | 5% | `alarm.triggered` with random alarm type |
| `tamper` | 3% | `alarm.triggered` with `alarm_type=tamper` |
| `door_held` | 2% | `alarm.triggered` with `alarm_type=door_held` |

### 11.2 Denial Reason Distribution

When generating denied events:

| Reason | Probability |
|--------|-------------|
| `denied_unknown` | 40% — credential not in local DB |
| `denied_time` | 25% — outside schedule |
| `denied_expired` | 15% — credential expired |
| `denied_blacklist` | 10% — person blacklisted |
| `denied_zone` | 5% — no rule for this door |
| `denied_anti_passback` | 3% — anti-passback violation |
| `denied_lockout` | 2% — too many failed attempts |

---

## 12. Metrics

### 12.1 Prometheus Metrics (port 9091)

```
# Device metrics
dm3_sim_devices_total{state="connected|disconnected|error"}
dm3_sim_devices_online_ratio

# Event metrics
dm3_sim_events_total{type="access_log|alarm|door_state|heartbeat", decision="granted|denied"}
dm3_sim_events_per_second
dm3_sim_event_publish_latency_ms{quantile="0.5|0.95|0.99"}

# Sync metrics
dm3_sim_sync_person_count{device_id}
dm3_sim_sync_latency_ms{sync_type="full|incremental|blacklist"}
dm3_sim_sync_failures_total

# Queue metrics
dm3_sim_queue_depth{device_id}
dm3_sim_queue_depth_total
dm3_sim_queue_drain_rate_per_second

# Resource metrics
dm3_sim_memory_bytes_per_device
dm3_sim_memory_total_bytes
dm3_sim_cpu_percent
dm3_sim_db_size_bytes{device_id}

# Decision metrics
dm3_sim_decision_time_ms{quantile="0.5|0.95|0.99"}
dm3_sim_decisions_total{result="granted|denied"}
```

### 12.2 REST API Stats

`GET /stats` returns:

```json
{
    "uptime_s": 3600,
    "devices": {
        "total": 1000,
        "connected": 998,
        "disconnected": 2,
        "error": 0
    },
    "events": {
        "total_published": 125000,
        "events_per_second": 34.7,
        "by_type": {
            "access_log_granted": 87500,
            "access_log_denied": 25000,
            "alarm": 6250,
            "tamper": 3750,
            "door_held": 2500
        }
    },
    "sync": {
        "total_persons_synced": 5000000,
        "avg_sync_latency_ms": 145,
        "last_sync_at": "2026-02-19T10:00:00Z"
    },
    "queue": {
        "total_pending": 0,
        "max_depth_seen": 1500
    },
    "decision": {
        "avg_time_ms": 2.3,
        "p95_time_ms": 8.1,
        "p99_time_ms": 15.4
    }
}
```

---

## 13. REST API (Control Plane)

### 13.1 Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/status` | Overall simulation status |
| `GET` | `/stats` | Detailed metrics (see above) |
| `GET` | `/devices` | List all virtual devices with state |
| `GET` | `/devices/{id}` | Single device detail (DB stats, queue, connection) |
| `POST` | `/devices/{id}/start` | Start a specific device |
| `POST` | `/devices/{id}/stop` | Stop a specific device |
| `POST` | `/trigger/event` | Manually trigger an event on a device |
| `POST` | `/trigger/disconnect` | Force disconnect a device |
| `POST` | `/trigger/reconnect` | Force reconnect a device |
| `POST` | `/simulation/start` | Start all devices |
| `POST` | `/simulation/stop` | Stop all devices |
| `PUT` | `/simulation/config` | Update runtime config (event rate, mode) |
| `GET` | `/metrics` | Prometheus metrics endpoint |

### 13.2 Trigger Event Example

```bash
curl -X POST http://localhost:9090/trigger/event \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "sim-001",
    "event_type": "access",
    "credential_type": "card",
    "credential_value": "AABBCCDD",
    "door_id": "door-001"
  }'
```

---

## 14. Configuration Options

### 14.1 YAML Config File

```yaml
# dm3-simulator.yaml
simulation:
  devices: 100
  device_prefix: "sim-term"
  device_type: "terminal"
  doors_per_device: 1
  mode: "normal"                    # normal | stress | chaos

mqtt:
  broker: "mqtts://broker:8883"
  username: "sim-user"
  password: "jwt-token"
  tls_ca: "/certs/ca.pem"
  keepalive: 60
  session_expiry: 3600
  connect_delay_ms: 100             # Stagger connections

tenant:
  tenant_id: "tenant-uuid"
  site_id: "site-uuid"

events:
  rate_per_device: 1.0              # Events/second
  mix:
    grant: 70
    deny: 20
    alarm: 5
    tamper: 3
    door_held: 2
  heartbeat_interval_s: 30

persons:
  count: 5000                       # Mock persons to pre-load
  face_templates: true
  card_uids: true
  pins: true

database:
  mode: "memory"                    # memory | file
  file_dir: "/tmp/dm3-sim"

chaos:                              # Only used in chaos mode
  disconnect_probability: 0.01     # Per heartbeat interval
  max_disconnect_duration_s: 60
  latency_min_ms: 50
  latency_max_ms: 5000
  clock_drift_max_ms: 30000

api:
  port: 9090
  metrics_port: 9091

logging:
  level: "info"
  format: "json"
```

---

## 15. Security Considerations

| Concern | Mitigation |
|---------|-----------|
| MQTT credentials in CLI args | Support environment variables and config file; never log credentials |
| Simulated devices impersonating real ones | Use distinct device_prefix; restrict simulator JWT permissions |
| Broker overload from stress test | Rate limiting on broker side; simulator respects `--connect-delay` |
| SQLite data at rest | In-memory mode by default; file mode uses temp directory with restrictive permissions |
| REST API access | Bind to localhost by default; add `--api-bind` for explicit network exposure |
| TLS certificate validation | Enforce TLS in production; `--tls-ca` required for `mqtts://` |

---

## 16. Monitoring & Diagnostics

| Tool | Purpose |
|------|---------|
| Prometheus metrics (`:9091/metrics`) | Grafana dashboards for event rates, latency, device health |
| REST API (`/stats`, `/devices`) | Real-time simulation status |
| Structured JSON logs | Centralized logging (stdout → Loki) |
| Per-device DB inspection | `GET /devices/{id}` returns local DB stats |
| Event trace mode | `--log-level debug` logs every access decision with timing |

### Grafana Dashboard

Pre-built dashboard at `grafana/dm3-simulator.json`:
- Panel 1: Connected devices over time
- Panel 2: Events/sec by type
- Panel 3: Decision latency (p50, p95, p99)
- Panel 4: Sync latency and failures
- Panel 5: Queue depth across all devices
- Panel 6: Memory usage per device

---

## 17. Deployment & Installation

### 17.1 Docker

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
ENTRYPOINT ["python", "-m", "dm3_simulator"]
```

```bash
# Run with Docker
docker run -d --name dm3-sim \
  -e MQTT_BROKER=mqtts://broker:8883 \
  -e TENANT_ID=tenant-uuid \
  -p 9090:9090 -p 9091:9091 \
  dm3/simulator:latest \
  --devices 100 --mode normal

# Docker Compose (with EMQX)
docker compose -f docker-compose.simulator.yml up
```

### 17.2 Docker Compose (CI/CD)

```yaml
version: '3.8'
services:
  emqx:
    image: emqx/emqx:5.8
    ports:
      - "1883:1883"
      - "8883:8883"

  dm3-simulator:
    build: ./simulator
    depends_on:
      - emqx
    environment:
      MQTT_BROKER: mqtt://emqx:1883
      TENANT_ID: test-tenant
    command: --devices 50 --mode stress --event-rate 10
    ports:
      - "9090:9090"
      - "9091:9091"
```

### 17.3 PyPI

```bash
pip install dm3-simulator
dm3-simulator --devices 10 --tenant-id xxx --broker mqtt://localhost:1883
```

---

## 18. Testing Approach

| Test Type | Scope | Tools |
|-----------|-------|-------|
| **Unit tests** | Decision engine, schedule evaluator, DB operations | pytest, pytest-asyncio |
| **Integration tests** | MQTT publish/subscribe, sync protocol, event queue drain | pytest + testcontainers (EMQX) |
| **Load tests** | 1K–10K devices against real EMQX + DM3 server | Simulator itself (stress mode) |
| **Chaos tests** | Resilience under network failures, clock drift | Simulator chaos mode |
| **Protocol compliance** | MQTT message format matches mqtt-protocol.md | JSON schema validation |
| **Performance benchmarks** | Decision latency < 50ms, memory per device | pytest-benchmark |

### Key Test Scenarios

1. **Full sync flow:** Device connects → receives full person DB → ack → ready
2. **Incremental sync:** Delta update received → local DB updated → ack
3. **Blacklist priority:** Blacklist push processed before next access decision
4. **Offline queue drain:** 5000 queued events uploaded on reconnect at 100/sec
5. **10K device connection storm:** All devices connect within 60 seconds
6. **Decision under load:** < 50ms decision time with 10K persons in local DB
7. **Chaos reconnect:** Device recovers after random disconnect, syncs delta, drains queue

---

## 19. Integration Points

- **Depends on:** EMQX broker, DM3 server (device-gw, access-svc, identity-svc)
- **Consumed by:** CI/CD pipelines, QA team, performance testing team
- **Replaces:** Manual device testing, hardware-dependent integration tests

---

## 20. Notes

- The simulator's decision engine code should be extracted as a shared library that real devices (Android terminal, Linux controller) can also use as reference implementation.
- SQLite in-memory mode is recommended for > 100 devices to avoid filesystem I/O bottleneck.
- For 10K device simulation, use connection staggering (`--connect-delay 0.01`) to avoid broker connection storm.
- Event rate of 1/sec per device × 10K devices = 10K events/sec — this is the upper bound stress test target.
- The simulator does NOT simulate face recognition AI inference time — only the DB lookup and rule evaluation. Face match confidence is randomly generated.
