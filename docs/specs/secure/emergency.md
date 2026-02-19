# Feature: Emergency & Lockdown Management

> Domain: SECURE | Color: #EF4444 | Priority: P0
> Status: Draft | Owner: SECURE Team

## Overview

The Emergency & Lockdown Management system coordinates building-wide or zone-specific emergency responses — from fire evacuations to security lockdowns to medical emergencies. It orchestrates all SECURE subsystems (access control, CCTV, intrusion, intercom) into unified response plans with confirmation flows, countdown timers, and all-clear procedures. **Devices execute emergency commands locally once received; the server broadcasts commands and tracks response state.** Emergency contacts, response plans, and escalation chains ensure the right people are notified within seconds.

## Data Models

### EmergencyPlan
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | - | Tenant isolation |
| site_id | uuid | yes | - | Site scope |
| name | string(100) | yes | - | e.g. "Kế hoạch sơ tán hỏa hoạn — Tòa A" |
| description | string(1000) | no | null | Plan details |
| type | EmergencyTypeEnum | yes | - | Emergency category |
| severity | SeverityEnum | yes | critical | Default severity |
| scope | ScopeEnum | yes | building_wide | Zone or building-wide |
| zone_ids | uuid[] | no | [] | Target zones (if zone-based) |
| confirmation_required | boolean | yes | true | Require operator confirmation |
| countdown_seconds | int | yes | 10 | Countdown before execution (0 = immediate) |
| auto_trigger_source | string | no | null | Sensor/system that can auto-trigger |
| actions | jsonb | yes | [] | Ordered list of EmergencyAction objects |
| all_clear_actions | jsonb | yes | [] | Actions to execute on all-clear |
| escalation_chain_id | uuid | no | null | Notification escalation chain |
| emergency_contacts | jsonb | no | [] | Contact list for this plan |
| response_team_ids | uuid[] | no | [] | Assigned response team members |
| drill_schedule | jsonb | no | null | Scheduled drill configuration |
| enabled | boolean | yes | true | Active toggle |
| last_activated_at | timestamp | no | null | Last real activation |
| last_drill_at | timestamp | no | null | Last drill |
| created_by | uuid | yes | - | Creator |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### EmergencyAction (embedded in EmergencyPlan.actions JSONB)
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| order | int | yes | Execution order (1-based) |
| type | ActionTypeEnum | yes | Action category |
| target_type | string | yes | door / zone / camera / intercom / notification / alarm / lift / hvac |
| target_ids | uuid[] | yes | Target resource IDs (or ["*"] for all) |
| action | string | yes | unlock / lock / record / announce / alert / recall / arm / disarm / shutdown |
| params | jsonb | no | Action-specific parameters |
| delay_seconds | int | no | Delay after previous action |
| condition | string | no | Optional condition (e.g. "zone.has_occupants") |

