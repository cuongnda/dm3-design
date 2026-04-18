# Attendance Plugin — Development Plan

> Spec: `docs/specs/manage/attendance.md`
> Architecture: `docs/architecture/module-isolation.md`
> Status: Draft plan | Owner: attend-svc team | Last updated: 2026-04-18

## 1. Scope & Strategy

The spec is a large surface (attendance + shifts + overtime + leave management + reports + self-service). Delivering everything at once is high risk. This plan splits the work into **five sprints** sequenced so each one ships independent user value.

**Reference implementation:** `visitor-svc` — same "event-driven, no MQTT, derived data" pattern. Steal its structure (handler package layout, `StartBackgroundJobs`, `LookupCache`, audit pattern).

**Out of scope for v1:**
- Mobile clock-in (GPS geofence) — defer to a later mobile-only sprint
- Payroll/HR external sync — keep as webhook `/leave/sync`, no bi-directional ERP
- Face photo at clock-in/out — plumb the photo_ref column but rendering/storage waits for CCTV clip integration

## 2. Pre-Flight Checklist

Before Sprint 1 starts, resolve these:

- [ ] **Port:** confirm `8010` for attend-svc (spec reserves this; `8009` is the next gap — `8006–8008` are visitor/parking/cctv). Add to `docker-compose.local.yml` and `scripts/local-reload.sh`.
- [ ] **Delete mock page:** `apps/console/src/features/manage/attendance/AttendancePage.tsx` has mock data. The new code lives in `apps/console/src/features/attendance/` per the spec. Remove the old file and its import/route.
- [ ] **Add plugin flag:** the `attendance` string value needs to appear in the known plugin list. Find the system-admin plugin picker and add `attendance` as a known option.
- [ ] **Enable on test tenant:** add `"attendance"` to `dm3_auth.tenants.enabled_plugins` for one seed tenant so dev work renders.
- [ ] **Decision: overtime = approval-gated or auto?** Spec says both (BR-ATT-005). Pick the default for v1 — recommend **approval-gated** to keep OT hours = 0 when no request, matching BR-ATT-005 first clause. Make it a tenant setting if disputed.
- [ ] **Decision: Vietnamese labels vs i18n keys.** Spec uses Vietnamese strings liberally ("Hành chính", "Ca sáng"). Seed a `shift.presets` table or hardcode English slugs? Recommend: store shift names as tenant-authored text; provide a Vietnamese seed set the tenant admin can import.

## 3. Sprint Plan

### Sprint 1 — Backend foundation + daily records (read-only) `~1 week`

Goal: events flow in, records show up on `/manage/attendance`, daily view renders with real data.

**Backend**
- `cmd/attend-svc/main.go` — boilerplate lifted from visitor-svc, port 8010
- Migration `000019_attendance_schema.up.sql` — create `dm3_attendance` schema, tables: `attendance_records`, `shifts`, `shift_assignments`, `attendance_devices`, `holiday_calendar`. Use TimescaleDB hypertable on `attendance_records(date)` for monthly queries.
- `internal/attendance/models.go` — structs for the above
- `internal/attendance/consumers.go` — NATS durable consumer on `dm3.access.*.event.log`; implements BR-ATT-001/002/003/011/013:
  - Dedupe within 5-second window `(user_id, device_id, timestamp)`
  - First entry event → create/update record.clock_in
  - Last exit event → update record.clock_out
  - Resolve shift via `shift_assignments` at event time
  - Compute late_minutes, status (`on_time` | `late`)
- `internal/attendance/records_handlers.go`:
  - `GET /api/v1/attendance/records` (paginated, filter by site/date/department/user/shift/status) + summary counters
  - `GET /api/v1/attendance/records/{id}`
- `internal/attendance/cache.go` — user display-name cache subscribing to `dm3.identity.user.*` (same pattern as visitor `LookupCache`)
- All routes mounted behind `authsvc.RequirePlugin("attendance")`
- Audit publishing via `pkg/audit.Logger` (consumer writes `attendance.clock_in`/`attendance.clock_out`)

