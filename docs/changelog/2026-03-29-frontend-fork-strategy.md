# Frontend Fork Strategy: Shared Core + Fork per Vertical

**Date:** 2026-03-29  
**Type:** Architecture Decision  
**Impact:** Major  

## Decision

Adopted a "Shared Core + Fork per Vertical" frontend architecture for DM3, allowing domain-specific frontend customization while maintaining unified backend infrastructure.

## Context

As DM3 expands to serve different customer verticals (schools, factories, apartments), each segment needs:
- Different terminology (Student/Parent vs Worker vs Resident)
- Different workflows (attendance-heavy vs maintenance-focused vs visitor-centric)
- Different UI layouts and page priorities
- Vertical-specific branding and themes

## Architecture

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

## Rules

1. **Backend = 1 codebase**, feature flags per tenant via `modules[]` + `vertical` in company config
2. **`@dm3/ui` and `@dm3/api-client`** = shared packages, all apps depend on these
3. **Vertical apps** = fork from console/, customize freely (pages, layout, flows, terminology)
4. **AI agents can fork + customize** a vertical in 1-2 days
5. **When fixing shared components** → fix in packages/, all verticals get update
6. **When fixing vertical-specific UI** → fix in that app only

## Rationale

In the AI coding era, **fork + customize is cheaper than maintaining complex abstractions**. 

- **Backend stays unified** (DB/MQTT/security too complex to fork)
- **Frontend is visual** — each vertical just needs different pages/flows
- **Shared packages** ensure consistency where it matters (UI components, API client)
- **Fork flexibility** allows rapid customization without breaking other verticals

## Implementation Status

- ✅ Monorepo structure established with `apps/` and `packages/`
- ✅ `packages/ui` with shared shadcn/ui components
- ✅ `packages/api-client` with OpenAPI-generated client + WebSocket integration
- ✅ `apps/console` as reference implementation with all 29 feature specs
- 🔄 Vertical apps (school, factory, apartment) to be created as needed

## Benefits

1. **Rapid vertical customization** without technical debt
2. **Consistent core functionality** via shared packages
3. **Independent deployment** per vertical
4. **AI-assisted development** can fork and adapt quickly
5. **Unified backend** reduces operational complexity
6. **Scalable architecture** as we add more verticals

## Migration

No breaking changes to existing `apps/console/` implementation. This decision establishes the framework for future vertical expansion.