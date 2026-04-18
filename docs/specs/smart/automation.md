# Feature: Automation Engine

> Domain: SMART | Color: #F59E0B | Priority: P1
> Status: NOT IMPLEMENTED | Owner: SMART Team

## Overview

The Automation Engine is an IFTTT-style rule engine that enables building operators to create custom "if-this-then-that" automation rules across all DM3 domains. Triggers include access events, schedules, sensor thresholds, time-of-day, and alarm events. Conditions support AND/OR boolean logic for fine-grained control. Actions span door control, notifications, zone arming, HVAC adjustments, camera recording, and more. The engine includes rule templates, conflict detection, priority ordering, and a full execution log. **Rules are evaluated server-side on the NATS event stream; device commands are dispatched via MQTT.**

## Data Models

### AutomationRule
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | - | Tenant isolation |
| site_id | uuid | yes | - | Site scope |
| name | string(100) | yes | - | e.g. "Tắt đèn khi không có người — Tầng 3" |
| description | string(500) | no | null | Rule description |
| trigger | jsonb | yes | - | Trigger definition (TriggerDef) |
| conditions | jsonb | no | null | Optional conditions (ConditionGroup) |
| actions | jsonb | yes | - | Array of ActionDef |
| priority | int | yes | 50 | Execution priority (0=highest, 100=lowest) |
| enabled | boolean | yes | true | Active toggle |
| cooldown_seconds | int | no | null | Min seconds between executions (debounce) |
| max_executions_per_hour | int | no | null | Rate limit |
| valid_from | timestamp | no | null | Rule effective start |
| valid_until | timestamp | no | null | Rule effective end |
| tags | string[] | no | [] | Categorization tags |
| template_id | uuid | no | null | Source template (if created from template) |
| last_triggered_at | timestamp | no | null | Last execution time |
| execution_count | bigint | yes | 0 | Total executions |
| error_count | int | yes | 0 | Consecutive errors |
| auto_disable_on_errors | int | yes | 10 | Disable after N consecutive errors |
| created_by | uuid | yes | - | Creator |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### TriggerDef (embedded in AutomationRule.trigger JSONB)
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| type | TriggerTypeEnum | yes | Trigger category |
| source_type | string | no | Resource type (door, sensor, zone, camera) |
| source_ids | uuid[] | no | Specific resource IDs (empty = all of type) |
| event_type | string | no | Specific event (e.g. "access.event.denied", "alarm.triggered") |
| schedule | jsonb | no | Cron expression or time schedule for time triggers |
| threshold | jsonb | no | For sensor triggers: {field, operator, value, unit} |
| debounce_ms | int | no | Ignore rapid re-triggers within window |

### ConditionGroup (embedded in AutomationRule.conditions JSONB)
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| operator | string | yes | "AND" or "OR" |
| conditions | jsonb[] | yes | Array of Condition or nested ConditionGroup |

### Condition (leaf node in ConditionGroup)
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| type | ConditionTypeEnum | yes | Condition category |
| field | string | yes | e.g. "event.user_id", "time.hour", "sensor.temperature" |
| operator | string | yes | eq, neq, gt, gte, lt, lte, in, not_in, between, contains |
| value | any | yes | Comparison value |

### ActionDef (embedded in AutomationRule.actions JSONB)
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| order | int | yes | Execution order |
| type | ActionTypeEnum | yes | Action category |
| target_type | string | yes | Resource type to act on |
| target_ids | uuid[] | yes | Target resources |
| action | string | yes | Specific action (unlock, lock, notify, arm, record, etc.) |
| params | jsonb | no | Action-specific parameters |
| delay_seconds | int | no | Delay before executing this action |
| on_failure | string | no | continue / abort / retry (default: continue) |

### AutomationTemplate
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| name | string(100) | yes | - | e.g. "VIP Fast Lane" |
| description | string(500) | yes | - | What this template does |
| category | string(50) | yes | - | security / comfort / energy / safety |
| trigger | jsonb | yes | - | Template trigger (with placeholders) |
| conditions | jsonb | no | null | Template conditions |
| actions | jsonb | yes | - | Template actions (with placeholders) |
| variables | jsonb | yes | - | Array of {name, type, label, required, default} |
| popularity | int | yes | 0 | Usage count across tenants |
| is_system | boolean | yes | false | System-provided vs user-created |
| created_at | timestamp | yes | now() | Creation time |