### EmergencyIncident
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | - | Tenant isolation |
| site_id | uuid | yes | - | Site scope |
| plan_id | uuid | yes | - | Which plan was activated |
| type | EmergencyTypeEnum | yes | - | Emergency type |
| severity | SeverityEnum | yes | - | Severity level |
| scope | ScopeEnum | yes | - | Actual scope |
| zone_ids | uuid[] | no | [] | Affected zones |
| status | IncidentStatusEnum | yes | pending_confirmation | Current state |
| is_drill | boolean | yes | false | Drill or real emergency |
| triggered_by | uuid | yes | - | User or system that triggered |
| trigger_source | string | yes | - | manual / sensor / alarm / automation |
| confirmed_by | uuid | no | null | User who confirmed (if confirmation required) |
| confirmed_at | timestamp | no | null | Confirmation time |
| activated_at | timestamp | no | null | When actions started executing |
| all_clear_by | uuid | no | null | User who declared all-clear |
| all_clear_at | timestamp | no | null | All-clear time |
| cancelled_by | uuid | no | null | User who cancelled (during countdown) |
| cancelled_at | timestamp | no | null | Cancellation time |
| action_log | jsonb | yes | [] | Array of {action, status, executed_at, error} |
| device_responses | jsonb | yes | {} | Map of device_id → {status, responded_at} |
| notes | string(2000) | no | null | Operator notes |
| resolution_summary | string(2000) | no | null | Post-incident summary |
| duration_seconds | int | no | null | Calculated: all_clear_at - activated_at |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### EmergencyContact
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | - | Tenant isolation |
| site_id | uuid | yes | - | Site scope |
| name | string(100) | yes | - | Contact name |
| role | string(100) | yes | - | e.g. "Trưởng ban PCCC", "Bác sĩ trực" |
| phone | string(20) | yes | - | Primary phone |
| phone_backup | string(20) | no | null | Backup phone |
| email | string(200) | no | null | Email |
| organization | string(200) | no | null | External org (fire dept, hospital) |
| type | ContactTypeEnum | yes | internal | Internal or external |
| emergency_types | EmergencyTypeEnum[] | yes | - | Which emergency types to contact |
| priority | int | yes | 0 | Contact order (lower = first) |
| available_hours | jsonb | no | null | Availability schedule |
| enabled | boolean | yes | true | Active toggle |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### ResponseTeam
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | - | Tenant isolation |
| site_id | uuid | yes | - | Site scope |
| name | string(100) | yes | - | e.g. "Đội PCCC Tòa A" |
| type | EmergencyTypeEnum | yes | - | Team specialization |
| member_ids | uuid[] | yes | - | Person IDs of team members |
| leader_id | uuid | yes | - | Team leader |
| assembly_point | string(200) | no | null | Gathering location |
| equipment_list | jsonb | no | [] | Required equipment checklist |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### Enums
```
EmergencyTypeEnum: fire | security_lockdown | medical | intruder | hazmat | earthquake | custom
SeverityEnum: low | medium | high | critical
ScopeEnum: zone | floor | building | building_wide | campus_wide
IncidentStatusEnum: pending_confirmation | countdown | active | all_clear | cancelled | escalated
ActionTypeEnum: door_control | camera_control | alarm_control | notification | intercom | lift_control | hvac_control | custom
ContactTypeEnum: internal | external_fire | external_police | external_medical | external_other
```

## API Endpoints

### GET /api/v1/emergency/plans
- **Auth:** Bearer token, role >= viewer
- **Query params:**
  | Param | Type | Default | Description |
  |-------|------|---------|-------------|
  | page | int | 1 | Page number |
  | limit | int | 20 | Items per page (max 100) |
  | site_id | uuid | required | Filter by site |
  | type | string | - | Filter by emergency type |
  | enabled | boolean | - | Filter active/inactive |
- **Response 200:**
  ```json
  {
    "data": [
      {
        "id": "uuid",
        "name": "Kế hoạch sơ tán hỏa hoạn — Tòa A",
        "type": "fire",
        "severity": "critical",
        "scope": "building_wide",
        "confirmation_required": true,
        "countdown_seconds": 10,
        "actions_count": 6,
        "last_activated_at": null,
        "last_drill_at": "2026-01-15T10:00:00Z",
        "enabled": true
      }
    ],
    "total": 5,
    "page": 1,
    "limit": 20
  }
  ```
- **Errors:** 401, 403, 422

### GET /api/v1/emergency/plans/{id}
- **Auth:** role >= viewer
- **Response 200:** Full EmergencyPlan with nested actions, contacts, response teams
- **Errors:** 401, 403, 404

### POST /api/v1/emergency/plans
- **Auth:** role >= site_admin
- **Body:**
  ```json
  {
    "name": "Phong tỏa an ninh — Tầng 3",
    "site_id": "uuid",
    "type": "security_lockdown",
    "severity": "high",
    "scope": "zone",
    "zone_ids": ["zone-uuid-floor3"],
    "confirmation_required": true,
    "countdown_seconds": 5,
    "actions": [
      { "order": 1, "type": "door_control", "target_type": "zone", "target_ids": ["zone-uuid-floor3"], "action": "lock", "params": {} },
      { "order": 2, "type": "camera_control", "target_type": "zone", "target_ids": ["zone-uuid-floor3"], "action": "record", "params": {"quality": "high"} },
      { "order": 3, "type": "alarm_control", "target_type": "zone", "target_ids": ["zone-uuid-floor3"], "action": "arm", "params": {} },
      { "order": 4, "type": "notification", "target_type": "notification", "target_ids": ["*"], "action": "alert", "params": {"channels": ["push","sms"], "template": "security_lockdown"} }
    ],
    "all_clear_actions": [
      { "order": 1, "type": "door_control", "target_type": "zone", "target_ids": ["zone-uuid-floor3"], "action": "unlock", "params": {} },
      { "order": 2, "type": "alarm_control", "target_type": "zone", "target_ids": ["zone-uuid-floor3"], "action": "disarm", "params": {} },
      { "order": 3, "type": "notification", "target_type": "notification", "target_ids": ["*"], "action": "alert", "params": {"template": "all_clear"} }
    ],
    "escalation_chain_id": "uuid",
    "enabled": true
  }
  ```
