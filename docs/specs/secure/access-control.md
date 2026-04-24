# Feature: Access Control System

> Domain: SECURE | Color: #3B82F6 | Priority: P0
> Status: Draft | Owner: SECURE Team

## Overview

The Access Control System is the foundation of the SECURE domain — controlling who goes where, when, and how. It manages doors, gates, turnstiles, lifts, and barriers across one or multiple sites. **All access decisions are made locally on devices** using synced user databases and access rules. The server manages rules, orchestrates sync, and aggregates event logs for dashboards and analytics. Zero connectivity dependency for core access decisions.

## Data Models

### Zone (Spatial Container)

A Zone is a spatial container representing a physical area (building, floor, room, parking level, etc.).
Zones form a hierarchy via `parent_id` (e.g., Building → Floor → Area).
Each zone can optionally carry location metadata and an indoor map/floor plan image
on which Access Points can be positioned.

| Field         | Type        | Required | Default | Description                                                                                 |
| ------------- | ----------- | -------- | ------- | ------------------------------------------------------------------------------------------- |
| id            | uuid        | yes      | auto    | Primary key                                                                                 |
| tenant_id     | uuid        | yes      | -       | Tenant isolation                                                                            |
| parent_id     | uuid        | no       | null    | Parent zone (hierarchy: building → floor → area)                                            |
| name          | string(255) | yes      | -       | Display name, e.g. "Tòa A — Tầng 3"                                                         |
| description   | string(500) | no       | null    | Notes                                                                                       |
| timezone      | string(50)  | no       | null    | IANA timezone (e.g. "Asia/Ho_Chi_Minh"). If null, inherits from parent zone or site default |
| latitude      | decimal     | no       | null    | GPS latitude of zone centroid                                                               |
| longitude     | decimal     | no       | null    | GPS longitude of zone centroid                                                              |
| address       | text        | no       | null    | Human-readable address                                                                      |
| floor         | string(50)  | no       | null    | Floor/level identifier (e.g. "1F", "B1")                                                    |
| building      | string(100) | no       | null    | Building name                                                                               |
| map_image_url | string(500) | no       | null    | Managed tenant-scoped asset path/object reference for the indoor map image                  |
| map_width     | int         | no       | null    | Map image natural width in pixels (for coordinate normalization)                            |
| map_height    | int         | no       | null    | Map image natural height in pixels                                                          |
| map_metadata  | jsonb       | no       | {}      | Optional layout metadata (origin, overlays, scale hints)                                    |
| created_at    | timestamp   | yes      | now()   | Creation time                                                                               |
| updated_at    | timestamp   | yes      | now()   | Last update                                                                                 |

**Zone as Map Owner:** When `map_image_url` is set, Access Points assigned to this zone can store
normalized placement coordinates (`map_x`, `map_y` in 0.0–1.0 range) to position themselves on
the zone's floor plan. This avoids a separate Location entity for v1.

### Access Point

| Field              | Type         | Required | Default | Description                                                                          |
| ------------------ | ------------ | -------- | ------- | ------------------------------------------------------------------------------------ |
| id                 | uuid         | yes      | auto    | Primary key                                                                          |
| tenant_id          | uuid         | yes      | -       | Tenant isolation                                                                     |
| site_id            | uuid         | yes      | -       | Site this access point belongs to                                                    |
| zone_id            | uuid         | no       | null    | Zone this AP belongs to (spatial container)                                          |
| name               | string(100)  | yes      | -       | Display name, e.g. "Cổng chính — Tòa A"                                              |
| description        | string(500)  | no       | null    | Notes                                                                                |
| type               | APTypeEnum   | yes      | -       | Physical type of access point                                                        |
| location           | string(200)  | yes      | -       | Human-readable location                                                              |
| floor              | string(50)   | no       | null    | Floor identifier                                                                     |
| building           | string(100)  | no       | null    | Building identifier                                                                  |
| map_x              | decimal      | no       | null    | X position on zone map (0.0–1.0 normalized). Only meaningful when zone has a map     |
| map_y              | decimal      | no       | null    | Y position on zone map (0.0–1.0 normalized)                                          |
| map_rotation       | decimal      | no       | 0       | Rotation angle in degrees (0–360) for map icon orientation                           |
| map_label          | string(100)  | no       | null    | Optional short label displayed on the zone map                                       |
| status             | APStatusEnum | yes      | offline | Current connection status                                                            |
| state              | APStateEnum  | yes      | locked  | Current physical state                                                               |
| mode               | APModeEnum   | yes      | normal  | Operating mode                                                                       |
| access_time_id     | uuid         | no       | null    | Passage Time schedule — when AP is freely open for everyone (overrides all AG rules) |
| controller_id      | uuid         | no       | null    | Associated controller device                                                         |
| device_id          | uuid         | no       | null    | Terminal device (if integrated)                                                      |
| reader_in_type     | string(50)   | no       | null    | Entry reader model                                                                   |
| reader_out_type    | string(50)   | no       | null    | Exit reader model                                                                    |
| unlock_duration_ms | int          | yes      | 5000    | How long AP stays unlocked                                                           |
| anti_passback      | boolean      | yes      | false   | Anti-passback enabled                                                                |
| interlock_group_id | uuid         | no       | null    | Interlock group (mantrap)                                                            |
| emergency_unlock   | boolean      | yes      | true    | Unlock on fire alarm                                                                 |
| camera_id          | uuid         | no       | null    | Linked CCTV camera                                                                   |
| firmware_version   | string(20)   | no       | null    | Controller firmware                                                                  |
| ip_address         | inet         | no       | null    | Controller IP                                                                        |
| mac_address        | macaddr      | no       | null    | Controller MAC                                                                       |
| last_event_at      | timestamp    | no       | null    | Last access event time                                                               |
| last_heartbeat_at  | timestamp    | no       | null    | Last device heartbeat                                                                |
| config_version     | int          | yes      | 0       | Current config version synced                                                        |
| person_db_version  | int          | yes      | 0       | Current user DB version on device                                                    |
| rules_version      | int          | yes      | 0       | Current rules version on device                                                      |
| metadata           | jsonb        | no       | {}      | Extra data                                                                           |
| created_at         | timestamp    | yes      | now()   | Creation time                                                                        |
| updated_at         | timestamp    | yes      | now()   | Last update                                                                          |

