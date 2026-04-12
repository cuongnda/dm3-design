# Plugin Isolation Architecture

> Domain: OPERATE + SMART | Status: Active | Last updated: 2026-04-11

## Overview

DM3 uses a plugin architecture where features beyond core access control are implemented as optional plugins. Each plugin can be independently enabled/disabled per tenant at runtime. This document defines the standard pattern that all optional plugins must follow.

The **visitor plugin** is the first implementation of this pattern and serves as the reference example. Future optional plugins (parking, intercom, smart building analytics) should replicate this structure exactly.

## Plugin Anatomy

Every optional plugin has these components:

### Backend

- **Own PostgreSQL schema** (`dm3_{plugin}`) — never shares tables with core (`dm3_auth`, `dm3_access`, `dm3_identity`, `dm3_devices`)
- **Own Go models** in `internal/{plugin}/models.go` — NOT in shared `internal/models/`
- **Own microservice** at `cmd/{plugin}-svc/main.go` with independent health checks on a unique port
- **Own NATS stream** for domain events (e.g., `VISITOR` stream, subjects `dm3.visitor.>`)
- **Own HTTP handlers** in `internal/{plugin}/handlers.go`
- **Feature flag** via `enabled_plugins` on the `dm3_auth.tenants` record (VARCHAR[] array)
- **Frontend feature directory** at `apps/console/src/features/{plugin}/` with conditional route loading
- **API client** at `packages/api-client/src/{plugin}.ts` (OpenAPI-generated or manual)

### Example: Visitor Module Structure

```
backend/
  cmd/visitor-svc/
    main.go                    # Service entry point
  internal/visitor/
    models.go                  # Visitor, Visit, VisitorBadge, Watchlist, etc.
    handlers.go                # HTTP handlers
    events.go                  # NATS event publishing
    cron.go                    # Scheduled tasks (expiration, cleanup)
    access_log_handlers.go     # Access log integration
    visitor_scenarios_test.go  # Integration tests
  pkg/db/migrations/
    000003_visitor_v2.up.sql   # Schema + tables
    000004_visitor_schema_isolation.up.sql  # Schema isolation migration

apps/console/src/features/visitors/
  VisitorAccessHistoryPage.tsx
  VisitorGroupsPage.tsx
  VisitorWatchlistPage.tsx
  ... (8+ pages)

packages/api-client/src/visitors.ts  # Generated from OpenAPI spec
```

## Database Schema Isolation Rules

### Schema Independence

- Each module gets its own PostgreSQL schema: `dm3_{module}`
- Tables within the module reference each other with explicit foreign key constraints
- **Cross-domain references** (to core tables like `dm3_identity.users`, `dm3_access.zones`) use UUID columns **WITHOUT foreign key constraints** — this is intentional to allow the module to be dropped without CASCADE affecting core tables
- Each module owns its migration files and is responsible for schema versioning

### Migration Strategy

Migrations are numbered sequentially across the entire project. Module-specific migrations:
1. Create the schema and tables (e.g., `000003_visitor_v2.up.sql`)
2. Handle isolation concerns (e.g., `000004_visitor_schema_isolation.up.sql`)
3. Include corresponding `.down.sql` files for rollback

The `dm3_visitor` schema was created in `000003_visitor_v2.up.sql`, then isolated in `000004_visitor_schema_isolation.up.sql` which moves all tables from `dm3_identity` to `dm3_visitor` without data loss.

### Example: Visitor Foreign Keys

```sql
-- Within dm3_visitor schema: explicit FKs are safe
ALTER TABLE dm3_visitor.visits
ADD CONSTRAINT fk_visits_visitor_id
  FOREIGN KEY (visitor_id)
  REFERENCES dm3_visitor.visitors(id)
  ON DELETE CASCADE;

-- Cross-schema: UUID column WITHOUT FK
-- The visit row has a host_user_id (UUID) that references dm3_identity.users.id
-- But we don't add a FK constraint — the application enforces this
ALTER TABLE dm3_visitor.visits
ADD COLUMN host_user_id UUID NOT NULL;

-- Similarly for zone_id: cross-schema reference
ALTER TABLE dm3_visitor.visits
ADD COLUMN zone_id UUID NOT NULL;  -- references dm3_access.zones(id)
```

### Accessing Core Data

When a module needs core data (users, zones, credentials):

1. **Prefer event-driven caches** — subscribe to core events, build local read-only cache
2. **Fall back to database queries** — join to core schema when cache miss or consistency required
3. **Never mutate core tables** — modules only READ from core schemas

Example: visitor module subscribes to `dm3.identity.*.user.*` events to cache user display names locally, avoiding expensive JOINs on every visit query.