**Frontend**
- `apps/console/src/features/attendance/AttendanceDailyPage.tsx` — date picker + filters + DataTable, summary chips (on-time/late/absent/on-leave)
- Route `/manage/attendance` gated by `PluginGuard plugin="attendance"`
- `packages/api-client/src/attendance.ts` — `listRecords`, `getRecord` DTOs
- Delete the mock `features/manage/attendance/` tree

**Acceptance**
- Clocking in at a seeded device (via simulator) creates a record within 2 seconds
- Daily view shows real clock-in/out times, correct late classification, filters work
- Playwright smoke test in `automation/tests/web/company-admin/test_attendance.py`

---

### Sprint 2 — Shifts, assignments, manual adjustments `~1 week`

Goal: admins can define shifts, assign to users, and fix bad records with audit trail.

**Backend**
- `internal/attendance/shifts_handlers.go`:
  - `GET/POST/PUT /api/v1/attendance/shifts`
  - `POST /api/v1/attendance/shifts/assign` (bulk user_ids → shift)
- `internal/attendance/adjust_handlers.go`:
  - `PUT /api/v1/attendance/records/{id}` with `manual_adjustment=true`, `adjusted_by`, `adjustment_reason`
  - `POST /api/v1/attendance/clockin` / `POST /api/v1/attendance/clockout` (manual by operator)
  - Audit entries `attendance.adjusted` with before/after diff (7-year retention)
- Re-compute status on adjustment

**Frontend**
- `AttendanceShiftsPage.tsx` — shift list, create/edit form (time pickers, working_days chips, break config)
- Shift-assignment modal with user multi-select + effective date range
- Adjustment drawer on daily view row (opens from row actions, requires reason)
- `AttendancePersonPage.tsx` — `/manage/attendance/:personId`, calendar heatmap + monthly table + timeline

**Acceptance**
- Shift CRUD works, default shift can be toggled
- Assignment updates affect future records, not historical
- Adjustment drawer shows diff + reason, audit log records the change

---

### Sprint 3 — Cron jobs, overtime, monthly summary `~1 week`

Goal: absences marked automatically, OT workflow, monthly numbers available.

**Backend**
- `internal/attendance/cron.go` with two workers (cctv-style `RetentionWorker` pattern):
  - **Absence marker** — runs every 15 min; for each active shift where `now > shift.end_time + 1h` and record has no clock_in and no approved leave, insert record with `status=absent` (BR-ATT-004). Emits `attendance.marked_absent` audit.
  - **Summary recalculator** — cron hook at 02:00 daily; recomputes `attendance_summary` for current month for all users with changes. Also triggered inline on adjust.
- `internal/attendance/overtime_handlers.go`:
  - `POST /api/v1/attendance/overtime/request` (self-service)
  - `PUT /api/v1/attendance/overtime/{id}/approve|reject`
  - `GET /api/v1/attendance/overtime` (filter by status/date)
  - On approve, reopen record and compute `overtime_hours` from actual clock-out vs shift.end + threshold
- `GET /api/v1/attendance/summary` and `GET /api/v1/attendance/summary/department` — read from `attendance_summary`

**Frontend**
- `AttendanceOvertimePage.tsx` — tabs for pending / approved / rejected, approve/reject modal
- Monthly summary widget on Person page pulling from `/summary`
- Department summary strip on daily view header (optional, nice-to-have)

**Acceptance**
- Kill access-svc for a shift window, restart → absent records appear within 15 min
- OT request → admin approves → record.overtime_hours updated, shown in daily view
- Monthly summary matches a hand-calculation for a seeded user

---

### Sprint 4 — Leave management (request → approve → balance) `~1.5 weeks`

This is the biggest sprint — the spec treats leave as almost a separate feature. Can be sliced further if needed.

