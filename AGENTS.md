# AGENTS.md — DM3 Project Guide for AI Assistants

## Project: Duall Master 3.0
**Brand:** Duall Master (not "Duali", not "DMPW")
**Codename:** DM3
**Company:** Duali Vietnam

## Quick Start
1. Read `docs/VISION.md` — understand the product
2. Read `docs/README.md` — navigate the docs
3. Read `docs/IMPLEMENTATION_STATUS.md` — ⚠️ understand what is real vs mock data before any feature work
4. Check `docs/changelog/` — understand recent decisions

## Architecture Principles (CRITICAL)
- **Offline-first**: Devices make access decisions LOCALLY. Never send credentials to server for decisions.
- **Server role**: Sync rules/user DB to devices + aggregate event logs for analytics
- **Three Domains**: SECURE (blue #3B82F6) / MANAGE (purple #8B5CF6) / OPERATE (amber #F59E0B)
- **Cross-cutting**: SMART (cyan #06B6D4) / PLATFORM (gray #6B7280)

## Project Structure
```
dm3/
├── AGENTS.md           # You are here
├── CLAUDE.md           # Claude Code specific guidance (commands, architecture detail)
├── docs/               # 📖 Single source of truth for all documentation
│   ├── VISION.md                  # 🎯 North star — read first
│   ├── IMPLEMENTATION_STATUS.md   # ⚠️ What is real vs mock data
│   ├── README.md                  # Doc structure & guidelines
│   ├── architecture/              # System design, MQTT protocol, tech stack
│   ├── specs/                     # 29 feature specs (authoritative for behaviour)
│   ├── design/                    # Design system (dark theme, components)
│   ├── ux/                        # UX specs per platform (webapp, mobile, terminal, guard)
│   ├── marketing/                 # Website copy, SEO strategy
│   ├── research/                  # Reference material (not source of truth)
│   └── changelog/                 # Major decision history
├── apps/               # 🖥️ Frontend — Turborepo workspaces
│   ├── console/        # Master app — all modules (reference implementation)
│   ├── school/         # Vertical: attendance + identity
│   ├── factory/        # Vertical: attendance + maintenance
│   └── apartment/      # Vertical: visitor + parking + intercom
├── packages/           # Shared frontend packages
│   ├── ui/             # @dm3/ui — shadcn/ui components + custom
│   └── api-client/     # @dm3/api-client — OpenAPI client + WebSocket + Zustand store
├── backend/            # 🔧 Go monorepo — 5 services (auth, identity, access, device-gateway, audit)
└── diagrams/           # 📊 Architecture diagrams (draw.io)
```

## Tech Stack
- **Frontend**: Vite + React 19 + TypeScript + Tailwind CSS 4 + shadcn/ui + React Router v7 + Zustand 5 + TanStack Query 5 + i18next
- **Backend**: Go 1.22 — 5 services (auth-svc :8005, identity-svc :8004, access-svc :8003, device-gateway :8002, audit-svc :8001)
- **Database**: TimescaleDB :5433 (`dm3` db, schemas: dm3_auth, dm3_devices, dm3_access, dm3_identity, dm3_audit, dm3_operate)
- **Messaging**: NATS JetStream :4222, EMQX MQTT :1884
- **Mobile** (planned): Flutter
- **IoT Protocol**: MQTT 5.0 via EMQX (offline-first, see docs/architecture/mqtt-protocol.md)
- **Theme**: Dark-first (#0B1120 bg), cyber security aesthetic

## Implementation Reality (read before coding)
Most frontend features are **mock-data-only UI shells**. Only these pages connect to real backend APIs:
- DashboardPage, DeviceDetailPage, IdentitiesPage, PersonDetailPage, GroupsPage, SystemSettingsPage, VisitorsPage

All OPERATE, SMART, and most SECURE/MANAGE pages import from `mock-data` files.
See `docs/IMPLEMENTATION_STATUS.md` for the full compliance table.

## Design Guidelines
- Clean, minimal (Stripe/Linear/Notion style)
- No heavy gradients — white cards with colored TEXT only
- Compact, data-dense layouts
- Domain colors for accents (see above)
- Vietnamese sample data in mocks

## Documentation Rules
1. **docs/ is the single source of truth** — don't create separate doc files elsewhere
2. **For major changes** (architecture shifts, strategy pivots) → add entry in `docs/changelog/`
3. **Cross-reference, don't duplicate** — if info exists in one doc, link to it from others
4. **VISION.md is the north star** — all docs must be consistent with it

## Git Conventions
- Never `git push --no-verify`
- Never push without explicit permission from the project owner
- Commit locally, push when told
- Use conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`
