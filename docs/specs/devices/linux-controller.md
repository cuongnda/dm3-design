# Device Specification: Linux-Based Device Controller

> Domain: SECURE | Priority: P0
> Status: Draft | Owner: Device Team
> Device Type: Headless Linux Controller (Raspberry Pi / Industrial SBC)

---

## 1. Overview & Purpose

The Linux Controller is a headless device that bridges physical access hardware (readers, locks, sensors) to the DM3 platform. It has no screen — it controls relays, reads credentials from external readers, monitors door sensors, and makes **all access decisions locally in < 50ms** using a synced user database.

**Use cases:**
- Retrofit existing buildings: connect legacy Wiegand readers to DM3
- Multi-door control: single controller manages 2–4 doors with independent readers and relays
- Bridge IP-based, RS485, and Wiegand readers to MQTT
- High-security areas requiring dedicated hardware (not Android)
- Industrial environments where Android terminals aren't suitable

**Supported hardware platforms:**
- Raspberry Pi 4/5 (development, small deployments)
- Industrial SBCs: Advantech UNO-2271G, Axiomtek eBOX560, or equivalent
- Any Debian/Ubuntu Linux ARM64 or x86_64 system with GPIO/RS485/USB

---

## 2. Hardware Interface

### 2.1 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    Linux Controller (SBC)                        │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                dm3-controller (systemd service)            │   │
│  │                                                           │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐       │   │
│  │  │ MQTT    │ │ Decision│ │ Sync    │ │ Event   │       │   │
│  │  │ Client  │ │ Engine  │ │ Manager │ │ Queue   │       │   │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘       │   │
│  │                                                           │   │
│  │  ┌──────────────────────────────────────────────────┐    │   │
│  │  │          Hardware Abstraction Layer (HAL)          │    │   │
│  │  │                                                    │    │   │
│  │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐         │    │   │
│  │  │  │ Wiegand  │ │ RS485    │ │ GPIO     │         │    │   │
│  │  │  │ Driver   │ │ Driver   │ │ Driver   │         │    │   │
│  │  │  └────┬─────┘ └────┬─────┘ └────┬─────┘         │    │   │
│  │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐         │    │   │
│  │  │  │ TCP/IP   │ │ USB HID  │ │ Relay    │         │    │   │
│  │  │  │ Driver   │ │ Driver   │ │ Driver   │         │    │   │
│  │  │  └────┬─────┘ └────┬─────┘ └────┬─────┘         │    │   │
│  │  └───────┼───────────┼───────────┼──────────────────┘    │   │
│  └──────────┼───────────┼───────────┼───────────────────────┘   │
└─────────────┼───────────┼───────────┼───────────────────────────┘
              │           │           │
    ┌─────────┴───┐ ┌─────┴─────┐ ┌──┴──────────────────────┐
    │  Wiegand    │ │ USB HID   │ │  GPIO / Relay Board     │
    │  Readers    │ │ Readers   │ │                          │
    │             │ │           │ │  Door 1: Relay + Sensor  │
    └─────────────┘ └───────────┘ │  Door 2: Relay + Sensor  │
                                  │  Door 3: Relay + Sensor  │
    ┌─────────────┐ ┌───────────┐ │  Door 4: Relay + Sensor  │
    │ RS485       │ │ IP-based  │ │  REX buttons             │
    │ Readers     │ │ Readers   │ │  Tamper switch           │
    │ (Modbus/    │ │ (TCP      │ │  Aux I/O                 │
    │  Serial)    │ │  socket)  │ └──────────────────────────┘
    └─────────────┘ └───────────┘