### Access Group

| Field          | Type        | Required | Default | Description                                                                    |
| -------------- | ----------- | -------- | ------- | ------------------------------------------------------------------------------ |
| id             | uuid        | yes      | auto    | Primary key                                                                    |
| tenant_id      | uuid        | yes      | -       | Tenant isolation                                                               |
| name           | string(100) | yes      | -       | e.g. "IT Team", "Cleaning Crew"                                                |
| description    | string(500) | no       | null    | Description                                                                    |
| is_default     | boolean     | yes      | false   | Default group for new users                                                    |
| type           | string(50)  | no       | null    | Group classification                                                           |
| access_time_id | uuid        | no       | null    | Access Time schedule — when AG members can use APs in this group (NULL = 24/7) |
| created_at     | timestamp   | yes      | now()   | Creation time                                                                  |
| updated_at     | timestamp   | yes      | now()   | Last update                                                                    |

An Access Group links a set of Access Points and a set of Users. Both are M:N relationships:

**access_group_access_points** — links AGs to APs:
| Field | Type | Description |
|-------|------|-------------|
| access_group_id | uuid | FK, CASCADE delete |
| access_point_id | uuid | FK, CASCADE delete |

- UNIQUE constraint: `(access_group_id, access_point_id)`
- No per-link time override — Access Time is defined at the AG level only

**access_group_users** — links AGs to Users with temporal membership:
| Field | Type | Description |
|-------|------|-------------|
| access_group_id | uuid | FK, CASCADE delete |
| user_id | uuid | FK, CASCADE delete |
| effective_from | timestamptz | When membership becomes active (default now) |
| effective_to | timestamptz | When membership expires (NULL = permanent) |

- UNIQUE constraint: `(access_group_id, user_id)`

### Access Time

| Field      | Type        | Required | Default          | Description                   |
| ---------- | ----------- | -------- | ---------------- | ----------------------------- |
| id         | uuid        | yes      | auto             | Primary key                   |
| tenant_id  | uuid        | yes      | -                | Tenant isolation              |
| name       | string(100) | yes      | -                | e.g. "Business Hours", "24/7" |
| timezone   | string(50)  | yes      | Asia/Ho_Chi_Minh | Timezone                      |
| is_active  | boolean     | yes      | true             | Active/inactive toggle        |
| created_at | timestamp   | yes      | now()            | Creation time                 |
| updated_at | timestamp   | yes      | now()            | Last update                   |

**access_time_slots** — individual time windows for an Access Time:
| Field | Type | Description |
|-------|------|-------------|
| access_time_id | uuid | FK |
| day_of_week | int | 0=Sunday … 6=Saturday |
| start_time | TIME | Start of window |
| end_time | TIME | End of window |

### AccessEvent (Hypertable)

