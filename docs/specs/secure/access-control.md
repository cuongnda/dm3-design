# Feature: Access Control System

> Domain: SECURE | Color: #3B82F6 | Priority: P0
> Status: Draft | Owner: SECURE Team

## Overview

The Access Control System is the foundation of the SECURE domain — controlling who goes where, when, and how. It manages doors, gates, turnstiles, lifts, and barriers across one or multiple sites. **All access decisions are made locally on devices** using synced person databases and access rules. The server manages rules, orchestrates sync, and aggregates event logs for dashboards and analytics. Zero connectivity dependency for core access decisions.

## Data Models

### Door (Access Point)
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | - | Tenant isolation |
| site_id | uuid | yes | - | Site this door belongs to |
| zone_id | uuid | no | null | Zone grouping (floor, area) |
| name | string(100) | yes | - | Display name, e.g. "Cổng chính — Tòa A" |
| description | string(500) | no | null | Notes |
| type | DoorTypeEnum | yes | - | Physical type of access point |
| location | string(200) | yes | - | Human-readable location |
| floor | string(50) | no | null | Floor identifier |
| building | string(100) | no | null | Building identifier |
| status | DoorStatusEnum | yes | offline | Current connection status |
| state | DoorStateEnum | yes | locked | Current physical state |
| mode | DoorModeEnum | yes | normal | Operating mode |
| controller_id | uuid | no | null | Associated controller device |
| device_id | uuid | no | null | Terminal device (if integrated) |
| reader_in_type | string(50) | no | null | Entry reader model |
| reader_out_type | string(50) | no | null | Exit reader model |
| unlock_duration_ms | int | yes | 5000 | How long door stays unlocked |
| anti_passback | boolean | yes | false | Anti-passback enabled |
| interlock_group_id | uuid | no | null | Interlock group (mantrap) |
| emergency_unlock | boolean | yes | true | Unlock on fire alarm |
| camera_id | uuid | no | null | Linked CCTV camera |
| firmware_version | string(20) | no | null | Controller firmware |
| ip_address | inet | no | null | Controller IP |
| mac_address | macaddr | no | null | Controller MAC |
| last_event_at | timestamp | no | null | Last access event time |
| last_heartbeat_at | timestamp | no | null | Last device heartbeat |
| config_version | int | yes | 0 | Current config version synced |
| person_db_version | int | yes | 0 | Current person DB version on device |
| rules_version | int | yes | 0 | Current rules version on device |
| metadata | jsonb | no | {} | Extra data |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### AccessRule
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | - | Tenant isolation |
| site_id | uuid | yes | - | Site scope |
| name | string(100) | yes | - | Rule name, e.g. "Nhân viên — Giờ hành chính" |
| description | string(500) | no | null | Rule description |
| door_ids | uuid[] | yes | - | Doors this rule applies to |
| person_group_ids | uuid[] | yes | - | Person groups granted access |
| schedule_id | uuid | no | null | Time schedule reference |
| schedule_inline | jsonb | no | null | Inline schedule if no schedule_id |
| anti_passback | boolean | yes | false | Override per-door anti-passback |
| multi_factor | boolean | yes | false | Require 2+ credentials |
| multi_factor_methods | string[] | no | null | Which methods required |
| max_failed_attempts | int | yes | 5 | Lockout threshold |
| lockout_duration_ms | int | yes | 300000 | Lockout duration (5 min default) |
| priority | int | yes | 0 | Higher = evaluated first |
| enabled | boolean | yes | true | Active/inactive toggle |
| valid_from | timestamp | no | null | Rule effective start |
| valid_until | timestamp | no | null | Rule effective end |
| created_by | uuid | yes | - | Creator user |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### Schedule
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | - | Tenant isolation |
| name | string(100) | yes | - | e.g. "Giờ hành chính" |
| timezone | string(50) | yes | Asia/Ho_Chi_Minh | Timezone |
| periods | jsonb | yes | - | Array of {days: int[], start: "HH:MM", end: "HH:MM"} |
| holidays_excluded | boolean | yes | true | Skip holidays |
| holiday_calendar_id | uuid | no | null | Holiday calendar ref |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### AccessEvent (Hypertable)
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | - | Tenant isolation |
| time | timestamptz | yes | - | Event timestamp (device clock) |
| door_id | uuid | yes | - | Which door |
| person_id | uuid | no | null | Matched person (null if unknown) |
| person_name | string(100) | no | null | Denormalized name |
| credential_type | CredentialTypeEnum | yes | - | Method used |
| direction | DirectionEnum | no | null | entry / exit |
| decision | DecisionEnum | yes | - | granted / denied / forced |
| decided_locally | boolean | yes | true | Always true in offline-first |
| decision_time_ms | int | no | null | Time to make decision on device |
| reason | DenialReasonEnum | no | null | Reason for denial |
| confidence | float | no | null | Biometric match confidence 0-1 |
| photo_ref | string(200) | no | null | MinIO reference for snapshot |
| temperature | float | no | null | Thermal reading if enabled |
| mask_detected | boolean | no | null | Mask detection result |
| local_db_version | int | no | null | Device's person DB version |
| local_person_count | int | no | null | Device's person count |
| device_id | uuid | no | null | Source device |
| metadata | jsonb | no | {} | Extra data |