```

### 2.2 Hardware Interface Details

#### Relay Outputs (Door Locks)

| Parameter | Specification |
|-----------|---------------|
| **Channels** | 2–4 relay channels (configurable per hardware) |
| **Type** | Dry contact (NO/NC) or solid-state relay |
| **Rating** | 5A @ 30V DC / 5A @ 250V AC |
| **Pulse duration** | Configurable per door: 1–30 seconds (default 5s) |
| **Failsafe mode** | Per-door: fail-secure (locked on power loss) or fail-safe (unlocked on power loss) |
| **Interface** | GPIO pins or USB relay board (FTDI) |

#### Wiegand Input

| Parameter | Specification |
|-----------|---------------|
| **Formats** | Wiegand 26, 34, custom bit lengths (configurable) |
| **Channels** | Up to 4 (one per door — entry reader) |
| **Interface** | GPIO: Data0 (D0), Data1 (D1) per channel |
| **Timing** | Pulse width: 20–100 μs, inter-pulse: 200 μs – 20 ms |
| **Library** | `pigpio` (Raspberry Pi) or custom GPIO driver |

#### RS485

| Parameter | Specification |
|-----------|---------------|
| **Ports** | 1–2 RS485 ports (USB-to-RS485 adapter or native) |
| **Protocols** | Modbus RTU, custom serial protocols |
| **Baud rate** | 9600, 19200, 38400, 57600, 115200 (configurable) |
| **Devices** | QR scanners, fingerprint modules, RFID readers, Wiegand-to-RS485 converters |

#### TCP/IP

| Parameter | Specification |
|-----------|---------------|
| **Interface** | Ethernet (10/100/1000) |
| **Protocols** | TCP socket, HTTP |
| **Devices** | IP-based access readers, IP intercoms, networked relay boards |

#### GPIO (General Purpose I/O)

| Signal | Direction | Purpose |
|--------|-----------|---------|
| Door sensor × 4 | Input | Magnetic contact: door open/closed |
| REX button × 4 | Input | Request-to-exit (momentary push button) |
| Tamper switch × 1 | Input | Enclosure tamper detection |
| Aux input × 2 | Input | Custom: fire alarm input, etc. |
| Aux output × 2 | Output | Custom: buzzer, LED indicator, etc. |
| Relay × 4 | Output | Door lock control |

#### USB

| Parameter | Specification |
|-----------|---------------|
| **Ports** | 2–4 USB 2.0/3.0 |
| **Devices** | USB HID readers (keyboard emulation), USB-to-RS485 adapters, USB relay boards |

---

## 3. Software Architecture

### 3.1 Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                 dm3-controller (Python or Go)                    │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    Core Application                        │   │
│  │                                                           │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐         │   │
│  │  │ MQTT       │  │ Sync       │  │ Command    │         │   │
│  │  │ Client     │  │ Manager    │  │ Handler    │         │   │
│  │  │ (paho/gmqtt│  │            │  │            │         │   │
│  │  │  or Go)    │  │            │  │            │         │   │
│  │  └────────────┘  └────────────┘  └────────────┘         │   │
│  │                                                           │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐         │   │
│  │  │ Access     │  │ Door State │  │ Event      │         │   │
│  │  │ Decision   │  │ Machine    │  │ Queue      │         │   │
│  │  │ Engine     │  │ (per door) │  │ Manager    │         │   │
│  │  └────────────┘  └────────────┘  └────────────┘         │   │
│  └──────────────────────────┬───────────────────────────────┘   │
│                             │                                    │
│  ┌──────────────────────────┼───────────────────────────────┐   │
│  │          Hardware Abstraction Layer (HAL)                  │   │
│  │                                                           │   │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐│   │
│  │  │Wiegand │ │RS485   │ │TCP/IP  │ │USB HID │ │GPIO/   ││   │
│  │  │Plugin  │ │Plugin  │ │Plugin  │ │Plugin  │ │Relay   ││   │
│  │  │        │ │(Modbus)│ │(Socket)│ │(evdev) │ │Plugin  ││   │
│  │  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘│   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                  Local SQLite Database                     │   │
│  │  users | credentials | access_rules | blacklist |       │   │
│  │  event_queue | sync_state | config | anti_passback        │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Diagnostics Web UI (port 8080)               │   │
│  │  Hardware status | Reader test | Relay test | Event log   │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Tech Stack Options

| Option | Language | MQTT Library | Best For |
|--------|----------|-------------|----------|
| **Option A** | Python 3.11+ (asyncio) | paho-mqtt / aiomqtt | Rapid development, plugin flexibility |
| **Option B** | Go 1.22+ | paho.mqtt.golang / gmqtt | Performance, single binary, low memory |

**Recommended: Go** — single static binary, lower memory footprint, better for embedded/industrial use.

### 3.3 systemd Service

```ini
[Unit]
Description=DM3 Access Controller
After=network-online.target
Wants=network-online.target
StartLimitBurst=5
StartLimitIntervalSec=60

