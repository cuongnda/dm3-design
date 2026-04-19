# Parking Plugin Review Verdict

## Verdict
- Risk: MEDIUM
- Recommendation: NEEDS CHANGES, but close

## Scope Reviewed
- Backend service wiring and routes
  - `backend/cmd/parking-svc/main.go`
  - parking-related consumers in `backend/cmd/access-svc/main.go`
- Backend parking module
  - `backend/internal/parking/handlers.go`
  - `backend/internal/parking/crud_handlers.go`
  - `backend/internal/parking/settings_handlers.go`
  - `backend/internal/parking/analytics_handlers.go`
  - `backend/internal/parking/events.go`
  - `backend/internal/parking/helpers.go`
- Frontend routes and pages
  - `apps/console/src/app/router.tsx`
  - `apps/console/src/components/common/PluginGuard.tsx`
  - `apps/console/src/features/parking/ParkingSessionsPage.tsx`
  - `apps/console/src/features/parking/ParkingSettingsPage.tsx`
  - other parking pages under `apps/console/src/features/parking/*`
- API client
  - `packages/api-client/src/parking.ts`
- Test evidence
  - `backend/internal/parking/handlers_test.go`
  - `backend/internal/parking/handlers_integration_test.go`

## Re-review summary
This pass is materially better than the earlier parking review.

A few of the original blockers were actually fixed:
- `plate_recognition_enabled` is now enforced in `RecognizeParkingPlate`.
- `auto_open_barrier_on_pass` is now respected for pass-holder entry in `CreateParkingSession`.
- `require_payment_before_exit` is now enforced more honestly in `ExitParkingSession`, so unpaid exits can remain `active` instead of being prematurely marked `completed`.
- The old backend/frontend contract mismatch around `normalized_plate` vs `normalized_plate_number` appears fixed.
- The old mismatch around `void` vs `voided` appears fixed in the current frontend/client, and there is backend test coverage explicitly guarding that.

So this is no longer a `REQUEST CHANGES because the contracts are obviously broken` situation. It is closer than before.

That said, I still would not approve it cleanly yet.

## What is solid
- `backend/cmd/parking-svc/main.go` is properly wired as a real service: DB, migrations, NATS, `PARKING` stream, `AUDIT` stream, handler setup.
- Parking is treated as an evented subsystem, not just CRUD. It publishes session entry/exit/payment/capacity events and barrier sync commands.
- `backend/cmd/access-svc/main.go` is still part of the story, because parking-related events feed access history / barrier registration flows.
- The backend logic is more complete than many plugins: lots, zones, vehicles, sessions, fee rules, passes, analytics, settings, recognition flow, barrier integration.
- `go test ./internal/parking/...` is being exercised with meaningful integration coverage, not just unit stubs.
- `handlers_integration_test.go` now includes targeted regression tests for several previously-called-out issues:
  - payment-before-exit behavior
  - recognition disabled behavior
  - overstay disputes via `max_session_hours`
  - canonical `void` filtering
  - response contract key `normalized_plate`

## Remaining issues

### 1) Current test suite is still red in current repo state
This matters.

My rerun of:
- `cd backend && go test ./internal/parking/...`

failed in the current state.

The log shows the failure occurs during the parking integration test run, after several lifecycle requests succeed. I did not yet pin the exact failing assertion from the truncated output, but the package is currently not green in this repo state.

That alone means I cannot call the plugin merge-safe right now.

## 2) Several settings still exist more in UI/config than in core runtime behavior
This is the main architectural gap that remains.

`backend/internal/parking/settings_handlers.go` and `apps/console/src/features/parking/ParkingSettingsPage.tsx` expose a broad policy surface, but some fields still do not appear convincingly enforced end-to-end:

- `confidence_threshold`
- `free_minutes_global`
- `default_fee_currency`
- `enforce_access_rules` is used, but only in one narrow path, and still feels under-proven operationally

Concrete examples:
- `confidence_threshold` is editable in settings UI, but the recognition path in `RecognizeParkingPlate` still classifies by hardcoded thresholds in `recognitionMatchMode()` (`0.85`, `0.70`) instead of the persisted tenant setting.
- `free_minutes_global` exists in settings/UI but fee calculation still depends on fee rule `free_minutes`; I do not see convincing application of the global setting in `calculateParkingFee()`.
- `default_fee_currency` exists in settings/UI, but session creation still hardcodes `'VND'` in `CreateParkingSession`.
- `enforce_access_rules` is real and wired into `checkAccessPolicy()`, which is good, but I still want stronger confidence via broader tests because this is cross-module authorization logic and easy to get subtly wrong.

So the product surface still over-promises a bit.

### 3) Some business semantics are better, but still not fully elegant
The biggest lifecycle issue, payment-before-exit, improved. Good.

But the resulting flow is still a bit awkward:
- `ExitParkingSession` can leave a session `active` even after exit-time is set, because payment is pending.
- That may be intentional, but it means `active` now partly means "vehicle still inside" and partly means "exit attempted but not financially cleared yet".

That is survivable, but it is muddy. If this is the intended product model, I would want it documented and reflected clearly in UI labels, queries, and reports.

### 4) Frontend is mostly aligned now, but still somewhat thin for operators
Compared to the earlier pass, the obvious contract breakages are much better.

Still, parking frontend remains operationally thin in a few places:
- limited richer edit/review flows around sessions and disputes
- light surfacing of decision code / reason despite backend carrying them
- settings page still exposes fields whose runtime effect is partial or unclear
- route/plugin gating is present, but `PluginGuard` is still only plugin presence, not authorization

This is not a blocker by itself, but it contributes to the "close, not done" verdict.

## Important deltas from the previous review
The previous parking review concluded:
- Risk: MEDIUM-HIGH
- Recommendation: REQUEST CHANGES

I would now revise that downward because several of the earlier findings have been genuinely addressed:
- contract mismatch around `normalized_plate` appears fixed
- legacy `voided` mismatch appears fixed and regression-tested
- recognition disable behavior appears implemented and tested
- payment-before-exit behavior appears improved and tested
- pass auto-open behavior now checks settings

So this plugin has clearly moved forward.

## What still blocks a clean approval
1. Get `go test ./internal/parking/...` green again in the current repo state.
2. Either enforce or remove the settings that are still mostly decorative:
   - `confidence_threshold`
   - `free_minutes_global`
   - `default_fee_currency`
3. Clarify the lifecycle semantics of an exited-but-unpaid vehicle session that remains `active`.
4. Add at least a couple more focused integration tests around:
   - tenant-configured recognition threshold behavior
   - global free-minutes behavior, if that setting is meant to matter
   - non-VND default currency behavior, if that setting is meant to matter
   - access-rule enforcement edge cases across linked zones/users

## Recommendation
NEEDS CHANGES, but close.

This is no longer the shaky parking plugin I saw earlier. A bunch of the real issues were fixed, and I’m glad we re-reviewed it instead of trusting the old verdict.

But with the parking package currently failing test rerun in this repo state, plus a few settings still not meaningfully enforced, I still would not stamp it approved today.
