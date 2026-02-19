# Feature: Attendance (Time & Attendance)

> Domain: MANAGE | Color: #8B5CF6 | Priority: P0
> Status: Draft | Owner: attend-svc team

## Overview
Time & Attendance derives employee working hours from access control events — clock-in/out from face readers, card readers, fingerprint terminals, and mobile check-in. It manages shift schedules, calculates overtime, tracks lateness and absences, integrates with leave systems, and generates department-level and monthly summary reports. Since access decisions happen on devices, attendance records are constructed server-side from the stream of access events.

## Data Models

### AttendanceRecord
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | — | Tenant isolation |
| site_id | uuid | yes | — | Site |
| person_id | uuid | yes | — | FK to Person |
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
| person_id | uuid | yes | — | FK to Person |
| shift_id | uuid | yes | — | FK to Shift |
| effective_from | date | yes | — | Start date |
| effective_until | date | no | — | End date (null = indefinite) |
| created_at | timestamp | yes | now() | Creation time |

### OvertimeRequest
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | — | Tenant isolation |
| person_id | uuid | yes | — | Employee requesting |
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
| site_id | uuid | yes | — | Site |
| person_id | uuid | yes | — | FK to Person |
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
| site_id | uuid | yes | — | Site |
| device_id | uuid | yes | — | FK to Device |
| function | DeviceFunctionEnum | yes | — | clock_in, clock_out, both |
| location_name | string(200) | no | — | "Sảnh chính — Tầng 1" |
| is_primary | boolean | no | false | Primary attendance device |

