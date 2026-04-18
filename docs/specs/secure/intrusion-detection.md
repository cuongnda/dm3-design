# Feature: Intrusion Detection System

> Domain: SECURE | Color: #22C55E | Priority: P0
> Status: Draft | Owner: SECURE Team

## Overview

The Intrusion Detection System manages alarm zones, sensors, arm/disarm operations, alarm events, and escalation workflows. It integrates perimeter protection (beam detectors, fence sensors) and interior detection (PIR, magnetic contacts, glass break, vibration) into a unified zone-based management model. Zones are armed/disarmed by schedule or operator command. Alarm events trigger escalation chains: guard notification → CCTV recording → lockdown. **Sensor monitoring and alarm triggering happen locally on alarm panels/controllers** — the server manages zone configuration, receives events, and orchestrates responses.

## Data Models

### Zone
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | - | Tenant isolation |
| site_id | uuid | yes | - | Site |
| name | string(100) | yes | - | e.g. "Sảnh chính - Tầng 1" |
| description | string(500) | no | null | Zone description |
| floor | string(50) | no | null | Floor |
| building | string(100) | no | null | Building |
| status | ZoneStatusEnum | yes | disarmed | Current status |
| arm_mode | ArmModeEnum | no | null | Current arm mode (when armed) |
| sensor_count | int | yes | 0 | Number of sensors in zone |
| alarm_panel_id | uuid | no | null | Associated alarm panel device |
| entry_delay_ms | int | yes | 30000 | Delay before triggering alarm on entry zone |
| exit_delay_ms | int | yes | 30000 | Delay for exiting after arming |
| auto_arm_schedule_id | uuid | no | null | Schedule for auto arm/disarm |
| linked_camera_ids | uuid[] | no | [] | Cameras to activate on alarm |
| linked_door_ids | uuid[] | no | [] | Doors to lock on alarm |
| escalation_plan_id | uuid | no | null | Escalation chain reference |
| bypass_enabled | boolean | yes | false | Allow sensor bypass |
| chime_enabled | boolean | yes | false | Chime on sensor trigger (disarmed) |
| last_armed_at | timestamp | no | null | Last arm time |
| last_armed_by | uuid | no | null | Who armed |
| last_alarm_at | timestamp | no | null | Last alarm event |
| metadata | jsonb | no | {} | Extra data |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### Sensor
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | - | Tenant isolation |
| site_id | uuid | yes | - | Site |
| zone_id | uuid | yes | - | Parent zone |
| name | string(100) | yes | - | e.g. "PIR-001" |
| type | SensorTypeEnum | yes | - | Sensor type |
| status | SensorStatusEnum | yes | normal | Current status |
| location | string(200) | yes | - | e.g. "Cửa chính" |
| device_id | uuid | no | null | Physical device reference |
| panel_zone_number | int | no | null | Zone number on alarm panel |
| is_wireless | boolean | yes | false | Wireless sensor |
| battery_pct | int | no | null | Battery percentage (wireless) |
| battery_low_threshold | int | yes | 20 | Alert when battery below |
| sensitivity | SensitivityEnum | yes | medium | Detection sensitivity |
| bypassed | boolean | yes | false | Currently bypassed |
| tamper_detection | boolean | yes | true | Tamper alert enabled |
| last_triggered_at | timestamp | no | null | Last trigger time |
| last_heartbeat_at | timestamp | no | null | Last heartbeat |
| installed_at | timestamp | no | null | Installation date |
| metadata | jsonb | no | {} | Extra data |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### AlarmEvent (Hypertable)
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | - | Tenant isolation |
| time | timestamptz | yes | - | Event timestamp |
| zone_id | uuid | yes | - | Zone |
| sensor_id | uuid | no | null | Triggering sensor |
| alarm_type | AlarmTypeEnum | yes | - | Alarm classification |
| severity | AlarmSeverityEnum | yes | - | Severity level |
| status | AlarmStatusEnum | yes | active | Current status |
| description | string(500) | yes | - | Event description |
| acknowledged_by | uuid | no | null | User who acknowledged |
| acknowledged_at | timestamp | no | null | Acknowledge time |
| resolved_by | uuid | no | null | User who resolved |
| resolved_at | timestamp | no | null | Resolution time |
| resolution_notes | text | no | null | Resolution notes |
| false_alarm | boolean | yes | false | Marked as false alarm |
| escalation_level | int | yes | 0 | Current escalation level |
| photo_ref | string(200) | no | null | Linked snapshot |
| clip_id | uuid | no | null | Linked video clip |
| linked_door_actions | jsonb | no | null | Doors locked/unlocked |
| metadata | jsonb | no | {} | Extra data |

