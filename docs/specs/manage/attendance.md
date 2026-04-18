# Feature: Attendance (Time & Attendance)

> Domain: MANAGE | Color: #8B5CF6 | Priority: P0
> Status: Draft | Owner: attend-svc team
> Plugin: `attendance` | Service: `attend-svc` | Schema: `dm3_attendance`
> Plugin Architecture: Follows `docs/architecture/module-isolation.md` (Active, 2026-04-12)

## Overview
Time & Attendance derives employee working hours from access control events, clock-in/out from face readers, card readers, fingerprint terminals, and mobile check-in. It manages shift schedules, calculates overtime, tracks lateness and absences, integrates with leave systems, and generates department-level and monthly summary reports. Since access decisions happen on devices, attendance records are constructed server-side from the stream of access events.

Attendance is implemented as an **optional tenant-gated plugin**, not as part of core access control. It follows the DM3 plugin isolation architecture:
- Own PostgreSQL schema: `dm3_attendance`
- Own microservice: `attend-svc`
- Own Go package: `internal/attendance/`
- Own frontend feature directory: `apps/console/src/features/attendance/`
- Own API client: `packages/api-client/src/attendance.ts`
- Own NATS stream for attendance domain events
- Enabled per tenant via `enabled_plugins` including `attendance`

This plugin is a **derived-data / event-driven plugin**. It consumes access events from core services and may cache identity/department metadata locally for read performance, but it does not mutate core access tables.

## Plugin Architecture Alignment

### Plugin Type
Attendance follows the **isolated plugin with event-driven integration** pattern, closest to Visitor/Parking style in `module-isolation.md`, rather than the CCTV device-extension pattern.

### Backend Components
Attendance plugin should include:
- `backend/cmd/attend-svc/main.go`
- `backend/internal/attendance/models.go`
- `backend/internal/attendance/handlers.go`
- `backend/internal/attendance/events.go`
- `backend/internal/attendance/consumers.go`
- `backend/internal/attendance/cron.go`
- `backend/pkg/db/migrations/*attendance*.sql`

### Frontend Components
Attendance plugin should include:
- `apps/console/src/features/attendance/`
- daily attendance pages
- shift management pages
- overtime pages
- reports pages
- settings/configuration pages
- conditional route loading based on `enabled_plugins`

### Isolation Rules
- All attendance tables live in `dm3_attendance`
- No hard foreign keys to `dm3_identity`, `dm3_access`, `dm3_devices`, or other core/plugin schemas
- Cross-domain references use UUID columns only, enforced by application logic
- Attendance may build local read-only caches from events for display performance
- Attendance never mutates core access records, it only derives records from events and publishes attendance domain events

### Tenant Gating
Attendance is enabled when `attendance` is present in `dm3_auth.companies.enabled_plugins`.

Backend APIs must be guarded with:
- `RequirePlugin("attendance")`

Frontend routes and sidebar items must load only when:
- `auth.company?.enabled_plugins?.includes('attendance')`

## Data Models