- **Side effects:** Audit log
- **Response 201:** Created plan
- **Errors:** 401, 403, 422

### PUT /api/v1/emergency/plans/{id}
- **Auth:** role >= site_admin
- **Body:** Partial update
- **Side effects:** Audit log, version bump
- **Response 200:** Updated plan
- **Errors:** 401, 403, 404, 422, 409 (plan currently active)

### DELETE /api/v1/emergency/plans/{id}
- **Auth:** role >= super_admin
- **Side effects:** Audit log
- **Response 204**
- **Errors:** 401, 403, 404, 409 (plan currently active)

### POST /api/v1/emergency/activate
- **Auth:** role >= operator
- **Body:**
  ```json
  {
    "plan_id": "uuid",
    "is_drill": false,
    "notes": "Phát hiện khói tại tầng 5"
  }
  ```
- **Side effects:** Creates EmergencyIncident, starts countdown (if confirmation required), broadcasts MQTT emergency command to devices, triggers escalation chain, audit log
- **Response 201:**
  ```json
  {
    "incident_id": "uuid",
    "status": "pending_confirmation",
    "countdown_seconds": 10,
    "plan": { "id": "uuid", "name": "...", "type": "fire" }
  }
  ```
- **Errors:** 401, 403, 404, 409 (plan already active), 422

### POST /api/v1/emergency/incidents/{id}/confirm
- **Auth:** role >= operator
- **Description:** Confirm emergency during countdown — immediately execute all actions
- **Side effects:** Updates incident status to `active`, executes all plan actions, MQTT broadcast, audit log
- **Response 200:**
  ```json
  {
    "incident_id": "uuid",
    "status": "active",
    "activated_at": "2026-02-19T09:15:05Z",
    "actions_initiated": 6
  }
  ```
- **Errors:** 401, 403, 404, 409 (not in pending_confirmation/countdown)

### POST /api/v1/emergency/incidents/{id}/cancel
- **Auth:** role >= operator
- **Body:** `{ "reason": "Báo động giả — kiểm tra hoàn tất" }`
- **Description:** Cancel during countdown before actions execute
- **Side effects:** Updates incident to `cancelled`, audit log, notify contacts
- **Response 200:** Cancelled incident
- **Errors:** 401, 403, 404, 409 (already active — use all-clear instead)

### POST /api/v1/emergency/incidents/{id}/all-clear
- **Auth:** role >= admin
- **Body:**
  ```json
  {
    "override_code": "string",
    "resolution_summary": "Hỏa hoạn dập tắt, khu vực an toàn",
    "notes": "Nguyên nhân: chập điện phòng kỹ thuật"
  }
  ```
- **Side effects:** Executes all_clear_actions, restores door modes, disarms zones, broadcasts all-clear MQTT, notifies all contacts, audit log
- **Response 200:**
  ```json
  {
    "incident_id": "uuid",
    "status": "all_clear",
    "all_clear_at": "2026-02-19T09:45:00Z",
    "duration_seconds": 1795,
    "all_clear_actions_initiated": 3
  }
  ```
- **Errors:** 401, 403, 404, 409 (not active), 422 (invalid override code)

### GET /api/v1/emergency/incidents
- **Auth:** role >= viewer
- **Query params:**
  | Param | Type | Default | Description |
  |-------|------|---------|-------------|
  | page | int | 1 | Page number |
  | limit | int | 20 | Items per page (max 100) |
  | site_id | uuid | required | Filter by site |
  | status | string | - | Filter by status |
  | type | string | - | Filter by emergency type |
  | is_drill | boolean | - | Filter drills vs real |
  | from | timestamp | -30d | Start time |
  | to | timestamp | now | End time |