### EscalationPlan
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | - | Tenant isolation |
| name | string(100) | yes | - | e.g. "Kế hoạch phản ứng tiêu chuẩn" |
| levels | jsonb | yes | - | Array of escalation levels |
| max_levels | int | yes | 3 | Max escalation steps |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

**Escalation levels schema:**
```json
[
  {
    "level": 1,
    "delay_seconds": 0,
    "actions": ["notify_guard", "trigger_camera_recording"],
    "notify_roles": ["guard"],
    "notify_users": ["user-uuid-1"]
  },
  {
    "level": 2,
    "delay_seconds": 120,
    "actions": ["notify_admin", "lock_zone_doors", "sound_siren"],
    "notify_roles": ["admin", "site_admin"],
    "notify_users": []
  },
  {
    "level": 3,
    "delay_seconds": 300,
    "actions": ["notify_all", "activate_lockdown"],
    "notify_roles": ["super_admin"],
    "notify_users": []
  }
]
```

### Enums
```
ZoneStatusEnum: armed | disarmed | alarm | entry_delay | exit_delay | trouble
ArmModeEnum: away | stay | night | instant
SensorTypeEnum: pir | magnetic | glass_break | vibration | beam | thermal | smoke | temperature | motion_outdoor | fence
SensorStatusEnum: normal | triggered | offline | tampered | low_battery | bypassed
AlarmTypeEnum: intrusion | door_forced | door_held | tamper | fire | duress | panic | glass_break | vibration | beam_break | temperature
AlarmSeverityEnum: critical | high | medium | low
AlarmStatusEnum: active | acknowledged | resolved | auto_resolved
SensitivityEnum: low | medium | high | very_high
```

## API Endpoints

### GET /api/v1/alarms/zones
- **Auth:** Bearer token, role >= viewer
- **Query params:**
  | Param | Type | Default | Description |
  |-------|------|---------|-------------|
  | site_id | uuid | required | Site filter |
  | status | string | - | armed,disarmed,alarm |
  | floor | string | - | Floor filter |
  | page | int | 1 | Page |
  | limit | int | 20 | Max 50 |
- **Response 200:**
  ```json
  {
    "data": [
      {
        "id": "uuid",
        "name": "Sảnh chính - Tầng 1",
        "floor": "Tầng 1",
        "status": "armed",
        "arm_mode": "away",
        "sensor_count": 5,
        "last_alarm_at": "2026-02-19T06:30:00Z",
        "active_alarms": 0
      }
    ],
    "total": 6,
    "page": 1,
    "limit": 20
  }
  ```

### GET /api/v1/alarms/zones/{id}
- **Auth:** role >= viewer
- **Response 200:** Full zone with sensors, active alarms, escalation plan, linked cameras/doors

### POST /api/v1/alarms/zones
- **Auth:** role >= admin
- **Body:**
  ```json
  {
    "name": "Kho hàng B2",
    "site_id": "uuid",
    "floor": "Tầng hầm",
    "entry_delay_ms": 30000,
    "exit_delay_ms": 30000,
    "linked_camera_ids": ["cam-uuid"],
    "linked_door_ids": ["door-uuid"],
    "escalation_plan_id": "plan-uuid"
  }
  ```
- **Side effects:** Audit log, push zone config to alarm panel
- **Response 201:** Created zone

### PUT /api/v1/alarms/zones/{id}
- **Auth:** role >= admin
- **Response 200:** Updated zone

### DELETE /api/v1/alarms/zones/{id}
- **Auth:** role >= site_admin
- **Precondition:** Zone must be disarmed
- **Response 204**

### POST /api/v1/alarms/zones/{id}/arm
- **Auth:** role >= operator
- **Body:**
  ```json
  {
    "mode": "away",
    "bypass_sensors": ["sensor-uuid-1"],
    "code": "1234"
  }
  ```
