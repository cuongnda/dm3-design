# DM3 Core Modules Review Verdict

Date: 2026-04-19
Scope: core platform surfaces across access, identity, auth, devices/gateway, and related console/API-client flows.

## Verdict
- Risk: MEDIUM
- Recommendation: NEEDS CHANGES, but close

I re-reviewed this from current repo state, not just the verdict doc.

The big news is that the strongest blocker from my earlier pass is no longer true. The stale `useUserManagement.ts` hook path I previously cited is gone, and the current `UserManagementPage.tsx` now talks directly to `/api/v1/identity/...` endpoints that actually exist in `backend/cmd/identity-svc/main.go`.

That materially improves merge safety.

So this is no longer a `REQUEST CHANGES` verdict for me. But I still would not call it clean approval yet, because there are still some real contract drifts in shared API clients and some coarse authorization wiring in the service entrypoints.

## What I re-checked

### Repo/doc state
- `docs/review-verdict_core.md`
- `git status --short`
- `git diff --stat -- docs/review-verdict_core.md`

### Backend services and routing
- `backend/cmd/identity-svc/main.go`
- `backend/cmd/access-svc/main.go`
- `backend/cmd/device-gateway/main.go`

### Frontend / API surfaces
- `apps/console/src/features/user-management/UserManagementPage.tsx`
- `apps/console/src/features/department-management/hooks/useDepartmentManagement.ts`
- `apps/console/src/features/devices/DevicesPage.tsx`
- `packages/api-client/src/devices.ts`
- `packages/api-client/src/persons.ts`
- `packages/api-client/src/access-points.ts`

### Backend tests re-run
- `go test ./internal/access/... ./internal/identity/... ./internal/authsvc/... ./internal/gateway/...`
- Result: passed in current repo state

## What changed since the earlier review

### 1. The old user-management blocker is resolved
Earlier I flagged `apps/console/src/features/user-management/hooks/useUserManagement.ts` as stale and mismatched.

That specific blocker does not hold anymore.

Current evidence:
- the old hook path is gone
- `apps/console/src/features/user-management/UserManagementPage.tsx` now fetches:
  - `GET /api/v1/identity/users`
  - `DELETE /api/v1/identity/users/{id}`
  - `POST /api/v1/identity/users/bulk-delete`
- it also loads departments from `GET /api/v1/identity/departments`
- those routes are present in `backend/cmd/identity-svc/main.go`

That is a real fix, not doc makeup.

## What is still good

### 1. Core backend packages are still structurally solid
The backend remains the strongest part of this surface.

Re-run evidence:
- `internal/access` passed
- `internal/identity` passed
- `internal/authsvc` passed
- `internal/gateway` passed

### 2. Identity, access, and gateway service wiring still looks coherent
The broad architecture is still good:
- access consumes `ACCESS`, `VISITOR`, and `PARKING`
- gateway bridges MQTT, NATS, sync, websocket, provisioning, and firmware
- identity owns identity events and media/object-store flows
- auth carries plugin claims and platform auth concerns

### 3. Tenant scoping still looks deliberate
The repeated use of company scoping and auth middleware is still visible and meaningful across the reviewed service entrypoints.

## Remaining findings

### 1. Shared API clients still expose stale or alternate contracts
This is now my main reason for not approving cleanly.

#### `packages/api-client/src/devices.ts`
This file still uses:
- `const BASE = '/api/v1/devices'`
- pending routes under `/api/v1/devices/pending`
- provisioning under `/api/v1/devices/provision`

But the reviewed backend routes in `backend/cmd/device-gateway/main.go` live under:
- `/api/v1/gateway/devices`
- `/api/v1/gateway/devices/pending`
- `/api/v1/gateway/devices/provision`

Meanwhile `DevicesPage.tsx` correctly uses `/api/v1/gateway/devices` directly.

So the page is healthier, but the shared client file is still on a different dialect. That is exactly how regressions sneak back in later.