- **Response 200:** Paginated list of EmergencyIncident with summary info
- **Errors:** 401, 403, 422

### GET /api/v1/emergency/incidents/{id}
- **Auth:** role >= viewer
- **Response 200:** Full incident with action log, device responses, timeline
- **Errors:** 401, 403, 404

### GET /api/v1/emergency/incidents/active
- **Auth:** role >= viewer
- **Query params:** site_id (required)
- **Response 200:** List of currently active incidents (status = pending_confirmation, countdown, active)

### POST /api/v1/emergency/incidents/{id}/notes
- **Auth:** role >= operator
- **Body:** `{ "note": "Đội PCCC đã đến hiện trường" }`
- **Side effects:** Append to incident timeline, audit log
- **Response 200:** Updated incident

### GET /api/v1/emergency/contacts
- **Auth:** role >= viewer
- **Query params:** site_id (required), type, emergency_types
- **Response 200:** Paginated contact list

### POST /api/v1/emergency/contacts
- **Auth:** role >= admin
- **Body:** EmergencyContact object
- **Response 201:** Created contact

### PUT /api/v1/emergency/contacts/{id}
- **Auth:** role >= admin
- **Body:** Partial update
- **Response 200:** Updated contact

### DELETE /api/v1/emergency/contacts/{id}
- **Auth:** role >= site_admin
- **Response 204**

### GET /api/v1/emergency/response-teams
- **Auth:** role >= viewer
- **Query params:** site_id (required), type
- **Response 200:** Paginated response teams

### POST /api/v1/emergency/response-teams
- **Auth:** role >= admin
- **Body:** ResponseTeam object
- **Response 201:** Created team

### POST /api/v1/emergency/drills
- **Auth:** role >= site_admin
- **Body:** `{ "plan_id": "uuid", "scheduled_at": "2026-03-01T10:00:00Z", "notify_participants": true }`
- **Description:** Schedule or immediately start an emergency drill
- **Side effects:** Creates incident with is_drill=true, follows same flow but notifications include "DRILL" prefix
- **Response 201:** Created drill incident

### GET /api/v1/emergency/incidents/{id}/device-responses
- **Auth:** role >= operator
- **Response 200:** Map of device_id → response status, showing which devices acknowledged the emergency command

## MQTT Topics

| Topic | Direction | QoS | Payload Schema | Description |
|-------|-----------|-----|----------------|-------------|
| `dm/{tid}/emergency/broadcast` | server→all | 2 | `{incident_id, type, severity, scope, zone_ids, actions: [{target_type, target_ids, action, params}], is_drill}` | Emergency activation broadcast — all devices in scope |
| `dm/{tid}/emergency/all-clear` | server→all | 2 | `{incident_id, all_clear_actions: [...]}` | All-clear broadcast — restore normal operations |
| `dm/{tid}/emergency/cancel` | server→all | 2 | `{incident_id, reason}` | Cancel broadcast during countdown |
| `dm/{tid}/device/{did}/emergency/ack` | device→server | 2 | `{incident_id, device_id, action_results: [{action, status, error}], executed_at}` | Device acknowledgment of emergency actions |
| `dm/{tid}/device/{did}/evt` (type: emergency.sensor) | device→server | 1 | `{sensor_type, zone_id, value, threshold}` | Sensor trigger that may auto-activate emergency |

## Business Rules

