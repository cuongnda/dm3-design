# DM3 — Duall Master 3.0

## Overview
Next-gen access control & smart building platform. Codename: DM3.

## Quick Start (Dev)

### Prerequisites
- **Node.js** ≥ 20.19 (check: `node -v`)
- **Go** ≥ 1.22
- **Docker** + Docker Compose

### 1. Start Infrastructure
```bash
cd ~/db   # or wherever your docker-compose file is
docker compose up -d postgres-db-timescale nats emqx valkey minio
```

Required services:
- TimescaleDB `:5433`
- NATS + JetStream `:4222`
- EMQX MQTT `:1884` (Dashboard: `http://localhost:18083`, login: admin/public)
- Valkey `:6380`
- MinIO `:9002` (Console: `http://localhost:9003`)

### 2. Start Backend (VSCode)
Open project in VSCode → Run & Debug → select **"All Backend Services"** → F5

Or run individual services:
- Audit Service (`:8001`)
- Device Gateway (`:8002`)
- Access Service (`:8003`)
- Identity Service (`:8004`)
- Auth Service (`:8005`)

### 3. Start Frontend
```bash
cd duall-master

# First time or when native module errors occur:
rm -rf node_modules apps/console/node_modules package-lock.json
npm cache clean --force
npm install --force

# Run dev server:
npm run dev
```
Console available at **http://localhost:3000**

### Test Accounts
| Role | Email | Password |
|------|-------|----------|
| System Admin | sysadmin@duali.com | sysadmin123 |
| Company Admin | admin@duali.com | admin123 |

### ⚠️ Troubleshooting
- **NATS stream timeout** → NATS not running or JetStream not enabled (`--jetstream` flag)
- **MQTT connection refused** → EMQX not started, check port 1884
- **rollup/lightningcss native module error** → Delete node_modules + package-lock.json, run `npm install --force`
- **Node version warning** → Requires Node ≥ 20.19: `nvm install 20 && nvm use 20`

## Architecture
- **Three Domains:** SECURE / MANAGE / OPERATE + SMART + PLATFORM
- **Multi-tenancy:** Company = Tenant, two-step login
- **Device Provisioning:** QR flow (pre-authorized) + Bootstrap flow (self-register)