[Service]
Type=notify
ExecStart=/usr/bin/dm3-controller --config /etc/dm3/controller.yaml
Restart=always
RestartSec=3
WatchdogSec=30
User=dm3
Group=dm3
# Hardware access
SupplementaryGroups=gpio dialout i2c spi
# Security hardening
ProtectSystem=strict
ReadWritePaths=/var/lib/dm3 /var/log/dm3
PrivateTmp=true
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```

---

## 4. Reader Protocol Plugins

The HAL uses a plugin architecture where each reader protocol is a separate module implementing a common `ReaderPlugin` interface.

### 4.1 Plugin Interface

```go
type ReaderPlugin interface {
    Init(config PluginConfig) error
    Start(ctx context.Context) error
    Stop() error
    // OnCredential is called when reader produces a credential
    SetCredentialHandler(handler func(credential Credential))
    Name() string
    Status() PluginStatus
}

type Credential struct {
    Type       string    // "card" | "pin" | "qr" | "fingerprint"
    Value      string    // UID hex, PIN string, QR data, template hash
    ReaderID   string    // Which reader produced this
    DoorID     string    // Mapped door
    Direction  string    // "entry" | "exit"
    RawData    []byte    // Raw bytes from reader
    Timestamp  time.Time
}
```

### 4.2 Wiegand Plugin

```yaml
readers:
  - id: "reader-door1-entry"
    type: "wiegand"
    door_id: "door-001"
    direction: "entry"
    config:
      data0_pin: 17          # GPIO pin for D0
      data1_pin: 27          # GPIO pin for D1
      bit_length: 26         # 26 or 34 (auto-detect if 0)
      facility_code: true    # Include facility code in UID
      timeout_ms: 50         # Inter-bit timeout
```

**Wiegand 26 format:** 1 parity + 8 facility code + 16 card number + 1 parity = 26 bits
**Wiegand 34 format:** 1 parity + 16 facility code + 16 card number + 1 parity = 34 bits

### 4.3 RS485 Modbus RTU Plugin

```yaml
readers:
  - id: "reader-door2-entry"
    type: "rs485_modbus"
    door_id: "door-002"
    direction: "entry"
    config:
      port: "/dev/ttyUSB0"
      baud_rate: 9600
      slave_address: 1
      data_register: 100     # Register holding card UID
      data_length: 4         # Number of registers to read
      poll_interval_ms: 100  # Polling interval
      byte_order: "big"      # big | little
```

### 4.4 RS485 Custom Serial Plugin

```yaml
readers:
  - id: "reader-door3-qr"
    type: "rs485_serial"
    door_id: "door-003"
    direction: "entry"
    config:
      port: "/dev/ttyUSB1"
      baud_rate: 115200
      protocol: "line"       # line (newline-delimited) | packet (length-prefixed) | stx_etx
      credential_type: "qr"
      parse_regex: "^UID:(.+)$"  # Extract credential from raw data
```

### 4.5 TCP Socket Plugin

```yaml
readers:
  - id: "reader-door4-ip"
    type: "tcp"
    door_id: "door-004"
    direction: "entry"
    config:
      host: "192.168.1.200"
      port: 4370
      protocol: "zk"         # zk (ZKTeco) | custom | http_poll
      reconnect_interval_s: 5
      credential_type: "card"
```

### 4.6 USB HID Plugin

```yaml
readers:
  - id: "reader-door1-exit"
    type: "usb_hid"
    door_id: "door-001"
    direction: "exit"
    config:
      vendor_id: "0x076b"    # Duali vendor ID
      product_id: "0x5421"
      # Or by device path:
      device_path: "/dev/input/event3"
      credential_type: "card"
      input_terminator: "\n"  # Key that marks end of input (Enter)
      timeout_ms: 500         # Max time to accumulate keystrokes
```

---

## 5. Local Database Schema

Identical core schema to the Device Simulator (see `device-simulator.md §6`). Same tables:

- `users` — synced user records
- `credentials` — card UIDs, PIN hashes, face templates, QR data
- `access_rules` — synced access rules with schedules
- `user_groups` — group membership
- `blacklist` — priority blacklist
- `event_queue` — pending events for upload
- `sync_state` — sync versions and cursors
- `config` — device configuration
- `anti_passback_state` — per-user last direction tracking
- `failed_attempts` — lockout tracking

### Additional Table: `door_state`

```sql
CREATE TABLE door_state (
    door_id         TEXT PRIMARY KEY,
    state           TEXT NOT NULL DEFAULT 'locked',  -- locked|unlocked|open|closed|forced|held_open|tampered
    relay_state     TEXT NOT NULL DEFAULT 'locked',  -- locked|unlocked
    sensor_state    TEXT NOT NULL DEFAULT 'closed',  -- open|closed|unknown
    unlock_until_ms INTEGER,                          -- When auto-relock (0 = locked)
    held_open_since INTEGER,                          -- When door was detected held open
    last_event_ms   INTEGER,
    updated_at      INTEGER DEFAULT (strftime('%s','now') * 1000)
);
```

---

## 6. Access Decision Engine

Same core algorithm as the simulator and Android terminal. See `device-simulator.md §8` for the full pseudocode.

### 6.1 Controller-Specific Flow

```
Reader Plugin emits Credential
       │
       ▼