## Inter-Service Communication

### Event Flow (NATS JetStream)

All integration between services happens via event streams. No direct HTTP calls between services.

#### Publishing Events

Each module publishes domain events to its own NATS stream:

```go
// Subject format: dm3.visitor.{tenant_id}.{event_type}
// Example: dm3.visitor.tenant-uuid.visit.approved

const (
    EventVisitCreated    = "visit.created"
    EventVisitApproved   = "visit.approved"
    EventVisitRejected   = "visit.rejected"
    EventVisitCheckedIn  = "visit.checked_in"
    EventVisitCheckedOut = "visit.checked_out"
)

func (h *VisitorHandlers) publishEvent(ctx context.Context, tenantID, eventType string, payload any) {
    data, _ := json.Marshal(payload)
    subject := "dm3.visitor." + tenantID + "." + eventType
    h.nats.Publish(ctx, subject, data)
}
```

**Event payload structure:**

```json
{
  "tenant_id": "company-uuid",
  "entity_id": "visit-uuid",
  "action": "created|updated|deleted|approved|rejected",
  "timestamp": "2026-04-11T10:30:00Z",
  "data": {
    "visitor_id": "...",
    "host_user_id": "...",
    "expected_arrival": "...",
    "status": "pending"
  }
}
```

#### Subscribing to Events

Modules subscribe to core events they need to stay synchronized:

**Example: Visitor module subscribes to user updates**

```
// Listen for all user events from identity-svc
dm3.identity.{tenant_id}.user.*

// Listen for all zone events from access-svc
dm3.access.{tenant_id}.zone.*

// Listen for credential lifecycle events
dm3.access.{tenant_id}.credential.*
```

**No direct database queries to core schemas for real-time data** — use the event-driven cache instead.

### Credential Integration Pattern

When a module needs to issue temporary credentials (like visitor badges):

1. **Module approves visitor** → publishes `dm3.visitor.{tenant}.visit.approved`
2. **access-svc subscribes** → creates temporary credential (UUID, with expiration tied to visit checkout time)
3. **access-svc publishes** → `dm3.access.{tenant}.credential.created` with credential_id
4. **Module subscribes** → stores `credential_id` on the visit record
5. **Visit checkout event** → module publishes `dm3.visitor.{tenant}.visit.checked_out`
6. **access-svc subscribes** → revokes credential (sets status=REVOKED, expires_at=now)

This asynchronous flow ensures:
- Visitor module doesn't depend on access-svc implementation details
- Credentials are created independently of visits
- Module can be disabled without breaking access-svc
- No direct database mutations across schemas

## Feature Flag System

### Tenant-Level Enablement

Modules are enabled/disabled per tenant (company) using the `enabled_plugins` VARCHAR[] array on `dm3_auth.companies`:

```sql
-- Companies table
CREATE TABLE dm3_auth.companies (
    id UUID PRIMARY KEY,
    name VARCHAR NOT NULL,
    enabled_plugins VARCHAR[] DEFAULT ARRAY['core'],
    ...
);

-- Core is always present
-- Example with visitor enabled:
enabled_plugins = ARRAY['core', 'visitor']

-- Example with parking and intercom:
enabled_plugins = ARRAY['core', 'visitor', 'parking', 'intercom']
```

### Backend Middleware

Add a middleware check to module handlers:

```go
// RequirePlugin middleware
func RequirePlugin(moduleName string) func(next http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            // Extract tenant_id from JWT claims
            tenantID := r.Context().Value("tenant_id").(string)
            
            // Check if module is enabled for this tenant
            enabled, err := isModuleEnabled(r.Context(), tenantID, moduleName)
            if err != nil || !enabled {
                http.Error(w, "module not enabled", http.StatusForbidden)
                return
            }
            
            next.ServeHTTP(w, r)
        })
    }
}

// Use in router:
// r.With(RequirePlugin("visitor")).Post("/api/v1/visitors", h.CreateVisitor)
```

### Frontend Conditional Loading

Read `enabled_plugins` from auth context, conditionally register routes:

```typescript
// apps/console/src/app/router.tsx
import { useAuth } from '@/features/auth/context';

export function createRouter() {
  const auth = useAuth();
  const routes = [
    // Core routes (always loaded)
    { path: '/', element: <DashboardPage /> },
    
    // Module routes (conditional)
    ...(auth.company?.enabled_plugins?.includes('visitor') ? [
      { path: '/visitors', element: <VisitorListPage /> },
      { path: '/visitors/:id', element: <VisitorDetailPage /> },
      { path: '/visitors/groups', element: <VisitorGroupsPage /> },
    ] : []),
    
    ...(auth.company?.enabled_plugins?.includes('parking') ? [
      { path: '/parking', element: <ParkingPage /> },
    ] : []),
  ];
  
  return createBrowserRouter(routes);
}
```

