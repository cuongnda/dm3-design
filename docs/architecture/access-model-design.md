# Access Model Design

> Domain: SECURE + MANAGE | Status: Active | Last updated: 2026-04-09

## Overview

The DM3 access model determines **who can go where, and when**. It uses a group-based architecture where Access Groups bind Users to Access Points, scoped by time schedules. All access decisions are made locally on devices — the server manages rules, syncs them to devices, and aggregates event logs.

## Core Concepts

### Two Distinct Time Concepts

| Concept | Defined On | Purpose | Priority |
|---------|-----------|---------|----------|
| **Passage Time** | Access Point | When the door is **OPEN for everyone** — no credential check required | **HIGH** (overrides all AG rules) |
| **Access Time** | Access Group | When AG members can use APs in the group — credential check required | Normal |

**Passage Time** is a property of the Access Point itself. Example: an office lobby door is freely open 8am–6pm on weekdays. During passage time, anyone can walk through without presenting a credential.

**Access Time** is a property of the Access Group. Example: the "IT Team" access group has 24/7 access, while the "Cleaning Crew" group has access only 6pm–8pm. Outside passage time, the device checks the user's credential against their AG memberships and corresponding access times.

### Access Groups (AG)

An Access Group is the central policy mechanism. It is a **flat structure** (no parent/child hierarchy) that links:

- A set of **Access Points** (M:N, simple link — no per-link time override)
- A set of **Users** (M:N, with temporal membership bounds)
- An optional **Access Time** schedule (when members can use APs in this group)

If an AG has no access time assigned (`access_time_id = NULL`), members have **24/7 unrestricted** access to the group's APs (subject to passage time taking priority when active).

### Access Points (AP)

An Access Point is a logical entry/exit point (door, gate, turnstile, barrier). It may have one or more physical devices attached. Key properties:

- **Passage Time** (`access_time_id` on `access_points` table): when the door is freely open
- **Zone**: physical grouping (floor, area, building)
- An AP can belong to **multiple Access Groups**

### Users

Users are assigned to Access Groups with optional **temporal membership**:

- `effective_from`: when the membership becomes active (defaults to now)
- `effective_to`: when the membership expires (NULL = permanent)

A user can belong to **multiple Access Groups**, each potentially granting access to different APs at different times.

### Access Times (AT)

A weekly schedule template with timezone support. Stored as:

- `access_times`: template with name, timezone, active flag
- `access_time_slots`: individual time windows — `day_of_week` (0=Sun, 6=Sat), `start_time`, `end_time`

Example: "Business Hours" = Mon–Fri 08:00–18:00 in Asia/Ho_Chi_Minh timezone.

## Data Model

```
AccessTime (weekly schedule template)
├── id, name, timezone, is_active
└── slots[] → day_of_week (0-6), start_time (TIME), end_time (TIME)

AccessPoint
├── id, name, description, zone_id
└── access_time_id → AccessTime  [PASSAGE TIME: when door is open for all]

AccessGroup
├── id, name, description, is_default, type
├── access_time_id → AccessTime  [ACCESS TIME: when members can use APs]
├── access_points[] → M:N via access_group_access_points (simple link)
└── users[] → M:N via access_group_users (with effective_from, effective_to)
```

### Junction Tables

**access_group_access_points** — links AGs to APs:
- `access_group_id` (FK, CASCADE delete)
- `access_point_id` (FK, CASCADE delete)
- UNIQUE constraint: `(access_group_id, access_point_id)`
- No per-link time override — time is defined at the AG level only

**access_group_users** — links AGs to Users:
- `access_group_id` (FK, CASCADE delete)
- `user_id` (FK, CASCADE delete)
- `effective_from` (TIMESTAMPTZ, default now)
- `effective_to` (TIMESTAMPTZ, NULL = permanent)
- UNIQUE constraint: `(access_group_id, user_id)`

## Rule Resolution Algorithm

When a user presents a credential at a device:

```
FUNCTION evaluate_access(user, access_point, current_time):

  1. CHECK PASSAGE TIME
     → If AP's passage_time schedule covers current_time:
        RESULT: OPEN (no credential check needed)
        The device handles this autonomously.

  2. CHECK BLACKLIST
     → If user is blacklisted:
        RESULT: DENY (blacklist overrides all rules)

  3. FIND MATCHING ACCESS GROUPS
     → Find all AGs where ALL conditions are true:
        a) access_point ∈ AG.access_points
        b) user ∈ AG.users
        c) user's membership is temporally active:
           effective_from <= current_time
           AND (effective_to IS NULL OR effective_to > current_time)

  4. EVALUATE ACCESS TIMES (UNION / OR logic)
     → For each matching AG:
        If AG.access_time_id IS NULL → 24/7 access → GRANT
        If AG.access_time schedule covers current_time → GRANT
     → If ANY AG grants access: RESULT = GRANT
     → If NO AG grants access: RESULT = DENY
```