┌──────────────┐
│ HAL          │  Normalize: raw reader data → standard Credential struct
│ Normalize    │  Map reader_id → door_id + direction
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Access       │  IDENTICAL algorithm to simulator/terminal:
│ Decision     │  1. Check lockdown
│ Engine       │  2. Lookup credential in local DB
│ (< 50ms)     │  3. Check blacklist
│              │  4. Check user status + validity
│              │  5. Check failed attempt lockout
│              │  6. Find + evaluate access rules (priority order)
│              │  7. Check schedule, anti-passback, interlock
└──────┬───────┘
       │
       ├── GRANTED
       │      ▼
       │  ┌──────────────┐
       │  │ Trigger      │  Pulse relay for door_id (configurable duration)
       │  │ Relay        │  Start door state machine timer
       │  └──────────────┘
       │
       └── DENIED
              ▼
          ┌──────────────┐
          │ Buzzer/LED   │  Aux output: denial signal
          │ (optional)   │
          └──────────────┘
       │
       ▼ (both paths)
┌──────────────┐
│ Log Event    │  Create access.log → publish MQTT or queue locally
│ + Publish    │
└──────────────┘
```

---

## 7. Multi-Door Support

A single controller manages 2–4 doors independently.

### 7.1 Door Configuration

```yaml
doors:
  - id: "door-001"
    name: "Main Entrance"
    relay_channel: 0
    relay_pulse_ms: 5000
    failsafe_mode: "fail_secure"     # fail_secure | fail_safe
    sensor_gpio: 22                   # Door contact sensor
    rex_gpio: 23                      # Request-to-exit button
    readers:
      - reader_id: "reader-door1-entry"
        direction: "entry"
      - reader_id: "reader-door1-exit"
        direction: "exit"
    anti_passback: true
    held_open_timeout_ms: 35000       # unlock_duration + 30s
    interlock_group: null

  - id: "door-002"
    name: "Server Room"
    relay_channel: 1
    relay_pulse_ms: 3000
    failsafe_mode: "fail_secure"
    sensor_gpio: 24
    rex_gpio: 25
    readers:
      - reader_id: "reader-door2-entry"
        direction: "entry"
    anti_passback: false
    held_open_timeout_ms: 33000
    interlock_group: "mantrap-001"

  - id: "door-003"
    name: "Emergency Exit"
    relay_channel: 2
    relay_pulse_ms: 5000
    failsafe_mode: "fail_safe"        # Unlocks on power loss
    sensor_gpio: 5
    rex_gpio: 6
    readers:
      - reader_id: "reader-door3-qr"
        direction: "entry"
    emergency_unlock: true
```

### 7.2 Interlock Group (Mantrap)

When doors are in an interlock group, only one can be unlocked at a time:

```
Door A (locked) ─── Mantrap ─── Door B (locked)

1. User presents credential at Door A
2. Controller checks: is Door B locked? → YES
3. Decision: GRANTED → Unlock Door A
4. User enters mantrap, Door A closes and locks
5. User presents credential at Door B
6. Controller checks: is Door A locked? → YES
7. Decision: GRANTED → Unlock Door B
8. User exits mantrap

If Door A is still open when Door B credential is presented:
→ DENIED (reason: denied_interlock)
```

---

## 8. Door State Machine

Each door has an independent state machine:

```
                    ┌─────────────┐
        ┌──────────│   LOCKED    │◄──────────────────────────┐
        │          │  (default)  │                            │
        │          └──────┬──────┘                            │
        │                 │                                    │
        │    access granted / remote cmd / REX                │
        │                 │                                    │
        │                 ▼                                    │
        │          ┌─────────────┐     unlock_duration         │
        │          │  UNLOCKED   │ ──── expired ──────────────┘
        │          │  (timed)    │
        │          └──────┬──────┘
        │                 │
        │         door sensor = OPEN
        │                 │
        │                 ▼
        │          ┌─────────────┐     door sensor = CLOSED
        │          │    OPEN     │ ──────────┐
        │          │             │            │
        │          └──────┬──────┘            ▼
        │                 │           ┌─────────────┐
        │      held_open_timeout      │   CLOSED    │
        │       exceeded              │  (re-lock)  │──► LOCKED
        │                 │           └─────────────┘
        │                 ▼
        │          ┌─────────────┐
        │          │  HELD OPEN  │  → alarm.triggered (door_held)
        │          │  (alarm)    │
        │          └──────┬──────┘
        │                 │
        │         door sensor = CLOSED
        │                 │
        │                 ▼
        │            LOCKED (alarm cleared)
        │
        │
        │   door sensor = OPEN without unlock command
        │          ┌─────────────┐
        └─────────│   FORCED    │  → alarm.triggered (door_forced)
                   │  (alarm)    │    CRITICAL ALERT
                   └─────────────┘

