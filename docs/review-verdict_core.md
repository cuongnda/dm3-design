# DM3 Core Modules Review Verdict

Date: 2026-04-19
Scope: core platform surfaces across access, identity, auth, devices/gateway, and related console/API-client flows.

## Verdict
- Risk: MEDIUM-HIGH
- Recommendation: REQUEST CHANGES

This core layer is structurally stronger than some plugin modules I reviewed earlier. Service wiring is coherent, event streams are in place, tenant scoping is visible in most handlers, and the main backend packages currently test clean.

But it is not merge-clean yet.

The main problem is not that the backend is obviously broken. The main problem is that parts of the console still speak an older or inconsistent API dialect, especially around user management and some identity/department flows. That means the system can look complete while shipping dead buttons, wrong endpoints, or features that only work on some pages.

## What I reviewed

### Backend services and routing
- `backend/cmd/access-svc/main.go`
- `backend/cmd/identity-svc/main.go`
- `backend/cmd/auth-svc/main.go`
- `backend/cmd/device-gateway/main.go`

### Backend module surfaces
- `backend/internal/access/handlers.go`
- `backend/internal/access/access_point_handlers.go`
- `backend/internal/access/zone_handlers.go`
- `backend/internal/access/access_group_handlers.go`
- `backend/internal/access/access_time_handlers.go`
- `backend/internal/access/emergency_handlers.go`
- `backend/internal/access/nats_consumer.go`
- `backend/internal/identity/handlers.go`
- `backend/internal/identity/user_handlers.go`
- `backend/internal/identity/email_template_handlers.go`
- `backend/internal/identity/storage.go`
- `backend/internal/authsvc/handlers.go`
- `backend/internal/authsvc/middleware.go`
- `backend/internal/authsvc/plugin_handlers.go`
- `backend/internal/authsvc/plugins.go`
- `backend/internal/authsvc/plugin_check.go`
- `backend/internal/authsvc/company_handlers.go`
- `backend/internal/gateway/handlers.go`
- `backend/internal/gateway/provisioning.go`
- `backend/internal/gateway/mqtt_handler.go`

### Tests checked
- `go test ./internal/access/... ./internal/identity/... ./internal/authsvc/... ./internal/gateway/...`
- Result: passed in current repo state

### Frontend / API client surfaces
- `apps/console/src/app/router.tsx`
- `apps/console/src/components/common/PluginGuard.tsx`
- `apps/console/src/features/access/...`
- `apps/console/src/features/devices/...`
- `apps/console/src/features/user-management/...`
- `apps/console/src/features/department-management/...`
- `apps/console/src/features/monitoring/LiveEventsPage.tsx`
- `packages/api-client/src/access-points.ts`
- `packages/api-client/src/devices.ts`
- `packages/api-client/src/persons.ts`
- `packages/api-client/src/auth.ts`

## What is good

### 1. Service wiring is mostly sane
The core services are not random CRUD islands.
- `access-svc` ensures and consumes `ACCESS`, `VISITOR`, and `PARKING` streams.
- `device-gateway` bridges MQTT, NATS, sync, websocket, firmware, and provisioning in one place that mostly makes architectural sense.
- `identity-svc` publishes identity events and supports photo/object-store flows.
- `auth-svc` carries plugin registry and enabled-plugin claims in tokens.

That is a solid platform shape.

### 2. Tenant scoping is visible in many backend handlers
Across access, identity, and gateway handlers, the repeated use of `authsvc.CompanyIDFromContext(...)` is doing real work, not just decorative middleware.

Examples inspected:
- access handlers and sub-handlers consistently scope by tenant
- identity user handlers scope list/get/update/delete by tenant
- gateway device and event handlers scope company routes by tenant

That reduces the usual “oops, cross-tenant leak” risk.

