# Visitor Plugin Review Verdict

## Verdict
- Risk: MEDIUM-HIGH
- Recommendation: REQUEST CHANGES

## Scope Reviewed
- Backend service wiring and routes
  - `backend/cmd/visitor-svc/main.go`
- Backend visitor module
  - `backend/internal/visitor/handlers.go`
  - `backend/internal/visitor/visit_handlers.go`
  - `backend/internal/visitor/walkin_handlers.go`
  - `backend/internal/visitor/group_handlers.go`
  - `backend/internal/visitor/watchlist_handlers.go`
  - `backend/internal/visitor/agreement_handlers.go`
  - `backend/internal/visitor/access_log_handlers.go`
  - `backend/internal/visitor/analytics_handlers.go`
  - `backend/internal/visitor/recurring_handlers.go`
  - `backend/internal/visitor/settings_handlers.go`
  - `backend/internal/visitor/credential_consumer.go`
  - `backend/internal/visitor/events.go`
  - `backend/internal/visitor/cache.go`
  - `backend/internal/visitor/cron.go`
  - `backend/internal/visitor/models.go`
  - `backend/internal/visitor/qr.go`
- Frontend routes and pages
  - `apps/console/src/app/router.tsx`
  - `apps/console/src/components/common/PluginGuard.tsx`
  - `apps/console/src/features/manage/visitors/VisitorsPage.tsx`
  - `apps/console/src/features/visitors/VisitorPreRegisterPage.tsx`
  - `apps/console/src/features/visitors/VisitorGroupsPage.tsx`
  - `apps/console/src/features/visitors/VisitorWatchlistPage.tsx`
  - `apps/console/src/features/visitors/VisitorAgreementsPage.tsx`
  - `apps/console/src/features/visitors/VisitorAccessHistoryPage.tsx`
  - `apps/console/src/features/visitors/VisitorAnalyticsPage.tsx`
  - `apps/console/src/features/visitors/VisitorRecurringPage.tsx`
  - `apps/console/src/features/visitors/VisitorSettingsPage.tsx`
- API client
  - `packages/api-client/src/visitors.ts`
- Test evidence
  - `backend/internal/visitor/handlers_test.go`
  - `backend/internal/visitor/module_handlers_test.go`
  - `backend/internal/visitor/visit_lifecycle_integration_test.go`
  - `backend/internal/visitor/visitor_scenarios_test.go`
- Verification run
  - `cd backend && go test ./internal/visitor/...` ✅

## What is solid
- The plugin is not just CRUD. The service is wired as a real module with DB migrations, NATS streams, audit publishing, lookup cache subscription, credential consumer, and background jobs in `backend/cmd/visitor-svc/main.go`.
- Core visit lifecycle is reasonably complete: pre-register, approve/reject, walk-in, check-in, checkout, reinvite, QR lookup, watchlist, groups, agreements, recurring templates, analytics, settings.
- There is real backend test evidence, including lifecycle and module-level tests. This is materially better than a thin demo plugin.
- QR token generation uses crypto randomness in `backend/internal/visitor/qr.go`, which is the right call.
- The host approval rule is better than many plugins: `ApproveVisit` checks `canApproveVisit(r, hostUserID)` instead of blindly allowing any viewer/operator.
- Frontend route coverage is broad enough that the feature feels like a whole plugin, not a stub.

## Main issues

### 1) API contract mismatches and missing client coverage
This is the biggest merge-safety problem on the frontend/integration side.

- `packages/api-client/src/visitors.ts` calls batch creation at `POST /api/v1/visitors/visits/batch`, but the backend route in `backend/cmd/visitor-svc/main.go` is `POST /api/v1/visitors/batch`.
  - Result: batch creation from the client will hit the wrong endpoint.
- `packages/api-client/src/visitors.ts` exposes `deleteAgreement(id)` to `DELETE /api/v1/visitors/agreements/{id}`, but `backend/cmd/visitor-svc/main.go` does not register any delete-agreement route, and `backend/internal/visitor/agreement_handlers.go` does not implement one.
  - Result: the UI advertises deletion that the backend does not support.