Special state:
        ┌─────────────┐
        │  TAMPERED   │  → alarm.triggered (tamper)
        │  (hardware) │    Tamper switch triggered
        └─────────────┘
```

### State Transitions

| From | Event | To | Side Effect |
|------|-------|----|-------------|
| LOCKED | Access granted / cmd.door(unlock) / REX button | UNLOCKED | Pulse relay, start timer |
| UNLOCKED | Timer expired | LOCKED | De-energize relay |
| UNLOCKED | Door sensor = open | OPEN | Start held-open timer |
| OPEN | Door sensor = closed | LOCKED | Re-lock relay |
| OPEN | held_open_timeout exceeded | HELD_OPEN | Emit `alarm.triggered` (door_held) |
| HELD_OPEN | Door sensor = closed | LOCKED | Clear alarm |
| LOCKED | Door sensor = open (no unlock) | FORCED | Emit `alarm.triggered` (door_forced) — CRITICAL |
| Any | Tamper switch triggered | TAMPERED | Emit `alarm.triggered` (tamper) |
| Any | cmd.lockdown(activate) | LOCKED | Lock relay, ignore access |
| LOCKED | cmd.door(hold_open) | UNLOCKED (hold) | Keep relay energized until release/timeout |

---

## 9. MQTT Topics Consumed & Published

Reference: `mqtt-protocol.md`

### 9.1 Subscriptions (Server → Device)

| Topic | QoS | Message Types |
|-------|-----|---------------|
| `dm/{tid}/device/{did}/cmd` | 2 | `cmd.door`, `cmd.reboot`, `cmd.snapshot` (N/A — no camera) |
| `dm/{tid}/device/{did}/cfg` | 2 | `cfg.full`, `cfg.patch`, `cfg.person_sync`, `cfg.access_rules`, `cfg.blacklist`, `cfg.firmware` |
| `dm/{tid}/emergency/broadcast` | 2 | `cmd.lockdown` |

### 9.2 Publications (Device → Server)

| Topic | QoS | Message Types | Trigger |
|-------|-----|---------------|---------|
| `dm/{tid}/device/{did}/evt` | 1 | `access.log` | After every access decision |
| `dm/{tid}/device/{did}/evt` | 1 | `door.state` | Every door state transition |
| `dm/{tid}/device/{did}/evt` | 1 | `alarm.triggered` | Door forced, door held, tamper |
| `dm/{tid}/device/{did}/evt` | 1 | `firmware.check` | On boot + every 6h + on reconnect after long offline (see §16.4) |
| `dm/{tid}/device/{did}/sta` | 0 | `status.heartbeat` | Every 30s |
| `dm/{tid}/device/{did}/cmd/resp` | 2 | `cmd.door.resp` | After command execution |
| `dm/{tid}/device/{did}/cfg/ack` | 2 | Sync acknowledgments, `cfg.firmware.ack` | After sync / update processing |

---

## 10. Sync Protocol

Identical to the simulator and Android terminal. See `device-simulator.md §9` for the full protocol.

### 10.1 Summary

1. **Boot:** Connect MQTT → subscribe → heartbeat (versions=0) → server pushes full sync
2. **Full sync:** cfg.full → cfg.person_sync (batched) → cfg.access_rules → cfg.blacklist
3. **Incremental:** Delta updates via sync_token cursor; blacklist with QoS 2 priority
4. **Offline:** Events queued in SQLite (max 100,000 events — configurable), drain at 100/sec on reconnect
5. **Conflict:** Server wins

### 10.2 Controller-Specific: Larger Offline Queue

The Linux controller has more storage than Android terminals:

| Storage | Queue Size | Duration @ 1 evt/min/door × 4 doors |
|---------|-----------|--------------------------------------|
| 4 GB SD card | 100,000 events | ~17 days offline |
| 32 GB SD card | 1,000,000 events | ~170 days offline |

Default: 100,000 events. Configurable via `cfg.full.network.offline_queue_max`.

---

## 11. Offline Mode

**Offline IS the normal operating mode.** The controller:

1. Makes all access decisions locally (< 50ms)
2. Controls relays, monitors sensors — no server dependency
3. Queues events in local SQLite
4. Continues operating indefinitely without connectivity
5. Syncs delta when connectivity restores

### Graceful Degradation

| Connectivity State | Behavior |
|-------------------|----------|
| **Online** | Normal: decisions + sync + event upload |
| **Offline < 1 hour** | No change in behavior; events queue |
| **Offline < 24 hours** | Same; blacklist may be slightly stale |
| **Offline > 24 hours** | Same; JWT may expire — device uses cached auth; events continue queuing |
| **Offline > 7 days** | Same; potential NTP drift — events timestamped with local clock |
| **First boot, never synced** | Deny all (empty user DB) — must complete initial sync |

---

## 12. Hardware Watchdog

### 12.1 Software Watchdog (systemd)

```ini
WatchdogSec=30    # systemd expects sd_notify("WATCHDOG=1") every 30s
                   # If missed → systemd restarts the service