**Backend**
- Migration `000020_attendance_leave.up.sql` — tables: `leave_requests`, `leave_balances`, `leave_policies`, `holiday_calendar` (add if not in sprint 1)
- `internal/attendance/leave_handlers.go`:
  - `GET/POST /api/v1/attendance/leave/requests`
  - `GET /api/v1/attendance/leave/requests/{id}`
  - `PUT /api/v1/attendance/leave/requests/{id}/approve|reject|cancel`
  - `GET/PUT /api/v1/attendance/leave/balances`
  - `GET/POST /api/v1/attendance/leave/policies`
  - `GET /api/v1/attendance/leave/calendar`
  - `POST /api/v1/attendance/leave/sync` (external HR webhook)
- Business rules:
  - BR-ATT-015 balance reservation (pending → used on approval, release on reject/cancel)
  - BR-ATT-009 clash detection — if clock-in and approved leave on same date, mark record as `exception` and surface to manager
  - BR-ATT-016 policy enforcement in POST (min notice, attachment, quota, approval mode)
  - BR-ATT-017 partial-day calculation folding into late/early-leave math
  - BR-ATT-018 holiday precedence on leave deduction
  - Auto-approve below threshold per policy
- Publish events `leave.requested/approved/rejected/cancelled` to NATS
- Audit entries `leave.*` at 3-year retention, `leave.balance_adjusted`/`leave.policy_updated` at 7-year

**Frontend**
- `AttendanceLeaveRequestsPage.tsx` — list + status tabs + request drawer with balance preview
- `AttendanceLeaveBalancePage.tsx` — per-type balance cards, admin adjustment modal
- `AttendanceLeaveCalendarPage.tsx` — monthly calendar, department filter, approved vs pending overlay
- `AttendanceLeavePoliciesPage.tsx` — policy form per leave_type × site
- Self-service page `/me/leave` — request form, history, balance cards, cancel action
- On daily attendance view, leave-typed days show a leave chip instead of late/absent

**Acceptance**
- Employee submits request → balance `pending_days` reserved → admin approves → moves to `used_days`, attendance marked `on_leave`
- Rejection returns pending to available
- Clash scenario (approved leave + clock-in) enters `exception` state with admin banner
- Policy validation returns actionable errors
- External webhook sync creates records without requester

---

### Sprint 5 — Reports, self-service, settings, holiday calendar `~1 week`

Goal: close the loop for end users and operations.

**Backend**
- `GET /api/v1/attendance/report/monthly?format=csv|xlsx` — server-side generation, uploads to MinIO, returns signed URL
- `GET/POST /api/v1/attendance/devices` — designate which devices are attendance sources
- Holiday calendar CRUD (likely `/settings/holidays`)
- BR-ATT-007 labor-law warning — compute on summary, emit advisory when > 48h/week or > 40h/month OT

**Frontend**
- `AttendanceReportsPage.tsx` — monthly table (✓/L/V/P cells per Vietnamese HR format), department comparison, CSV/Excel buttons
- `AttendanceSettingsPage.tsx` — attendance-device designation, holiday calendar editor, threshold sliders
- `/me/attendance` — personal timeline, monthly stats, shift info, exceptions surface

**Acceptance**
- Monthly CSV/XLSX download matches on-screen totals and Vietnamese format spec
- Holiday marked on calendar → attendance on holiday auto-classifies as 300% OT per BR-ATT-008
- Self-service page loads for non-admin role; correctly scoped to own records only

---

## 4. Cross-Cutting Work

**Tests**
- Go: `backend/internal/attendance/*_test.go` — unit tests for status calculation, late logic, break deduction, cross-midnight shift, dedup. Target 80%+ coverage on business logic.
- Automation: `automation/tests/api/test_attendance_*.py`, `automation/tests/web/company-admin/test_attendance_*.py` per Sprint
- Tenant isolation test — attendance data from tenant A must not leak to tenant B (`automation/tests/tenant_isolation/`)

**Observability**
- NATS consumer lag metric (events/sec processed, delay)
- Cron run timestamps logged to audit-svc
- Surface `exception` records count on admin dashboard

**Data migration / seed**
- `make seed-attendance` target — seeds shifts (Hành chính, Ca sáng, Ca chiều, Ca đêm), 3 holidays, 5 leave policies per leave_type, assigns default shift to all seeded users
- Backfill option: replay last 30 days of access events into attendance for tenants enabling the plugin for the first time

