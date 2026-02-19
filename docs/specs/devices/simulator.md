# DM3 Device Simulator

> Domain: DEVICES | Status: **Active** | Owner: Platform Team

## Overview

The DM3 Device Simulator creates virtual access control devices for end-to-end testing of the platform. Each virtual device has its own MQTT client, SQLite database, access engine, and state machine — operating independently like a real DF-970 terminal.

**Dashboard:** http://localhost:9090
**API Base:** http://localhost:9090/api

## Capabilities

- **Virtual Devices** — Simulate 1-1000 devices with independent MQTT connections
- **Access Events** — Generate realistic access grant/deny events with configurable rates
- **Offline Mode** — Disconnect individual devices, queue events locally, auto-drain on reconnect
- **Local Decision Engine** — SQLite-based person/credential/rule evaluation matching real firmware
- **Device Provisioning** — Both Bootstrap and QR provisioning flows
- **Metrics** — Prometheus-compatible metrics at `/metrics`

## Running

```bash
# Docker (recommended) — starts with 0 devices by default
cd simulator
docker compose up -d

# Local
pip install -e .
python -m dm3_simulator run --broker mqtt://localhost:1884 --devices 0
```

**Important:** Simulator starts with **zero devices** by default. All devices must be created via the dashboard or API and go through proper provisioning (Bootstrap or QR) before they can connect to MQTT.

## Provisioning Simulation

### Bootstrap Flow

1. Create unprovisioned device via dashboard "➕ New Device" or API
2. Click "🔗 Bootstrap" on device card (or `POST /api/devices/{id}/bootstrap`)
3. Device connects to EMQX with bootstrap credentials (`bootstrap:{RID}` + HMAC)
4. Device publishes registration to `dm/bootstrap/register`
5. Backend validates HMAC, creates pending record
6. Device status → `pending_approval`
7. Click "✅ Approve" on dashboard (calls backend `/api/v1/devices/pending/{id}/approve`)
8. Backend publishes credentials to `dm/bootstrap/{RID}/response`
9. Device receives credentials, disconnects bootstrap, reconnects as provisioned device
10. Device status → `provisioned` → `ready`

### QR Activation Flow

1. Pre-create device on backend: `POST http://localhost:8002/api/v1/devices/provision`
2. Copy the `qr_token` from response
3. Create unprovisioned device in simulator dashboard
4. Click "📱 QR Activate", paste token
5. Simulator calls backend `/api/v1/devices/activate` with token + hardware fingerprint
6. Backend validates token, returns MQTT credentials
7. Device connects and begins normal operation

## API Reference

### Device Management

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/devices` | List all virtual devices |
| GET | `/api/devices/{id}` | Get device status |
| POST | `/api/devices/{id}/trigger` | Trigger access event |
| POST | `/api/devices/{id}/start` | Start stopped device |
| POST | `/api/devices/{id}/stop` | Stop device |
| POST | `/api/devices/{id}/network/disconnect` | Simulate network loss |
| POST | `/api/devices/{id}/network/reconnect` | Restore network |
| POST | `/api/devices/{id}/auto-trigger` | Toggle auto event generation |

### Provisioning

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/devices/new` | Create new unprovisioned device |
| POST | `/api/devices/{id}/bootstrap` | Start bootstrap flow |
| POST | `/api/devices/{id}/activate` | QR activation (pass `qr_token`) |
| POST | `/api/simulate/activate` | Shortcut: create + QR activate |
| POST | `/api/simulate/bootstrap` | Shortcut: create + bootstrap |

### Simulation Control

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/status` | Overall status |
| GET | `/api/stats` | Detailed metrics |
| POST | `/api/simulation/start` | Create N unprovisioned devices (batch) |
| POST | `/api/simulation/stop` | Stop all devices |
| GET | `/api/events/recent` | Recent event feed |

> **Note:** `POST /api/simulation/start` creates unprovisioned devices with sequential 6-digit IDs (000001, 000002, ...). Devices must go through Bootstrap or QR provisioning before connecting to MQTT. This is the same as clicking "➕ Create Devices" on the dashboard.

### Device Inspection

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/devices/{id}/config` | Device config & sync state |
| GET | `/api/devices/{id}/persons` | Local person DB |
| GET | `/api/devices/{id}/credentials` | Local credentials |
| GET | `/api/devices/{id}/rules` | Access rules |
| GET | `/api/devices/{id}/events-queue` | Offline event queue |

## Dashboard Features

- **Header** — Device count, online count, events/s, simulation status, "➕ New Device" button
- **Configuration Panel** — Broker URL, device count, mode, event rate, "➕ Create Devices" / "⏹ Stop All"
- **Device Grid** — All devices with state, provisioning status, network status, action buttons (Bootstrap/QR on unprovisioned devices)
- **Provisioning Badges** — Color-coded: unprovisioned (gray), registering (blue), pending (yellow), approved (green), rejected (red)
- **Provisioning Actions** — Bootstrap, QR Activate, Approve, Reject buttons contextual to device state
- **Metrics Panel** — Throughput, access decisions, latency, offline/sync stats
- **Event Feed** — Real-time access event stream
- **Device Detail Modal** — Config, persons, credentials, rules, event queue tabs
- **Batch Operations** — Select multiple devices for bulk trigger/start/stop/disconnect

## Provisioning States

```
unprovisioned → registering → pending_approval → approved → provisioned → ready (online)
                                               → rejected
unprovisioned → registering (QR) → provisioned → ready (online)
```

All devices start as `unprovisioned` and must go through Bootstrap or QR flow. No devices are auto-created or pre-provisioned — this ensures testing reflects real-world provisioning behavior.