```

### 12.2 Hardware Watchdog

```yaml
watchdog:
  enabled: true
  device: "/dev/watchdog0"      # Hardware watchdog device
  timeout_s: 60                 # Hardware reboot if not fed for 60s
  feed_interval_s: 15           # Feed every 15 seconds
```

### 12.3 Failsafe Relay State

On unexpected shutdown/reboot, each door's relay defaults to its configured failsafe:

| Mode | Power Loss Behavior | Use Case |
|------|-------------------|----------|
| **fail_secure** | Relay de-energized → door LOCKED | Default — secure areas |
| **fail_safe** | Relay energized → door UNLOCKED | Emergency exits, fire exits |

---

## 13. Configuration

### 13.1 YAML Config File (`/etc/dm3/controller.yaml`)

```yaml
# DM3 Linux Controller Configuration
device:
  id: "ctrl-001"
  type: "controller"
  name: "Building A Controller"

tenant:
  id: "tenant-uuid"
  site_id: "site-uuid"

mqtt:
  broker: "mqtts://broker.example.com:8883"
  username: "ctrl-001"
  password: "${DM3_MQTT_TOKEN}"     # Env var reference
  tls:
    ca_cert: "/etc/dm3/certs/ca.pem"
    client_cert: "/etc/dm3/certs/client.pem"  # Optional: mTLS
    client_key: "/etc/dm3/certs/client.key"
  keepalive_s: 60
  session_expiry_s: 3600
  reconnect_delay_s: [1, 5, 15, 30, 60]  # Exponential backoff

database:
  path: "/var/lib/dm3/controller.db"
  wal_mode: true
  max_event_queue: 100000

doors:
  - id: "door-001"
    name: "Main Entrance"
    relay_channel: 0
    relay_pulse_ms: 5000
    failsafe_mode: "fail_secure"
    sensor_gpio: 22
    rex_gpio: 23
    held_open_timeout_ms: 35000
    readers:
      - id: "reader-door1-entry"
        type: "wiegand"
        direction: "entry"
        config:
          data0_pin: 17
          data1_pin: 27
          bit_length: 26

  - id: "door-002"
    name: "Server Room"
    relay_channel: 1
    relay_pulse_ms: 3000
    failsafe_mode: "fail_secure"
    sensor_gpio: 24
    rex_gpio: 25
    readers:
      - id: "reader-door2-entry"
        type: "rs485_modbus"
        direction: "entry"
        config:
          port: "/dev/ttyUSB0"
          baud_rate: 9600
          slave_address: 1

heartbeat:
  interval_s: 30

network:
  ntp_server: "pool.ntp.org"

watchdog:
  enabled: true
  device: "/dev/watchdog0"
  timeout_s: 60

diagnostics:
  web_port: 8080
  bind: "0.0.0.0"                   # LAN only (firewall restricted)

logging:
  level: "info"
  file: "/var/log/dm3/controller.log"
  max_size_mb: 50
  max_files: 5