#### `packages/api-client/src/persons.ts`
This client still uses:
- `const BASE = '/api/v1/persons'`

But the current reviewed identity service exposes `/api/v1/identity/users`, not a matching `/api/v1/persons` surface in the files I re-checked.

Maybe there is another service still backing `/persons`, but from the current core review surface this client looks suspicious and at least inconsistent with the main identity direction.

#### `packages/api-client/src/access-points.ts`
This client is closer to current routing and uses `/api/v1/access/access-points`, which matches the current access service shape.

So the core issue is not “all clients are broken”. It is inconsistency.

### 2. Read/write authorization intent is still muddled in service entrypoints
This part is still not cleaned up.

#### Identity service
In `backend/cmd/identity-svc/main.go`, comments say things like:
- operator/viewer can read, manager+ can write

But the `/users` routes are wrapped in:
- `RequireWriteRole("primary_manager", "manager", "system_admin")`

That group contains both GET and write endpoints.

So the implementation is still stricter than the comment.

#### Access service
`backend/cmd/access-svc/main.go` still wraps zones, access points, access devices, access groups, and access times in broad `RequireWriteRole(...)` groups, while those groups also include GET endpoints.

#### Device gateway
`backend/cmd/device-gateway/main.go` still applies `RequireWriteRole(...)` broadly to company-scoped device routes even though that group includes reads like:
- `GET /devices`
- `GET /devices/{id}`
- `GET /devices/{id}/events`
- `GET /devices/{id}/history`
- `GET /events`

This is not a security hole. If anything, it is over-restrictive. But it is still a correctness/policy clarity issue.

### 3. The frontend contract layer is better, but still not unified enough
The improvement is real:
- `UserManagementPage.tsx` is now aligned with identity routes
- `useDepartmentManagement.ts` also uses `/api/v1/identity/departments...`
- `DevicesPage.tsx` uses `/api/v1/gateway/devices`

But shared clients and page-local fetches are still mixed.

That means the system works more by local repair than by one canonical contract layer. That is survivable, but not elegant, and it increases future breakage risk.

## Best concrete evidence from the re-review

### Confirmed fix
The earlier stale user-management hook blocker is obsolete.

### Fresh backend test pass
I re-ran:
- `go test ./internal/access/... ./internal/identity/... ./internal/authsvc/... ./internal/gateway/...`

And it passed again.

That matters. This is not a repo that is falling apart underneath the doc.

## Remaining merge blockers

### Blocker 1: stale shared device API client
`packages/api-client/src/devices.ts` still targets `/api/v1/devices...` while current backend/page usage is `/api/v1/gateway/devices...`.

### Blocker 2: unresolved identity/person contract drift
`packages/api-client/src/persons.ts` still presents a `/api/v1/persons` contract that does not match the identity user surface I re-validated.

### Blocker 3: authorization policy is still coarse and comment-misaligned
In access, identity, and gateway service entrypoints, GET routes are still grouped under write-role middleware despite comments suggesting broader read access.

## Recommendation before merge

### Must fix
1. Normalize shared core API clients to the current backend route shape.
   - especially `packages/api-client/src/devices.ts`
   - revalidate whether `packages/api-client/src/persons.ts` is still canonical or should be retired/repointed

2. Resolve the read/write policy mismatch in service entrypoints.
   - either allow read-only roles on GET routes
   - or update comments and product expectations so the stricter policy is explicit

### Should fix soon
3. Continue consolidating core console data access around canonical shared clients or one consistent fetch layer.

4. Add a small set of contract-focused integration tests for:
   - user list and delete/bulk-delete flows
   - department list and assignment flows
   - device list/detail/history/sync flows

## Final call
This got better. Enough better that I’m lowering the verdict.

Current call:
- Risk: MEDIUM
- Recommendation: NEEDS CHANGES, but close

So, no, I would not stamp this as fully clean yet.

But the earlier biggest blocker was real, and it has been fixed. The remaining issues are now mostly contract cleanup and authorization-policy clarity, not a major structural failure.