### AttendanceRecord
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | — | Tenant isolation |
| site_id | uuid | yes | — | Site (soft reference to core site entity) |
| user_id | uuid | yes | — | Soft reference to User |
| date | date | yes | — | Working date |
| shift_id | uuid | no | — | FK to Shift (null = flexible) |
| clock_in | timestamp | no | — | First entry event |
| clock_in_device_id | uuid | no | — | Device used for clock-in |
| clock_in_method | string(30) | no | — | face, card, pin, mobile |
| clock_in_photo_ref | string(500) | no | — | Face photo captured at clock-in |
| clock_out | timestamp | no | — | Last exit event |
| clock_out_device_id | uuid | no | — | Device used for clock-out |
| clock_out_method | string(30) | no | — | face, card, pin, mobile |
| clock_out_photo_ref | string(500) | no | — | Face photo at clock-out |
| status | AttendanceStatusEnum | yes | pending | Calculated status |
| total_hours | decimal(5,2) | no | — | Total hours worked |
| regular_hours | decimal(5,2) | no | — | Hours within shift |
| overtime_hours | decimal(5,2) | no | — | Hours beyond shift |
| late_minutes | int | no | 0 | Minutes late (vs shift start) |
| early_leave_minutes | int | no | 0 | Minutes early departure |
| break_minutes | int | no | — | Total break time deducted |
| overtime_approved | boolean | no | false | OT approved by manager |
| overtime_approved_by | uuid | no | — | Who approved OT |
| manual_adjustment | boolean | no | false | Record was manually edited |
| adjusted_by | uuid | no | — | Who made manual adjustment |
| adjustment_reason | text | no | — | Reason for manual edit |
| leave_type | LeaveTypeEnum | no | — | If on leave |
| leave_reference_id | string(50) | no | — | External leave system reference |
| notes | text | no | — | Admin notes |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### Shift
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | — | Tenant isolation |
| site_id | uuid | yes | — | Site |
| name | string(100) | yes | — | Shift name (e.g., "Hành chính", "Sáng", "Chiều") |
| code | string(20) | no | — | Short code (e.g., "HC", "S", "C") |
| start_time | time | yes | — | Shift start (e.g., 08:00) |
| end_time | time | yes | — | Shift end (e.g., 17:00) |
| grace_period_minutes | int | no | 15 | Minutes after start before marking late |
| early_leave_threshold | int | no | 15 | Minutes before end considered early leave |
| break_start | time | no | — | Break start (e.g., 12:00) |
| break_end | time | no | — | Break end (e.g., 13:00) |
| break_deducted | boolean | no | true | Auto-deduct break from hours |
| overtime_threshold_minutes | int | no | 30 | Minutes after shift end before OT counts |
| max_overtime_hours | decimal(3,1) | no | 4.0 | Max OT per day |
| working_days | int[] | no | [1,2,3,4,5] | Days of week (1=Mon, 7=Sun) |
| color | string(7) | no | #3B82F6 | Display color |
| is_default | boolean | no | false | Default shift for new employees |
| status | string(20) | yes | active | active or archived |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### ShiftAssignment
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | — | Tenant isolation |
| user_id | uuid | yes | — | Soft reference to User |
| shift_id | uuid | yes | — | FK to Shift within `dm3_attendance` |
| effective_from | date | yes | — | Start date |
| effective_until | date | no | — | End date (null = indefinite) |
| created_at | timestamp | yes | now() | Creation time |

### OvertimeRequest
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | — | Tenant isolation |
| user_id | uuid | yes | — | Employee requesting (soft reference to User) |
| date | date | yes | — | OT date |
| planned_hours | decimal(3,1) | yes | — | Planned OT hours |
| actual_hours | decimal(3,1) | no | — | Actual OT (from attendance) |
| reason | text | yes | — | Reason for OT |
| status | OTStatusEnum | yes | pending | Approval status |
| approved_by | uuid | no | — | Manager who approved |
| approved_at | timestamp | no | — | Approval time |
| created_at | timestamp | yes | now() | Creation time |

### AttendanceSummary (materialized/cached)
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | — | Tenant isolation |
| site_id | uuid | yes | — | Site (soft reference) |
| user_id | uuid | yes | — | Soft reference to User |
| month | date | yes | — | First day of month |
| total_working_days | int | yes | — | Days with attendance |
| total_absent_days | int | yes | — | Days absent (no leave) |
| total_leave_days | int | yes | — | Days on approved leave |
| total_late_count | int | yes | — | Times late |
| total_early_leave_count | int | yes | — | Times left early |
| total_regular_hours | decimal(7,2) | yes | — | Total regular hours |
| total_overtime_hours | decimal(7,2) | yes | — | Total approved OT hours |
| total_hours | decimal(7,2) | yes | — | Total hours worked |
| attendance_rate | decimal(5,2) | yes | — | Attendance % |
| calculated_at | timestamp | yes | now() | Last calculation |

### AttendanceDevice
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | — | Tenant isolation |
| site_id | uuid | yes | — | Site (soft reference) |
| device_id | uuid | yes | — | Soft reference to Device |
| function | DeviceFunctionEnum | yes | — | clock_in, clock_out, both |
| location_name | string(200) | no | — | "Sảnh chính — Tầng 1" |
| is_primary | boolean | no | false | Primary attendance device |