- **Side effects:** Audit log, MQTT command to alarm panel, notify guards, exit delay starts
- **Response 200:**
  ```json
  {
    "zone_id": "uuid",
    "status": "exit_delay",
    "exit_delay_remaining_ms": 30000,
    "bypassed_sensors": ["sensor-uuid-1"]
  }
  ```
- **Errors:** 401, 403, 422 (sensor trouble prevents arming), 409 (already armed)

### POST /api/v1/alarms/zones/{id}/disarm
- **Auth:** role >= operator
- **Body:** `{ "code": "1234" }`
- **Side effects:** Audit log, MQTT command to alarm panel, cancel active alarms for zone
- **Response 200:** `{ "zone_id": "uuid", "status": "disarmed" }`
- **Errors:** 401, 403, 401 (invalid code)

### POST /api/v1/alarms/zones/{id}/bypass-sensor
- **Auth:** role >= admin
- **Body:** `{ "sensor_id": "uuid", "bypass": true, "reason": "Bảo trì cảm biến" }`
- **Side effects:** Audit log
- **Response 200:** Updated sensor

### GET /api/v1/alarms/zones/{id}/sensors
- **Auth:** role >= viewer
- **Response 200:** List of sensors in zone

### POST /api/v1/alarms/sensors
- **Auth:** role >= admin
- **Body:** Sensor creation payload
- **Response 201:** Created sensor

### PUT /api/v1/alarms/sensors/{id}
- **Auth:** role >= admin
- **Response 200:** Updated sensor

### DELETE /api/v1/alarms/sensors/{id}
- **Auth:** role >= admin
- **Precondition:** Zone must be disarmed
- **Response 204**

### GET /api/v1/alarms/events
- **Auth:** role >= viewer
- **Query params:**
  | Param | Type | Default | Description |
  |-------|------|---------|-------------|
  | site_id | uuid | required | Site filter |
  | zone_id | uuid | - | Zone filter |
  | severity | string | - | critical,high,medium,low |
  | status | string | - | active,acknowledged,resolved |
  | alarm_type | string | - | Filter by alarm type |
  | from | timestamp | -24h | Start time |
  | to | timestamp | now | End time |
  | page | int | 1 | Page |
  | limit | int | 50 | Max 500 |
- **Response 200:** Paginated alarm events

### POST /api/v1/alarms/events/{id}/acknowledge
- **Auth:** role >= operator
- **Body:** `{ "notes": "Bảo vệ đang kiểm tra" }`
- **Side effects:** Audit log, notification to team, escalation timer paused
- **Response 200:** Updated alarm event

### POST /api/v1/alarms/events/{id}/resolve
- **Auth:** role >= operator
- **Body:**
  ```json
  {
    "notes": "Kiểm tra: nhân viên bảo vệ đi tuần",
    "false_alarm": true
  }
  ```
- **Side effects:** Audit log, alarm cleared
- **Response 200:** Updated alarm event

### GET /api/v1/alarms/escalation-plans
- **Auth:** role >= admin
- **Response 200:** List of escalation plans

### POST /api/v1/alarms/escalation-plans
- **Auth:** role >= site_admin
- **Body:** EscalationPlan object
- **Response 201:** Created plan

## MQTT Topics

| Topic | Direction | QoS | Payload Schema | Description |
|-------|-----------|-----|----------------|-------------|
| `dm/{tid}/device/{did}/evt` (type: alarm.triggered) | device→server | 1 | `{alarm_type, severity, zone_id, sensor_id, details, photo}` | Alarm event from panel/sensor |
| `dm/{tid}/device/{did}/evt` (type: sensor.status) | device→server | 1 | `{sensor_id, status, battery_pct, tamper}` | Sensor status change |
| `dm/{tid}/device/{did}/cmd` (type: cmd.arm) | server→device | 2 | `{zone_id, mode, bypass_sensors}` | Arm zone command |
| `dm/{tid}/device/{did}/cmd` (type: cmd.disarm) | server→device | 2 | `{zone_id}` | Disarm zone command |
| `dm/{tid}/device/{did}/cmd` (type: cmd.siren) | server→device | 2 | `{action: "on|off", duration_ms}` | Siren control |
| `dm/{tid}/zone/{zid}/alarm` | server→internal | 1 | `{zone_id, alarm_type, severity, sensor_id}` | Zone alarm aggregation (NATS) |
| `dm/{tid}/device/{did}/sta` | device→server | 0 | Heartbeat with sensor health summary | Panel/sensor health |