- `packages/api-client/src/visitors.ts` exposes `listVisitorAccessLog()` against `/api/v1/visitors/access-log`, but the backend only exposes `GET /api/v1/visitors/{id}/access-log` and `GET /api/v1/visitors/history/{visitor_id}`.
  - Result: `VisitorAccessHistoryPage.tsx` is wired to a route that does not exist.
- `packages/api-client/src/visitors.ts` exposes `triggerEvacuation()` against `POST /api/v1/visitors/evacuate`, but the backend only exposes `GET /api/v1/visitors/evacuation`.
  - Result: client/server mismatch again.
- `listRecurringTemplates()` in the client is typed as `Promise<RecurringTemplateDTO[]>`, but the backend handler `ListRecurringTemplates` returns paginated output via `httputil.Paginated(...)`.
  - Result: the current page is very likely relying on the wrong response shape.
- `updateVisitGroup()` exists in the client, but there is no corresponding update route in `backend/cmd/visitor-svc/main.go` and no handler implementation.

This is enough on its own to block merge confidence. The surface area is broad, but the contract is not clean.

### 2) Settings exist, but runtime enforcement is patchy
`backend/internal/visitor/settings_handlers.go`, `backend/internal/visitor/models.go`, and `apps/console/src/features/visitors/VisitorSettingsPage.tsx` expose a fairly rich policy model, but several settings are not convincingly enforced in the runtime flow.

Notably risky:
- `self_service_enabled`
- `self_service_requires_qr`
- `require_photo`
- `require_national_id`
- `require_nda`
- `notify_host_on_register`
- `notify_host_on_arrival`
- `approver_user_ids`
- `max_duration_hours`

Examples from current code state:
- `WalkinVisit` in `backend/internal/visitor/walkin_handlers.go` hardcodes `status='waiting'` and a 4-hour QR expiry. It does not appear to load settings or respect approval/QR/self-service policy.
- `CheckinVisit` in `backend/internal/visitor/visit_handlers.go` accepts optional `national_id`, `photo_ref`, and `nda_signed`, but the visible flow does not convincingly reject check-in when policy requires them and the request omits them.
- `ApproveVisit` checks host/coarse permission but does not appear to use `approver_user_ids` as an approval allowlist.
- `CreateVisit` and related flows may use some approval logic, but policy application is not obviously consistent across pre-register, walk-in, reinvite, and recurring generation.

Right now the settings page is stronger than the actual enforcement. That is dangerous because it creates fake safety.

### 3) Authorization is still coarse in business-sensitive paths
The plugin has route-level auth and some handler-level checks, but the business authorization still feels too broad in places.

- `ApproveVisit` is better than average, but the approval model still appears centered on host identity and broad role checks, not a richer policy model.
- Agreement administration uses `requireWatchlistAdmin(r)` in `backend/internal/visitor/agreement_handlers.go`, which is odd semantically. It works as a coarse admin gate, but it suggests permissions are being reused opportunistically rather than modeled cleanly.
- Group management and recurring template management use broad write permission, with limited deeper business rules.
- `PluginGuard` remains plugin gating, not authorization enforcement. That is fine as long as backend is authoritative, but backend policy still needs tightening.

I would not call this insecure by default, but I would call it under-specified for a visitor/security-adjacent module.

### 4) Some operator UX is still thin or misleading
A lot of the pages technically exist, but several feel more like admin scaffolding than production operator workflows.

- `VisitorGroupsPage.tsx` still asks for raw `hostUserId` instead of using the host picker pattern already present in `VisitorsPage.tsx`. That is clunky and error-prone.
- `VisitorAgreementsPage.tsx` offers delete actions even though the backend route is missing. That is not just rough UX, it is a broken action.
- `VisitorAccessHistoryPage.tsx` is wired to an API function that currently points to a non-existent endpoint, so the page is effectively lying until the client/backend contract is fixed.
- `VisitorRecurringPage.tsx` assumes a plain array response and only supports activate/deactivate/delete, with no create/edit flow in the page itself.
- Several pages still surface raw IDs when cache lookups or richer labels are unavailable.
- Error handling is generally light. Pages often fall back to generic empty/loading states without surfacing actionable backend errors.