### LeaveRequest
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | — | Tenant isolation |
| site_id | uuid | yes | — | Site (soft reference) |
| user_id | uuid | yes | — | Requester (soft reference to User) |
| leave_type | LeaveTypeEnum | yes | — | Type of leave |
| start_date | date | yes | — | Leave start date |
| end_date | date | yes | — | Leave end date |
| duration_days | decimal(4,1) | yes | — | Total leave duration |
| partial_day_mode | string(20) | no | full_day | full_day, morning_half, afternoon_half, hourly |
| partial_start_time | time | no | — | Used when partial_day_mode=hourly |
| partial_end_time | time | no | — | Used when partial_day_mode=hourly |
| reason | text | yes | — | Employee reason |
| status | LeaveRequestStatusEnum | yes | pending | Approval status |
| approver_id | uuid | no | — | Current or final approver |
| approved_at | timestamp | no | — | Approval time |
| rejection_reason | text | no | — | Rejection note |
| cancel_reason | text | no | — | If requester cancels |
| source | LeaveSourceEnum | yes | self_service | self_service, admin, external_sync |
| attachment_refs | jsonb | no | [] | Supporting documents |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### LeaveBalance
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | — | Tenant isolation |
| user_id | uuid | yes | — | Soft reference to User |
| year | int | yes | — | Balance year |
| leave_type | LeaveTypeEnum | yes | — | Balance bucket |
| entitled_days | decimal(5,1) | yes | 0 | Annual quota |
| carry_over_days | decimal(5,1) | yes | 0 | Days carried from previous year |
| used_days | decimal(5,1) | yes | 0 | Approved leave consumed |
| pending_days | decimal(5,1) | yes | 0 | Pending requests |
| remaining_days | decimal(5,1) | yes | 0 | Computed remaining balance |
| adjusted_by | uuid | no | — | Admin who adjusted balance |
| adjustment_reason | text | no | — | Reason for adjustment |
| updated_at | timestamp | yes | now() | Last update |

### LeavePolicy
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | — | Tenant isolation |
| site_id | uuid | no | — | Optional site override |
| leave_type | LeaveTypeEnum | yes | — | Policy bucket |
| annual_quota_days | decimal(5,1) | yes | — | Default annual quota |
| carry_over_limit_days | decimal(5,1) | no | 0 | Max days carried over |
| min_notice_days | int | no | 0 | Required advance notice |
| requires_attachment | boolean | no | false | Whether proof is required |
| allow_negative_balance | boolean | no | false | Allow request beyond balance |
| approval_mode | string(30) | no | manager | manager, department_head, hr, auto |
| auto_approve_below_days | decimal(4,1) | no | — | Auto-approve small requests |
| status | string(20) | yes | active | active or archived |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### HolidayCalendar
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | — | Tenant isolation |
| site_id | uuid | no | — | Optional site-specific calendar |
| date | date | yes | — | Holiday date |
| name | string(150) | yes | — | Holiday name |
| holiday_type | string(30) | yes | public | public, company, makeup_workday |
| paid | boolean | no | true | Paid holiday |
| notes | text | no | — | Additional notes |
| created_at | timestamp | yes | now() | Creation time |

### Enums
```
AttendanceStatusEnum: on_time | late | absent | on_leave | half_day | holiday | pending
LeaveTypeEnum: annual | sick | maternity | paternity | marriage | bereavement | unpaid | compensatory | other
OTStatusEnum: pending | approved | rejected | cancelled
DeviceFunctionEnum: clock_in | clock_out | both
LeaveRequestStatusEnum: pending | approved | rejected | cancelled
LeaveSourceEnum: self_service | admin | external_sync
```

## API Endpoints

### GET /api/v1/attendance/records
- **Auth:** Bearer token, role >= viewer
- **Query params:**
  | Param | Type | Default | Description |
  |-------|------|---------|-------------|
  | page | int | 1 | Page number |
  | limit | int | 50 | Items per page (max 200) |
  | site_id | uuid | required | Filter by site |
  | date | date | today | Attendance date |
  | date_from | date | — | Range start (overrides date) |
  | date_to | date | — | Range end |
  | department_id | uuid | — | Filter by department |
  | user_id | uuid | — | Specific user |
  | status | string | — | Filter by status |
  | shift_id | uuid | — | Filter by shift |