## Business Rules

1. **BR-ID-001 — Arm Prerequisite Check:** A zone cannot be armed if any sensor is in `triggered`, `offline`, or `tampered` state — unless those sensors are explicitly bypassed. UI must show blocking sensors.
2. **BR-ID-002 — Entry Delay:** When an armed zone detects entry (e.g., door open), a configurable entry delay starts (default 30s). If not disarmed within the delay, the alarm triggers. Entry delay applies only to designated entry sensors (e.g., main door magnetic contact).
3. **BR-ID-003 — Exit Delay:** After arming, an exit delay (default 30s) allows the operator to leave the zone. Zone status shows `exit_delay`. Sensors on the exit path are suppressed during this period.
4. **BR-ID-004 — Escalation Chain:** Unacknowledged alarms escalate automatically: Level 1 (immediate) → notify guards + record cameras. Level 2 (2 min) → notify admin + lock doors + sound siren. Level 3 (5 min) → notify all + consider lockdown. Escalation pauses when acknowledged.
5. **BR-ID-005 — Auto Arm/Disarm:** Zones with `auto_arm_schedule_id` are automatically armed/disarmed per schedule. e.g., office zones arm at 22:00 Mon-Fri, disarm at 06:00. Manual override takes precedence until next schedule trigger.
6. **BR-ID-006 — Cross-System Camera Trigger:** When an alarm triggers, all `linked_camera_ids` for the zone automatically start recording (if in motion/event mode) and a snapshot is captured and attached to the alarm event.
7. **BR-ID-007 — Cross-System Door Lock:** When an alarm triggers at severity `critical` or `high`, all `linked_door_ids` for the zone are locked. Doors are unlocked when alarm is resolved or manually overridden.
8. **BR-ID-008 — Tamper Alert:** A sensor in `tampered` state generates an immediate `high` severity alarm, regardless of zone armed state. Tamper = physical interference with the sensor device.
9. **BR-ID-009 — Low Battery Alert:** Wireless sensors with battery below `battery_low_threshold` generate a `low` severity alert. Repeated daily until resolved.
10. **BR-ID-010 — False Alarm Tracking:** Alarms resolved as `false_alarm=true` are tracked for analytics. If a sensor generates >3 false alarms in 7 days, a maintenance alert is created.
11. **BR-ID-011 — Arm Mode Behavior:** `away` = all sensors active. `stay` = perimeter sensors active, interior PIR bypassed. `night` = perimeter + ground floor active. `instant` = no entry/exit delay.
12. **BR-ID-012 — Duress Code:** If a special duress code is entered during disarm, zone disarms normally (to not alert intruder) but a silent `duress` alarm is sent to guards and authorities.
13. **BR-ID-013 — Zone Trouble State:** If a panel loses communication with >50% of sensors in a zone, the zone enters `trouble` state and cannot be armed. Alert generated.

## Permissions Matrix

| Action | viewer | operator | admin | site_admin | super_admin |
|--------|--------|----------|-------|------------|-------------|
| View zones & sensors | ✅ | ✅ | ✅ | ✅ | ✅ |
| View alarm events | ✅ | ✅ | ✅ | ✅ | ✅ |
| Arm/disarm zones | ❌ | ✅ | ✅ | ✅ | ✅ |
| Acknowledge alarms | ❌ | ✅ | ✅ | ✅ | ✅ |
| Resolve alarms | ❌ | ✅ | ✅ | ✅ | ✅ |
| Bypass sensors | ❌ | ❌ | ✅ | ✅ | ✅ |
| Create/edit zones | ❌ | ❌ | ✅ | ✅ | ✅ |
| Delete zones | ❌ | ❌ | ❌ | ✅ | ✅ |
| Create/edit sensors | ❌ | ❌ | ✅ | ✅ | ✅ |
| Manage escalation plans | ❌ | ❌ | ❌ | ✅ | ✅ |
| Delete sensors | ❌ | ❌ | ✅ | ✅ | ✅ |