### 5) Lifecycle consistency is decent, but not yet airtight
The lifecycle is one of the stronger parts of this plugin, but there are still places where I want sharper rules.

- `WalkinVisit` bypasses the richer approval/settings pipeline and goes straight to `waiting` with fixed QR semantics.
- Agreement signing is recorded, but I do not see convincing enforcement that a required agreement must be signed before check-in when policy says so.
- There is useful watchlist blocking in check-in, but the exact behavior for flagged vs blocked visitors should be clearer and more explicitly tested.
- The plugin has self-service concepts in settings and valid check-in methods like `self_service`, but I do not see a strong end-to-end self-service flow enforcement story yet.

## Concrete findings
- `backend/cmd/visitor-svc/main.go`
  - Good: service wiring, streams, audit, cache, credential consumer, background jobs.
  - Gap: registered routes do not match all client functions.
- `backend/internal/visitor/walkin_handlers.go`
  - Gap: hardcoded walk-in behavior, not obviously policy-driven.
- `backend/internal/visitor/agreement_handlers.go`
  - Gap: no delete agreement handler, but the client/UI expects one.
- `backend/internal/visitor/access_log_handlers.go`
  - Gap: backend supports per-visit and per-visitor history, but the client page is pointed at a different endpoint shape.
- `backend/internal/visitor/recurring_handlers.go`
  - Gap: backend returns paginated recurring templates, but client page expects array semantics.
- `packages/api-client/src/visitors.ts`
  - Multiple route/shape mismatches, enough to make the plugin feel only partially wired.
- `apps/console/src/features/visitors/VisitorGroupsPage.tsx`
  - UX gap: raw host UUID input.
- `apps/console/src/features/visitors/VisitorAgreementsPage.tsx`
  - Broken delete action relative to backend.
- `apps/console/src/features/visitors/VisitorAccessHistoryPage.tsx`
  - Broken endpoint path via current API client.

## Test review
Good news first:
- There is meaningful backend coverage.
- `visit_lifecycle_integration_test.go` is especially useful because it checks lifecycle side effects like temp credential revocation, temp user deactivation, badge return state, and visitor counters.
- Scenario tests around approve/check-in/checkout edge cases are present.
- `go test ./internal/visitor/...` passes.

Still missing or not convincing enough:
- client/backend contract tests for all exposed API functions
- tests proving required settings are enforced at runtime, not just stored and retrieved
- tests for agreement-required-before-checkin policy
- tests for self-service gating and QR-required self-service flow
- tests for `approver_user_ids` behavior, if that field is intended to matter
- tests for batch API path/client alignment

## Recommendation before merge
Request changes.

This plugin is substantially further along than a fake feature branch, but it is not merge-safe yet because the edges are where real systems fail: route contracts, settings enforcement, and admin/operator behavior.

## Minimum fix list
1. Fix client/backend route mismatches in `packages/api-client/src/visitors.ts`.
   - batch path
   - access-log path
   - evacuation path
   - recurring response typing
   - remove or implement agreement delete and visit-group update
2. Either implement the missing backend routes or remove the corresponding frontend/client actions.
3. Tighten runtime enforcement of visitor settings, especially:
   - required NDA
   - required photo
   - required national ID
   - self-service flags
   - approver allowlist behavior if intended
   - max duration constraints
4. Make walk-in flow policy-aware instead of hardcoding status/QR behavior.
5. Replace raw host UUID entry in groups with the same host selector pattern already used elsewhere.
6. Add focused tests for the above fixes.

## Bottom line
The visitor plugin is promising and materially more complete than the average half-built module, but right now it still has too many contract and policy gaps to call it safe to merge.