### ExecutionLog (Hypertable)
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | - | Tenant isolation |
| time | timestamptz | yes | - | Execution timestamp |
| rule_id | uuid | yes | - | Which rule executed |
| rule_name | string(100) | yes | - | Denormalized name |
| trigger_event | jsonb | yes | - | Event that triggered execution |
| conditions_met | boolean | yes | - | Whether conditions passed |
| actions_executed | jsonb | yes | [] | Array of {action, status, duration_ms, error} |
| status | ExecutionStatusEnum | yes | - | Overall status |
| duration_ms | int | yes | - | Total execution time |
| error_message | string(500) | no | null | Error details if failed |

### RuleConflict
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | - | Tenant isolation |
| rule_a_id | uuid | yes | - | First conflicting rule |
| rule_b_id | uuid | yes | - | Second conflicting rule |
| conflict_type | ConflictTypeEnum | yes | - | Type of conflict |
| description | string(500) | yes | - | Human-readable explanation |
| severity | string(20) | yes | - | warning / error |
| resolved | boolean | yes | false | Manually resolved |
| detected_at | timestamp | yes | now() | Detection time |

### Enums
```
TriggerTypeEnum: access_event | alarm_event | sensor_threshold | schedule | time | device_status | visitor_event | system_event
ConditionTypeEnum: event_field | time_range | day_of_week | person_attribute | device_state | sensor_value | zone_state | variable
ActionTypeEnum: door_control | camera_control | alarm_control | notification | intercom | hvac_control | lighting | webhook | delay | variable_set
ExecutionStatusEnum: success | partial_failure | failure | skipped_cooldown | skipped_condition | skipped_disabled
ConflictTypeEnum: contradicting_actions | overlapping_triggers | circular_dependency | resource_contention
```

## API Endpoints

### GET /api/v1/automation/rules
- **Auth:** Bearer token, role >= viewer
- **Query params:**
  | Param | Type | Default | Description |
  |-------|------|---------|-------------|
  | page | int | 1 | Page number |
  | limit | int | 20 | Items per page (max 100) |
  | site_id | uuid | required | Filter by site |
  | enabled | boolean | - | Filter active/inactive |
  | trigger_type | string | - | Filter by trigger type |
  | tags | string | - | Comma-separated tag filter |
  | search | string | - | Search name/description |
  | sort | string | priority | Sort field |
- **Response 200:**
  ```json
  {
    "data": [
      {
        "id": "uuid",
        "name": "After-hours access → Alert guard",
        "trigger": { "type": "access_event", "event_type": "access.event.granted" },
        "conditions_summary": "time.hour >= 22 OR time.hour <= 6",
        "actions_summary": "Notify security team, Start camera recording",
        "priority": 10,
        "enabled": true,
        "last_triggered_at": "2026-02-18T23:45:00Z",
        "execution_count": 42
      }
    ],
    "total": 15,
    "page": 1,
    "limit": 20
  }
  ```
- **Errors:** 401, 403, 422

### GET /api/v1/automation/rules/{id}
- **Auth:** role >= viewer
- **Response 200:** Full rule with trigger, conditions, actions, execution stats, recent logs
- **Errors:** 401, 403, 404

### POST /api/v1/automation/rules
- **Auth:** role >= admin
- **Body:**
  ```json
  {
    "name": "Người lạ ra vào ngoài giờ → Cảnh báo bảo vệ",
    "site_id": "uuid",
    "trigger": {
      "type": "access_event",
      "event_type": "access.event.granted",
      "source_type": "door",
      "source_ids": []
    },
    "conditions": {
      "operator": "AND",
      "conditions": [
        { "type": "time_range", "field": "time.hour", "operator": "not_in", "value": [7, 19] },
        { "type": "person_attribute", "field": "event.user.department", "operator": "neq", "value": "Security" }
      ]
    },
    "actions": [
      { "order": 1, "type": "notification", "target_type": "role", "target_ids": ["security_guard"], "action": "push", "params": {"template": "after_hours_access", "priority": "high"} },
      { "order": 2, "type": "camera_control", "target_type": "door_camera", "target_ids": ["$trigger.door_id"], "action": "record", "params": {"duration_seconds": 60, "quality": "high"} }
    ],
    "priority": 10,
    "cooldown_seconds": 300,
    "enabled": true
  }
  ```