- **Response 200:**
  ```json
  {
    "data": [{
      "id": "uuid",
      "user": { "id": "uuid", "name": "Nguyễn Văn An", "department": "Kỹ thuật" },
      "date": "2026-02-19",
      "shift": { "name": "Hành chính", "start": "08:00", "end": "17:00" },
      "clock_in": "07:52",
      "clock_out": "17:15",
      "status": "on_time",
      "total_hours": 8.38,
      "overtime_hours": 0,
      "late_minutes": 0
    }],
    "total": 30,
    "summary": {
      "on_time": 22,
      "late": 5,
      "absent": 2,
      "on_leave": 1,
      "total": 30
    }
  }
  ```

### GET /api/v1/attendance/records/{id}
- **Auth:** role >= viewer
- **Response 200:** Full record with clock-in/out photos, device info, adjustment history

### PUT /api/v1/attendance/records/{id}
- **Auth:** role >= admin
- **Body:** Manual adjustment fields
  ```json
  {
    "clock_in": "2026-02-19T08:00:00+07:00",
    "clock_out": "2026-02-19T17:00:00+07:00",
    "adjustment_reason": "Nhân viên quên chấm công — xác nhận có mặt",
    "status": "on_time"
  }
  ```
- **Side effects:** Sets `manual_adjustment=true`, audit log with before/after diff

### POST /api/v1/attendance/clockin
- **Auth:** role >= operator (for manual clock-in by admin)
- **Body:** `{ "user_id": "uuid", "site_id": "uuid", "method": "manual", "note": "Quên thẻ, xác nhận bởi bảo vệ" }`
- **Side effects:** Creates or updates today's AttendanceRecord

### POST /api/v1/attendance/clockout
- **Auth:** role >= operator
- **Body:** `{ "user_id": "uuid", "site_id": "uuid" }`

### GET /api/v1/attendance/summary
- **Auth:** role >= viewer
- **Query params:** `site_id`, `month` (YYYY-MM), `department_id`, `user_id`
- **Response 200:** Monthly summary per user

### GET /api/v1/attendance/summary/department
- **Auth:** role >= admin
- **Query params:** `site_id`, `month`, `department_id`
- **Response 200:** Department-level aggregation — total hours, average attendance rate, OT hours

### GET /api/v1/attendance/shifts
- **Auth:** role >= viewer
- **Response 200:** List of shifts

### POST /api/v1/attendance/shifts
- **Auth:** role >= admin
- **Body:**
  ```json
  {
    "site_id": "uuid",
    "name": "Ca sáng",
    "code": "S",
    "start_time": "06:00",
    "end_time": "14:00",
    "grace_period_minutes": 10,
    "break_start": "10:00",
    "break_end": "10:30",
    "working_days": [1, 2, 3, 4, 5, 6]
  }
  ```

### PUT /api/v1/attendance/shifts/{id}
- **Auth:** role >= admin

### POST /api/v1/attendance/shifts/assign
- **Auth:** role >= admin
- **Body:**
  ```json
  {
    "user_ids": ["uuid1", "uuid2"],
    "shift_id": "uuid",
    "effective_from": "2026-03-01",
    "effective_until": null
  }
  ```

### POST /api/v1/attendance/overtime/request
- **Auth:** Any authenticated employee (self-service)
- **Body:** `{ "date": "2026-02-20", "planned_hours": 2.0, "reason": "Hoàn thành dự án ABC gấp" }`

### PUT /api/v1/attendance/overtime/{id}/approve
- **Auth:** role >= admin (or department head)
- **Body:** `{ "approved": true }`

### GET /api/v1/attendance/overtime
- **Auth:** role >= viewer
- **Query params:** `site_id`, `status`, `date_from`, `date_to`, `user_id`

### GET /api/v1/attendance/leave/requests
- **Auth:** role >= viewer (self limited to own records unless manager/admin)
- **Query params:** `site_id`, `status`, `user_id`, `department_id`, `date_from`, `date_to`, `leave_type`
- **Response 200:** List of leave requests with approval status, requester, duration, balance impact

### POST /api/v1/attendance/leave/requests
- **Auth:** Any authenticated employee (self-service) or admin on behalf
- **Body:**
  ```json
  {
    "site_id": "uuid",
    "leave_type": "annual",
    "start_date": "2026-03-10",
    "end_date": "2026-03-12",
    "duration_days": 3,
    "partial_day_mode": "full_day",
    "reason": "Nghỉ phép gia đình",
    "attachment_refs": []
  }
  ```
