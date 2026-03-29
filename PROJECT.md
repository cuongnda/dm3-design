# DM3 — Duall Master 3.0

## Overview
Next-gen access control & smart building platform. Codename: DM3.

## Architecture
- **Three Domains:** SECURE / MANAGE / OPERATE + SMART + PLATFORM
- **Multi-tenancy:** Company = Tenant, two-step login
- **Device Provisioning:** QR flow (pre-authorized) + Bootstrap flow (self-register)

## Stack
- **Backend:** Go monorepo (4 services: device-gateway:8002, access-svc:8003, identity-svc:8004, auth-svc:8005)
- **DB:** TimescaleDB port 5433 (dm3/dm3secret), 7 migrations
- **Infra:** EMQX(:1884), NATS(:4222), Valkey(:6379), MinIO(:9002), Simulator(:9090)
- **Webapp:** Vite + React 18 + TS + Tailwind + shadcn/ui + React Router v7 + Zustand + TanStack Query
- **Mobile:** Flutter (Admin + Resident apps)
- **Android Terminal:** Kotlin + Compose, 15 screens, MQTT live
- **Theme:** Dark-first cyber (deep navy #0B1120, electric blue accents)

## Key Paths
- Backend: `backend/`
- Webapp: `webapp/` (24 pages + System Admin UI)
- Simulator: `simulator/` (Python asyncio, Docker)
- Terminal: `dm3-terminal/` (Kotlin + Compose)
- Docs: `docs/` (Vision, specs/, architecture/, design/)
- Feature Specs: `docs/specs/` (25+ docs, single source of truth)
- Mockups: `mockups/` (webapp, mobile, terminal, guard-station)

## Credentials
- System admin: sysadmin@duali.com / sysadmin123
- Company admin: admin@duali.com / admin123 (Duali Demo)
- Domain colors: SECURE=#3B82F6, MANAGE=#8B5CF6, OPERATE=#F59E0B, SMART=#06B6D4, PLATFORM=#6B7280

## Device
- DF-970: ADB c5802c96950d5246, Android 12, RK3568, 480×800
- Docker: EMQX on port 1884 (not 1883 — Roombox RabbitMQ conflict)

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
- Brand name: "Duall Master" (not Duali, not DMPW)
- Users can belong to multiple companies (user_companies junction table)
- 7-day grace period for expired JWT refresh (offline devices)