| Field              | Type               | Required | Default | Description                     |
| ------------------ | ------------------ | -------- | ------- | ------------------------------- |
| id                 | uuid               | yes      | auto    | Primary key                     |
| tenant_id          | uuid               | yes      | -       | Tenant isolation                |
| time               | timestamptz        | yes      | -       | Event timestamp (device clock)  |
| access_point_id    | uuid               | yes      | -       | Which access point              |
| user_id            | uuid               | no       | null    | Matched user (null if unknown)  |
| user_name          | string(100)        | no       | null    | Denormalized name               |
| credential_type    | CredentialTypeEnum | yes      | -       | Method used                     |
| direction          | DirectionEnum      | no       | null    | entry / exit                    |
| decision           | DecisionEnum       | yes      | -       | granted / denied / forced       |
| decided_locally    | boolean            | yes      | true    | Always true in offline-first    |
| decision_time_ms   | int                | no       | null    | Time to make decision on device |
| reason             | DenialReasonEnum   | no       | null    | Reason for denial               |
| confidence         | float              | no       | null    | Biometric match confidence 0-1  |
| photo_ref          | string(200)        | no       | null    | MinIO reference for snapshot    |
| temperature        | float              | no       | null    | Thermal reading if enabled      |
| mask_detected      | boolean            | no       | null    | Mask detection result           |
| local_db_version   | int                | no       | null    | Device's user DB version        |
| local_person_count | int                | no       | null    | Device's user count             |
| device_id          | uuid               | no       | null    | Source device                   |
| metadata           | jsonb              | no       | {}      | Extra data                      |

### InterlockGroup

| Field            | Type              | Required | Default          | Description                         |
| ---------------- | ----------------- | -------- | ---------------- | ----------------------------------- |
| id               | uuid              | yes      | auto             | Primary key                         |
| tenant_id        | uuid              | yes      | -                | Tenant isolation                    |
| name             | string(100)       | yes      | -                | e.g. "Mantrap Kho quỹ"              |
| access_point_ids | uuid[]            | yes      | -                | Access points in group (must be 2+) |
| mode             | InterlockModeEnum | yes      | mutual_exclusive | Interlock logic                     |
| created_at       | timestamp         | yes      | now()            | Creation time                       |

### Enums

```
APTypeEnum: door | gate | barrier | turnstile | lift
APStatusEnum: online | offline | alarm | warning
APStateEnum: locked | unlocked | open | closed | forced | held_open | tampered
APModeEnum: normal | locked_down | free_access | card_and_pin | emergency_open
CredentialTypeEnum: card | face | fingerprint | pin | qr | mobile_ble | multi_factor
DirectionEnum: entry | exit
DecisionEnum: granted | denied | forced
DenialReasonEnum: authorized | denied_expired | denied_zone | denied_time | denied_unknown | denied_blacklist | denied_lockout | denied_anti_passback | denied_interlock | denied_inactive
InterlockModeEnum: mutual_exclusive | sequential
```

## API Endpoints

### GET /api/v1/access/zones/{id}/map

- **Auth:** role >= viewer
- **Description:** Returns the zone's map metadata plus placed access points for layout UIs.
- **Response 200:**
  ```json
  {
    "zone": {
      "id": "uuid",
      "name": "Tòa A — Tầng 3",
      "timezone": "Asia/Ho_Chi_Minh",
      "map_image_url": "/assets/tenants/{tenant_id}/access/zones/{zone_id}/map.png",
      "map_width": 1600,
      "map_height": 900,
      "map_metadata": { "origin": "top-left" }
    },
    "access_points": [
      {
        "id": "uuid",
        "name": "Cửa phòng Lab",
        "zone_id": "uuid",
        "map_x": 0.42,
        "map_y": 0.31,
        "map_rotation": 90,
        "map_label": "LAB-01"
      }
    ]
  }
  ```

### PUT /api/v1/access/zones/{id}/map

- **Auth:** role >= admin
- **Description:** Updates the zone-owned indoor map metadata without editing unrelated zone fields.
- **Body:**
  ```json
  {
    "map_image_url": "/assets/tenants/{tenant_id}/access/zones/{zone_id}/map.png",
    "map_width": 1600,
    "map_height": 900,
    "map_metadata": { "origin": "top-left", "unit": "normalized" }
  }
  ```

### POST /api/v1/access/zones/{id}/map/upload

- **Auth:** role >= admin
- **Description:** Uploads an indoor map image for the zone using multipart/form-data. The backend stores the binary in MinIO under the managed tenant-scoped object key `tenants/{tenant_id}/access/zones/{zone_id}/map.{ext}`, serves it back through `GET /assets/...`, then persists the resulting `map_image_url`, `map_width`, and `map_height` on the zone.
- **Body:** `multipart/form-data` with field `map` (PNG/JPEG/GIF)
- **Response 200:** Updated Zone resource