### PersonGroup
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | - | Tenant isolation |
| site_id | uuid | yes | - | Site scope |
| name | string(100) | yes | - | e.g. "Nhân viên văn phòng", "Ban giám đốc" |
| description | string(500) | no | null | Description |
| person_ids | uuid[] | no | [] | Members (or use dynamic rules) |
| dynamic_filter | jsonb | no | null | Auto-membership rules (department, role) |
| person_count | int | yes | 0 | Cached member count |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### InterlockGroup
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | - | Tenant isolation |
| name | string(100) | yes | - | e.g. "Mantrap Kho quỹ" |
| door_ids | uuid[] | yes | - | Doors in group (must be 2+) |
| mode | InterlockModeEnum | yes | mutual_exclusive | Interlock logic |
| created_at | timestamp | yes | now() | Creation time |

### Enums
```
DoorTypeEnum: door | gate | barrier | turnstile | lift
DoorStatusEnum: online | offline | alarm | warning
DoorStateEnum: locked | unlocked | open | closed | forced | held_open | tampered
DoorModeEnum: normal | locked_down | free_access | card_and_pin | emergency_open
CredentialTypeEnum: card | face | fingerprint | pin | qr | mobile_ble | multi_factor
DirectionEnum: entry | exit
DecisionEnum: granted | denied | forced
DenialReasonEnum: authorized | denied_expired | denied_zone | denied_time | denied_unknown | denied_blacklist | denied_lockout | denied_anti_passback | denied_interlock | denied_inactive
InterlockModeEnum: mutual_exclusive | sequential
```

## API Endpoints

### GET /api/v1/access/doors
- **Auth:** Bearer token, role >= viewer
- **Query params:**
  | Param | Type | Default | Description |
  |-------|------|---------|-------------|
  | page | int | 1 | Page number |
  | limit | int | 20 | Items per page (max 100) |
  | site_id | uuid | required | Filter by site |
  | zone_id | uuid | - | Filter by zone |
  | status | string | - | Filter: online,offline,alarm,warning |
  | type | string | - | Filter: door,gate,barrier,turnstile,lift |
  | search | string | - | Search name, location |
  | sort | string | name | Sort field |
  | order | string | asc | asc / desc |
- **Response 200:**
  ```json
  {
    "data": [
      {
        "id": "uuid",
        "name": "Cổng chính — Tòa A",
        "location": "Tòa A, Tầng 1",
        "type": "door",
        "status": "online",
        "state": "locked",
        "mode": "normal",
        "last_event_at": "2026-02-19T09:15:00Z",
        "zone": { "id": "uuid", "name": "Sảnh chính" },
        "camera_id": "uuid"
      }
    ],
    "total": 52,
    "page": 1,
    "limit": 20
  }
  ```
- **Errors:** 401, 403, 422

### GET /api/v1/access/doors/{id}
- **Auth:** role >= viewer
- **Response 200:** Full Door object with nested controller info, linked camera, access rules, recent events (last 10)
- **Errors:** 401, 403, 404

### POST /api/v1/access/doors
- **Auth:** role >= admin
- **Body:**
  ```json
  {
    "name": "Cửa phòng Lab — Tầng 3",
    "site_id": "uuid",
    "zone_id": "uuid",
    "type": "door",
    "location": "Tòa A, Tầng 3",
    "floor": "Tầng 3",
    "building": "Tòa A",
    "device_id": "uuid",
    "unlock_duration_ms": 5000,
    "anti_passback": false,
    "emergency_unlock": true,
    "camera_id": "uuid"
  }
  ```