1. **BR-EM-001 — Confirmation Flow:** When `confirmation_required=true`, activation creates a countdown. If not confirmed or cancelled within `countdown_seconds`, the plan auto-executes. This prevents accidental activations while ensuring timely response.
2. **BR-EM-002 — Immediate Execution:** When `confirmation_required=false` or `countdown_seconds=0`, plan actions execute immediately upon activation. Used for auto-triggered emergencies (e.g., fire sensor).
3. **BR-EM-003 — Fire Door Override:** During fire emergencies, ALL doors with `emergency_unlock=true` unlock immediately regardless of access rules, schedules, or lockdown state. Doors with `emergency_unlock=false` (vault, server room) remain locked.
4. **BR-EM-004 — Security Lockdown Override:** During security lockdown, ALL doors in scope lock immediately. Only operators with role >= admin AND a valid override code can unlock individual doors. Normal access credentials are disabled for the duration.
5. **BR-EM-005 — Medical Emergency Path:** Medical emergencies unlock the shortest path from incident location to medical room/exit and notify first-aid team members. Non-critical doors remain in normal mode.
6. **BR-EM-006 — Zone vs Building Scope:** Zone-scoped emergencies only affect devices in specified zones. Building-wide affects all devices in the site. Campus-wide broadcasts to all sites in the tenant.
7. **BR-EM-007 — All-Clear Override Code:** All-clear requires a pre-configured override code (per plan) to prevent unauthorized de-escalation. The code is hashed (bcrypt) and stored in the plan. Failed attempts are logged.
8. **BR-EM-008 — One Active Per Type:** Only one emergency of each type can be active per scope at a time. Activating a fire emergency while one is already active returns 409. Different types can coexist (fire + medical).
9. **BR-EM-009 — Escalation Timeout:** If an active emergency is not resolved within a configurable timeout (default 30 minutes), the system auto-escalates: notifies higher-priority contacts and increases severity.
10. **BR-EM-010 — Drill Marking:** All drill-related events, notifications, and MQTT messages include `is_drill=true`. Drill notifications are prefixed with "[DIỄN TẬP]" to prevent panic. Drill events are stored separately in reports.
11. **BR-EM-011 — Lift Recall:** Fire emergencies automatically send lift recall commands — all lifts return to ground floor and doors open. Lifts remain locked until all-clear.
12. **BR-EM-012 — CCTV Auto-Record:** Emergency activation triggers high-quality recording on all cameras in affected zones. Recordings are tagged with incident_id and retained for minimum 1 year regardless of normal retention policy.
13. **BR-EM-013 — Intercom Broadcast:** Emergency plans can include PA/intercom announcements — pre-recorded messages or live broadcast from guard station. Fire plans include automated evacuation announcement in Vietnamese and English.
14. **BR-EM-014 — Device Response Tracking:** After broadcast, the system tracks which devices acknowledged within 10 seconds. Devices that don't respond are flagged as "unresponsive" and operators are alerted to manually verify those areas.
15. **BR-EM-015 — HVAC Integration:** Fire emergencies shut down HVAC in affected zones to prevent smoke spread. Hazmat emergencies may activate positive pressure in safe zones.

## Permissions Matrix

| Action | viewer | operator | admin | site_admin | super_admin |
|--------|--------|----------|-------|------------|-------------|
| List plans | ✅ | ✅ | ✅ | ✅ | ✅ |
| View plan detail | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create/edit plans | ❌ | ❌ | ❌ | ✅ | ✅ |
| Delete plans | ❌ | ❌ | ❌ | ❌ | ✅ |
| Activate emergency | ❌ | ✅ | ✅ | ✅ | ✅ |
| Confirm/cancel during countdown | ❌ | ✅ | ✅ | ✅ | ✅ |
| Declare all-clear | ❌ | ❌ | ✅ | ✅ | ✅ |
| Add incident notes | ❌ | ✅ | ✅ | ✅ | ✅ |
| View incidents | ✅ | ✅ | ✅ | ✅ | ✅ |
| Manage contacts | ❌ | ❌ | ✅ | ✅ | ✅ |
| Manage response teams | ❌ | ❌ | ✅ | ✅ | ✅ |
| Schedule drills | ❌ | ❌ | ❌ | ✅ | ✅ |
| Override door during lockdown | ❌ | ❌ | ✅ | ✅ | ✅ |

## Offline Behavior