- **Side effects:** Audit log, conflict detection runs against existing rules
- **Response 201:** Created rule with any detected conflicts
  ```json
  {
    "rule": { "id": "uuid", "..." : "..." },
    "conflicts": [
      { "rule_b_id": "uuid", "conflict_type": "overlapping_triggers", "description": "Rule 'X' also triggers on access events with similar conditions", "severity": "warning" }
    ]
  }
  ```
- **Errors:** 401, 403, 422

### PUT /api/v1/automation/rules/{id}
- **Auth:** role >= admin
- **Body:** Partial update
- **Side effects:** Audit log, re-run conflict detection
- **Response 200:** Updated rule with conflicts
- **Errors:** 401, 403, 404, 422

### DELETE /api/v1/automation/rules/{id}
- **Auth:** role >= admin
- **Side effects:** Audit log, resolve conflicts involving this rule
- **Response 204**
- **Errors:** 401, 403, 404

### POST /api/v1/automation/rules/{id}/enable
- **Auth:** role >= admin
- **Side effects:** Audit log
- **Response 200:** `{ "enabled": true }`

### POST /api/v1/automation/rules/{id}/disable
- **Auth:** role >= admin
- **Side effects:** Audit log
- **Response 200:** `{ "enabled": false }`

### POST /api/v1/automation/rules/{id}/test
- **Auth:** role >= admin
- **Body:** `{ "mock_event": { "type": "access.event.granted", "door_id": "uuid", "user_id": "uuid", "time": "2026-02-19T23:00:00Z" } }`
- **Description:** Dry-run a rule against a mock event — evaluates conditions but does NOT execute actions
- **Response 200:**
  ```json
  {
    "trigger_matched": true,
    "conditions_met": true,
    "conditions_detail": [
      { "condition": "time.hour not_in [7,19]", "result": true, "actual_value": 23 },
      { "condition": "user.department neq Security", "result": true, "actual_value": "Engineering" }
    ],
    "actions_would_execute": [
      { "order": 1, "type": "notification", "description": "Push to security_guard role" },
      { "order": 2, "type": "camera_control", "description": "Record 60s on door camera" }
    ]
  }
  ```
- **Errors:** 401, 403, 404, 422

### GET /api/v1/automation/rules/{id}/logs
- **Auth:** role >= viewer
- **Query params:** from, to, status, page, limit
- **Response 200:** Paginated execution logs for this rule

### GET /api/v1/automation/logs
- **Auth:** role >= viewer
- **Query params:** site_id (required), rule_id, status, from, to, page, limit
- **Response 200:** Paginated execution logs across all rules

### GET /api/v1/automation/templates
- **Auth:** role >= viewer
- **Query params:** category, search, page, limit
- **Response 200:** Paginated automation templates

### POST /api/v1/automation/templates/{id}/instantiate
- **Auth:** role >= admin
- **Body:** `{ "site_id": "uuid", "variables": { "door_id": "uuid", "threshold": 30 } }`
- **Description:** Create a rule from a template, filling in variables
- **Response 201:** Created rule
- **Errors:** 401, 403, 404, 422 (missing required variables)

### GET /api/v1/automation/conflicts
- **Auth:** role >= admin
- **Query params:** site_id (required), resolved, severity
- **Response 200:** List of detected rule conflicts

### POST /api/v1/automation/conflicts/{id}/resolve
- **Auth:** role >= admin
- **Body:** `{ "resolution": "Adjusted priorities — Rule A runs first" }`
- **Side effects:** Marks conflict resolved, audit log
- **Response 200:** Resolved conflict

## MQTT Topics