- **Side effects:** Audit log, MQTT `cfg.full` push to device if device_id set
- **Response 201:** Created door
- **Errors:** 401, 403, 409 (duplicate name), 422

### PUT /api/v1/access/doors/{id}
- **Auth:** role >= admin
- **Body:** Partial door fields
- **Side effects:** Audit log, MQTT `cfg.patch` to device if config changed
- **Response 200:** Updated door
- **Errors:** 401, 403, 404, 422

### DELETE /api/v1/access/doors/{id}
- **Auth:** role >= site_admin
- **Side effects:** Audit log, remove door from all rules, notify device
- **Response 204:** Deleted
- **Errors:** 401, 403, 404, 409 (door has active alarm)

### POST /api/v1/access/doors/{id}/unlock
- **Auth:** role >= operator
- **Body:**
  ```json
  {
    "duration_ms": 5000,
    "reason": "Mở cửa cho khách VIP"
  }
  ```
- **Side effects:** MQTT `cmd.door` (action=unlock) → device, audit log, wait for response (10s timeout)
- **Response 200:**
  ```json
  {
    "status": "ok",
    "door_id": "uuid",
    "current_state": "unlocked",
    "executed_at": "2026-02-19T09:15:00.500Z"
  }
  ```
- **Errors:** 401, 403, 404, 408 (device timeout), 503 (device offline)

### POST /api/v1/access/doors/{id}/lock
- **Auth:** role >= operator
- **Side effects:** MQTT `cmd.door` (action=lock) → device, audit log
- **Response 200:** Same as unlock
- **Errors:** 401, 403, 404, 408, 503

### POST /api/v1/access/doors/{id}/hold-open
- **Auth:** role >= admin
- **Body:** `{ "duration_ms": 60000, "reason": "Sự kiện công ty" }`
- **Side effects:** MQTT `cmd.door` (action=hold_open), audit log
- **Response 200:** Confirmation
- **Errors:** 401, 403, 404, 408, 503

### GET /api/v1/access/doors/{id}/events
- **Auth:** role >= viewer
- **Query params:**
  | Param | Type | Default | Description |
  |-------|------|---------|-------------|
  | from | timestamp | -24h | Start time |
  | to | timestamp | now | End time |
  | decision | string | - | Filter: granted,denied,forced |
  | credential_type | string | - | Filter by credential type |
  | person_id | uuid | - | Filter by person |
  | page | int | 1 | Pagination |
  | limit | int | 50 | Max 500 |
- **Response 200:**
  ```json
  {
    "data": [
      {
        "id": "uuid",
        "time": "2026-02-19T09:15:00Z",
        "person_id": "uuid",
        "person_name": "Nguyễn Văn An",
        "credential_type": "face",
        "direction": "entry",
        "decision": "granted",
        "confidence": 0.97,
        "photo_ref": "access/2026/02/19/snap_uuid.jpg"
      }
    ],
    "total": 1234,
    "page": 1,
    "limit": 50
  }
  ```

### GET /api/v1/access/rules
- **Auth:** role >= viewer
- **Query params:** site_id (required), door_id, person_group_id, enabled, page, limit
- **Response 200:** Paginated list of AccessRule with nested schedule and person counts

### POST /api/v1/access/rules
- **Auth:** role >= admin
- **Body:**
  ```json
  {
    "name": "Nhân viên — Giờ hành chính",
    "site_id": "uuid",
    "door_ids": ["uuid1", "uuid2"],
    "person_group_ids": ["uuid1"],
    "schedule_inline": {
      "timezone": "Asia/Ho_Chi_Minh",
      "periods": [
        { "days": [1,2,3,4,5], "start": "07:00", "end": "19:00" }
      ]
    },
    "anti_passback": false,
    "priority": 10,
    "enabled": true
  }
  ```
- **Side effects:** Audit log, trigger `cfg.access_rules` sync to all affected devices
- **Response 201:** Created rule
- **Errors:** 401, 403, 422

### PUT /api/v1/access/rules/{id}
- **Auth:** role >= admin
- **Body:** Partial update
- **Side effects:** Audit log, re-sync rules to affected devices
- **Response 200:** Updated rule