- **Device-side:** Devices store the latest emergency plan actions locally. When an emergency MQTT broadcast is received, devices execute their assigned actions immediately without further server communication. If a device is offline during broadcast, it cannot receive emergency commands — this is mitigated by hardware failsafe wiring (fire alarm relay directly connected to door strike).
- **Hardware failsafe:** Fire alarm systems are wired directly to door controllers as a hardware backup. Even if MQTT/network is completely down, fire alarm relay triggers emergency unlock on wired doors. This is independent of software.
- **Sync strategy:** On reconnect, devices report their current mode (normal/emergency/lockdown). If an emergency is still active, server re-sends the emergency state. If all-clear was issued while device was offline, server sends all-clear on reconnect.
- **Conflict resolution:** Server wins. If device reconnects with stale emergency state, server's current state takes precedence.
- **Local storage:** Devices cache: current emergency state, list of emergency plan actions for their doors, override codes (hashed). Max: 10 emergency plans per device.
- **Event queuing:** Emergency events (activations, device responses) are critical — devices queue them with highest priority for upload on reconnect.

## UI Pages

| Route | Page | Key Components |
|-------|------|----------------|
| /secure/emergency | Emergency Dashboard | Active incidents banner (red), plan list, recent incidents timeline, contact directory |
| /secure/emergency/plans/:id | Plan Detail | Action sequence editor, zone picker, contact assignment, drill history |
| /secure/emergency/incidents/:id | Incident Detail | Live timeline, device response map, action status, notes, all-clear button |
| /secure/emergency/activate | Activation Dialog | Plan selector, confirmation countdown overlay, emergency type quick buttons |
| /secure/emergency/contacts | Contact Directory | Contact list with emergency types, availability, priority ordering |

## Events & Audit Log

| Event Type | Trigger | Payload | Retention |
|------------|---------|---------|-----------|
| emergency.plan.created | POST create | full plan | permanent |
| emergency.plan.updated | PUT update | diff only | permanent |
| emergency.plan.deleted | DELETE | id + actor | permanent |
| emergency.activated | POST activate | incident_id, plan_id, type, scope, actor, is_drill | permanent |
| emergency.confirmed | POST confirm | incident_id, actor, time | permanent |
| emergency.cancelled | POST cancel | incident_id, actor, reason | permanent |
| emergency.all_clear | POST all-clear | incident_id, actor, duration, summary | permanent |
| emergency.escalated | Auto-escalation | incident_id, new_severity, contacts_notified | permanent |
| emergency.device.ack | Device MQTT ack | incident_id, device_id, actions_executed | permanent |
| emergency.device.unresponsive | No ack within 10s | incident_id, device_id | permanent |
| emergency.contact.created | POST create | full contact | 1 year |
| emergency.contact.updated | PUT update | diff | 1 year |
| emergency.drill.completed | All-clear on drill | incident_id, duration, device_response_rate | permanent |
| emergency.override.door | Door override during lockdown | door_id, actor, override_code_hash | permanent |
| emergency.override.failed | Invalid override code | door_id, actor, attempts | permanent |

## Integration Points

- **Depends on:**
  - `access-svc` — Door control commands (unlock/lock/mode change), door registry
  - `video-svc` — Camera recording triggers, snapshot capture
  - `alarm-svc` — Zone arm/disarm, sensor events that auto-trigger emergencies
  - `intercom-svc` — PA announcements, broadcast messages
  - `notif-svc` — Push/SMS/email notifications to contacts and response teams
  - `device-gw` — MQTT broadcast routing, device registry for response tracking
  - `auth-svc` — JWT validation, override code verification
  - `identity-svc` — Response team member lookup
- **Consumed by:**
  - `automate-svc` — Emergency events as triggers for automation rules
  - `report-svc` — Emergency response analytics, drill compliance reports
  - `audit-svc` — All emergency events are permanent audit records
- **External:**
  - Fire alarm panel (hardware relay integration)
  - Building Management System (HVAC control via BACnet/Modbus)
  - External emergency services (auto-dial via SIP integration)

## Notes

- Emergency plans should be tested via drills at least quarterly. The system tracks drill history and alerts admins when drills are overdue.
- Override codes for all-clear should be rotated every 90 days. The system warns when codes are approaching expiry.
- Hardware failsafe wiring (fire relay → door strike) is mandatory for fire emergency doors and cannot be replaced by software alone.
- Campus-wide emergencies broadcast to all sites — requires cross-site admin role or super_admin.
- Emergency activation is the highest-priority MQTT message (QoS 2) and pre-empts all other sync operations.
- The countdown timer is displayed on all connected web/mobile clients via WebSocket push for real-time visibility.