### Enums
```
AttendanceStatusEnum: on_time | late | absent | on_leave | half_day | holiday | pending
LeaveTypeEnum: annual | sick | maternity | paternity | marriage | bereavement | unpaid | compensatory | other
OTStatusEnum: pending | approved | rejected | cancelled
DeviceFunctionEnum: clock_in | clock_out | both
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
  | person_id | uuid | — | Specific person |
  | status | string | — | Filter by status |
  | shift_id | uuid | — | Filter by shift |
- **Response 200:**
  ```json
  {
    "data": [{
      "id": "uuid",
      "person": { "id": "uuid", "name": "Nguyễn Văn An", "department": "Kỹ thuật" },
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
- **Body:** `{ "person_id": "uuid", "site_id": "uuid", "method": "manual", "note": "Quên thẻ, xác nhận bởi bảo vệ" }`
- **Side effects:** Creates or updates today's AttendanceRecord

### POST /api/v1/attendance/clockout
- **Auth:** role >= operator
- **Body:** `{ "person_id": "uuid", "site_id": "uuid" }`

### GET /api/v1/attendance/summary
- **Auth:** role >= viewer
- **Query params:** `site_id`, `month` (YYYY-MM), `department_id`, `person_id`
- **Response 200:** Monthly summary per person

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
    "person_ids": ["uuid1", "uuid2"],
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
- **Query params:** `site_id`, `status`, `date_from`, `date_to`, `person_id`

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
      "person_id": "uuid",
      "date": "2026-02-20",
      "leave_type": "annual",
      "leave_reference_id": "LEAVE-2026-0042"
    }]
  }
  ```

## MQTT Topics

| Topic | Direction | QoS | Payload Schema | Description |
|-------|-----------|-----|----------------|-------------|
| `dm/{tenant}/device/{device_id}/evt/access` | device→server | 1 | `{ "person_id": "uuid", "time": "...", "direction": "entry\|exit", "credential_type": "face", "photo_ref": "..." }` | Access events that drive attendance calculation |

Note: attend-svc subscribes to access events via NATS (`dm.{tenant}.access.log.*`) — not directly from MQTT. The device-gw bridges MQTT events to NATS.

## Business Rules

1. **BR-ATT-001: Clock-in from first entry event.** The first "entry" direction access event at a designated attendance device on a given day creates the clock-in record. Subsequent entry events on the same day do not update clock-in time.

2. **BR-ATT-002: Clock-out from last exit event.** The last "exit" direction access event at a designated attendance device updates the clock-out time. Clock-out is continuously updated throughout the day (last-event-wins).

3. **BR-ATT-003: Late calculation.** If clock-in time > shift start + grace_period, the person is marked `late`. Late minutes = clock-in time - shift start time. Grace period is configurable per shift (default 15 min).

4. **BR-ATT-004: Absence marking.** If no clock-in event exists by shift end time and no leave is recorded, status is set to `absent`. A background job runs at shift_end + 1 hour to mark absences.

5. **BR-ATT-005: Overtime calculation.** OT hours = time worked beyond shift end, minus `overtime_threshold_minutes`. OT only counts if an OvertimeRequest is approved OR if site policy allows auto-OT. Max capped at `max_overtime_hours` per shift.

6. **BR-ATT-006: Break deduction.** If shift has break_start/break_end and `break_deducted=true`, break duration is subtracted from total hours. If clock-out is before break_start, no break is deducted.

7. **BR-ATT-007: Working hours cap.** Per Vietnamese labor law, regular hours max 8/day, 48/week. Overtime max 40 hours/month, 200 hours/year (300 with special permit). The system warns when approaching limits.

8. **BR-ATT-008: Holiday calendar.** Public holidays (Tết, 30/4, 1/5, 2/9, 1/1) are configured per site. Attendance on holidays is auto-classified as overtime at 300% rate (for reporting).

9. **BR-ATT-009: Leave integration.** When leave records are synced (via API or webhook from HR system), the attendance record for that date is marked with the leave type. If a person has both a leave record and a clock-in event, the clock-in takes precedence (leave cancelled).

10. **BR-ATT-010: Manual adjustment audit.** All manual adjustments require a reason and are permanently logged in audit trail. Original values are preserved in the audit diff.

11. **BR-ATT-011: Cross-midnight shift.** For night shifts (e.g., 22:00-06:00), the system correctly associates clock-in events with the shift start date, not the calendar date of the event.

12. **BR-ATT-012: Monthly summary auto-calculation.** AttendanceSummary records are recalculated daily at 02:00 for the current month. They can also be manually triggered via API.

13. **BR-ATT-013: Multi-device clock-in.** If a site has multiple attendance devices, the earliest entry event across all devices is the clock-in. The system deduplicates events within a 5-minute window from the same person.

14. **BR-ATT-014: Attendance rate threshold.** Sites can configure a minimum attendance rate (e.g., 90%). Persons falling below threshold trigger an alert to their department head.

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
- **Conflict resolution:** For attendance, events are processed idempotently. If an event is received twice (device retry), the system deduplicates by `(person_id, device_id, timestamp)` key within a 5-second window.
- **Mobile clock-in offline:** The mobile app can capture a "clock-in intent" with GPS coordinates and timestamp while offline. When connectivity returns, it submits to the server. The server validates GPS proximity to site and accepts if within geofence.
- **Summary recalculation:** Monthly summaries are recalculated from source records, so even if events arrive late (from previously offline devices), the summary auto-corrects on the next calculation run.

## UI Pages

| Route | Page | Key Components |
|-------|------|----------------|
| /manage/attendance | Daily view | DataTable with date picker, department filter, shift filter, status pills, summary cards (on-time/late/absent/leave) |
| /manage/attendance/:personId | Person attendance | Calendar heatmap, monthly table, clock-in/out timeline, leave overlay |
| /manage/attendance/shifts | Shift management | Shift list, create/edit forms, assignment matrix |
| /manage/attendance/overtime | OT requests | Pending approvals, approved/rejected history, monthly OT chart |
| /manage/attendance/reports | Reports | Monthly summary table, department comparison, export buttons (CSV, Excel) |
| /manage/attendance/settings | Configuration | Attendance devices, holiday calendar, threshold settings |

## Events & Audit Log

| Event Type | Trigger | Payload | Retention |
|------------|---------|---------|-----------|
| attendance.clock_in | access event | person_id + time + device + method | 3 years |
| attendance.clock_out | access event | person_id + time + device + method | 3 years |
| attendance.marked_late | calculation | person_id + date + late_minutes | 3 years |
| attendance.marked_absent | cron job | person_id + date + shift | 3 years |
| attendance.adjusted | PUT adjust | person_id + date + old_values + new_values + reason + actor | 7 years |
| attendance.leave_synced | POST leave sync | person_id + date + leave_type | 3 years |
| shift.created | POST shift | full shift | 7 years |
| shift.updated | PUT shift | diff | 7 years |
| shift.assigned | POST assign | person_ids + shift_id + dates | 3 years |
| overtime.requested | POST OT | person_id + date + hours + reason | 3 years |
| overtime.approved | PUT approve | ot_id + approver | 3 years |
| overtime.rejected | PUT reject | ot_id + approver + reason | 3 years |

## Integration Points

- **Depends on:**
  - `identity-svc` — person data (name, department, status)
  - `access-svc` — access event stream via NATS (primary data source)
  - `device-gw` — access events originate from devices via MQTT→NATS bridge
  - `auth-svc` — JWT validation
- **Consumed by:**
  - `report-svc` — attendance analytics, department reports
  - `notif-svc` — late/absent notifications, OT approval notifications
- **External:**
  - HR/ERP systems — leave data sync (bi-directional)
  - Payroll systems — monthly attendance summary export
  - Vietnamese labor compliance reporting

## Notes

- Attendance is a derived feature — it has no direct device interaction. All data comes from access events processed by access-svc and forwarded via NATS.
- Vietnamese shift names: "Hành chính" (office hours 8-17), "Ca sáng" (morning 6-14), "Ca chiều" (afternoon 14-22), "Ca đêm" (night 22-6).
- For factories with rotating shifts, the ShiftAssignment model supports date-range assignments. A person can have different shifts for different weeks.
- The monthly report format follows Vietnamese HR standards: employee name, department, each day status (✓=present, L=late, V=absent, P=leave), total days, total hours, OT hours.
- GPS-verified mobile clock-in uses a geofence radius (default 200m) around the site coordinates. This is configurable per site and can be disabled for office-based sites where physical device clock-in is preferred.