### DELETE /api/v1/access/rules/{id}
- **Auth:** role >= admin
- **Side effects:** Audit log, re-sync rules to affected devices
- **Response 204**

### GET /api/v1/access/schedules
- **Auth:** role >= viewer
- **Query params:** site_id (required), page, limit
- **Response 200:** Paginated schedules

### POST /api/v1/access/schedules
- **Auth:** role >= admin
- **Body:** Schedule object
- **Response 201:** Created schedule

### GET /api/v1/access/person-groups
- **Auth:** role >= viewer
- **Query params:** site_id (required), search, page, limit
- **Response 200:** Paginated groups with member counts

### POST /api/v1/access/person-groups
- **Auth:** role >= admin
- **Body:** PersonGroup object
- **Response 201:** Created group

### PUT /api/v1/access/person-groups/{id}/members
- **Auth:** role >= admin
- **Body:** `{ "add": ["person-uuid1"], "remove": ["person-uuid2"] }`
- **Side effects:** Triggers person_sync to devices that have rules referencing this group
- **Response 200:** Updated group

### POST /api/v1/access/doors/{id}/sync
- **Auth:** role >= admin
- **Description:** Force full person DB + rules sync to a specific device
- **Side effects:** MQTT `cfg.person_sync` (action=full_sync) + `cfg.access_rules` (action=full_sync)
- **Response 202:** Sync initiated
- **Errors:** 401, 403, 404, 503 (device offline)

### GET /api/v1/access/doors/{id}/sync-status
- **Auth:** role >= operator
- **Response 200:**
  ```json
  {
    "door_id": "uuid",
    "device_online": true,
    "config_version": 42,
    "person_db_version": 38,
    "rules_version": 28,
    "blacklist_version": 15,
    "local_person_count": 4998,
    "last_sync_at": "2026-02-19T09:00:00Z",
    "pending_events": 0,
    "sync_health": "healthy"
  }
  ```

### GET /api/v1/access/interlock-groups
- **Auth:** role >= viewer
- **Query params:** site_id (required)
- **Response 200:** List of interlock groups

### POST /api/v1/access/interlock-groups
- **Auth:** role >= site_admin
- **Body:** InterlockGroup object
- **Response 201:** Created interlock group

## MQTT Topics

| Topic | Direction | QoS | Payload Schema | Description |
|-------|-----------|-----|----------------|-------------|
| `dm/{tid}/device/{did}/evt` (type: access.log) | device→server | 1 | See mqtt-protocol.md §4.1 | Access event log — decision already made locally |
| `dm/{tid}/device/{did}/evt` (type: door.state) | device→server | 1 | See mqtt-protocol.md §4.2 | Door physical state change |
| `dm/{tid}/device/{did}/cmd` (type: cmd.door) | server→device | 2 | `{action, door_id, duration_ms, reason, operator_id}` | Remote door control |
| `dm/{tid}/device/{did}/cmd/resp` (type: cmd.door.resp) | device→server | 2 | `{door_id, current_state, executed_at}` | Door command response |
| `dm/{tid}/device/{did}/cfg` (type: cfg.person_sync) | server→device | 2 | See mqtt-protocol.md §7.3 | Person DB sync to device |
| `dm/{tid}/device/{did}/cfg` (type: cfg.access_rules) | server→device | 2 | See mqtt-protocol.md §7.5 | Access rules sync to device |
| `dm/{tid}/device/{did}/cfg` (type: cfg.blacklist) | server→device | 2 | See mqtt-protocol.md §7.4 | Blacklist push (priority) |
| `dm/{tid}/device/{did}/cfg/ack` | device→server | 2 | Ack with local versions and counts | Sync confirmation |
| `dm/{tid}/device/{did}/sta` (type: status.heartbeat) | device→server | 0 | See mqtt-protocol.md §5.1 | Device health + sync status |
| `dm/{tid}/emergency/broadcast` (type: cmd.lockdown) | server→all | 2 | See mqtt-protocol.md §6.5 | Emergency lockdown broadcast |

## Business Rules

