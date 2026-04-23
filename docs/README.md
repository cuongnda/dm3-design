# Duall Master 3.0 — Documentation

> Single source of truth for all DM3 project documentation.

## 📋 Structure

```
docs/
├── VISION.md                          # 🎯 Product vision & strategy (start here)
├── README.md                          # This file
│
├── architecture/                      # How the system is built
│   ├── system-architecture.md         # Services, data flow, deployment
│   ├── mqtt-protocol.md               # IoT device ↔ server protocol (offline-first)
│   └── tech-stack.md                  # Technology choices & rationale
│
├── design/                            # How it looks
│   └── design-system.md               # Colors, typography, components, themes
│
├── ux/                                # How it works (user experience)
│   ├── webapp-ux.md                   # Web dashboard — all screens & flows
│   ├── mobile-ux.md                   # Admin + Resident mobile apps
│   ├── terminal-ux.md                 # Visitor & attendance kiosk
│   └── guard-station-ux.md            # Security operations center
│
├── marketing/                         # How we sell it
│   ├── website-copy.md                # Marketing website content (15 pages)
│   └── seo-content-strategy.md        # SEO & content marketing plan
│
├── research/                          # Reference material (not source of truth)
│   ├── competitor-analysis.md         # Genetec, Gallagher, Verkada, etc.
│   ├── tech-stack-research.md         # Raw research before decisions
│   ├── materials-plan.md              # Original materials planning
│   └── webapp-tasks-archive.md        # Task breakdown (now in kanban)
│
├── implementation/                    # Customer rollout, delivery, and licensing docs
│   ├── README.md                      # Index for deployment and licensing docs
│   ├── customer-deployment/           # Installation package templates and runbooks
│   └── licensing/                     # Commercial and technical license design
│
└── changelog/                         # Decision history & major changes
    └── 2026-02-19-offline-first.md    # Architecture shift to offline-first
```

## 🔑 Key Principles

1. **VISION.md is the north star** — all other docs must be consistent with it
2. **One source of truth** — don't duplicate info across docs, cross-reference instead
3. **Changelog for big decisions** — when we change direction (like offline-first), log it in `changelog/` so we have context for why

## 🏗️ Architecture Overview

**Three Domains:** SECURE (blue) / MANAGE (purple) / OPERATE (amber)
**Cross-cutting:** SMART (cyan) / PLATFORM (gray)
**Core principle:** Offline-first — devices decide locally, server syncs & aggregates

## 🚀 Implementation docs

For customer deployment packaging and licensing, start here:
- `docs/implementation/README.md`
- `docs/implementation/customer-deployment/README.md`
- `docs/implementation/licensing/license-framework.md`
- `docs/implementation/licensing/license-technical-design.md`

## 📝 How to Update

- Edit the source doc directly
- For major architectural changes, create a changelog entry in `changelog/YYYY-MM-DD-description.md`
- Keep VISION.md updated when strategy shifts
- Update `IMPLEMENTATION_STATUS.md` when features are built or specifications change
- Run `scripts/docs-health-check.sh` after significant changes to verify consistency

## 🔧 Documentation Maintenance

### Health Check Script
Run `scripts/docs-health-check.sh` to verify:
- Migration count matches PROJECT.md
- Referenced paths exist
- Port assignments are consistent
- Apps are documented
- Changelog has recent entries
- Implementation status is current

**Recommended schedule:**
- After major changes or releases
- Weekly via automation
- Before important presentations or demos

### Changelog Guidelines
Create changelog entries for:
- Major architecture decisions (like frontend fork strategy)
- Significant feature implementations (like WebSocket integration)  
- Technology stack changes
- Infrastructure modifications
- API breaking changes

### Implementation Status
Keep `docs/IMPLEMENTATION_STATUS.md` updated with:
- ✅ **Implemented**: Features with working code
- 📋 **Specified**: Features with detailed specs but no code yet  
- 🔮 **Vision Only**: High-level ideas without specifications

This helps stakeholders understand project progress and what's ready for development.