```

### 13.2 Remote Config Override

Any setting in the YAML can be overridden via MQTT `cfg.full` or `cfg.patch`. Remote config takes precedence over local YAML. The merged config is stored in the `config` table in SQLite.

---

## 14. Security Considerations

| Concern | Mitigation |
|---------|-----------|
| **MQTT in transit** | TLS 1.3 mandatory; optional mTLS with client certificates |
| **Local DB at rest** | SQLite with WAL mode; optional SQLCipher encryption |
| **Physical tamper** | Tamper switch on enclosure; `alarm.triggered` on trigger |
| **Wiegand sniffing** | Wiegand is inherently insecure (plain-text); recommend OSDP or DESFire secure read where possible |
| **SSH access** | Key-based only; disable password auth; fail2ban |
| **Service hardening** | systemd: NoNewPrivileges, ProtectSystem=strict, restricted user |
| **Firmware integrity** | GPG-signed packages; checksum verification on OTA update |
| **GPIO access** | dm3 user added to gpio group; no root required |
| **Network exposure** | Diagnostics web UI bound to LAN; firewall rules in place |
| **Relay failsafe** | Configurable per door: fail-secure or fail-safe on power loss |

---

## 15. Monitoring & Diagnostics

### 15.1 Heartbeat (MQTT)

Every 30 seconds, published to `dm/{tid}/device/{did}/sta`:

```json
{
  "type": "status.heartbeat",
  "data": {
    "online": true,
    "uptime_s": 86400,
    "firmware": "1.2.0",
    "ip": "192.168.1.50",
    "cpu_pct": 15,
    "mem_pct": 35,
    "disk_pct": 12,
    "temperature_c": 42,
    "network": { "type": "ethernet", "latency_ms": 5 },
    "peripherals": {
      "reader_door1_entry": "ok",
      "reader_door2_entry": "ok",
      "relay_0": "ok",
      "relay_1": "ok",
      "sensor_door1": "ok",
      "sensor_door2": "ok"
    },
    "queue_depth": 0,
    "doors": {
      "door-001": { "state": "locked", "sensor": "closed" },
      "door-002": { "state": "locked", "sensor": "closed" }
    }
  }
}
```

### 15.2 Local Diagnostics Web UI (port 8080)

Accessible on LAN only. Provides:

| Page | Content |
|------|---------|
| **Dashboard** | System status, uptime, MQTT connection, sync versions |
| **Doors** | Per-door: state machine state, relay state, sensor state, last event |
| **Readers** | Per-reader: plugin status, last credential received, error count |
| **Event Log** | Last 100 access events with decision details |
| **Relay Test** | Manual relay pulse per channel (requires auth) |
| **Reader Test** | Monitor next credential from any reader (debug mode) |
| **Network** | MQTT status, IP config, DNS, NTP sync |
| **Logs** | Tail application logs |

**Authentication:** HTTP Basic Auth with device admin credentials.

### 15.3 Remote Log Pull (over MQTT)

Wire spec: `docs/architecture/mqtt-protocol.md §6.5`. Install flow mirrors Android terminal §13.3 with these substitutions:

- **Source of log lines:** `journalctl -u dm3-controller --since ... --until ... -o short-iso` (or systemd-journal equivalent for containerised deploys), NOT Logcat.
- **Filter mapping:** `level_min=info|warn|error` → `-p info|warning|err` on journalctl.
- **Redaction:** none at the device; the server is the trust boundary (same rule as Android §13.3).

Respect the same constraints: run on a worker so the control loop isn't blocked, cap concurrency at 1 per controller, reply with `cmd.logs.resp error=device_busy` if a second request arrives while the first is in flight.

---

## 16. Deployment & Installation

### 16.1 Debian Package (.deb)

```bash
# Add Duali repository
curl -fsSL https://repo.duallmaster.com/gpg.key | sudo gpg --dearmor -o /etc/apt/keyrings/duali.gpg
echo "deb [signed-by=/etc/apt/keyrings/duali.gpg] https://repo.duallmaster.com/debian stable main" | \
  sudo tee /etc/apt/sources.list.d/duali.list

# Install
sudo apt update
sudo apt install dm3-controller

# Configure
sudo nano /etc/dm3/controller.yaml

# Start
sudo systemctl enable --now dm3-controller
```

### 16.2 Docker

```bash
docker run -d --name dm3-controller \
  --privileged \
  -v /etc/dm3:/etc/dm3:ro \
  -v /var/lib/dm3:/var/lib/dm3 \
  -v /dev:/dev \
  -p 8080:8080 \
  --restart unless-stopped \
  dm3/controller:latest
```

Note: `--privileged` required for GPIO, RS485, USB access. For production, use `--device` flags for specific devices.

### 16.3 Install Script

```bash
curl -fsSL https://install.duallmaster.com/controller.sh | sudo bash -s -- \
  --device-id "ctrl-001" \
  --tenant-id "tenant-uuid" \
  --broker "mqtts://broker:8883" \
  --token "jwt-token"