## 5. Risks & Open Questions

| Risk | Mitigation |
|------|-----------|
| Event ordering from offline devices arrives days late (BR-ATT-011/override) | Ensure consumer is idempotent and summary recalculator runs on `record.updated` event so late events correct history |
| Cross-midnight shift logic bug | Dedicated table-driven tests covering 22:00-06:00, 18:00-02:00, shift spanning DST, before implementing handlers |
| Leave clash handling ambiguity | Confirm with product: banner-only vs block-on-create vs auto-reject approved-leave-day clock-in |
| Performance of monthly report for 1000+ employees | Drive off `attendance_summary` table, not live aggregation; add composite index `(tenant_id, month, site_id)` |
| Payroll export format drift | Keep XLSX generation behind a versioned endpoint `?format=xlsx&version=v1` |
| Vietnamese character handling in CSV | Use UTF-8 with BOM for Excel compatibility |

**Open questions to settle before Sprint 1:**
1. Does "site" map to an existing DM3 entity or is it a new attendance-local concept? Spec uses `site_id` as a soft reference but core doesn't have a `sites` table in the primary identity schema — clarify.
2. Who is the approver for OT when a department head isn't configured? Fallback to admin?
3. Is `/me/attendance` a separate app surface or embedded in the same console behind an end-user role?

## 6. Sequencing & Handoff Notes

- Sprints 1 → 3 must ship in order (downstream depends on `attendance_records` shape).
- Sprint 4 (leave) can run **in parallel** with Sprint 3 if a second engineer is available; leave interacts with attendance via the `attendance_record.leave_type` column only.
- Sprint 5 can begin once Sprints 2 and 3 land.
- Every sprint ends with: migration + handler + test + frontend page + an automation test + a commit per spec feature. Follow the repo convention of "commit per task".

## 7. File-Level Deliverables Summary

```
backend/
  cmd/attend-svc/main.go                          # Sprint 1
  internal/attendance/
    models.go                                     # Sprint 1
    records_handlers.go                           # Sprint 1
    shifts_handlers.go                            # Sprint 2
    adjust_handlers.go                            # Sprint 2
    overtime_handlers.go                          # Sprint 3
    leave_handlers.go                             # Sprint 4
    report_handlers.go                            # Sprint 5
    devices_handlers.go                           # Sprint 5
    consumers.go                                  # Sprint 1
    cache.go                                      # Sprint 1
    cron.go                                       # Sprint 3
    events.go                                     # Sprint 3
    *_test.go
  pkg/db/migrations/
    000019_attendance_schema.up/down.sql          # Sprint 1
    000020_attendance_leave.up/down.sql           # Sprint 4

apps/console/src/features/attendance/
  AttendanceDailyPage.tsx                         # Sprint 1
  AttendancePersonPage.tsx                        # Sprint 2
  AttendanceShiftsPage.tsx                        # Sprint 2
  AttendanceOvertimePage.tsx                      # Sprint 3
  AttendanceLeaveRequestsPage.tsx                 # Sprint 4
  AttendanceLeaveBalancePage.tsx                  # Sprint 4
  AttendanceLeaveCalendarPage.tsx                 # Sprint 4
  AttendanceLeavePoliciesPage.tsx                 # Sprint 4
  AttendanceReportsPage.tsx                       # Sprint 5
  AttendanceSettingsPage.tsx                      # Sprint 5
  SelfAttendancePage.tsx       (/me/attendance)   # Sprint 5
  SelfLeavePage.tsx            (/me/leave)        # Sprint 4

packages/api-client/src/attendance.ts             # grows each sprint

docker-compose.local.yml                          # Sprint 0: add attend-svc @ 8010
scripts/local-reload.sh                           # Sprint 0: include attend-svc in --backend
```

**Rough effort:** ~5.5 weeks single engineer, ~3.5 weeks with a second engineer splitting leave-management out from Sprint 3.
