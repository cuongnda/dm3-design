# RBAC Review Verdict

## Verdict
- **Risk:** MEDIUM
- **Recommendation:** NEEDS CHANGES

## Scope Reviewed
Reviewed the current RBAC implementation across backend and frontend, including:
- schema and migrations
- permission catalog and checker
- JWT claim integration
- auth-svc RBAC CRUD APIs
- role management UI and assignment flows
- visible enforcement rollout into product routes

## What Is Actually Implemented

### Backend
- Real RBAC schema exists in `backend/pkg/db/migrations/000035_rbac_tables.up.sql`
  - `company_roles`
  - `company_role_permissions`
  - `user_role_assignments`
- Canonical permission catalog exists in `backend/internal/rbac/catalog.go`
- RBAC evaluation logic exists in `backend/internal/rbac/checker.go`
- JWT access tokens now carry canonical RBAC context:
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

### Verification Performed
- Console build passed
- Backend tests passed:
  - `go test ./internal/rbac ./internal/authsvc/...`

## Main Findings

### 1. RBAC foundation is real, but enforcement rollout is incomplete
This is the main blocker to calling RBAC “fully implemented”.

The codebase now has the core RBAC machinery, but visible route-level adoption is still sparse. In the reviewed backend, clear permission middleware usage was only directly observed in CCTV routes (`backend/internal/cctv/routes.go`).

That means the project currently has:
- a permission catalog
- a checker
- assignments in JWT
- role-management UI

But much of the product surface does not yet appear to be consistently protected by the new RBAC permission model.

**Impact:** The admin surface exists before the enforcement surface is fully rolled out. That is not a finished RBAC implementation.

### 2. Ghost `site` scope is still present in both backend and frontend
`site` still exists as a supported scope in:
- `backend/internal/rbac/catalog.go`
- `backend/internal/rbac/checker.go`
- migration `000035_rbac_tables.up.sql`
- `apps/console/src/features/role-management/types.ts`
- `apps/console/src/features/role-management/AssignmentModal.tsx`

The UI still allows `site` selection while also acknowledging that sites are not really modeled. This is the same ghost-domain problem seen elsewhere in DM3.

**Impact:** The product exposes a scope users can pick even though the domain model is not convincingly real. Either hide/remove `site` for now, or implement it properly end to end.

### 3. Permission changes are JWT-cached, so assignment updates are not immediately authoritative
Assignments are loaded from DB during token minting in `backend/internal/authsvc/handlers.go` and then carried in JWT claims.

This means role/assignment changes can remain stale until access token refresh or re-login.

**Impact:** This may be an acceptable design tradeoff, but it must be treated as an explicit behavior, not an invisible surprise. Sensitive authorization expectations should not assume immediate revocation semantics unless the system compensates elsewhere.

### 4. Scope enforcement quality depends on handler integration, not just the checker
`rbac.Check(...)` supports company/site/department/zone/self, but actual correctness depends on handlers passing the right `rbac.Target` values.

The generic middleware in `backend/internal/authsvc/rbac_adapter.go` only supplies a company-scoped tenant target by default. Fine-grained scope enforcement still requires handler-level integration.

**Impact:** The checker is not the same thing as completed enforcement. The project still needs consistent per-resource target wiring across services.

### 5. Role-management UX is real, but some behavior is still technically exposed rather than product-clean
Examples:
- `site` scope still appears in assignment flows
- role detail scope rendering is still technical (`scope_type:id-prefix`) rather than operator-friendly
- eligible assignment targets are account-bound, not person/identity-bound

These are not fatal, but they reinforce that this is a foundation-stage rollout, not a polished finished RBAC system.

## What Looks Good
- Permission catalog structure is coherent and practical
- Plugin gating before primary-manager bypass is the right security/commercial boundary
- Member self-service baseline is sensible
- Auth-side role and assignment CRUD shape is coherent
- Backend checker and authsvc tests exist and pass
- Frontend role pages are real and usable, not placeholder UI

## Missing Confidence / Coverage
- No strong evidence yet that major non-auth services have broadly migrated to RBAC permission checks
- No broad handler-level verification showing department/zone/self target enforcement across business modules
- No evidence in this review that assignment revocation timing/staleness has been explicitly documented as an operational constraint

## Recommendation
**Do not call this fully implemented yet.**

More accurate status:
- **RBAC foundation:** implemented
- **Role management UI/API:** implemented
- **JWT integration:** implemented
- **System-wide authorization rollout:** incomplete
- **Scope model cleanup:** incomplete

## Required Next Fixes
1. Finish RBAC enforcement rollout across actual product services, not just auth-svc and isolated route slices
2. Remove, hide, or properly implement `site` scope
3. Document the token-staleness behavior for assignment changes and revocation expectations
4. Add more service/handler-level tests for real scoped authorization paths

## Final Assessment
This is real backend + frontend RBAC work, not frontend theater. But the claim that everything is implemented is too strong.

The current state is a **solid RBAC foundation with partial enforcement rollout**, not a completed end-to-end authorization system.