### 3. Route-level write protection is clearer than earlier plugin modules
Service entrypoints use role gates with a readable pattern:
- `RequireWriteRole("primary_manager", "manager", "system_admin")`
- `RequireRole(...)` for stricter paths like pending devices and provisioning

This is not perfect business authorization, but it is cleaner than pure frontend gating.

### 4. Access and device operator UIs are materially better than placeholder quality
The access-point, access-group, access-time, device, pending-device, and monitoring pages are real operator surfaces, not toy tables.

Notable strengths:
- Access point page exposes completeness and health state well.
- Bulk door commands exist and appear backed by a real backend endpoint.
- Live monitoring page has a fairly honest merged realtime plus backend timeline model.
- Pending device flow supports approval metadata instead of a dumb approve/reject toggle.

### 5. Auth plugin plumbing is conceptually correct
`auth-svc` carries enabled plugins in claims and `PluginGuard` checks them on the console side. That is a reasonable feature-flag/plugin availability mechanism.

## Main findings

### 1. User-management frontend still talks to stale or wrong endpoints
This is the biggest concrete merge blocker I found.

`apps/console/src/features/user-management/hooks/useUserManagement.ts` is still using endpoints like:
- `GET /api/v1/users`
- `GET /api/v1/users/filter-options`
- `POST /api/v1/users/bulk/delete`
- `POST /api/v1/users/bulk/update-department`
- `POST /api/v1/users/bulk/update-access-group`
- `POST /api/v1/users/bulk/suspend`
- `POST /api/v1/users/bulk/approve`

But the current backend routing in `backend/cmd/identity-svc/main.go` exposes identity-scoped paths such as:
- `GET /api/v1/identity/users`
- `POST /api/v1/identity/users`
- `POST /api/v1/identity/users/bulk-delete`

And I found no backend evidence for several of the hook endpoints above, especially:
- `/api/v1/users/filter-options`
- `/api/v1/users/bulk/update-department`
- `/api/v1/users/bulk/update-access-group`
- `/api/v1/users/bulk/suspend`
- `/api/v1/users/bulk/approve`

So at least one user-management path is stale, and likely several actions are dead or partially dead.

This is exactly the kind of mismatch that makes a module look done until someone clicks the secondary actions.

### 2. Identity routing comments overstate read/write separation
In `backend/cmd/identity-svc/main.go`, comments say things like:
- operator/viewer can read, manager+ can write

But the route group shown currently wraps the whole `/users` block with `RequireWriteRole(...)`, then registers both GET and write endpoints inside that group.

That means the implementation is stricter than the comment, and possibly stricter than product intent.

This is not a catastrophic security flaw. If anything, it may be over-restrictive. But it is still a correctness mismatch between documented intent and actual behavior, and those are nasty because teams stop trusting comments and permissions docs.

### 3. PluginGuard is still availability gating, not authorization
`apps/console/src/components/common/PluginGuard.tsx` only checks `enabledPlugins`.

That means it is useful for “plugin on/off”, but not for role or business-rule enforcement. I’m calling this out again because core routes also rely heavily on route structure and page logic, and the platform should stay disciplined about not treating plugin gating as auth.

For the core modules, backend role middleware does exist, so this is less severe than in some plugin reviews. Still worth stating plainly.

### 4. Core console has mixed API styles, which raises regression risk
Some pages correctly use current scoped endpoints like:
- `/api/v1/identity/users`
- `/api/v1/access/...`
- `/api/v1/gateway/...`

But other pages/hooks still use legacy-ish or alternate shapes.

Examples from the review:
- `UserManagementPage.tsx` itself looks closer to current identity endpoints.
- `useUserManagement.ts` does not.
- department management uses `/api/v1/identity/departments/...` directly from several places, while backend routing for department flows is added through `tenant.AddDepartmentRoutes(...)`, which is workable but easy to drift if not kept disciplined.

So the frontend contract layer is not unified enough. That is a real maintainability and merge-safety issue.