## Offline Behavior

- **Device-side:** Alarm panels operate completely independently. All sensor monitoring, zone arming state, entry/exit delays, and alarm triggering happen locally on the alarm panel. Panel has its own siren and relay outputs for immediate response.
- **Sync strategy:** Zone configuration and sensor assignments are pushed to alarm panels via MQTT. Alarm events are reported from panels to server. If server is offline, panels continue operating with last known configuration.
- **Event queuing:** Alarm events are buffered on the panel (typically 500-1000 events depending on hardware). On reconnect, events are uploaded chronologically.
- **Conflict resolution:** Server wins for configuration. Panel wins for real-time state (armed/disarmed status, active alarms). On reconnect, panel reports current state and server reconciles.
- **Local storage:** Panel stores zone config, sensor mappings, arm/disarm schedules, arm codes, and event log locally in flash memory.
- **Escalation during offline:** Panel executes local escalation actions (siren, relay outputs for door locks) but cannot send notifications to users/guards. On reconnect, pending alarm events trigger notification catch-up.
- **Auto arm/disarm:** Panels execute auto arm/disarm schedules locally using their internal clock (NTP synced when connected). Schedules continue operating during server outage.

## UI Pages

| Route | Page | Key Components |
|-------|------|----------------|
| /secure/intrusion | Intrusion Dashboard | Zone cards (arm/disarm toggle, status), sensor list per zone, alarm event table with severity/status filters, stat cards (active alarms, armed zones) |

## Events & Audit Log

| Event Type | Trigger | Payload | Retention |
|------------|---------|---------|-----------|
| alarm.zone.created | POST create | full zone | 1 year |
| alarm.zone.updated | PUT update | diff | 1 year |
| alarm.zone.deleted | DELETE | id + actor | permanent |
| alarm.zone.armed | POST arm | zone_id, mode, actor, bypassed sensors | 1 year |
| alarm.zone.disarmed | POST disarm | zone_id, actor | 1 year |
| alarm.event.triggered | Device alarm | full alarm event | permanent |
| alarm.event.acknowledged | POST ack | alarm_id, actor, notes | permanent |
| alarm.event.resolved | POST resolve | alarm_id, actor, notes, false_alarm | permanent |
| alarm.event.escalated | Escalation timer | alarm_id, from_level, to_level | permanent |
| alarm.sensor.created | POST create | full sensor | 1 year |
| alarm.sensor.bypassed | Bypass command | sensor_id, actor, reason | 1 year |
| alarm.sensor.tampered | Device event | sensor_id, zone_id | permanent |
| alarm.sensor.low_battery | Device event | sensor_id, battery_pct | 90 days |
| alarm.sensor.offline | Heartbeat timeout | sensor_id, last_seen | 90 days |
| alarm.duress | Duress code entered | zone_id, time (no actor — silent) | permanent |

## Integration Points

- **Depends on:**
  - `device-gw` — MQTT communication with alarm panels
  - `auth-svc` — JWT validation, arm/disarm codes
  - `notif-svc` — Alarm notifications (push, SMS, Telegram)
- **Consumed by:**
  - `video-svc` — Auto-recording on alarm (linked cameras)
  - `access-svc` — Auto-lock doors on alarm (linked doors)
  - `automate-svc` — Alarm events as automation triggers
  - `report-svc` — Alarm analytics (frequency, response times, false alarm rates)
  - `emergency-svc` — Alarm events can trigger emergency procedures
  - `ai-detection` — AI detection events can create intrusion alarms
- **External:**
  - Alarm panels (RS-485, TCP/IP protocols — Bosch, DSC, Paradox, Honeywell)
  - External monitoring stations (SIA/DC-09 protocol for central station reporting)

## Notes

- Alarm panels from different vendors use different protocols. `device-gw` has protocol adapters per brand.
- Duress code handling is critical: panel must disarm normally (visual/audio) while silently alerting. Never reveal duress detection to the intruder.
- Sensor sensitivity should be tuned per installation. Outdoor PIR sensors need lower sensitivity to avoid wind/animal false alarms.
- Glass break sensors require periodic testing with a glass break simulator. Maintenance schedule recommended.
- Zone naming convention should include floor/area for clear identification during alarm events.