### Frontend Lazy Loading (Optional)

For large modules, use dynamic imports to load chunks only when enabled:

```typescript
const VisitorRoutes = lazy(() => import('@/features/visitors/routes'));

// In router setup:
...(enabled.includes('visitor') ? [
  { path: '/visitors/*', element: <Suspense fallback={<Loading />}><VisitorRoutes /></Suspense> },
] : []),
```

### Sidebar Visibility

Conditionally show module navigation items:

```tsx
<nav>
  <NavItem href="/" label="Dashboard" />
  {auth.company?.enabled_plugins?.includes('visitor') && (
    <>
      <NavItem href="/visitors" label="Visitors" icon={<UserIcon />} />
      <NavItem href="/visitors/groups" label="Visitor Groups" />
      <NavItem href="/visitors/watchlist" label="Watchlist" />
    </>
  )}
  {auth.company?.enabled_plugins?.includes('parking') && (
    <NavItem href="/parking" label="Parking" icon={<CarIcon />} />
  )}
</nav>
```

## Service Topology

Each optional module runs as a standalone microservice:

| Module | Service | Port | Entry Point | Schema | Stream |
|--------|---------|------|-------------|--------|--------|
| Core (Access) | `access-svc` | 8003 | `cmd/access-svc/` | `dm3_access` | `ACCESS` |
| Core (Identity) | `identity-svc` | 8004 | `cmd/identity-svc/` | `dm3_identity` | `IDENTITY` |
| Visitor | `visitor-svc` | 8006 | `cmd/visitor-svc/` | `dm3_visitor` | `VISITOR` |
| Parking | `parking-svc` | 8007 | `cmd/parking-svc/` | `dm3_parking` | `PARKING` |
| Intercom | `intercom-svc` | 8008 | `cmd/intercom-svc/` | `dm3_intercom` | `INTERCOM` |

Each service:
- Has its own database schema
- Publishes to its own NATS stream
- Subscribes to core events it needs
- Exposes HTTP API on its dedicated port
- Has independent health checks
- Can be started/stopped without affecting others

### Docker Compose

```yaml
visitor-svc:
  build: ./backend
  command: go run ./cmd/visitor-svc/
  ports:
    - "8006:8006"
  depends_on:
    - postgres-db-timescale
    - nats
  environment:
    - DATABASE_URL=postgres://dm3:dm3secret@postgres-db-timescale:5433/dm3
    - NATS_URL=nats://nats:4222
    - PORT=8006

parking-svc:
  build: ./backend
  command: go run ./cmd/parking-svc/
  ports:
    - "8007:8007"
  depends_on:
    - postgres-db-timescale
    - nats
  environment:
    - DATABASE_URL=postgres://dm3:dm3secret@postgres-db-timescale:5433/dm3
    - NATS_URL=nats://nats:4222
    - PORT=8007
```

### Nginx Routing

Each service gets its own location block:

```nginx
# nginx.conf

# Visitor module
location /api/v1/visitors {
    proxy_pass http://visitor-svc:8006;
    proxy_set_header X-Tenant-ID $http_x_tenant_id;
}

location /api/v1/visitor-groups {
    proxy_pass http://visitor-svc:8006;
    proxy_set_header X-Tenant-ID $http_x_tenant_id;
}

location /api/v1/watchlist {
    proxy_pass http://visitor-svc:8006;
    proxy_set_header X-Tenant-ID $http_x_tenant_id;
}

# Parking module
location /api/v1/parking {
    proxy_pass http://parking-svc:8007;
    proxy_set_header X-Tenant-ID $http_x_tenant_id;
}
```

## Checklist for New Modules

When creating a new optional module (e.g., `parking`, `intercom`), follow this checklist:

### Backend

- [ ] **Schema**: Create `dm3_{module}` schema in new migration file
  - [ ] Create all tables with `tenant_id` on every row
  - [ ] No foreign keys to core schemas
  - [ ] Timestamps with automatic `updated_at` trigger
  
- [ ] **Models**: Create `internal/{module}/models.go`
  - [ ] Define all domain structs
  - [ ] Include JSON tags for API responses
  - [ ] Document optional fields clearly

- [ ] **HTTP Handlers**: Create `internal/{module}/handlers.go`
  - [ ] CRUD operations (Create, Read, Update, Delete)
  - [ ] List/search with pagination
  - [ ] Proper error responses (400, 403, 404, 500)
  