- **Side effects:** Creates pending leave request, reserves `pending_days` from leave balance, may auto-approve based on policy

### GET /api/v1/attendance/leave/requests/{id}
- **Auth:** requester, approver, or role >= viewer with scope
- **Response 200:** Full leave request, approval trail, attachments, balance impact

### PUT /api/v1/attendance/leave/requests/{id}/approve
- **Auth:** role >= admin or designated approver
- **Body:** `{ "approved": true, "note": "Approved by department head" }`
- **Side effects:** marks request approved, converts pending balance to used balance, updates AttendanceRecord(s)

### PUT /api/v1/attendance/leave/requests/{id}/reject
- **Auth:** role >= admin or designated approver
- **Body:** `{ "reason": "Peak staffing day, please reschedule" }`
- **Side effects:** releases pending balance, leaves attendance unchanged

### PUT /api/v1/attendance/leave/requests/{id}/cancel
- **Auth:** requester (while pending) or admin
- **Body:** `{ "reason": "No longer needed" }`
- **Side effects:** releases pending balance, reverts attendance leave mark if generated early

### GET /api/v1/attendance/leave/balances
- **Auth:** role >= viewer (self limited unless manager/admin)
- **Query params:** `user_id`, `year`, `site_id`
- **Response 200:** leave balances by type with entitled / used / pending / remaining

### PUT /api/v1/attendance/leave/balances/{id}
- **Auth:** role >= admin
- **Body:** `{ "remaining_days": 10, "adjustment_reason": "Carry-over correction" }`

### GET /api/v1/attendance/leave/policies
- **Auth:** role >= admin
- **Query params:** `site_id`

### POST /api/v1/attendance/leave/policies
- **Auth:** role >= admin
- **Body:** create or update leave policy for type/site

### GET /api/v1/attendance/leave/calendar
- **Auth:** role >= viewer
- **Query params:** `site_id`, `month`, `department_id`
- **Response 200:** calendar view of approved and pending leave requests

### GET /api/v1/attendance/report/monthly
- **Auth:** role >= admin
- **Query params:** `site_id`, `month` (YYYY-MM), `department_id`, `format` (json|csv|xlsx)
- **Response 200:** Complete monthly report with all employees, all days, totals
- **Side effects:** If format=csv|xlsx, generates file and returns download URL

### GET /api/v1/attendance/devices
- **Auth:** role >= admin
- **Query params:** `site_id`
- **Response 200:** Attendance device configuration

### POST /api/v1/attendance/devices
- **Auth:** role >= admin
- **Body:** `{ "device_id": "uuid", "site_id": "uuid", "function": "both", "location_name": "Sảnh chính — Tầng 1" }`

### POST /api/v1/attendance/leave/sync
- **Auth:** role >= admin (or system webhook)
- **Body:**
  ```json
  {
    "records": [{
      "user_id": "uuid",
      "date": "2026-02-20",
      "leave_type": "annual",
      "leave_reference_id": "LEAVE-2026-0042"
    }]
  }
  ```

## Service Topology

| Component | Value |
|---|---|
| Plugin name | `attendance` |
| Service | `attend-svc` |
| Schema | `dm3_attendance` |
| Suggested port | `8010` (reserve, confirm against backend port map before implementation) |
| NATS stream | `ATTENDANCE` |
| Frontend feature dir | `apps/console/src/features/attendance/` |
| API client | `packages/api-client/src/attendance.ts` |

## Event Integration

Attendance does not ingest device MQTT directly. It follows the plugin isolation model and consumes normalized event streams from core services.

### Consumes
- access events from access-svc via NATS
- user / department / company metadata changes from identity/auth event streams
- optional leave sync events from HR/ERP integration services

### Publishes
- attendance clock-in / clock-out domain events
- attendance marked late / absent events
- overtime workflow events
- summary recalculation events

### Subject Convention
Suggested attendance subjects:
- `dm3.attendance.{tenant_id}.record.created`
- `dm3.attendance.{tenant_id}.record.updated`
- `dm3.attendance.{tenant_id}.record.adjusted`
- `dm3.attendance.{tenant_id}.summary.recalculated`
- `dm3.attendance.{tenant_id}.overtime.requested`
- `dm3.attendance.{tenant_id}.overtime.approved`
- `dm3.attendance.{tenant_id}.overtime.rejected`

