# RBAC Review Verdict

## Verdict
- **Risk:** MEDIUM
- **Recommendation:** MERGEABLE WITH FOLLOW-UP

## Scope Reviewed
Reviewed the current RBAC implementation across backend and frontend, including:
- schema and migrations
- permission catalog and checker
- JWT claim integration
- auth-svc RBAC CRUD APIs
- role management UI and assignment flows
- enforcement rollout into product routes
- follow-up fixes made after the first review

## What Is Actually Implemented

### Backend
- Real RBAC schema exists in `backend/pkg/db/migrations/000035_rbac_tables.up.sql`
  - `company_roles`
  - `company_role_permissions`
  - `user_role_assignments`
- Canonical permission catalog exists in `backend/internal/rbac/catalog.go`
- RBAC evaluation logic exists in `backend/internal/rbac/checker.go`
- JWT access tokens carry canonical RBAC context:
  - `fixed_role`
  - `assignments`
  - `enabled_plugins`
- Auth service exposes real RBAC APIs in `backend/internal/authsvc/rbac_handlers.go`
  - list permissions
  - list eligible accounts
  - list/create/update/delete roles
  - list/create/delete assignments
- Claims are adapted into the RBAC engine through `backend/internal/authsvc/rbac_adapter.go`
- Assignment loading for JWT minting exists in `backend/internal/authsvc/handlers.go`

### Frontend
- Real role management UI exists under `apps/console/src/features/role-management/`
  - role list
  - role detail
  - create/edit role modal
  - assignment modal
- Routes exist for:
  - `/settings/roles`
  - `/settings/roles/:id`
- Permission labels and role-management localization are present in both English and Vietnamese locale files

## What Improved Since The Previous Review
The developer materially addressed the biggest blockers from the prior review.

### 1. `site` scope is now hidden from the UI
The ghost user-facing `site` scope was removed from the role-management frontend surface:
- `apps/console/src/features/role-management/types.ts`
- `apps/console/src/features/role-management/AssignmentModal.tsx`
- related locale cleanup

The backend catalog still preserves `site` for future modeling, but the current UI no longer exposes a fake or unassignable path to operators.

### 2. JWT assignment staleness is now explicitly documented
The RBAC spec now documents the propagation model for:
- assignment grants/revocations
- role permission edits
- plugin toggles
- fixed-role changes

See:
- `docs/specs/platform/company-rbac.md`

This was an important gap in the first review. It is now an explicit, documented tradeoff rather than hidden behavior.

### 3. RBAC enforcement rollout is now materially broader
The earlier review found that the RBAC foundation existed but visible service rollout was still thin. That is no longer true.

The latest fixes moved multiple services away from legacy role-gating and onto RBAC permission-gating, including:
- `backend/cmd/access-svc/main.go`
- `backend/cmd/attend-svc/main.go`
- `backend/cmd/device-gateway/main.go`
- `backend/cmd/identity-svc/main.go`
- `backend/cmd/parking-svc/main.go`
- `backend/cmd/visitor-svc/main.go`
- `backend/internal/tenant/department_routes.go`

This is the single biggest improvement in the review delta.

## Verification Performed
- Console build passed
  - `npm -C apps/console run build`
- Backend tests passed
  - `go test ./internal/rbac ./internal/authsvc/... ./cmd/access-svc ./cmd/attend-svc ./cmd/device-gateway ./cmd/identity-svc ./cmd/parking-svc ./cmd/visitor-svc`

## Current Findings

### 1. This is now a real end-to-end RBAC rollout foundation, not just admin UI + checker
The previous main blocker was incomplete enforcement rollout. The new route-level changes substantially improved that.

At this point, it is fair to say the project has:
- RBAC schema
- permission catalog
- checker
- JWT integration
- role-management UI
- service-level permission rollout across multiple major product services

That is a meaningful jump in implementation maturity.

### 2. Permission mapping is improved, but some route-band choices still look coarse
A few services now use permission middleware bands that are operationally reasonable but still somewhat coarse.

Example:
- some identity write surfaces are gated through broad write permissions rather than fully splitting create/update/delete semantics at the middleware layer

This is not necessarily wrong, but it means the policy model is currently practical/coarse rather than maximally granular.

**Impact:** Acceptable for now, but worth tightening later if fine-grained authorization semantics matter.

### 3. Fine-grained scope correctness still depends on handler integration
This remains the most important remaining caution.

`rbac.Check(...)` supports company/site/department/zone/self, but real correctness still depends on handlers providing the right `rbac.Target` values where resource-level scope matters.

The route middleware rollout is much better now, but this review still does not prove that every handler across every service is passing fully correct target context for department/zone/self decisions.

**Impact:** The rollout is now mergeable, but a later focused audit of scope-sensitive handlers is still warranted.

### 4. Read access policy is intentionally broad in several places
Many services now follow the pattern:
- reads open to any authenticated tenant user with plugin/company context
- writes gated by RBAC permissions

That is a valid product policy if intended, but it should be understood as a policy choice, not as an automatic consequence of “having RBAC”.

**Impact:** If the product later wants narrower read visibility, those routes will need another pass.

## What Looks Good
- Permission catalog structure is coherent and practical
- Plugin gating before primary-manager bypass is the right security/commercial boundary
- Member self-service baseline is sensible
- Auth-side role and assignment CRUD shape is coherent
- The biggest previous review blockers were actually addressed, not hand-waved
- Route-level RBAC rollout is now materially broader and more credible
- Frontend role pages are real and usable, not placeholder UI
- Build/tests passed after the fixes

## Remaining Follow-up Work
1. Audit fine-grained scope-sensitive handlers for correct `rbac.Target` population
2. Revisit coarse permission bundling where create/update/delete may deserve separate enforcement
3. Revisit broad read-open policies if stricter visibility rules become a product requirement
4. Add more service/handler-level tests for real scoped authorization paths

## Recommendation
This should no longer be described as “partial frontend theater” or “RBAC foundation only”. The latest fixes materially improved the implementation.

More accurate status now:
- **RBAC foundation:** implemented
- **Role management UI/API:** implemented
- **JWT integration:** implemented
- **Major service-level authorization rollout:** implemented
- **Scope model cleanup in UI:** implemented
- **Fine-grained scope audit:** still follow-up work

## Final Assessment
This is now **mergeable with follow-up**, not “needs changes” in the earlier sense.

I still would not call it perfect or fully proven at fine-grained scope level. But the earlier major blockers were addressed well enough that the implementation now looks credible and practically shippable.