### GET /api/v1/access/access-points

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
        "access_time_id": "uuid",
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

### GET /api/v1/access/access-points/{id}

- **Auth:** role >= viewer
- **Response 200:** Full Access Point object with nested controller info, linked camera, access groups, recent events (last 10)
- **Errors:** 401, 403, 404

### POST /api/v1/access/access-points

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
    "access_time_id": "uuid",
    "unlock_duration_ms": 5000,
    "anti_passback": false,
    "emergency_unlock": true,
    "camera_id": "uuid",
    "map_x": 0.42,
    "map_y": 0.31,
    "map_rotation": 90,
    "map_label": "LAB-01"
  }
  ```
- **Side effects:** Audit log, MQTT `cfg.full` push to device if device_id set
- **Response 201:** Created access point
- **Errors:** 401, 403, 409 (duplicate name), 422

### PUT /api/v1/access/access-points/{id}

- **Auth:** role >= admin
- **Body:** Partial access point fields
- **Side effects:** Audit log, MQTT `cfg.patch` to device if config changed; if `access_time_id` changed, triggers `cfg.access_rules` re-sync to this AP's device
- **Response 200:** Updated access point
- **Errors:** 401, 403, 404, 422

### DELETE /api/v1/access/access-points/{id}

- **Auth:** role >= site_admin
- **Side effects:** Audit log, remove AP from all access groups, notify device
- **Response 204:** Deleted
- **Errors:** 401, 403, 404, 409 (AP has active alarm)

### POST /api/v1/access/access-points/{id}/unlock

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
    "access_point_id": "uuid",
    "current_state": "unlocked",
    "executed_at": "2026-02-19T09:15:00.500Z"
  }
  ```
- **Errors:** 401, 403, 404, 408 (device timeout), 503 (device offline)

### POST /api/v1/access/access-points/{id}/lock

- **Auth:** role >= operator
- **Side effects:** MQTT `cmd.door` (action=lock) → device, audit log
- **Response 200:** Same as unlock
- **Errors:** 401, 403, 404, 408, 503

### POST /api/v1/access/access-points/{id}/hold-open

- **Auth:** role >= admin
- **Body:** `{ "duration_ms": 60000, "reason": "Sự kiện công ty" }`
- **Side effects:** MQTT `cmd.door` (action=hold_open), audit log
- **Response 200:** Confirmation
- **Errors:** 401, 403, 404, 408, 503

### GET /api/v1/access/access-points/{id}/events

- **Auth:** role >= viewer
- **Query params:**
  | Param | Type | Default | Description |
  |-------|------|---------|-------------|
  | from | timestamp | -24h | Start time |
  | to | timestamp | now | End time |
  | decision | string | - | Filter: granted,denied,forced |
  | credential_type | string | - | Filter by credential type |
  | user_id | uuid | - | Filter by user |
  | page | int | 1 | Pagination |
  | limit | int | 50 | Max 500 |