### 5. Devices/gateway backend is strong, but company read access may be tighter than intended
`device-gateway` comments say operator/viewer can read and manager+ can write, but the company-scoped route group currently applies `RequireWriteRole(...)` broadly before registering both reads and writes.

So depending on intended product policy, device list/detail/history/events may be inaccessible to viewer/operator roles even though comments suggest otherwise.

This needs explicit product confirmation. Right now it reads like an implementation/comment mismatch, not a deliberate security rule.

### 6. Access service has the same pattern: broad write-role middleware around mixed routes
In `backend/cmd/access-svc/main.go`, resource groups like zones, access points, access groups, and access times are wrapped with `RequireWriteRole(...)` even though each group includes GET endpoints too.

If the intended policy is “only managers can view configuration pages”, fine, but then the comments and UX should reflect that. If the intended policy is “operators/viewers can inspect but not mutate”, current routing is too coarse.

This is not unsafe. It is a product/authorization correctness gap.

### 7. Monitoring/live-events path looks decent, but it is still hand-assembled and brittle
`apps/console/src/features/monitoring/LiveEventsPage.tsx` does a fairly careful merge of backend history and realtime store state. That is good.

But it also means the page depends on several subtly different shapes:
- realtime access events
- realtime alarms
- realtime door status
- backend `/api/v1/gateway/events`

The current code is thoughtful, but this area is contract-fragile. I did not find a smoking gun bug here, but I would still treat it as regression-prone unless there is explicit integration coverage for the merged timeline shape.

## Best concrete evidence found

### Backend tests passed
I ran:
- `go test ./internal/access/... ./internal/identity/... ./internal/authsvc/... ./internal/gateway/...`

This is meaningful evidence that the core backend packages are in better shape than some plugin surfaces.

### Strong backend features present
- access NATS consumers and parking/visitor integration hooks are present
- gateway door command bulk endpoint exists and matches current access UI intent
- auth token/plugin support is present and tested
- identity user CRUD is real, not a stub

## Merge blockers

### Blocker 1: stale user-management hook contract
`apps/console/src/features/user-management/hooks/useUserManagement.ts` is not aligned with current backend routes. This needs cleanup before the core verdict can be clean.

### Blocker 2: read/write authorization intent is unclear and likely inconsistent
In access, identity, and gateway service entrypoints, comments imply read access for lower roles, while route grouping appears to require manager+ for whole resource groups including GETs.

That needs an explicit decision, then route wiring should match it.

### Blocker 3: frontend contract surface is not unified enough
Some pages use the current API shape, others still use alternate/legacy shapes. That makes regressions too easy.

## Recommendation before merge

### Must fix
1. Normalize user-management frontend API usage to current backend routes.
   - Remove stale `/api/v1/users/...` assumptions where backend is actually `/api/v1/identity/users/...`
   - Remove or implement missing bulk endpoints
   - Make one canonical contract and use it everywhere

2. Resolve the role-policy mismatch in service routing.
   - If viewers/operators should read these modules, stop wrapping GET routes in write-role middleware
   - If they should not, fix comments and UI assumptions so the policy is explicit

3. Do one focused pass for core console endpoint consistency.
   - user management
   - departments
   - access config pages
   - device pages

### Should fix soon
4. Add targeted integration tests for core console/backend contract-critical paths, especially:
   - user list + bulk actions
   - department assignment flows
   - device list/detail/update + sync
   - access point bulk door commands
   - live events payload compatibility

5. Consider centralizing core API clients instead of leaving some screens on ad hoc `fetch(...)` patterns.

## Final call
The backend core is pretty solid. The console contract layer is the part that’s slipping.

So my current call is:
- Risk: MEDIUM-HIGH
- Recommendation: REQUEST CHANGES

Not because the architecture is bad. It isn’t.

Because there are enough frontend/backend contract mismatches in the core admin layer that I would not trust this as a clean merge without one more tightening pass.