- [ ] **Events**: Create `internal/{module}/events.go`
  - [ ] Define event constants
  - [ ] Implement `publishEvent()` helper
  - [ ] Document event payload structure
  
- [ ] **Service**: Create `cmd/{module}-svc/main.go`
  - [ ] Load config from env vars
  - [ ] Connect to database
  - [ ] Connect to NATS
  - [ ] Set up HTTP router with middleware
  - [ ] Graceful shutdown handling
  - [ ] Health check endpoint at `/health`
  
- [ ] **Event Subscriptions**: Implement NATS consumer
  - [ ] Subscribe to needed core events (e.g., `dm3.identity.>`, `dm3.access.>`)
  - [ ] Build local read-only caches
  - [ ] Error handling with exponential backoff
  
- [ ] **Middleware**: Add `RequirePlugin("{module}")` check
  - [ ] Verify module is enabled for tenant
  - [ ] Return 403 if disabled
  
- [ ] **Tests**: Write integration tests
  - [ ] Test with NATS mocked
  - [ ] Test event publishing/subscribing
  - [ ] Test cross-schema references resolve correctly

### Frontend

- [ ] **Feature Directory**: Create `apps/console/src/features/{module}/`
  - [ ] `{Module}Page.tsx` — main landing page
  - [ ] `{Module}SettingsPage.tsx` — module-specific settings
  - [ ] Additional feature pages as needed
  
- [ ] **Router Integration**: Update `apps/console/src/app/router.tsx`
  - [ ] Import feature pages
  - [ ] Conditionally register routes based on `enabled_plugins`
  - [ ] Use lazy loading for large modules
  
- [ ] **Navigation**: Update sidebar/menu
  - [ ] Show/hide module items based on `enabled_plugins`
  - [ ] Use appropriate icons and labels
  - [ ] Group related items together
  
- [ ] **API Client**: Create `packages/api-client/src/{module}.ts`
  - [ ] OpenAPI-generated or manual client
  - [ ] Export types for responses
  - [ ] Use TanStack Query for data fetching
  
- [ ] **Tests**: Write E2E tests
  - [ ] Test feature pages load when enabled
  - [ ] Test pages don't appear when disabled
  - [ ] Test API calls with proper tenant isolation

### Infrastructure

- [ ] **Docker Compose**: Add service entry in `docker-compose.local.yml`
  - [ ] Service container definition
  - [ ] Port mapping
  - [ ] Environment variables
  - [ ] Depends on database and NATS
  
- [ ] **Nginx**: Add location blocks in `deploy/nginx/nginx.local.conf`
  - [ ] Route all `/api/v1/{module}*` paths to the service
  - [ ] Include tenant ID header forwarding
  
- [ ] **Environment**: Add env var defaults in `internal/config/config.go`
  - [ ] Module-specific settings if any
  - [ ] Feature flags or thresholds

### Documentation

- [ ] **ER Diagram**: Update `diagrams/er-diagram.drawio`
  - [ ] Add new schema group for module tables
  - [ ] Show cross-schema reference (no FK) to core tables
  
- [ ] **IMPLEMENTATION_STATUS.md**: Mark module as implemented
  - [ ] Note which pages are real vs mock
  - [ ] List enabled_plugins status
  
- [ ] **Architecture Docs**: Add module-specific design doc if complex
  - [ ] Use same format as `docs/architecture/access-model-design.md`
  - [ ] Include data model, event flow, design decisions
  
- [ ] **README**: Update main project README
  - [ ] List new module and its purpose
  - [ ] Update service port table

## Visitor Module — Reference Implementation

The visitor module demonstrates all patterns in this document:

### Backend Structure

- **Schema**: `dm3_visitor` with 10 tables (visitors, visits, badges, watchlist, agreements, etc.)
- **Models**: `internal/visitor/models.go` with 8+ types
- **Handlers**: `internal/visitor/handlers.go` with 30+ endpoints
- **Events**: `internal/visitor/events.go` publishes 8 event types
- **Service**: `cmd/visitor-svc/main.go` (150 lines)
- **Cron**: `internal/visitor/cron.go` handles expiration of QR tokens, temporary credentials, recurring visits
- **Tests**: `internal/visitor/visitor_scenarios_test.go` with 15+ integration scenarios

### Frontend Structure

- **Pages**: 8 pages under `apps/console/src/features/visitors/`
  - `VisitorAccessHistoryPage.tsx`
  - `VisitorAgreementsPage.tsx`
  - `VisitorAnalyticsPage.tsx`
  - `VisitorGroupsPage.tsx`
  - `VisitorPreRegisterPage.tsx`
  - `VisitorRecurringPage.tsx`
  - `VisitorSettingsPage.tsx`
  - `VisitorWatchlistPage.tsx`