- **Response 200:**
  ```json
  {
    "data": [
      {
        "id": "uuid",
        "time": "2026-02-19T09:15:00Z",
        "user_id": "uuid",
        "user_name": "Nguyễn Văn An",
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

### POST /api/v1/access/access-points/{id}/sync

- **Auth:** role >= admin
- **Description:** Force full user DB + rules sync to a specific device
- **Side effects:** MQTT `cfg.person_sync` (action=full_sync) + `cfg.access_rules` (action=full_sync)
- **Response 202:** Sync initiated
- **Errors:** 401, 403, 404, 503 (device offline)

### GET /api/v1/access/access-points/{id}/sync-status

- **Auth:** role >= operator
- **Response 200:**
  ```json
  {
    "access_point_id": "uuid",
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

### GET /api/v1/access/zones

- **Auth:** role >= viewer
- **Query params:**
  | Param | Type | Default | Description |
  |-------|------|---------|-------------|
  | page | int | 1 | Page number |
  | limit | int | 20 | Items per page (max 100) |
  | parent_id | uuid | - | Filter by parent zone |
  | search | string | - | Search zone name |
- **Response 200:** Paginated list of zones with `access_point_count`
- **UI usage note:** The console consumes this as a tree-first explorer. Search/filter should preserve enough ancestor context for operators to understand where a matched zone sits in the hierarchy.

### POST /api/v1/access/zones

- **Auth:** role >= admin
- **Body:**
  ```json
  {
    "name": "Tòa A — Tầng 3",
    "description": "Office floor",
    "parent_id": "uuid",
    "timezone": "Asia/Ho_Chi_Minh",
    "latitude": 10.7769,
    "longitude": 106.7009,
    "address": "123 Nguyễn Huệ, Quận 1",
    "floor": "3F",
    "building": "Tòa A",
    "map_image_url": "/assets/tenants/{tenant_id}/access/zones/{zone_id}/map.png",
    "map_width": 1920,
    "map_height": 1080
  }
  ```
- **Side effects:** Audit log
- **Response 201:** Created zone
- **Errors:** 401, 403, 422

### GET /api/v1/access/zones/{id}

- **Auth:** role >= viewer
- **Response 200:** Full zone object with `access_point_count`

### PUT /api/v1/access/zones/{id}

- **Auth:** role >= admin
- **Body:** Partial zone fields (any field from POST body)
- **Side effects:** Audit log
- **Response 200:** Updated zone

### DELETE /api/v1/access/zones/{id}

- **Auth:** role >= admin
- **Side effects:** Audit log, access points in this zone have `zone_id` set to null
- **Response 204**

### GET /api/v1/access/access-groups

- **Auth:** role >= viewer
- **Query params:** search, page, limit
- **Response 200:** Paginated list of Access Groups with nested access time, AP count, user count

### POST /api/v1/access/access-groups

- **Auth:** role >= admin
- **Body:**
  ```json
  {
    "name": "IT Team",
    "description": "Full-time IT staff",
    "access_time_id": "uuid"
  }
  ```
- **Side effects:** Audit log
- **Response 201:** Created access group
- **Errors:** 401, 403, 409 (duplicate name), 422

### GET /api/v1/access/access-groups/{id}

- **Auth:** role >= viewer
- **Response 200:** Full Access Group with access points, users (with temporal membership), and access time
- **Errors:** 401, 403, 404

### PUT /api/v1/access/access-groups/{id}

- **Auth:** role >= admin
- **Body:** Partial access group fields (name, description, access_time_id)
- **Side effects:** Audit log, triggers `cfg.access_rules` re-sync to all APs in this AG
- **Response 200:** Updated access group
- **Errors:** 401, 403, 404, 422

### DELETE /api/v1/access/access-groups/{id}

- **Auth:** role >= admin
- **Side effects:** Audit log, cascades to remove all AP and user links, triggers re-sync
- **Response 204**
- **Errors:** 401, 403, 404

### GET /api/v1/access/access-groups/{id}/access-points

- **Auth:** role >= viewer
- **Response 200:** List of Access Points assigned to this AG

### POST /api/v1/access/access-groups/{id}/access-points

- **Auth:** role >= admin
- **Body:** `{ "access_point_id": "uuid" }`
- **Side effects:** Audit log, triggers `cfg.access_rules` re-sync to the added AP's device
- **Response 201:** AP added to AG
- **Errors:** 401, 403, 404, 409 (already assigned)

### DELETE /api/v1/access/access-groups/{id}/access-points/{apId}

- **Auth:** role >= admin
- **Side effects:** Audit log, triggers `cfg.access_rules` re-sync to the removed AP's device
- **Response 204**
- **Errors:** 401, 403, 404

### GET /api/v1/access/access-groups/{id}/users

- **Auth:** role >= viewer
- **Response 200:** List of users in this AG with their `effective_from` / `effective_to` membership bounds

### POST /api/v1/access/access-groups/{id}/users

- **Auth:** role >= admin
- **Body:**
  ```json
  {
    "user_id": "uuid",
    "effective_from": "2026-04-09T00:00:00Z",
    "effective_to": null
  }
  ```
- **Side effects:** Audit log, triggers `cfg.access_rules` re-sync to all APs in this AG
- **Response 201:** User added to AG
- **Errors:** 401, 403, 404, 409 (already a member)

### PUT /api/v1/access/access-groups/{id}/users/{userId}

- **Auth:** role >= admin
- **Body:** `{ "effective_from": "...", "effective_to": "..." }`
- **Description:** Update temporal membership bounds for a user in this AG
- **Side effects:** Audit log, triggers `cfg.access_rules` re-sync to all APs in this AG
- **Response 200:** Updated membership
- **Errors:** 401, 403, 404

### DELETE /api/v1/access/access-groups/{id}/users/{userId}

- **Auth:** role >= admin
- **Side effects:** Audit log, triggers `cfg.access_rules` re-sync to all APs in this AG
- **Response 204**
- **Errors:** 401, 403, 404

### GET /api/v1/access/interlock-groups

- **Auth:** role >= viewer
- **Query params:** site_id (required)
- **Response 200:** List of interlock groups

### POST /api/v1/access/interlock-groups

- **Auth:** role >= site_admin
- **Body:** InterlockGroup object
- **Response 201:** Created interlock group

## MQTT Topics

| Topic                                                  | Direction     | QoS | Payload Schema                                                | Description                                                    |
| ------------------------------------------------------ | ------------- | --- | ------------------------------------------------------------- | -------------------------------------------------------------- |
| `dm/{tid}/device/{did}/evt` (type: access.log)         | device→server | 1   | See mqtt-protocol.md §4.1                                     | Access event log — decision already made locally               |
| `dm/{tid}/device/{did}/evt` (type: door.state)         | device→server | 1   | See mqtt-protocol.md §4.2                                     | AP physical state change                                       |
| `dm/{tid}/device/{did}/cmd` (type: cmd.door)           | server→device | 2   | `{action, access_point_id, duration_ms, reason, operator_id}` | Remote AP control                                              |
| `dm/{tid}/device/{did}/cmd/resp` (type: cmd.door.resp) | device→server | 2   | `{access_point_id, current_state, executed_at}`               | AP command response                                            |
| `dm/{tid}/device/{did}/cfg` (type: cfg.person_sync)    | server→device | 2   | See mqtt-protocol.md §7.3                                     | User DB sync to device                                         |
| `dm/{tid}/device/{did}/cfg` (type: cfg.access_rules)   | server→device | 2   | See mqtt-protocol.md §7.5                                     | Access rules sync — passage_time + per-user schedules from AGs |
| `dm/{tid}/device/{did}/cfg` (type: cfg.blacklist)      | server→device | 2   | See mqtt-protocol.md §7.4                                     | Blacklist push (priority)                                      |
| `dm/{tid}/device/{did}/cfg/ack`                        | device→server | 2   | Ack with local versions and counts                            | Sync confirmation                                              |
| `dm/{tid}/device/{did}/sta` (type: status.heartbeat)   | device→server | 0   | See mqtt-protocol.md §5.1                                     | Device health + sync status                                    |
| `dm/{tid}/emergency/broadcast` (type: cmd.lockdown)    | server→all    | 2   | See mqtt-protocol.md §6.6                                     | Emergency lockdown broadcast                                   |

## Business Rules

1. **BR-AC-001 — Local Decision Engine:** All access decisions MUST be made on-device within 50ms using synced user DB and access rules. Server NEVER participates in real-time access decisions.
2. **BR-AC-002 — Deny by Default:** If a credential does not match any user in the local DB, or the user has no applicable Access Group for the current access point + time, access is DENIED.
3. **BR-AC-003 — Blacklist Priority:** Blacklist entries override ALL access rules. A blacklisted user is denied regardless of any AG granting access. Blacklist sync has QoS 2 and must be processed before the next access decision.
4. **BR-AC-004 — Passage Time Priority (Highest):** When an Access Point's Passage Time schedule is active, the AP is freely open for everyone — no credential check is performed. The device enforces this autonomously. Passage Time overrides all Access Group rules.
5. **BR-AC-005 — Access Time Union (OR) Logic:** A user's access at a given AP is determined by the union of all matching Access Groups. An Access Group matches when: (a) the AP is assigned to the AG, (b) the user is a member of the AG with an active temporal membership, and (c) the AG's Access Time covers the current time (or the AG has no Access Time, meaning 24/7). If ANY matching AG grants access, the result is GRANT. Rules are not evaluated in priority order — all AGs are checked and any grant wins.
6. **BR-AC-006 — Temporal Membership:** A user's AG membership is only active when `effective_from <= current_time` AND (`effective_to IS NULL` OR `effective_to > current_time`). Expired or future memberships are treated as non-existent during rule evaluation.
7. **BR-AC-007 — Anti-Passback:** If enabled on an access point, a user who entered (direction=entry) cannot enter again until they exit. Violation → deny with reason `denied_anti_passback`. Anti-passback state is maintained locally on the device.
8. **BR-AC-008 — Interlock / Mantrap:** In an interlock group, only one access point may be unlocked at a time. An AP in the group cannot unlock until all other APs in the group are in `locked` state. Enforced locally by the controller.
9. **BR-AC-009 — Failed Attempt Lockout:** After `max_failed_attempts` consecutive denials for the same credential within 10 minutes, the credential is locked out for `lockout_duration_ms`. Enforced locally.
10. **BR-AC-010 — Emergency Override:** When emergency mode is activated via `dm/{tid}/emergency/broadcast`, APs with `emergency_unlock=true` must unlock immediately regardless of rules. APs with `emergency_unlock=false` (e.g., server rooms) lock down.
11. **BR-AC-011 — Access Time Enforcement:** Access Times use the device's local clock (synced via NTP). Timezone is always explicit in the schedule. Devices evaluate day-of-week and time-of-day locally.
12. **BR-AC-012 — AP Held Open Alert:** If an AP remains in `open` state longer than `unlock_duration_ms + 30 seconds`, the device emits an `alarm.triggered` event with type `door_held`. Monitored locally.
13. **BR-AC-013 — Forced AP Alert:** If an AP is opened without a valid unlock command or access grant, the device emits `alarm.triggered` with type `door_forced`. Immediate critical alert.
14. **BR-AC-014 — Incremental Sync:** User DB sync uses cursor-based incremental sync (`sync_token`). Only changed records are sent. Full sync only on first provision or admin request.
15. **BR-AC-015 — Multi-Factor Access:** Devices configured with `multi_factor=true` require users to present 2+ credentials (e.g., card + face) within a 30-second window. Both must match the same user.
16. **BR-AC-016 — Credential Validity Window:** Each user credential has `valid_from` and `valid_until`. Device rejects expired credentials locally without server involvement.
17. **BR-AC-017 — Event Queue Ordering:** When device reconnects, queued events are uploaded in chronological order (oldest first), throttled at 100 events/second.
18. **BR-AC-018 — Zone-Owned Spatial Context:** Zone is the canonical spatial container for access control. Indoor maps, zone-local timezone, and spatial metadata belong to the zone.
19. **BR-AC-019 — Relative Placement:** Access Point coordinates are always interpreted relative to the owning zone map. Reassigning a point to another zone requires placement recalibration.
20. **BR-AC-020 — Optional Indoor Map:** Zones may carry location metadata and timezone without an indoor map asset. Spatial placement becomes active only when a map is configured.
21. **BR-AC-021 — Tree-First Zone Operations:** Zone management UI must present the hierarchy first so operators can understand building → floor → area relationships without switching screens.
22. **BR-AC-022 — Search With Hierarchy Context:** When search/filter narrows the zone explorer, matched zones should remain visible with their ancestor chain so their physical context is still clear.
23. **BR-AC-023 — Dual Access Point Views:** Zone detail must provide both a list view and a map view over the same zone-scoped access point set.
24. **BR-AC-024 — Direct Map Editing:** In map view, operators may drag access point markers directly on the indoor map. Updated normalized coordinates persist through the standard access point update API.

## Permissions Matrix

| Action                    | viewer | operator | admin | site_admin | super_admin |
| ------------------------- | ------ | -------- | ----- | ---------- | ----------- |
| List access points        | ✅     | ✅       | ✅    | ✅         | ✅          |
| View access point detail  | ✅     | ✅       | ✅    | ✅         | ✅          |
| View events               | ✅     | ✅       | ✅    | ✅         | ✅          |
| Remote unlock/lock        | ❌     | ✅       | ✅    | ✅         | ✅          |
| Hold open                 | ❌     | ❌       | ✅    | ✅         | ✅          |
| Create/edit access points | ❌     | ❌       | ✅    | ✅         | ✅          |
| Delete access points      | ❌     | ❌       | ❌    | ✅         | ✅          |
| Create/edit access groups | ❌     | ❌       | ✅    | ✅         | ✅          |
| Delete access groups      | ❌     | ❌       | ✅    | ✅         | ✅          |
| Manage AG members (users) | ❌     | ❌       | ✅    | ✅         | ✅          |
| Manage AG access points   | ❌     | ❌       | ✅    | ✅         | ✅          |
| Force device sync         | ❌     | ❌       | ✅    | ✅         | ✅          |
| Create interlock groups   | ❌     | ❌       | ❌    | ✅         | ✅          |
| Emergency lockdown        | ❌     | ✅       | ✅    | ✅         | ✅          |

## Offline Behavior

- **Device-side:** This IS the primary mode. Devices always have a complete local user DB (SQLite), access rules, and blacklist. All credential matching, rule evaluation, schedule checks, anti-passback tracking, and interlock logic run locally in < 50ms. No server dependency whatsoever.
- **Event queuing:** Access events are logged to local SQLite `event_queue` table (max 5,000 events). When connectivity restores, events upload in chronological order at 100/sec.
- **Sync strategy:** On reconnect, device publishes heartbeat with `local_db_version`, `rules_version`, `blacklist_version`. Server compares versions and sends incremental deltas for any stale data.
- **Conflict resolution:** Server wins. Server is the single source of truth for user data and rules. Device never modifies user records — only consumes them.
- **Local storage:** SQLite DB on device containing: users table (face templates ~2KB each, card UIDs, fingerprint templates ~500B each), access_rules, blacklist, event_queue, config. Max capacity: 10,000 users by default (configurable per device model).
- **Clock sync:** Devices use NTP for time synchronization. If NTP is unavailable, device uses internal RTC. Events include device timestamp and are reconciled server-side.
- **Blacklist during offline:** Blacklist entries synced before going offline remain enforced. New blacklist entries cannot reach the device until connectivity restores — this is an accepted risk documented in the security assessment.
- **Degraded mode indicators:** Device displays "Offline Mode" icon on screen but continues normal access operations. Operators see `queue_depth > 0` in status to know events are pending upload.

## UI Pages

| Route                      | Page                | Key Components                                                                                                   |
| -------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------- |
| /secure/access-control     | Access Point List   | DataTable with status tabs (All/Online/Offline/Alarm/Warning), filters, stat cards                               |
| /secure/access-control/:id | Access Point Detail | AP info, state controls (unlock/lock/hold), live event timeline, linked camera, access groups tab, device health |
| /secure/zones              | Zone Explorer       | Tree-first zone explorer with hierarchy, inline search/filter, map readiness, AP counts                          |
| /secure/zones/:id          | Zone Detail         | Zone info, child zones, Access Point List View, Access Point Map View with direct marker repositioning           |
| /secure/access-groups      | Access Groups       | DataTable of AGs, create/edit dialog with access time picker                                                     |
| /secure/access-groups/:id  | Access Group Detail | AG info, access points tab, users tab (with effective_from/effective_to), access time assignment                 |

## Events & Audit Log

| Event Type                  | Trigger                  | Payload                                             | Retention |
| --------------------------- | ------------------------ | --------------------------------------------------- | --------- |
| access.ap.created           | POST create              | full access point resource                          | 1 year    |
| access.ap.updated           | PUT update               | diff only                                           | 1 year    |
| access.ap.deleted           | DELETE                   | id + actor                                          | permanent |
| access.ap.unlocked          | POST unlock command      | access_point_id, actor, reason, duration            | 1 year    |
| access.ap.locked            | POST lock command        | access_point_id, actor                              | 1 year    |
| access.ap.held_open         | POST hold-open           | access_point_id, actor, duration                    | 1 year    |
| access.event.granted        | Device access.log        | user, access_point, credential, time                | 2 years   |
| access.event.denied         | Device access.log        | user/unknown, access_point, reason, time            | 2 years   |
| access.event.forced         | Device door.state forced | access_point, time, photo                           | permanent |
| access.group.created        | POST access group        | full AG resource                                    | 1 year    |
| access.group.updated        | PUT access group         | diff                                                | 1 year    |
| access.group.deleted        | DELETE access group      | id + actor                                          | permanent |
| access.group.ap_added       | POST AG access point     | ag_id, access_point_id, actor                       | 1 year    |
| access.group.ap_removed     | DELETE AG access point   | ag_id, access_point_id, actor                       | 1 year    |
| access.group.user_added     | POST AG user             | ag_id, user_id, effective_from, effective_to, actor | 1 year    |
| access.group.user_updated   | PUT AG user              | ag_id, user_id, membership bounds diff, actor       | 1 year    |
| access.group.user_removed   | DELETE AG user           | ag_id, user_id, actor                               | 1 year    |
| access.sync.initiated       | POST sync                | access_point_id, sync_type, actor                   | 90 days   |
| access.sync.completed       | cfg/ack received         | access_point_id, versions, counts                   | 90 days   |
| access.alarm.door_forced    | Device alarm event       | access_point_id, time, photo                        | permanent |
| access.alarm.door_held      | Device alarm event       | access_point_id, duration                           | 1 year    |
| access.lockdown.activated   | Emergency broadcast      | actor, level, zones                                 | permanent |
| access.lockdown.deactivated | Emergency deactivate     | actor, override_code_hash                           | permanent |

## Integration Points

- **Depends on:**
  - `identity-svc` — User data, credentials, user groups (gRPC)
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

- The access-svc is NOT a real-time decision engine. It is an Access Group management + sync orchestration + event aggregation service.
- Face templates are ArcFace v3 format (~2KB each). Card UIDs are 4-10 byte hex. Fingerprint templates are ISO/IEC 19794-2 format (~500B each).
- Interlock groups are limited to 4 access points maximum per group due to controller hardware constraints.
- Anti-passback state resets daily at midnight (configurable) to handle edge cases like tailgating that can desync state.
- Photo snapshots in access events are optional and configurable per access point. When enabled, photos are stored in MinIO with 90-day retention, then thumbnails only.
- Passage Time is stored as `access_time_id` on the `access_points` table. Access Time is stored as `access_time_id` on the `access_groups` table. Both reference the same `access_times` / `access_time_slots` tables but serve different purposes. See [access-model-design.md](../architecture/access-model-design.md) for the full rule resolution algorithm.
