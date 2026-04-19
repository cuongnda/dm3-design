# Parking Plugin Review Verdict

Date: 2026-04-19
Reviewer: Aysee
Scope: Full Parking plugin review from current codebase state, covering backend correctness, authorization, data integrity, service/event wiring, frontend integration, API client consistency, tests, and UI/UX quality.

## Current Verdict

Risk: MEDIUM-HIGH  
Recommendation: REQUEST CHANGES

## Summary

The Parking plugin has a solid foundation and is much more than a superficial CRUD module. The service is wired into real infrastructure, publishes domain events, integrates with access-service, and already has meaningful package and integration test coverage.

The problem is not that it looks fake. The problem is that several important product controls are present in settings/UI/API shape but are not convincingly enforced in runtime behavior yet.

That creates a dangerous gap between what the product appears to support and what the backend actually guarantees.

Because of that gap, plus a few backend/frontend contract mismatches, this should not be treated as merge-safe yet.

## What Looks Good

### 1. Real service wiring exists

In:
- `backend/cmd/parking-svc/main.go`

Verified:
- DB connection and migrations
- NATS connection
- `PARKING` stream setup on `dm3.parking.>`
- `AUDIT` stream setup
- auth, company, and plugin gating
- parking handler wiring

This is a real service, not a placeholder.

### 2. Cross-service integration is thoughtfully designed

In:
- `backend/cmd/access-svc/main.go`
- `backend/internal/parking/events.go`

Verified:
- parking publishes access-related entry/exit events
- access-service consumes parking events into unified access logs
- parking zone barrier sync events support barrier device auto-registration in access-service

This is one of the strongest parts of the plugin.

### 3. Multi-tenant scoping is mostly consistent

Across:
- `backend/internal/parking/handlers.go`
- `backend/internal/parking/crud_handlers.go`
- `backend/internal/parking/settings_handlers.go`
- `backend/internal/parking/analytics_handlers.go`

Most queries correctly scope by `tenant_id`, which is essential and appears consistently applied in the main flows reviewed.

### 4. Core parking flows exist end-to-end

Reviewed flows include:
- lots
- zones
- vehicles
- fee rules
- sessions
- recognition
- passes
- dashboard/analytics
- settings

This is broad enough to count as a real plugin review, not a narrow endpoint check.

### 5. Test coverage is real, not imaginary

Verified:
- `backend/internal/parking/handlers_test.go`
- `backend/internal/parking/handlers_integration_test.go`
- `go test ./internal/parking/...` passes from `backend/`

There is meaningful test evidence here, including lifecycle/integration-style flow coverage.

## Main Problems

### 1. Several settings exist but are not convincingly enforced in runtime logic

In:
- `backend/internal/parking/settings_handlers.go`
- `backend/internal/parking/handlers.go`
- `apps/console/src/features/parking/ParkingSettingsPage.tsx`

Settings present in API/UI include:
- `require_payment_before_exit`
- `auto_open_barrier_on_pass`
- `plate_recognition_enabled`
- `max_session_hours`
- `notify_on_disputed`
- `capacity_alert_threshold`
- `enforce_access_rules`

From the reviewed code, only `enforce_access_rules` is clearly used in meaningful runtime behavior, and `allow_unregistered_entry` is partially respected inside access-policy checks.

The rest appear mostly stored and editable, but not genuinely enforced in the critical session/recognition/exit flows.

That is the biggest merge blocker.

### 2. Exit/payment lifecycle is muddy and may violate intended business rules

In:
- `backend/internal/parking/handlers.go`

Current behavior in `ExitParkingSession`:
- fee is calculated
- session status can move to `completed`
- payment can still remain `pending`
- barrier opening is delayed unless paid/waived

This means operationally the session can look completed before payment is actually settled.

If the intended business rule is really “payment required before exit”, then the current lifecycle is not clean enough. At minimum, the state model is ambiguous and likely to confuse reporting, reconciliation, and operations.

### 3. `auto_open_barrier_on_pass` does not appear enforced

In:
- `backend/internal/parking/handlers.go`

`CreateParkingSession` currently attempts barrier-open behavior when `EntryDeviceID` is provided and command publish succeeds.

It does not appear to gate that behavior on `auto_open_barrier_on_pass`.

So the setting currently looks more cosmetic than real.

### 4. `plate_recognition_enabled` does not appear enforced

In:
- `backend/internal/parking/handlers.go`

`RecognizeParkingPlate` accepts and processes recognition requests regardless of that setting.

If recognition can be disabled from settings, backend behavior should reflect that explicitly.

