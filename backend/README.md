# DM3 Backend

Go monorepo for the Duall Master 3.0 platform.

## Services

| Service | Port | Description |
|---------|------|-------------|
| device-gateway | 8002 | MQTT ↔ NATS bridge, device lifecycle |
| access-svc | 8003 | Access control rules + event processing |
| identity-svc | 8004 | Persons, credentials, groups |
| auth-svc | 8005 | JWT auth, two-step company login |

## Full Dev Environment

### 1. Start all infrastructure

```bash
cd backend/
docker compose up -d
```

This brings up:
- **TimescaleDB** (port 5433) — primary database, 7 migrations auto-applied
- **EMQX** (port 1884, dashboard 18083) — MQTT broker
- **NATS** (port 4222, monitor 8222) — event streaming with JetStream
- **Valkey** (port 6380) — cache / session store
- **MinIO** (port 9002, console 9003) — object storage
- **dm3-simulator** (port 9090) — 5 virtual devices on MQTT
- **seed-demo** — seeds 50 persons + credentials + access rules on first run

Wait ~15s for EMQX to be healthy before simulator devices connect.

### 2. Run migrations

```bash
make migrate
# or manually:
PGPASSWORD=dm3secret psql -h localhost -p 5433 -U dm3 -d dm3 \
  -f pkg/db/migrations/001_initial.sql \
  -f pkg/db/migrations/002_access_enhanced.sql \
  # ... through 007
```

> Note: The seed-demo container handles `008_seed_demo_data.sql` automatically.

### 3. Start Go services

```bash
# Build all
make build

# Run individually (each in its own terminal)
./bin/device-gateway
./bin/access-svc
./bin/identity-svc
./bin/auth-svc
```

Or run one at a time for development:
```bash
go run ./cmd/device-gateway/
go run ./cmd/access-svc/
go run ./cmd/identity-svc/
go run ./cmd/auth-svc/
```

### 4. Verify the pipeline

```bash
# 5 devices should be connected
curl http://localhost:9090/api/devices

# Gateway should see them online
curl http://localhost:8002/api/v1/devices

# Access events should be flowing
curl http://localhost:8003/api/v1/events?limit=10
```

### 5. Start the webapp

```bash
cd ../apps/console/
npm run dev    # http://localhost:5173
```

Login: `admin@duali.com` / `admin123` (Duali Demo company)

## Infrastructure Ports

| Service | External Port | Internal | Notes |
|---------|--------------|----------|-------|
| TimescaleDB | 5433 | 5432 | `dm3`/`dm3secret` |
| EMQX MQTT | 1884 | 1883 | Avoids Roombox conflict on 1883 |
| EMQX Dashboard | 18083 | 18083 | http://localhost:18083 |
| NATS | 4222 | 4222 | |
| NATS Monitor | 8222 | 8222 | http://localhost:8222 |
| Valkey | 6380 | 6379 | |
| MinIO API | 9002 | 9000 | `dm3admin`/`dm3secret123` |
| MinIO Console | 9003 | 9001 | http://localhost:9003 |
| Simulator API | 9090 | 9090 | http://localhost:9090/api/status |

## Demo Data (auto-seeded)

The `seed-demo` container runs `008_seed_demo_data.sql` on startup:

- **50 persons** — Vietnamese names, departments, employee IDs (DM-001…DM-050)
- **Credentials** — card + face for all, PIN for first 30 (~60%)
- **4 person groups** — All Staff, Engineering Team, VIP/Management, Security Team
- **4 access rules** — Main Door, Executive Floor (24/7), Engineering Lab, Security 24/7
- **Tenant ID** — `00000000-0000-0000-0000-000000000001` (Duali Demo)

All seeds use `ON CONFLICT DO NOTHING` — safe to restart compose.

## Simulator

The `dm3-simulator` starts 5 virtual devices that:
- Connect to EMQX via `mqtt://emqx:1883` (internal Docker network)
- Publish heartbeats and access events to MQTT topics
- Expose a REST API at `http://localhost:9090`
- Use device prefix `dm3-dev`, site ID `site-001`

```bash
# Check simulator status
curl http://localhost:9090/api/status

# List virtual devices
curl http://localhost:9090/api/devices

# Trigger a manual access event on device 1
curl -X POST http://localhost:9090/api/devices/dm3-dev-001/trigger
```

## E2E Pipeline

```
Simulator → EMQX (MQTT) → device-gateway → NATS → access-svc → TimescaleDB → webapp
```

## Teardown

```bash
docker compose down        # stop, keep volumes
docker compose down -v     # stop + wipe all data
```