| Topic | Direction | QoS | Payload Schema | Description |
|-------|-----------|-----|----------------|-------------|
| `dm/{tid}/device/{did}/cmd` (type varies) | server→device | 1-2 | Action-specific payload | Automation action dispatched to device |

Note: The automation engine consumes NATS events internally (not MQTT). It publishes device commands via MQTT through the device gateway.

### NATS Subjects Consumed
| Subject | Description |
|---------|-------------|
| `access.event.*` | Access granted/denied events |
| `alarm.*` | Alarm triggered/cleared events |
| `sensor.reading` | Sensor threshold crossings |
| `device.status.*` | Device online/offline events |
| `visitor.*` | Visitor check-in/out events |
| `system.*` | System events |

## Business Rules

1. **BR-AU-001 — Priority Ordering:** When multiple rules match the same event, they execute in priority order (0=highest). Rules with the same priority execute in creation order.
2. **BR-AU-002 — Cooldown Debounce:** If `cooldown_seconds` is set, the rule will not re-execute within that window after last execution. The triggering event is silently dropped.
3. **BR-AU-003 — Rate Limiting:** `max_executions_per_hour` prevents runaway rules. When limit is reached, subsequent triggers are logged as `skipped_cooldown` until the hour window rolls.
4. **BR-AU-004 — Auto-Disable on Errors:** If a rule fails `auto_disable_on_errors` consecutive times, it is automatically disabled. Admin is notified. Error count resets on successful execution.
5. **BR-AU-005 — Condition Evaluation:** Conditions are evaluated lazily — in AND groups, evaluation stops at first false. In OR groups, evaluation stops at first true. Nested groups are supported up to 5 levels deep.
6. **BR-AU-006 — Action Variable References:** Actions can reference trigger event fields using `$trigger.field_name` syntax (e.g., `$trigger.door_id`, `$trigger.user_id`). Unresolvable references cause action failure.
7. **BR-AU-007 — Conflict Detection:** On rule create/update, the engine checks for: contradicting actions (same target, opposite actions), overlapping triggers with incompatible actions, and circular dependencies. Conflicts are logged but don't block creation — only warnings.
8. **BR-AU-008 — Emergency Override:** Automation rules are suspended during active emergencies. Emergency actions take absolute precedence. Rules resume on all-clear.
9. **BR-AU-009 — Execution Timeout:** Each action has a 30-second execution timeout. Timed-out actions are logged as failures. The `on_failure` setting determines whether subsequent actions continue.
10. **BR-AU-010 — Template Variables:** Templates define typed variables with validation. On instantiation, all required variables must be provided. Variables are substituted into trigger/condition/action definitions.
11. **BR-AU-011 — Audit Every Execution:** Every rule execution (success or failure) is logged in the execution log hypertable with full trigger event, condition evaluation results, and action outcomes.
12. **BR-AU-012 — Cross-Domain Actions:** Rules can trigger actions across domains (e.g., access event → camera recording → notification). The engine routes actions to the appropriate service via NATS.
13. **BR-AU-013 — Time-Based Triggers:** Schedule triggers use cron expressions evaluated every minute. Time-of-day conditions use the site's configured timezone.
14. **BR-AU-014 — Sensor Threshold Hysteresis:** Sensor triggers include a 5% hysteresis band to prevent rapid on/off toggling. E.g., if threshold is 30°C, it triggers at 30°C but doesn't re-trigger until value drops below 28.5°C and rises again.

## Permissions Matrix

| Action | viewer | operator | admin | site_admin | super_admin |
|--------|--------|----------|-------|------------|-------------|
| List rules | ✅ | ✅ | ✅ | ✅ | ✅ |
| View rule detail | ✅ | ✅ | ✅ | ✅ | ✅ |
| View execution logs | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create/edit rules | ❌ | ❌ | ✅ | ✅ | ✅ |
| Delete rules | ❌ | ❌ | ✅ | ✅ | ✅ |
| Enable/disable rules | ❌ | ❌ | ✅ | ✅ | ✅ |
| Test rules (dry-run) | ❌ | ❌ | ✅ | ✅ | ✅ |
| View templates | ✅ | ✅ | ✅ | ✅ | ✅ |
| Instantiate templates | ❌ | ❌ | ✅ | ✅ | ✅ |
| Create system templates | ❌ | ❌ | ❌ | ❌ | ✅ |
| View/resolve conflicts | ❌ | ❌ | ✅ | ✅ | ✅ |

