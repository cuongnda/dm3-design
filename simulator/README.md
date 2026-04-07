# DM3 Device Simulator

Asyncio-based access control device simulator for testing the Duall Master 3.0 system. Simulates virtual devices with MQTT communication, local SQLite databases, and offline-first access decision engines.

## Quick Start

```bash
# Docker Compose (simulator + Mosquitto broker)
docker-compose up

# Or install locally
pip install -e .
dm3-simulator run --devices 10 --broker mqtt://localhost:1883 --tenant-id tenant-001
```

## CLI Usage

```bash
# Run simulator with 10 devices
dm3-simulator run --devices 10 --broker mqtt://localhost:1883 --tenant-id tenant-001

# Stress test mode (max throughput)
dm3-simulator run --devices 100 --mode stress --broker mqtt://broker:1883 --tenant-id t-001

# Pre-seed databases with mock data
dm3-simulator seed --devices 10 --users 50 --output-dir /tmp/dm3-sim

# Full options
dm3-simulator run \
  --devices 100 \
  --broker mqtt://localhost:1883 \
  --tenant-id tenant-001 \
  --site-id site-001 \
  --device-prefix sim \
  --mode normal \
  --event-rate 1.0 \
  --users 50 \
  --db-mode memory \
  --api-port 9090 \
  --heartbeat-interval 30 \
  --log-level info
```

## Architecture

```
┌─────────────────────────────────────────┐
│           dm3-simulator process          │
│                                          │
│  ┌────────────┐  ┌────────────┐         │
│  │  Device 1   │  │  Device N   │  ...   │
│  │ ┌────────┐ │  │ ┌────────┐ │         │
│  │ │MQTT Clt│ │  │ │MQTT Clt│ │         │
│  │ ├────────┤ │  │ ├────────┤ │         │
│  │ │SQLite  │ │  │ │SQLite  │ │         │
│  │ ├────────┤ │  │ ├────────┤ │         │
│  │ │Access  │ │  │ │Access  │ │         │
│  │ │Engine  │ │  │ │Engine  │ │         │
│  │ └────────┘ │  │ └────────┘ │         │
│  └────────────┘  └────────────┘         │
│                                          │
│  ┌──────────────────────────────────┐   │
│  │  REST API (port 9090)             │   │
│  │  /status /devices /trigger /metrics│   │
│  └──────────────────────────────────┘   │
└─────────────────────────────────────────┘
         │ MQTT                    │ HTTP
         ▼                         ▼
   MQTT Broker              Prometheus
```

Each virtual device:
- Maintains its own MQTT connection with LWT
- Has an independent SQLite database (in-memory or file-backed)
- Runs the offline-first access decision engine (< 50ms decisions)
- Generates simulated access events at configurable rates
- Supports full/incremental sync protocol
- Queues events when offline, drains on reconnect

## Configuration

### Environment Variables

| Variable | Description |
|----------|-------------|
| `DM3_DEVICES` | Number of virtual devices |
| `DM3_TENANT_ID` | Tenant ID |
| `DM3_SITE_ID` | Site ID |
| `DM3_BROKER` | MQTT broker URL |
| `DM3_MODE` | Simulation mode (normal/stress/chaos) |
| `DM3_EVENT_RATE` | Events per second per device |
| `DM3_LOG_LEVEL` | Log level |
| `DM3_API_PORT` | REST API port |

### YAML Config

Pass `--config dm3-simulator.yaml` to load from file. See the spec for full YAML schema.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/status` | Overall simulation status |
| GET | `/api/devices` | List all virtual devices |
| GET | `/api/devices/{id}` | Single device detail |
| POST | `/api/devices/{id}/trigger` | Trigger access event |
| POST | `/trigger/event` | Trigger event (body: device_id) |
| GET | `/metrics` | Prometheus metrics |

## MQTT Topics

Each device subscribes to:
- `dm/{tenant_id}/device/{device_id}/cmd` (QoS 2)
- `dm/{tenant_id}/device/{device_id}/cfg` (QoS 2)
- `dm/{tenant_id}/emergency/broadcast` (QoS 2)

And publishes to:
- `dm/{tenant_id}/device/{device_id}/evt` (QoS 1) — access events
- `dm/{tenant_id}/device/{device_id}/sta` (QoS 0) — heartbeat
- `dm/{tenant_id}/device/{device_id}/cfg/ack` (QoS 2) — sync acks

## Testing

```bash
pip install -e ".[dev]"
python -m pytest tests/ -v
```

## Mock Data

The `seed` command generates:
- 50 users per device with Vietnamese names
- Card UIDs, face template hashes, optional PINs
- 5 access rules with different schedules and door assignments