1. **BR-AC-001 — Local Decision Engine:** All access decisions MUST be made on-device within 50ms using synced person DB and access rules. Server NEVER participates in real-time access decisions.
2. **BR-AC-002 — Deny by Default:** If a credential does not match any person in the local DB, or the person has no applicable rule for the current door + time, access is DENIED.
3. **BR-AC-003 — Blacklist Priority:** Blacklist entries override ALL access rules. A blacklisted person is denied regardless of any rule granting access. Blacklist sync has QoS 2 and must be processed before the next access decision.
4. **BR-AC-004 — Anti-Passback:** If enabled on a rule or door, a person who entered (direction=entry) cannot enter again until they exit. Violation → deny with reason `denied_anti_passback`. Anti-passback state is maintained locally on the device.
5. **BR-AC-005 — Interlock / Mantrap:** In an interlock group, only one door may be unlocked at a time. A door in the group cannot unlock until all other doors in the group are in `locked` state. Enforced locally by the controller.
6. **BR-AC-006 — Failed Attempt Lockout:** After `max_failed_attempts` consecutive denials for the same credential within 10 minutes, the credential is locked out for `lockout_duration_ms`. Enforced locally.
7. **BR-AC-007 — Emergency Override:** When emergency mode is activated via `dm/{tid}/emergency/broadcast`, doors with `emergency_unlock=true` must unlock immediately regardless of rules. Doors with `emergency_unlock=false` (e.g., server rooms) lock down.
8. **BR-AC-008 — Rule Priority Evaluation:** Rules are evaluated in descending priority order. First matching rule determines the decision. If no rule matches, access is denied.
9. **BR-AC-009 — Schedule Enforcement:** Access rules with schedules are only active during the defined periods. Schedule evaluation uses the device's local clock (synced via NTP). Timezone is always explicit.
10. **BR-AC-010 — Door Held Open Alert:** If a door remains in `open` state longer than `unlock_duration_ms + 30 seconds`, the device emits an `alarm.triggered` event with type `door_held`. Monitored locally.
11. **BR-AC-011 — Forced Door Alert:** If a door is opened without a valid unlock command or access grant, the device emits `alarm.triggered` with type `door_forced`. Immediate critical alert.
12. **BR-AC-012 — Incremental Sync:** Person DB sync uses cursor-based incremental sync (`sync_token`). Only changed records are sent. Full sync only on first provision or admin request.
13. **BR-AC-013 — Multi-Factor Access:** When `multi_factor=true` on a rule, person must present 2+ credentials (e.g., card + face) within a 30-second window. Both must match the same person.
14. **BR-AC-014 — Credential Validity Window:** Each person credential has `valid_from` and `valid_until`. Device rejects expired credentials locally without server involvement.
15. **BR-AC-015 — Event Queue Ordering:** When device reconnects, queued events are uploaded in chronological order (oldest first), throttled at 100 events/second.

## Permissions Matrix

| Action | viewer | operator | admin | site_admin | super_admin |
|--------|--------|----------|-------|------------|-------------|
| List doors | ✅ | ✅ | ✅ | ✅ | ✅ |
| View door detail | ✅ | ✅ | ✅ | ✅ | ✅ |
| View events | ✅ | ✅ | ✅ | ✅ | ✅ |
| Remote unlock/lock | ❌ | ✅ | ✅ | ✅ | ✅ |
| Hold open | ❌ | ❌ | ✅ | ✅ | ✅ |
| Create/edit doors | ❌ | ❌ | ✅ | ✅ | ✅ |
| Delete doors | ❌ | ❌ | ❌ | ✅ | ✅ |
| Create/edit rules | ❌ | ❌ | ✅ | ✅ | ✅ |
| Delete rules | ❌ | ❌ | ✅ | ✅ | ✅ |
| Manage person groups | ❌ | ❌ | ✅ | ✅ | ✅ |
| Force device sync | ❌ | ❌ | ✅ | ✅ | ✅ |
| Create interlock groups | ❌ | ❌ | ❌ | ✅ | ✅ |
| Emergency lockdown | ❌ | ✅ | ✅ | ✅ | ✅ |

## Offline Behavior