- **API Client**: `packages/api-client/src/visitors.ts`
- **Routes**: Conditionally loaded in `apps/console/src/app/router.tsx`
- **Sidebar**: Visitor menu items shown when `visitor` ∈ `enabled_plugins`

### Credential Flow

1. Host approves visitor → visitor-svc publishes `dm3.visitor.{tenant}.visit.approved`
2. access-svc subscribes → creates temporary credential with 24h TTL
3. access-svc publishes `dm3.access.{tenant}.credential.created`
4. visitor-svc subscribes → stores credential_id on visit record
5. Visitor uses badge/credential to enter zones
6. Visit checkout → visitor-svc publishes `dm3.visitor.{tenant}.visit.checked_out`
7. access-svc subscribes → revokes credential (status=REVOKED, expires_at=now)

### Feature Flag Example

```sql
-- Tenant has visitor enabled
SELECT enabled_plugins FROM dm3_auth.companies WHERE id = 'tenant-uuid';
-- Result: {core,visitor}

-- Tenant without visitor
SELECT enabled_plugins FROM dm3_auth.companies WHERE id = 'other-tenant-uuid';
-- Result: {core}
```

Frontend sidebar conditionally shows:
```
Visitors
├── Visitor Directory
├── Visitor Groups
├── Watchlist
├── Analytics
└── Settings
```

Only when visitor is in `enabled_plugins`.

## Parking Module — Cross-Plugin Integration Example

The parking plugin demonstrates how a plugin can **deeply integrate** with
core access-svc while staying plugin-gated. See
[`docs/changelog/2026-04-12-parking-access-integration.md`](../changelog/2026-04-12-parking-access-integration.md)
for the full decision record.

### Integration surfaces (all plugin-safe)

| Surface | Mechanism | Direction |
|---|---|---|
| Unified vehicle registry | `dm3_parking.parking_vehicles` owns plate + RFID + NFC + `visitor_id` (soft FK to `dm3_visitor.visitors`) | parking → visitor |
| Zone hierarchy | `parking_zones.access_zone_id` soft FK to `dm3_access.zones` | parking → access |
| Event bridge | `dm3.parking.{tid}.access.{direction}` → access-svc `ParkingAccessConsumer` → `dm3_access.access_events` | parking → access (async) |
| Barrier auto-registration | `dm3.parking.{tid}.zone.barrier_sync` → access-svc `ParkingBarrierConsumer` upserts `access_devices` (source=parking, source_ref=zone_id) | parking → access (async) |
| Cross-module policy check | Opt-in via `parking_settings.enforce_access_rules` — `CreateParkingSession` validates user has access_group access to `zone.access_zone_id` | parking → access (sync query) |

### Invariants preserved

- **No hard FKs across schemas.** All cross-plugin links are UUID columns
  with no `REFERENCES` clause.
- **No Go imports across plugins.** access-svc consumers read events and
  query their own schema; they never import `internal/parking`.
- **Opt-in by default.** `enforce_access_rules` defaults to `false`; the
  event bridge and barrier sync are passive — access-svc ingests what
  parking-svc publishes, never the other way around.
- **Graceful degradation.** If the zone has no `access_zone_id`, the
  vehicle has no owner, or the tenant has the plugin disabled, the
  checks fall through to the existing parking-only path.

### Auto-registration pattern

To register external resources as access devices without a hard FK, use
the `source` + `source_ref` columns on `dm3_access.access_devices`:

```sql
CREATE UNIQUE INDEX uq_access_device_source_ref
    ON dm3_access.access_devices(tenant_id, source, source_ref)
    WHERE source IS NOT NULL;
```

Upsert keyed on `(tenant_id, source, source_ref)` is idempotent, so
replaying the sync event is safe. Future plugins (intercom, turnstile,
elevator) can reuse this pattern — pick a `source` string (`intercom`,
`turnstile`, etc.) and publish a `{domain}.zone.barrier_sync`-style
event.

## Related Documents

- [System Architecture](./system-architecture.md) — overall service topology
- [MQTT Protocol](./mqtt-protocol.md) — device sync and MQTT integration
- [Access Model Design](./access-model-design.md) — core access control rules
- [IMPLEMENTATION_STATUS.md](../IMPLEMENTATION_STATUS.md) — which features are live vs mock
- [Visitor Feature Spec](../specs/operate/visitor-management.md) — detailed visitor requirements
- [2026-04-12 Parking ↔ Access Integration](../changelog/2026-04-12-parking-access-integration.md) — cross-plugin integration decision record
