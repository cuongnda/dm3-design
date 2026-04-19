# Visitor Plugin Review Verdict

## Verdict
- Risk: MEDIUM
- Recommendation: NEEDS CHANGES, but close

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

- `packages/api-client/src/visitors.ts` now correctly posts batch creation to `POST /api/v1/visitors/batch`, which matches `backend/cmd/visitor-svc/main.go`.
- `listVisitorHistory()` now correctly targets `GET /api/v1/visitors/history/{visitor_id}`, and `VisitorAccessHistoryPage.tsx` uses that path, so the earlier access-history route mismatch is fixed.
- `getEvacuationList()` now correctly uses `GET /api/v1/visitors/evacuation`, which matches the backend.
- `listRecurringTemplates()` is now typed as paginated and `VisitorRecurringPage.tsx` consumes `data?.data ?? []`, which fixes the earlier array-vs-paginated mismatch.
- The old raw `hostUserId` input problem in `VisitorGroupsPage.tsx` is also fixed, the page now uses `HostSelect`.

Remaining contract / capability issues:
- `packages/api-client/src/visitors.ts` still does not expose a delete-agreement action, which is fine, because the backend also does not implement one. The old review point about a broken delete action is obsolete.
- `UpdateRecurringTemplate` in `backend/internal/visitor/recurring_handlers.go` only updates `active` and `end_date`, while `VisitorRecurringPage.tsx` edit mode submits a broader payload (`host_user_id`, `purpose`, `recurrence_rule`, `start_date`, `escort_required`). That means the edit UI currently implies more editable fields than the backend actually persists.
- `DeleteRecurringTemplate` returns HTTP 200 with `{status:"deactivated"}` instead of a real delete/no-content response. That is acceptable if intentional, but the naming in client/UI still reads like a hard delete while backend behavior is soft deactivate.

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
- `CreateVisit` in `backend/internal/visitor/visit_handlers.go` now does more real policy work than before. It loads tenant settings, enforces `require_email`, `require_phone`, `require_company`, checks `allowed_purposes`, and applies `approval_required` plus auto-approve rules for VIP / returning visitors.
- But `WalkinVisit` in `backend/internal/visitor/walkin_handlers.go` still hardcodes `status='waiting'` and a 4-hour QR expiry, and does not appear to load tenant settings or respect approval / QR / self-service policy.
- `CheckinVisit` in `backend/internal/visitor/visit_handlers.go` still accepts optional `national_id`, `photo_ref`, and `nda_signed`, but the visible flow does not convincingly reject check-in when policy requires them and the request omits them.
- `ApproveVisit` checks host/coarse permission but still does not appear to use `approver_user_ids` as an approval allowlist.
- Policy application is therefore better than the old verdict suggested, but still inconsistent across pre-register, walk-in, approval, and check-in paths.

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

- `VisitorGroupsPage.tsx` is improved, it now uses `HostSelect`, which is the right direction and removes the raw host UUID problem.
- `VisitorAgreementsPage.tsx` no longer appears to offer a nonexistent delete action. It currently supports create and active/inactive toggle via `updateAgreement`, which aligns with the reviewed backend.
- `VisitorAccessHistoryPage.tsx` is now wired through `listVisitorHistory(...)`, which matches the backend history route.
- `VisitorRecurringPage.tsx` is improved and now has create/edit UI, but its edit form still over-promises because backend `UpdateRecurringTemplate` does not persist the full set of fields the page lets the operator change.
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
Needs changes, but close.

This plugin is substantially further along than the earlier review state. Several concrete client/backend mismatches are now genuinely fixed. But it is still not fully merge-safe because policy enforcement remains inconsistent and the recurring-template edit flow still overstates backend capability.

## Minimum fix list
1. Tighten runtime enforcement of visitor settings, especially:
   - required NDA
   - required photo
   - required national ID
   - self-service flags
   - approver allowlist behavior if intended
   - max duration constraints
2. Make walk-in flow policy-aware instead of hardcoding status/QR behavior.
3. Align recurring-template edit UX with backend capability, either expand `UpdateRecurringTemplate` or narrow the form to fields the backend actually persists.
4. Add focused tests for the above fixes.

## Bottom line
The visitor plugin is in better shape than the old verdict suggested. Some earlier integration findings are now fixed for real.

But I still would not fully approve it today. The main remaining issue is no longer broad route mismatch, it is uneven policy enforcement, especially around walk-in and check-in requirements, plus the recurring-template edit surface promising more than backend update behavior actually supports.