## MQTT Topics

| Topic | Direction | QoS | Payload Schema | Description |
|-------|-----------|-----|----------------|-------------|
| `dm/{tenant}/device/{device_id}/evt/access` | device→server | 1 | `{ "user_id": "uuid", "time": "...", "direction": "entry\|exit", "credential_type": "face", "photo_ref": "..." }` | Access events that drive attendance calculation |

Note: attend-svc subscribes to access events via NATS (`dm.{tenant}.access.log.*`) — not directly from MQTT. The device-gw bridges MQTT events to NATS.

## Business Rules

1. **BR-ATT-001: Clock-in from first entry event.** The first "entry" direction access event at a designated attendance device on a given day creates the clock-in record. Subsequent entry events on the same day do not update clock-in time.

2. **BR-ATT-002: Clock-out from last exit event.** The last "exit" direction access event at a designated attendance device updates the clock-out time. Clock-out is continuously updated throughout the day (last-event-wins).

3. **BR-ATT-003: Late calculation.** If clock-in time > shift start + grace_period, the user is marked `late`. Late minutes = clock-in time - shift start time. Grace period is configurable per shift (default 15 min).

4. **BR-ATT-004: Absence marking.** If no clock-in event exists by shift end time and no leave is recorded, status is set to `absent`. A background job runs at shift_end + 1 hour to mark absences.

5. **BR-ATT-005: Overtime calculation.** OT hours = time worked beyond shift end, minus `overtime_threshold_minutes`. OT only counts if an OvertimeRequest is approved OR if site policy allows auto-OT. Max capped at `max_overtime_hours` per shift.

6. **BR-ATT-006: Break deduction.** If shift has break_start/break_end and `break_deducted=true`, break duration is subtracted from total hours. If clock-out is before break_start, no break is deducted.

7. **BR-ATT-007: Working hours cap.** Per Vietnamese labor law, regular hours max 8/day, 48/week. Overtime max 40 hours/month, 200 hours/year (300 with special permit). The system warns when approaching limits.

8. **BR-ATT-008: Holiday calendar.** Public holidays (Tết, 30/4, 1/5, 2/9, 1/1) are configured per site. Attendance on holidays is auto-classified as overtime at 300% rate (for reporting).

9. **BR-ATT-009: Leave integration.** When leave records are approved internally or synced from an external HR system, the attendance record for that date is marked with the leave type. If a user has both an approved leave record and a clock-in event, the request enters exception state for manager review, clock-in is not silently discarded.

10. **BR-ATT-010: Manual adjustment audit.** All manual adjustments require a reason and are permanently logged in audit trail. Original values are preserved in the audit diff.

11. **BR-ATT-011: Cross-midnight shift.** For night shifts (e.g., 22:00-06:00), the system correctly associates clock-in events with the shift start date, not the calendar date of the event.

12. **BR-ATT-012: Monthly summary auto-calculation.** AttendanceSummary records are recalculated daily at 02:00 for the current month. They can also be manually triggered via API.

13. **BR-ATT-013: Multi-device clock-in.** If a site has multiple attendance devices, the earliest entry event across all devices is the clock-in. The system deduplicates events within a 5-minute window from the same user.

14. **BR-ATT-014: Attendance rate threshold.** Sites can configure a minimum attendance rate (e.g., 90%). Users falling below threshold trigger an alert to their department head.

15. **BR-ATT-015: Leave balance reservation.** Creating a pending leave request reserves the requested days into `pending_days`. Approval moves days from `pending_days` to `used_days`; rejection/cancellation releases them.

16. **BR-ATT-016: Leave policy enforcement.** Requests validate against policy rules: minimum notice, attachment requirement, quota limits, and approval mode. Violations return actionable validation errors.

17. **BR-ATT-017: Partial-day leave.** Half-day or hourly leave requests only affect matching portions of the working day and must integrate correctly with late/early-leave calculations.

18. **BR-ATT-018: Holiday precedence.** Public holidays and company holidays override normal leave deductions unless policy explicitly marks the date as a makeup workday.

19. **BR-ATT-019: Cancellation window.** Employees may cancel only pending requests unless an admin override is used. Approved requests require approver/admin cancellation with audit reason.