- **Device-side:** This IS the primary mode. Devices always have a complete local person DB (SQLite), access rules, and blacklist. All credential matching, rule evaluation, schedule checks, anti-passback tracking, and interlock logic run locally in < 50ms. No server dependency whatsoever.
- **Event queuing:** Access events are logged to local SQLite `event_queue` table (max 5,000 events). When connectivity restores, events upload in chronological order at 100/sec.
- **Sync strategy:** On reconnect, device publishes heartbeat with `local_db_version`, `rules_version`, `blacklist_version`. Server compares versions and sends incremental deltas for any stale data.
- **Conflict resolution:** Server wins. Server is the single source of truth for person data and rules. Device never modifies person records — only consumes them.
- **Local storage:** SQLite DB on device containing: persons table (face templates ~2KB each, card UIDs, fingerprint templates ~500B each), access_rules, blacklist, event_queue, config. Max capacity: 10,000 persons by default (configurable per device model).
- **Clock sync:** Devices use NTP for time synchronization. If NTP is unavailable, device uses internal RTC. Events include device timestamp and are reconciled server-side.
- **Blacklist during offline:** Blacklist entries synced before going offline remain enforced. New blacklist entries cannot reach the device until connectivity restores — this is an accepted risk documented in the security assessment.
- **Degraded mode indicators:** Device displays "Offline Mode" icon on screen but continues normal access operations. Operators see `queue_depth > 0` in status to know events are pending upload.

## UI Pages

| Route | Page | Key Components |
|-------|------|----------------|
| /secure/access-control | Door List | DataTable with status tabs (All/Online/Offline/Alarm/Warning), filters, stat cards |
| /secure/access-control/:id | Door Detail | Door info, state controls (unlock/lock/hold), live event timeline, linked camera, access rules tab, schedule heatmap, device health |
| /secure/access-control/rules | Access Rules | DataTable of rules, create/edit dialog with door picker, group picker, schedule builder, day selector |

## Events & Audit Log

| Event Type | Trigger | Payload | Retention |
|------------|---------|---------|-----------|
| access.door.created | POST create | full door resource | 1 year |
| access.door.updated | PUT update | diff only | 1 year |
| access.door.deleted | DELETE | id + actor | permanent |
| access.door.unlocked | POST unlock command | door_id, actor, reason, duration | 1 year |
| access.door.locked | POST lock command | door_id, actor | 1 year |
| access.door.held_open | POST hold-open | door_id, actor, duration | 1 year |
| access.event.granted | Device access.log | person, door, credential, time | 2 years |
| access.event.denied | Device access.log | person/unknown, door, reason, time | 2 years |
| access.event.forced | Device door.state forced | door, time, photo | permanent |
| access.rule.created | POST rule | full rule | 1 year |
| access.rule.updated | PUT rule | diff | 1 year |
| access.rule.deleted | DELETE rule | id + actor | permanent |
| access.group.members_changed | PUT group members | added/removed person IDs | 1 year |
| access.sync.initiated | POST sync | door_id, sync_type, actor | 90 days |
| access.sync.completed | cfg/ack received | door_id, versions, counts | 90 days |
| access.alarm.door_forced | Device alarm event | door_id, time, photo | permanent |
| access.alarm.door_held | Device alarm event | door_id, duration | 1 year |
| access.lockdown.activated | Emergency broadcast | actor, level, zones | permanent |
| access.lockdown.deactivated | Emergency deactivate | actor, override_code_hash | permanent |

## Integration Points

- **Depends on:**
  - `identity-svc` — Person data, credentials, person groups (gRPC)
  - `auth-svc` — JWT validation, role-based permissions
  - `device-gw` — MQTT message routing, device registry
  - `notif-svc` — Push notifications for alarms (forced door, held open)
- **Consumed by:**
  - `video-svc` — Links access events to camera snapshots/clips
  - `alarm-svc` — Receives door alarms for intrusion detection zone state
  - `attend-svc` — Uses access events as attendance clock-in/out records
  - `visitor-svc` — Grants temporary access via person_sync
  - `automate-svc` — Triggers automation rules on access events
  - `report-svc` — Access analytics, traffic heatmaps, denied access trends
  - `parking-svc` — Barrier control shares same door command interface
- **External:**
  - NTP servers for device time sync
  - OSDP/Wiegand readers via controller hardware

## Notes

- The access-svc is NOT a real-time decision engine. It is a rule management + sync orchestration + event aggregation service.
- Face templates are ArcFace v3 format (~2KB each). Card UIDs are 4-10 byte hex. Fingerprint templates are ISO/IEC 19794-2 format (~500B each).
- Interlock groups are limited to 4 doors maximum per group due to controller hardware constraints.
- Anti-passback state resets daily at midnight (configurable) to handle edge cases like tailgating that can desync state.
- Photo snapshots in access events are optional and configurable per door. When enabled, photos are stored in MinIO with 90-day retention, then thumbnails only.