## Offline Behavior

- **Device-side:** Automation rules run entirely server-side. Devices are unaffected — they execute commands received via MQTT regardless of origin (manual, automation, or emergency).
- **Server offline:** If the automation engine (automate-svc) is down, events are buffered in NATS JetStream (durable consumer). When the service recovers, it replays buffered events and executes matching rules. Events older than 5 minutes are skipped to prevent stale actions.
- **Sync strategy:** N/A — automation is server-only. No device sync required for rules.
- **Conflict resolution:** N/A for devices. For rule conflicts, detection is advisory — operators resolve conflicts manually.
- **Local storage:** N/A.

## UI Pages

| Route | Page | Key Components |
|-------|------|----------------|
| /smart/automation | Automation Dashboard | Rule list with status indicators, execution stats, recent activity feed |
| /smart/automation/rules/:id | Rule Detail | Visual trigger/condition/action editor, execution log, conflict warnings |
| /smart/automation/rules/new | Rule Builder | Step-by-step wizard: trigger → conditions → actions → settings |
| /smart/automation/templates | Template Gallery | Card grid by category, popularity ranking, quick instantiate |
| /smart/automation/logs | Execution Log | Global execution log with filters, timeline visualization |
| /smart/automation/conflicts | Conflict Viewer | Conflict list with rule comparison, resolution actions |

## Events & Audit Log

| Event Type | Trigger | Payload | Retention |
|------------|---------|---------|-----------|
| automation.rule.created | POST create | full rule | 1 year |
| automation.rule.updated | PUT update | diff only | 1 year |
| automation.rule.deleted | DELETE | id + actor | permanent |
| automation.rule.enabled | POST enable | rule_id, actor | 1 year |
| automation.rule.disabled | POST disable / auto-disable | rule_id, actor, reason | 1 year |
| automation.rule.executed | Engine execution | rule_id, trigger_event, conditions_met, actions, duration | 90 days |
| automation.rule.failed | Execution failure | rule_id, error, actions_attempted | 1 year |
| automation.rule.skipped | Cooldown/disabled | rule_id, reason | 30 days |
| automation.rule.auto_disabled | Error threshold reached | rule_id, error_count | 1 year |
| automation.conflict.detected | Create/update rule | rule_a_id, rule_b_id, conflict_type | 1 year |
| automation.conflict.resolved | POST resolve | conflict_id, resolution | 1 year |
| automation.template.instantiated | POST instantiate | template_id, rule_id, variables | 1 year |

## Integration Points

- **Depends on:**
  - `access-svc` — Door control commands, access event stream
  - `alarm-svc` — Zone arm/disarm, alarm events
  - `iot-svc` — Sensor readings, threshold events
  - `video-svc` — Camera recording commands
  - `intercom-svc` — Announcement commands
  - `notif-svc` — Notification dispatch
  - `device-gw` — MQTT command routing
  - `identity-svc` — User attribute lookups for conditions
  - `auth-svc` — JWT validation
- **Consumed by:**
  - `report-svc` — Automation analytics: rule effectiveness, execution trends
  - `audit-svc` — All execution logs for compliance
  - `ai-asst-svc` — AI assistant can suggest and create automation rules
- **External:**
  - Webhooks — automation actions can call external HTTP endpoints
  - BMS (BACnet/Modbus) — HVAC/lighting control via device gateway

## Notes

- The automation engine is a stateless NATS consumer. It can be horizontally scaled by adding more instances with consumer group partitioning.
- System templates are provided out-of-the-box for common scenarios: after-hours access alerts, VIP fast lane, energy saving schedules, parking full notification.
- Complex automation (>10 actions or >5 condition levels) should be reviewed by site_admin to prevent performance issues.
- The test/dry-run endpoint is critical for validation before enabling rules in production.
- Automation is an Enterprise-tier feature per the business model.