20. **BR-ATT-020: Team visibility.** Managers may view pending/approved leave for their departments in calendar and list format to avoid staffing conflicts before approval.

## Permissions Matrix

| Action | viewer | operator | admin | site_admin | super_admin |
|--------|--------|----------|-------|------------|-------------|
| View attendance records | ✅ | ✅ | ✅ | ✅ | ✅ |
| View own attendance | ✅* | ✅* | ✅ | ✅ | ✅ |
| Manual clock-in/out | ❌ | ✅ | ✅ | ✅ | ✅ |
| Adjust records | ❌ | ❌ | ✅ | ✅ | ✅ |
| Manage shifts | ❌ | ❌ | ✅ | ✅ | ✅ |
| Assign shifts | ❌ | ❌ | ✅ | ✅ | ✅ |
| Request overtime (self) | ✅* | ✅* | ✅ | ✅ | ✅ |
| Approve overtime | ❌ | ❌ | ✅** | ✅ | ✅ |
| View department summary | ❌ | ✅ | ✅ | ✅ | ✅ |
| Export reports | ❌ | ❌ | ✅ | ✅ | ✅ |
| Configure devices | ❌ | ❌ | ✅ | ✅ | ✅ |
| Sync leave records | ❌ | ❌ | ✅ | ✅ | ✅ |

*Employees can view their own attendance and request OT for themselves.
**Department heads can approve OT for their department members.

## Offline Behavior

- **Device-side:** Access control devices operate fully offline — they grant/deny access and log events locally. Attendance is a server-side calculation from access events, so device offline has no direct impact on real-time attendance.
- **Sync strategy:** When a device comes back online, it uploads all buffered access events in chronological order. attend-svc processes these events and retroactively creates/updates AttendanceRecords. This means attendance data may be delayed but will eventually be accurate.
- **Event ordering:** Events from devices include device-local timestamps. attend-svc uses device timestamps (not server-received time) for clock-in/out calculation. Device clock sync via NTP is critical for accuracy.
- **Conflict resolution:** For attendance, events are processed idempotently. If an event is received twice (device retry), the system deduplicates by `(user_id, device_id, timestamp)` key within a 5-second window.
- **Mobile clock-in offline:** The mobile app can capture a "clock-in intent" with GPS coordinates and timestamp while offline. When connectivity returns, it submits to the server. The server validates GPS proximity to site and accepts if within geofence.
- **Summary recalculation:** Monthly summaries are recalculated from source records, so even if events arrive late (from previously offline devices), the summary auto-corrects on the next calculation run.

## UI Pages

| Route | Page | Key Components |
|-------|------|----------------|
| /manage/attendance | Daily view | DataTable with date picker, department filter, shift filter, status pills, summary cards (on-time/late/absent/leave) |
| /manage/attendance/:personId | User attendance | Calendar heatmap, monthly table, clock-in/out timeline, leave overlay |
| /manage/attendance/shifts | Shift management | Shift list, create/edit forms, assignment matrix |
| /manage/attendance/overtime | OT requests | Pending approvals, approved/rejected history, monthly OT chart |
| /manage/attendance/leave | Leave requests | Request list, status tabs, approval queue, request drawer/modal, balance preview |
| /manage/attendance/leave/balance | Leave balances | Balance table, quota adjustments, per-type cards, carry-over indicators |
| /manage/attendance/leave/calendar | Team leave calendar | Monthly/weekly calendar, department filter, pending vs approved overlays |
| /manage/attendance/leave/policies | Leave policies | Policy forms, approval mode settings, attachment requirement, quota config |
| /manage/attendance/reports | Reports | Monthly summary table, department comparison, export buttons (CSV, Excel) |
| /manage/attendance/settings | Configuration | Attendance devices, holiday calendar, threshold settings |
| /me/attendance | Self-service attendance | Personal timeline, monthly stats, shift info, attendance exceptions |
| /me/leave | Self-service leave | Request form, request history, leave balance cards, cancellation action |

## Events & Audit Log

