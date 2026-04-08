# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Duall Master 3.0 (DM3)** — access control & smart building platform by Duali Vietnam.  
Brand name is always **"Duall Master"** (not "Duali", not "DMPW").

## Commands

### Frontend (Turborepo / npm workspaces)

```bash
npm run dev          # start all apps in dev mode
npm run build        # build all apps
npm run lint         # lint all packages
```

Run a single app:
```bash
cd apps/console && npm run dev      # Console at http://localhost:3000
```

E2E tests (Playwright):
```bash
cd apps/console
npm run test:e2e
npm run test:e2e:ui   # interactive UI mode
```

### Backend (Go — run from `backend/`)

```bash
make build            # build all 4 binaries → bin/
make test             # go test ./... -v -race
make lint             # golangci-lint run ./...
make migrate          # apply DB migrations (TimescaleDB :5433)
make seed             # seed test data
```

Run a single service:
```bash
go run ./cmd/auth-svc/
go run ./cmd/identity-svc/
go run ./cmd/access-svc/
go run ./cmd/device-gateway/
```

Run a single test file:
```bash
go test ./internal/authsvc/... -v -run TestName
```

### Infrastructure

```bash
docker compose -f docker-compose.local.yml up -d postgres-db-timescale nats emqx
```

Required services: TimescaleDB `:5433`, NATS+JetStream `:4222`, EMQX MQTT `:1884`.

### Automation tests (pytest)

```bash
cd automation
pytest tests/api/          # backend API tests
pytest tests/web/          # Playwright UI tests
```

## Architecture

### Backend — Go monorepo (`backend/`)

Four services, all in one Go module (`github.com/duali/dm3-backend`):

| Service | Port | Entry point | Responsibility |
|---|---|---|---|
| `auth-svc` | 8005 | `cmd/auth-svc/` | JWT auth, login, token refresh |
| `identity-svc` | 8004 | `cmd/identity-svc/` | Users, companies, profiles |
| `access-svc` | 8003 | `cmd/access-svc/` | Access rules, schedules, event logs |
| `device-gateway` | 8002 | `cmd/device-gateway/` | MQTT bridge, device provisioning, WebSocket |

**Key internal packages:**
- `internal/config/` — shared `Config` struct, loaded from env vars (defaults to dev values)
- `internal/models/` — shared domain structs: `access.go`, `device.go`, `event.go`, `person.go`
- `internal/middleware/` — JWT auth middleware (`auth.go`), CORS, logging
- `internal/authsvc/`, `internal/access/`, `internal/identity/`, `internal/gateway/` — per-service handlers
- `pkg/db/` — pgx connection pool, migrations
- `pkg/audit/` — async audit logger (buffered channel → batch INSERT into `dm3_audit.audit_logs`)
- `pkg/natsutil/`, `pkg/mqtt/` — NATS JetStream and MQTT helpers
- `internal/audit/` — audit log query API (list, filter, export CSV, stats)

**Event flow:** Simulator → EMQX (MQTT :1884) → `device-gateway` → NATS JetStream → `access-svc` → TimescaleDB

**Key design decisions:**
- **Offline-first**: devices make access decisions locally; server syncs rules/credentials to devices and aggregates logs
- **Multi-tenancy**: company = tenant; `tenant_id` on all tenant-scoped tables; two-step login (company code → credentials)
- NATS subjects carry `tenant_id` — extract it from subject, not just payload (see `internal/access/nats_consumer.go`)
- 7-day grace period for expired JWT refresh tokens (to support offline devices)
- **Audit trail**: every CREATE/UPDATE/DELETE and auth event is logged to `dm3_audit.audit_logs` (TimescaleDB hypertable). Async writes via `pkg/audit.Logger` (buffered channel, batch INSERT). The table is INSERT+SELECT only (no UPDATE/DELETE by application user). Retention: 2 years, compression after 30 days. Query API at `/api/v1/audit/` (system admin) and `/api/v1/audit/tenant/` (tenant-scoped).

### Frontend — Turborepo (`apps/` + `packages/`)

```
packages/
  ui/           # @dm3/ui — shadcn/ui components + custom, shared by all apps
  api-client/   # @dm3/api-client — OpenAPI-generated client, WebSocket, realtime Zustand store

apps/
  console/      # Master app with ALL modules (reference implementation, 24+ pages)
  school/       # Fork: attendance + identity, terminology Student/Parent
  factory/      # Fork: attendance + maintenance, shift management
  apartment/    # Fork: visitor + parking + intercom, resident portal
```

**Strategy:** One backend, N frontend verticals. Fix shared logic in `packages/`; fix vertical-specific UI in the app only. New verticals fork from `console/`.

**Console stack:** Vite + React 19 + TypeScript + Tailwind CSS 4 + shadcn/ui + React Router v7 + Zustand 5 + TanStack Query 5 + i18next.

**Theme:** Dark-first, cyber security aesthetic — deep navy `#0B1120` background, electric blue accents.  
Domain colors: SECURE `#3B82F6` · MANAGE `#8B5CF6` · OPERATE `#F59E0B` · SMART `#06B6D4` · PLATFORM `#6B7280`.

### Database

TimescaleDB on port `5433`, database `dm3`, user `dm3`, password `dm3secret`.  
Schema is split into namespaced schemas: `dm3_auth`, `dm3_devices`, `dm3_access`, `dm3_identity`.  
Single migration file: `backend/pkg/db/migrations/001_initial.sql`.

## Frontend Conventions

- Every interactive UI element **must** have `data-testid` in format `{module}-{element}-{name}`.
  - Modules: `login`, `sys`, `company`, `user`, `device`, `identity`, `access`, `settings`
  - Elements: `input`, `button`, `select`, `table`, `row`, `card`, `modal`, `badge`, `link`
  - Example: `login-input-email`, `company-button-create`
- Full guide: `automation/docs/DATA_TESTID_CONVENTION.md`

## Docs & Specs

- `docs/` is the single source of truth — do not create doc files elsewhere
- `AGENTS.md` — AI assistant quick-start guide (read alongside this file)

**Before implementing any feature:** read `docs/IMPLEMENTATION_STATUS.md` first.  
Most OPERATE, SMART, and SECURE frontend pages are mock-data-only shells with no real backend APIs.
Only a handful of pages (Dashboard, Devices, Identities, System Settings) connect to live backend endpoints.

| Directory | Purpose |
|---|---|
| `docs/IMPLEMENTATION_STATUS.md` | ⚠️ What is real vs mock data — check before every feature task |
| `docs/VISION.md` | Product north star |
| `docs/architecture/` | System design, MQTT protocol, tech stack decisions |
| `docs/specs/` | 29 feature specs (authoritative for feature behaviour) |
| `docs/changelog/` | Major architecture decisions |
| `docs/design/` | Design system — colors, typography, components |
| `docs/ux/` | UX specs for webapp, mobile, terminal, guard station |
| `docs/CODE_CONVENTIONS.md` | Code style and conventions |
| `docs/research/` | Reference material (not source of truth) |
| `diagrams/er-diagram.drawio` | Current ER diagram (draw.io, use the app to view) |

## Git Conventions

- Conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`
- Never push without explicit permission from the project owner
- Never `git push --no-verify`

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- After modifying code files in this session, run `python3 -c "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path('.'))"` to keep the graph current
