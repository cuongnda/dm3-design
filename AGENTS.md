# AGENTS.md — DM3 Project Guide for AI Assistants

## Project: Duall Master 3.0
**Brand:** Duall Master (not "Duali", not "DMPW")
**Codename:** DM3
**Company:** Duali Vietnam

## Quick Start
1. Read `docs/VISION.md` — understand the product
2. Read `docs/README.md` — navigate the docs
3. Check `docs/changelog/` — understand recent decisions

## Architecture Principles (CRITICAL)
- **Offline-first**: Devices make access decisions LOCALLY. Never send credentials to server for decisions.
- **Server role**: Sync rules/user DB to devices + aggregate event logs for analytics
- **Three Domains**: SECURE (blue #3B82F6) / MANAGE (purple #8B5CF6) / OPERATE (amber #F59E0B)
- **Cross-cutting**: SMART (cyan #06B6D4) / PLATFORM (gray #6B7280)

## Project Structure
```
dm3/
├── AGENTS.md           # You are here
├── docs/               # 📖 Single source of truth for all documentation
│   ├── VISION.md       # 🎯 North star — read first
│   ├── README.md       # Doc structure & guidelines
│   ├── architecture/   # System design, MQTT protocol, tech stack
│   ├── design/         # Design system (dark theme, components)
│   ├── ux/             # UX specs per platform (webapp, mobile, terminal, guard)
│   ├── marketing/      # Website copy, SEO strategy
│   ├── research/       # Reference material (not source of truth)
│   └── changelog/      # Major decision history
├── webapp/             # 🖥️ React web dashboard (Vite + React 18 + TS + Tailwind + shadcn/ui)
├── mockups/            # 📸 HTML mockups & screenshots
└── diagrams/           # 📊 Architecture diagrams (draw.io)
```

## Tech Stack
- **Web App**: Vite + React 18 + TypeScript + Tailwind CSS 4 + shadcn/ui + Zustand + TanStack Query
- **Backend** (planned): Go (core) + Python/FastAPI (AI services)
- **Mobile** (planned): Flutter
- **IoT Protocol**: MQTT 5.0 via EMQX (offline-first, see docs/architecture/mqtt-protocol.md)
- **Theme**: Dark-first (#0A0E1A bg), cyber security aesthetic

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

## Kanban
Tasks are tracked in the kanban board at http://localhost:8080
- Project: `dm3-webapp`
- Always create kanban tasks before starting work
- Log time spent and token usage on completion