```

### 16.4 Firmware Update

Wire spec: `docs/architecture/mqtt-protocol.md §7.7`. Install flow is identical to the Android terminal's §12.1 with two substitutions:

- **Package format:** Debian `.deb` or OCI container image instead of APK
- **Installer:** `dpkg -i` (deb) or `docker pull` + `docker run` (container) instead of `PackageInstaller`

Steps:

- Via MQTT: `cfg.firmware` message with download URL and checksum
- Controller downloads package, verifies GPG signature + SHA-256 checksum
- Applies via `dpkg -i` (deb) or `docker pull` (container)
- Auto-restart via systemd

**Device-initiated check (pull):** controller publishes `firmware.check` on its `evt` topic to catch updates missed while offline. Triggers:

| Trigger | Rationale |
|---|---|
| On systemd service start, after MQTT connect | Picks up firmware released while the controller was off / unreachable |
| Every 6 hours (configurable via `firmware_check_hours` in `cfg.patch`) | Covers 24/7 controllers that miss a push due to broker blip |
| Immediately after MQTT reconnect when the previous offline gap was ≥ 10 min | Recovers catch-up after WAN outage |

Payload and response semantics match Android §12.3 — silence means "up-to-date or no firmware registered for this device_type". Do not block startup waiting for a response; do not spam-retry.

---

## 17. Testing Approach

| Test Type | Scope | Tools |
|-----------|-------|-------|
| **Unit tests** | Decision engine, door state machine, schedule evaluator | Go: testing + testify / Python: pytest |
| **Integration tests** | MQTT protocol, sync flow, event queue drain | Testcontainers (EMQX), mock readers |
| **Hardware-in-loop** | Real Wiegand readers, relay boards, GPIO sensors | Physical test bench |
| **Plugin tests** | Each reader protocol plugin independently | Protocol simulators, RS485 loopback |
| **Offline tests** | 7-day offline operation, queue fill/drain | Network disconnect test |
| **State machine tests** | All door state transitions, alarm generation | Unit tests with mocked GPIO |
| **Performance tests** | Decision < 50ms, 4 simultaneous door events | Benchmark suite |
| **Security tests** | TLS enforcement, tamper response, failsafe behavior | Penetration test |

### Key Test Scenarios

1. **Multi-door simultaneous access:** 4 credentials presented within 100ms → 4 independent decisions
2. **Interlock enforcement:** Door A open → Door B credential → denied (interlock)
3. **Door forced alarm:** Sensor reports open without unlock → alarm within 100ms
4. **Held open alarm:** Door remains open beyond timeout → alarm triggered
5. **Wiegand reader failure:** Reader stops responding → peripheral status = "error" in heartbeat
6. **100K event queue:** Fill queue offline → reconnect → drain at 100/sec → ~17 minutes
7. **Watchdog recovery:** Kill process → systemd restarts within 3s → relay returns to failsafe state
8. **REX button:** Button press → unlock door → no access log event (or with source="button")
9. **Power cycle:** Cut power → restore → boot → sync delta → resume operations

---

## 18. Integration Points

- **Depends on:** EMQX broker, DM3 server (device-gw for sync orchestration)
- **Hardware:** GPIO-capable SBC, relay boards, Wiegand/RS485/USB readers
- **Consumed by:** access-svc (event logs, door state), alarm-svc (forced/held/tamper alarms)
- **External:** NTP server, external readers (various protocols)

---

## 19. Notes

- The Linux controller is the most hardware-flexible device in the DM3 ecosystem. Its plugin architecture allows supporting virtually any reader hardware.
- For Wiegand: the protocol is inherently insecure (plain-text over two wires). For high-security deployments, recommend OSDP (RS485-based, encrypted) or DESFire EV3 with secure messaging.
- GPIO libraries differ by platform: `pigpio` for Raspberry Pi, `libgpiod` for generic Linux. The HAL abstracts this.
- Maximum recommended users: 10,000 (same as other devices). Limited by SQLite lookup performance, not storage.
- The REX (request-to-exit) button unlocks the door without logging an access event by default. This is configurable — some deployments want REX events logged.
- Door sensor polarity is configurable: normally-open or normally-closed magnetic contacts.
- For multi-controller deployments managing the same physical mantrap, interlock coordination happens via server-side MQTT commands (not direct controller-to-controller communication).