### 5. `max_session_hours`, `notify_on_disputed`, and `capacity_alert_threshold` appear underused or unused

In:
- `backend/internal/parking/settings_handlers.go`
- runtime parking handlers and analytics reviewed

These settings are present in DTOs and UI, but there is no convincing reviewed evidence that they drive real enforcement or alert behavior.

Again, that creates product debt disguised as finished functionality.

### 6. API client contract mismatch exists

In:
- `internal/models/parking.go`
- `packages/api-client/src/parking.ts`

Reviewed mismatch:
- backend/model uses `normalized_plate`
- API client exposes `normalized_plate_number`

That is a real contract inconsistency and should be fixed before downstream frontend code depends on the wrong shape.

### 7. Session status naming mismatch exists

In:
- `internal/models/parking.go`
- `backend/internal/parking/crud_handlers.go`
- `apps/console/src/features/parking/ParkingSessionsPage.tsx`

Reviewed mismatch:
- backend status value is `void`
- frontend filter/badge logic expects `voided`

That can break filtering, display, or analytics assumptions and is not safe to leave fuzzy.

### 8. Frontend is functional but still thin for real operators

Reviewed pages include:
- `apps/console/src/features/parking/ParkingDashboardPage.tsx`
- `apps/console/src/features/parking/ParkingSessionsPage.tsx`
- `apps/console/src/features/parking/ParkingVehiclesPage.tsx`
- `apps/console/src/features/parking/ParkingZonesPage.tsx`
- `apps/console/src/features/parking/ParkingPassesPage.tsx`
- `apps/console/src/features/parking/ParkingFeeRulesPage.tsx`
- `apps/console/src/features/parking/ParkingAnalyticsPage.tsx`
- `apps/console/src/features/parking/ParkingSettingsPage.tsx`

Strengths:
- the pages are coherent and usable
- core views exist
- domain grouping is clear

Weaknesses:
- some views still expose operator-unfriendly raw IDs instead of richer labels
- edit flows are limited or thin compared to create/delete flows
- error-state surfacing is still light
- pagination state exists in several pages but UI pagination handling appears incomplete/thin

This is not a blocker by itself, but it lowers confidence for production readiness.

### 9. Authorization is mostly route-level and coarse-grained

In:
- `backend/cmd/parking-svc/main.go`

Current route bands are reasonable:
- authenticated users can read dashboard/analytics/settings
- operator-level routes cover vehicles, sessions, recognition, payment, void, pass listing
- manager-level routes cover lots, zones, fee rules, pass management, settings update

That is a decent first layer.

But deeper business authorization inside handlers is still fairly broad. If future business rules require per-site, per-zone, or per-operator scope restrictions, the current design will need more than route-level role checks.

## UI/UX Review

### Good
- Parking dashboard is clean and readable.
- Analytics page is useful for a first operational dashboard.
- Sessions and settings pages are understandable.
- The plugin is coherent enough that a real team could start piloting it.

### Not good enough yet
- Too many operator workflows still feel like admin/dev tooling rather than polished operations UX.
- Some data presentation is still ID-centric.
- Important policy controls in settings over-promise compared to actual backend enforcement.

## Architecture Review

### Strong parts
- event-driven design is good
- parking-to-access integration is a strong decision
- tenant scoping is generally sound
- handlers are fairly readable
- testability is better than average for an early plugin

### Weak parts
- settings-to-runtime enforcement is incomplete
- business lifecycle semantics are not crisp enough around unpaid exit
- backend/frontend contract consistency still has rough edges

## Highest Priority Fixes Before Merge

1. Enforce settings in runtime logic, not just in settings storage/UI:
   - `require_payment_before_exit`
   - `auto_open_barrier_on_pass`
   - `plate_recognition_enabled`
   - `max_session_hours`
   - disputed/alert behaviors if these settings are meant to be real product controls

2. Fix backend/frontend contract mismatches:
   - `normalized_plate` vs `normalized_plate_number`
   - `void` vs `voided`

3. Clarify and tighten session lifecycle semantics:
   - unpaid exit should not ambiguously appear fully completed unless explicitly intended and documented

4. Add focused regression tests for:
   - settings-driven behavior
   - recognition disabled flow
   - payment-before-exit enforcement
   - voided session filtering/state shape
   - contract shape consistency in API client-facing responses

## Final Recommendation

This plugin has a good foundation, real event wiring, real tests, and real operational breadth.

But it still has an uncomfortable gap between what the product surface suggests and what the backend actually enforces.

Because of that, the current recommendation remains:

**Risk: MEDIUM-HIGH**  
**Recommendation: REQUEST CHANGES**