## Stack
- **Backend:** Go monorepo (5 services: audit-svc:8001, device-gateway:8002, access-svc:8003, identity-svc:8004, auth-svc:8005)
- **DB:** TimescaleDB port 5433 (`dm3` / `dm3secret`)
- **Infra:** EMQX(:1884), NATS(:4222), Valkey(:6380), MinIO(:9002), Simulator(:9090)
- **Webapp:** Vite + React 18 + TS + Tailwind + shadcn/ui + React Router v7 + Zustand + TanStack Query
- **Mobile:** Flutter (Admin + Resident apps)
- **Android Terminal:** Kotlin + Compose, 15 screens, MQTT live
- **Theme:** Dark-first cyber (deep navy #0B1120, electric blue accents)

## Port Map

### Backend Services
| Service | Port | Description |
|---------|------|-------------|
| audit-svc | 8001 | Immutable audit trail, event consumer |
| device-gateway | 8002 | MQTT bridge, device provisioning |
| access-svc | 8003 | Access rules, schedules, logs |
| identity-svc | 8004 | Users, companies, profiles |
| auth-svc | 8005 | JWT auth, login, token refresh |

### Infrastructure
| Service | Port | Description |
|---------|------|-------------|
| PostgreSQL | 5432 | Main DB |
| TimescaleDB | 5433 | Time-series DB (dm3) |
| NATS + JetStream | 4222 | Event streaming |
| NATS Monitor | 8222 | NATS dashboard |
| EMQX (MQTT) | 1884 | Device MQTT broker |
| EMQX Dashboard | 18083 | EMQX management UI (admin/public) |
| Valkey | 6380 | Cache / session store |
| MinIO | 9002 | Object storage |
| RabbitMQ | 5672 | Legacy messaging |
| RabbitMQ UI | 15672 | Management console |

### Frontend
| App | Port | Description |
|-----|------|-------------|
| Console (Vite) | 3000 | Webapp dev server |
| Simulator | 9090 | Python device simulator |

## Key Paths
- Backend: `backend/`
- Console: `apps/console/` (React + TS + Tailwind, 24 pages + System Admin UI)
- Shared UI: `packages/ui/` (shadcn/ui components, reusable across verticals)
- API Client: `packages/api-client/` (OpenAPI-generated client + WebSocket + realtime store)
- Automation: `automation/` (pytest + Playwright)
- Simulator: `simulator/` (Python asyncio, Docker)
- Terminal: `dm3-terminal/` (Kotlin + Compose)
- Docs: `docs/` (Vision, specs/, architecture/, design/)
- Feature Specs: `docs/specs/` (29 specs, single source of truth)
- Mockups: `mockups/` (webapp, mobile, terminal, guard-station)

## Automation Tests
```
automation/
├── tests/api/          ← Backend API tests (pytest + requests)
├── tests/web/          ← Frontend UI tests (pytest + Playwright)
├── data/web/           ← JSON test case data (data-driven)
├── common/             ← Shared: api_client, web_executor, constants
├── docs/               ← DATA_TESTID_CONVENTION.md
└── conftest.py         ← Shared fixtures
```

### data-testid Convention (mandatory for all FE elements)
Format: `{module}-{element}-{name}`
- Modules: `login`, `sys`, `company`, `user`, `device`, `identity`, `access`, `settings`
- Elements: `input`, `button`, `select`, `table`, `row`, `card`, `modal`, `badge`, `link`
- Examples: `login-input-email`, `company-button-create`, `sys-card-companies`
- Full guide: `automation/docs/DATA_TESTID_CONVENTION.md`

**Rule:** Every new/modified FE interactive element MUST have a `data-testid` attribute.

## Credentials
- System admin: sysadmin@duali.com / sysadmin123
- Company admin: admin@duali.com / admin123 (Duali Demo)
- Domain colors: SECURE=#3B82F6, MANAGE=#8B5CF6, OPERATE=#F59E0B, SMART=#06B6D4, PLATFORM=#6B7280

## Device
- DF-970: ADB c5802c96950d5246, Android 12, RK3568, 480×800
- Docker: EMQX on port 1884 (not 1883 — host RabbitMQ conflict)

## Frontend Architecture: Shared Core + Fork per Vertical (Decision 2026-03-29)

**Strategy:** General platform backend + domain-specific frontend per customer vertical.

```
dm3/
├── packages/
│   ├── ui/            ← Shared UI components (shadcn + custom), all apps import from @dm3/ui
│   └── api-client/    ← Generated from OpenAPI spec, shared types + hooks
├── apps/
│   ├── console/       ← "Master" app with ALL modules (reference implementation)
│   ├── school/        ← Fork: attendance + identity heavy, terminology: Student/Parent
│   ├── factory/       ← Fork: attendance + maintenance heavy, shift management
│   └── apartment/     ← Fork: visitor + parking + intercom, resident portal
├── backend/           ← 1 backend, NEVER fork. Feature flags per tenant.
└── simulator/
```

**Rules:**
- Backend = 1 codebase, feature flags per tenant via `modules[]` + `vertical` in company config
- `@dm3/ui` and `@dm3/api-client` = shared packages, all apps depend on these
- Vertical apps = fork from console/, customize freely (pages, layout, flows, terminology)
- AI agents can fork + customize a vertical in 1-2 days
- When fixing shared components → fix in packages/, all verticals get update
- When fixing vertical-specific UI → fix in that app only

**Rationale:** In the AI coding era, fork + customize is cheaper than maintaining complex abstractions. Backend stays unified (DB/MQTT/security too complex to fork). Frontend is visual — each vertical just needs different pages/flows.

## Patterns & Gotchas
- E2E pipeline: Simulator → EMQX → gateway → NATS → access-svc → TimescaleDB
- Zone indoor map uploads are now stored in MinIO bucket `dm3` and served back through access-svc `/assets/...` routes. Keep the tenant-scoped key contract under `tenants/{tenant_id}/access/zones/{zone_id}/map.{ext}`.
- Spatial zones are now the canonical location and map owner for access control. The console uses a tree-first zone explorer, then a zone detail page with list and map views over the same zone-scoped access points.
- DM3 uses a shared objectstore abstraction across access-svc, identity-svc, and device-gateway. Runtime defaults currently point all managed assets at the shared `dm3` bucket with tenant-prefixed object keys.
- Brand name: "Duall Master" (not Duali, not DMPW)
- Users can belong to multiple companies (user_companies junction table)
- 7-day grace period for expired JWT refresh (offline devices)
