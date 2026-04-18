# Monorepo Restructure: From webapp/ to apps/console + packages/

**Date:** 2026-03-20 (approximate)  
**Type:** Infrastructure Change  
**Impact:** Major  

## Change

Restructured the frontend codebase from a single `webapp/` directory to a monorepo architecture with shared packages and multiple applications.

## Before

```
dm3/
├── backend/
├── webapp/          ← Single React application
├── simulator/
└── docs/
```

## After

```
dm3/
├── backend/
├── apps/
│   └── console/     ← Main React application (formerly webapp/)
├── packages/
│   ├── ui/          ← Shared UI components
│   └── api-client/  ← API client + WebSocket integration
├── simulator/
└── docs/
```

## Rationale

1. **Prepare for vertical specialization** - Different customer verticals (school, factory, apartment) will need customized frontends
2. **Shared component reuse** - Common UI elements extracted to `packages/ui`
3. **Unified API access** - Centralized API client with WebSocket integration in `packages/api-client`
4. **Scalable architecture** - Easy to add new applications while maintaining shared infrastructure
5. **Modern monorepo patterns** - Following industry best practices for multi-application repositories

## Technical Changes

### New Package Structure
- **`packages/ui/`**: Shared UI components built on shadcn/ui
  - Button, Card, Dialog, Form components
  - Theme configuration and utilities
  - Tailwind CSS presets
  
- **`packages/api-client/`**: Unified API access layer
  - OpenAPI-generated TypeScript client
  - WebSocket connection management
  - Realtime store (Zustand) for live data
  - React hooks for easy component integration

### Application Changes
- **`apps/console/`**: Renamed from `webapp/`, now imports from shared packages
  - All existing functionality preserved
  - Updated imports to use `@dm3/ui` and `@dm3/api-client`
  - Enhanced with real-time features via WebSocket integration

## Benefits Achieved

1. **Code reusability** - UI components and API logic shared across applications
2. **Consistent design system** - Unified component library ensures design consistency
3. **Simplified WebSocket integration** - Centralized real-time data management
4. **Better separation of concerns** - Clear boundaries between UI, API, and application logic
5. **Future-ready** - Ready for vertical-specific applications (school, factory, apartment)

## Migration Impact

- **No breaking changes** to existing functionality
- **All 24 pages + System Admin UI** preserved and functional
- **Enhanced real-time capabilities** through WebSocket integration
- **Build process updated** to support monorepo structure with Turbo

## Developer Experience

- **Faster builds** with Turbo caching and parallel processing
- **Hot reload** works across packages during development
- **Type safety** maintained across package boundaries
- **Easy package management** with workspace dependencies

This restructure lays the foundation for DM3's expansion into multiple customer verticals while maintaining code quality and development velocity.