| Event Type | Trigger | Payload | Retention |
|------------|---------|---------|-----------|
| attendance.clock_in | access event | user_id + time + device + method | 3 years |
| attendance.clock_out | access event | user_id + time + device + method | 3 years |
| attendance.marked_late | calculation | user_id + date + late_minutes | 3 years |
| attendance.marked_absent | cron job | user_id + date + shift | 3 years |
| attendance.adjusted | PUT adjust | user_id + date + old_values + new_values + reason + actor | 7 years |
| attendance.leave_synced | POST leave sync | user_id + date + leave_type | 3 years |
| leave.requested | POST leave request | user_id + leave_type + dates + duration | 3 years |
| leave.approved | PUT leave approve | leave_id + approver + balance impact | 3 years |
| leave.rejected | PUT leave reject | leave_id + approver + reason | 3 years |
| leave.cancelled | PUT leave cancel | leave_id + actor + reason | 3 years |
| leave.balance_adjusted | PUT leave balance | user_id + leave_type + before/after + reason | 7 years |
| leave.policy_updated | POST/PUT leave policy | policy diff + actor | 7 years |
| shift.created | POST shift | full shift | 7 years |
| shift.updated | PUT shift | diff | 7 years |
| shift.assigned | POST assign | user_ids + shift_id + dates | 3 years |
| overtime.requested | POST OT | user_id + date + hours + reason | 3 years |
| overtime.approved | PUT approve | ot_id + approver | 3 years |
| overtime.rejected | PUT reject | ot_id + approver + reason | 3 years |

## Integration Points

- **Depends on:**
  - `identity-svc` — user data (name, department, status), preferably via event-driven local cache
  - `access-svc` — access event stream via NATS (primary source of truth for attendance derivation)
  - `device-gw` — origin of access events via MQTT→NATS bridge, not consumed directly by attendance
  - `auth-svc` — JWT validation, tenant context, `enabled_plugins`
- **Consumed by:**
  - `report-svc` — attendance analytics, department reports
  - `notif-svc` — late/absent notifications, OT approval notifications
  - payroll / HR exports — monthly summaries and compliance reporting
- **External:**
  - HR/ERP systems — leave data sync (bi-directional)
  - Payroll systems — monthly attendance summary export
  - Vietnamese labor compliance reporting

## Plugin Enablement & Frontend Loading

### Backend
Attendance APIs must be mounted behind plugin gating middleware:

```go
r.With(RequirePlugin("attendance")).Get("/api/v1/attendance/records", h.ListRecords)
r.With(RequirePlugin("attendance")).Post("/api/v1/attendance/shifts", h.CreateShift)
```

### Frontend
Attendance routes and navigation must only load when the tenant has `attendance` enabled:

```ts
...(auth.company?.enabled_plugins?.includes('attendance') ? [
  { path: '/manage/attendance', element: <AttendanceDailyPage /> },
  { path: '/manage/attendance/:personId', element: <AttendancePersonPage /> },
  { path: '/manage/attendance/shifts', element: <AttendanceShiftsPage /> },
  { path: '/manage/attendance/overtime', element: <AttendanceOvertimePage /> },
  { path: '/manage/attendance/reports', element: <AttendanceReportsPage /> },
  { path: '/manage/attendance/settings', element: <AttendanceSettingsPage /> },
] : [])
```

Sidebar visibility must follow the same plugin flag.

## Notes

- Attendance is a derived plugin feature, not a core access feature. It has no direct device interaction. All source data comes from access events processed by access-svc and forwarded via NATS.
- This spec must follow the active plugin isolation architecture in `docs/architecture/module-isolation.md`. If implementation differs, the plugin architecture doc wins.
- Attendance should use soft references to users, sites, devices, departments, and leave records. No hard foreign keys to core schemas.
- Frontend labels should present Attendance as a tenant-enabled module under MANAGE.
- Vietnamese shift names: "Hành chính" (office hours 8-17), "Ca sáng" (morning 6-14), "Ca chiều" (afternoon 14-22), "Ca đêm" (night 22-6).
- For factories with rotating shifts, the ShiftAssignment model supports date-range assignments. A user can have different shifts for different weeks.
- The monthly report format follows Vietnamese HR standards: employee name, department, each day status (✓=present, L=late, V=absent, P=leave), total days, total hours, OT hours.
- GPS-verified mobile clock-in uses a geofence radius (default 200m) around the site coordinates. This is configurable per site and can be disabled for office-based sites where physical device clock-in is preferred.