**Key: Union (OR) logic** — if a user belongs to multiple AGs that contain the same AP, access is granted if ANY of those AGs' access times cover the current time. This is additive, not restrictive.

## Device Sync Format

When access rules are synced to a device (via MQTT `cfg.access_rules`):

```json
{
  "type": "cfg.access_rules",
  "version": 42,
  "passage_time": {
    "timezone": "Asia/Ho_Chi_Minh",
    "slots": [
      { "day": 1, "start": "08:00", "end": "18:00" },
      { "day": 2, "start": "08:00", "end": "18:00" },
      { "day": 3, "start": "08:00", "end": "18:00" },
      { "day": 4, "start": "08:00", "end": "18:00" },
      { "day": 5, "start": "08:00", "end": "18:00" }
    ]
  },
  "access_rules": [
    {
      "user_id": "uuid",
      "credential": "card-A1B2C3",
      "schedules": [
        {
          "source": "IT Team",
          "timezone": "Asia/Ho_Chi_Minh",
          "slots": [
            { "day": 0, "start": "00:00", "end": "23:59" },
            { "day": 1, "start": "00:00", "end": "23:59" }
          ]
        },
        {
          "source": "Cleaning Crew",
          "timezone": "Asia/Ho_Chi_Minh",
          "slots": [
            { "day": 1, "start": "18:00", "end": "20:00" }
          ]
        }
      ]
    }
  ]
}
```

Device logic: if passage_time active → open for all. Otherwise → for each user presenting credential, check if ANY schedule covers current time.

## Sync Triggers

Access rules must be re-synced to affected devices when:

| Event | Affected Devices |
|-------|-----------------|
| AG created/updated/deleted | All devices linked to APs in this AG |
| AP added/removed from AG | Devices linked to this AP |
| User added/removed from AG | Devices linked to APs in this AG |
| User temporal bounds changed | Devices linked to APs in this AG |
| AG's access time changed | All devices linked to APs in this AG |
| AP's passage time changed | Devices linked to this AP |
| Access time schedule modified | All devices using this access time (via AG or AP) |

Sync is event-driven via NATS: AG/AP/User mutations publish events → device-gateway consumes and pushes MQTT to affected devices.

## Test Scenarios

| # | Scenario | User AGs | AP AGs | Matching | Access Time | Expected |
|---|----------|----------|--------|----------|-------------|----------|
| 1 | Basic match | AG-A | AG-A | AG-A | 24/7 | GRANT |
| 2 | No overlap | AG-A | AG-B | none | — | DENY |
| 3 | Multi-AG union | AG-A(9-5), AG-B(18-22) | AG-A, AG-B | both | effective 9-22 | GRANT in either window |
| 4 | Partial overlap | AG-A, AG-B | AG-A only | AG-A | AG-A's time | GRANT only during AG-A time |
| 5 | Passage time priority | AG-A(24/7) | AG-A, PT=8-18 | AG-A | PT: open 8-18 for all; AG: 24/7 for members | OPEN 8-18 (all), credential outside |
| 6 | Expired membership | AG-A (expired) | AG-A | none | — | DENY |
| 7 | Future membership | AG-A (starts May 1) | AG-A | none | — | DENY (before May 1) |
| 8 | Mixed temporal | AG-A(active), AG-B(expired) | AG-A, AG-B | AG-A only | AG-A's time | GRANT during AG-A time |

## Design Decisions

### Why flat groups, not hierarchical?

Parent/child AG hierarchy was considered and rejected:
- Inheritance resolution (child overrides parent APs) adds significant complexity
- Cycle detection needed on every parent change
- Delete handling (orphan vs re-parent children) is error-prone
- Flat groups with multi-membership achieve the same flexibility with simpler logic
- Building operators think in terms of "who goes where" not tree structures

### Why no per-link time override on AG↔AP junction?

The time schedule belongs to the Access Group, not to individual AP assignments within a group:
- If an AP needs a different schedule for certain users, create a separate AG
- This keeps the model clean: AG = "who + where + when" as a single policy unit
- Reduces sync complexity — device receives one schedule per AG, not per AP-AG pair

### Why passage time on the AP, not on a rule?

Passage time is a physical property of the access point — "this door is open from 8am to 6pm regardless of who is presenting credentials." It is enforced by the device autonomously and has the highest priority. It is not a user-level policy.

## Related Documents

- [Access Control Spec](../specs/secure/access-control.md) — API endpoints, data models, business rules
- [MQTT Protocol](./mqtt-protocol.md) — device sync message format
- [System Architecture](./system-architecture.md) — service topology
