# Feature: Intercom & Communications

> Domain: SECURE | Color: #8B5CF6 | Priority: P1
> Status: Draft | Owner: SECURE Team

## Overview

The Intercom system manages door stations, indoor monitors, and call management for building communication. Visitors press a door station to call reception/resident, who can see video, talk, and remotely unlock the door. The system integrates with SIP for phone/PBX connectivity, enabling call forwarding to mobile apps. Call history, device management, and remote door unlock from intercom monitors are core capabilities. Integration with Access Control allows door unlock through intercom, and with CCTV for viewing camera feeds on indoor monitors.

## Data Models

### IntercomDevice
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | - | Tenant isolation |
| site_id | uuid | yes | - | Site |
| name | string(100) | yes | - | e.g. "DS-Cổng chính" |
| type | IntercomDeviceTypeEnum | yes | - | Device type |
| status | IntercomDeviceStatusEnum | yes | offline | Connection status |
| location | string(200) | yes | - | Physical location |
| floor | string(50) | no | null | Floor |
| building | string(100) | no | null | Building |
| ip_address | inet | yes | - | Device IP |
| mac_address | macaddr | no | null | MAC address |
| sip_uri | string(200) | no | null | SIP URI, e.g. "sip:ds01@pbx.local" |
| sip_extension | string(20) | no | null | PBX extension number |
| firmware_version | string(50) | no | null | Firmware |
| model | string(100) | no | null | Hardware model |
| brand | string(50) | no | null | Brand (Hikvision, Dahua, 2N, etc.) |
| has_camera | boolean | yes | true | Built-in camera |
| has_card_reader | boolean | yes | false | Built-in card reader |
| has_keypad | boolean | yes | false | Built-in PIN pad |
| linked_door_id | uuid | no | null | Associated access point for unlock |
| linked_camera_id | uuid | no | null | Camera feed (if external) |
| call_timeout_ms | int | yes | 60000 | Ring timeout before missed |
| auto_answer | boolean | yes | false | Auto-answer for guard stations |
| volume_level | int | yes | 70 | Speaker volume (0-100) |
| ring_group_ids | uuid[] | no | [] | Ring groups this device belongs to |
| last_seen_at | timestamp | no | null | Last heartbeat |
| metadata | jsonb | no | {} | Extra data |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### RingGroup
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | - | Tenant isolation |
| site_id | uuid | yes | - | Site |
| name | string(100) | yes | - | e.g. "Phòng bảo vệ", "Lễ tân" |
| description | string(500) | no | null | Description |
| member_device_ids | uuid[] | yes | - | Indoor monitors in this group |
| member_user_ids | uuid[] | no | [] | Users to ring on mobile app |
| ring_strategy | RingStrategyEnum | yes | ring_all | How to ring members |
| fallback_group_id | uuid | no | null | Fallback if no answer |
| fallback_timeout_ms | int | yes | 30000 | Time before fallback |
| active_schedule_id | uuid | no | null | Only active during schedule |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### CallRecord (Hypertable)
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | - | Tenant isolation |
| time | timestamptz | yes | - | Call start time |
| caller_device_id | uuid | yes | - | Door station that initiated |
| caller_name | string(100) | yes | - | Device name denormalized |
| receiver_device_id | uuid | no | null | Device that answered |
| receiver_name | string(100) | no | null | Answering device name |
| receiver_user_id | uuid | no | null | User who answered (mobile) |
| ring_group_id | uuid | no | null | Ring group called |
| duration_ms | int | no | null | Call duration |
| result | CallResultEnum | yes | - | Call outcome |
| door_unlocked | boolean | yes | false | Was door unlocked during call |
| door_id | uuid | no | null | Which door unlocked |
| recording_path | string(500) | no | null | Call recording MinIO path |
| snapshot_path | string(500) | no | null | Caller snapshot |
| visitor_id | uuid | no | null | Linked visitor if identified |
| metadata | jsonb | no | {} | Extra data |

### SIPTrunk
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | - | Tenant isolation |
| name | string(100) | yes | - | e.g. "PBX chính" |
| sip_server | string(200) | yes | - | SIP server address |
| sip_port | int | yes | 5060 | SIP port |
| transport | SIPTransportEnum | yes | udp | Transport protocol |
| username | string(100) | no | null | SIP auth |
| password | string(200) | no | null | SIP auth (encrypted) |
| realm | string(100) | no | null | SIP realm |
| status | SIPTrunkStatusEnum | yes | inactive | Registration status |
| max_concurrent_calls | int | yes | 10 | Max simultaneous calls |
| codec_priority | string[] | yes | ["opus","g711a","g711u"] | Codec preference |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### Enums
```
IntercomDeviceTypeEnum: door_station | indoor_monitor | guard_station | mobile_client
IntercomDeviceStatusEnum: online | offline | busy | ringing | in_call
CallResultEnum: answered | missed | rejected | busy | timeout | failed
RingStrategyEnum: ring_all | round_robin | priority | sequential
SIPTransportEnum: udp | tcp | tls
SIPTrunkStatusEnum: active | inactive | error | registering
```

## API Endpoints

### GET /api/v1/intercom/devices
- **Auth:** Bearer token, role >= viewer
- **Query params:**
  | Param | Type | Default | Description |
  |-------|------|---------|-------------|
  | site_id | uuid | required | Site filter |
  | type | string | - | door_station,indoor_monitor,guard_station |
  | status | string | - | online,offline,busy |
  | page | int | 1 | Page |
  | limit | int | 20 | Max 50 |
- **Response 200:** Paginated device list with status, type, location

### GET /api/v1/intercom/devices/{id}
- **Auth:** role >= viewer
- **Response 200:** Full device with config, linked door, recent calls

### POST /api/v1/intercom/devices
- **Auth:** role >= admin
- **Body:**
  ```json
  {
    "name": "DS-Cổng phụ",
    "site_id": "uuid",
    "type": "door_station",
    "location": "Cổng phụ phía Bắc",
    "ip_address": "192.168.1.102",
    "sip_uri": "sip:ds02@pbx.local",
    "has_camera": true,
    "has_card_reader": true,
    "linked_door_id": "uuid",
    "ring_group_ids": ["uuid"],
    "call_timeout_ms": 60000
  }
  ```
- **Side effects:** Audit log, SIP registration if SIP configured, ONVIF probe
- **Response 201:** Created device

### PUT /api/v1/intercom/devices/{id}
- **Auth:** role >= admin
- **Response 200:** Updated device

### DELETE /api/v1/intercom/devices/{id}
- **Auth:** role >= site_admin
- **Side effects:** Audit log, SIP deregistration
- **Response 204**

### GET /api/v1/intercom/calls
- **Auth:** role >= viewer
- **Query params:**
  | Param | Type | Default | Description |
  |-------|------|---------|-------------|
  | site_id | uuid | required | Site filter |
  | device_id | uuid | - | Filter by device |
  | result | string | - | answered,missed,rejected,busy |
  | from | timestamp | -24h | Start time |
  | to | timestamp | now | End time |
  | page | int | 1 | Page |
  | limit | int | 50 | Max 200 |
- **Response 200:** Paginated call records

### POST /api/v1/intercom/calls
- **Auth:** role >= operator (for server-initiated calls)
- **Body:**
  ```json
  {
    "from_device_id": "uuid",
    "to_ring_group_id": "uuid"
  }
  ```
- **Description:** Initiate a call from server (e.g., guard calling door station)
- **Side effects:** SIP INVITE, audit log
- **Response 201:** Call initiated with call_id

### POST /api/v1/intercom/calls/{id}/answer
- **Auth:** role >= operator (or resident user for their unit)
- **Side effects:** SIP 200 OK, update call record
- **Response 200:** Call answered

### POST /api/v1/intercom/calls/{id}/hangup
- **Auth:** role >= operator (or call participant)
- **Side effects:** SIP BYE, update call record with duration
- **Response 200:** Call ended

### POST /api/v1/intercom/calls/{id}/unlock
- **Auth:** role >= operator (or resident user during active call)
- **Body:** `{ "door_id": "uuid", "duration_ms": 5000 }`
- **Side effects:** MQTT `cmd.door` unlock, audit log
- **Response 200:** Door unlocked
- **Errors:** 401, 403, 404, 503 (door offline)

### POST /api/v1/intercom/calls/{id}/transfer
- **Auth:** role >= operator
- **Body:** `{ "to_device_id": "uuid" }` or `{ "to_extension": "101" }`
- **Side effects:** SIP REFER, audit log
- **Response 200:** Call transferred

### GET /api/v1/intercom/ring-groups
- **Auth:** role >= viewer
- **Query params:** site_id (required)
- **Response 200:** List of ring groups

### POST /api/v1/intercom/ring-groups
- **Auth:** role >= admin
- **Body:** RingGroup object
- **Response 201:** Created ring group

### PUT /api/v1/intercom/ring-groups/{id}
- **Auth:** role >= admin
- **Response 200:** Updated ring group

### GET /api/v1/intercom/sip-trunks
- **Auth:** role >= admin
- **Response 200:** List of SIP trunks

### POST /api/v1/intercom/sip-trunks
- **Auth:** role >= site_admin
- **Body:** SIPTrunk object
- **Side effects:** SIP REGISTER
- **Response 201:** Created trunk

### PUT /api/v1/intercom/sip-trunks/{id}
- **Auth:** role >= site_admin
- **Response 200:** Updated trunk

### POST /api/v1/intercom/broadcast
- **Auth:** role >= admin
- **Body:**
  ```json
  {
    "message_type": "audio",
    "audio_url": "https://...",
    "text": "Thông báo: Diễn tập PCCC lúc 14:00",
    "target_device_ids": ["uuid1", "uuid2"],
    "target_all": false
  }
  ```
- **Description:** Building-wide announcement via intercom speakers
- **Side effects:** SIP multicast or device-specific push, audit log
- **Response 200:** Broadcast sent

## MQTT Topics

| Topic | Direction | QoS | Payload Schema | Description |
|-------|-----------|-----|----------------|-------------|
| `dm/{tid}/device/{did}/evt` (type: intercom.call_start) | device→server | 1 | `{caller_device_id, ring_group_id, snapshot}` | Door station call initiated |
| `dm/{tid}/device/{did}/evt` (type: intercom.call_answer) | device→server | 1 | `{call_id, answered_by_device_id}` | Call answered |
| `dm/{tid}/device/{did}/evt` (type: intercom.call_end) | device→server | 1 | `{call_id, duration_ms, result, door_unlocked}` | Call ended |
| `dm/{tid}/device/{did}/evt` (type: intercom.button_press) | device→server | 1 | `{button_id, device_id}` | Physical button pressed on door station |
| `dm/{tid}/device/{did}/cmd` (type: cmd.intercom_ring) | server→device | 2 | `{call_id, caller_name, caller_snapshot, door_station_id}` | Ring indoor monitor |
| `dm/{tid}/device/{did}/cmd` (type: cmd.intercom_stop) | server→device | 2 | `{call_id}` | Stop ringing |
| `dm/{tid}/device/{did}/cmd` (type: cmd.broadcast) | server→device | 2 | `{audio_url, text, priority}` | Announcement push |
| `dm/{tid}/device/{did}/sta` | device→server | 0 | Heartbeat with call state, SIP registration status | Device health |

## Business Rules

1. **BR-IC-001 — Ring Group Routing:** When a door station button is pressed, the call is routed to the configured ring group(s). `ring_all` = all monitors ring simultaneously. `sequential` = ring one by one with timeout. `priority` = ring highest priority first.
2. **BR-IC-002 — Fallback Routing:** If no one answers within `call_timeout_ms`, and a `fallback_group_id` is configured, the call forwards to the fallback group. Common pattern: door station → reception → guard room.
3. **BR-IC-003 — Mobile App Forwarding:** If `member_user_ids` are configured in a ring group, the call also pushes to users' mobile apps via push notification + WebRTC/SIP. User can answer from anywhere.
4. **BR-IC-004 — Door Unlock During Call:** During an active call, the answering party can unlock the linked door. The unlock command goes through access-svc (same `cmd.door` MQTT command). Audit log records who unlocked during which call.
5. **BR-IC-005 — Call Recording:** All intercom calls are recorded (configurable per site). Recordings stored in MinIO with 90-day retention default. Audio + video recorded.
6. **BR-IC-006 — Snapshot on Call:** When a door station initiates a call, a snapshot is captured and sent with the ring notification. This allows monitors/mobile app to see who's calling before answering.
7. **BR-IC-007 — Guard Station Auto-Answer:** Guard station monitors can be configured for auto-answer. Call connects immediately with 2-way audio/video. Guard confirms and unlocks.
8. **BR-IC-008 — SIP Interop:** Door stations and monitors communicate via SIP protocol. DM3's intercom-svc acts as a SIP proxy/registrar or integrates with existing PBX (Asterisk, FreeSWITCH, 3CX). Supports SIP trunking for PSTN calls.
9. **BR-IC-009 — Concurrent Call Limit:** Each door station can only have one active call. If a second visitor presses while call is active, they get a "busy" tone and the event is logged.
10. **BR-IC-010 — After-Hours Routing:** Ring groups with `active_schedule_id` are only active during schedule. Outside schedule, calls route to fallback group (typically guard station, which is 24/7).
11. **BR-IC-011 — Visitor Identification:** If the door station has a card reader or face recognition, the caller identity is resolved before/during the call. Call notification shows "Nguyễn Văn A — Nhân viên" vs "Người lạ".
12. **BR-IC-012 — Broadcast Priority:** Emergency broadcasts (from emergency-svc) override all active calls. Monitors interrupt current calls to play the emergency announcement.

## Permissions Matrix

| Action | viewer | operator | admin | site_admin | super_admin |
|--------|--------|----------|-------|------------|-------------|
| View devices | ✅ | ✅ | ✅ | ✅ | ✅ |
| View call history | ✅ | ✅ | ✅ | ✅ | ✅ |
| Answer calls | ❌ | ✅ | ✅ | ✅ | ✅ |
| Initiate calls | ❌ | ✅ | ✅ | ✅ | ✅ |
| Unlock during call | ❌ | ✅ | ✅ | ✅ | ✅ |
| Transfer calls | ❌ | ✅ | ✅ | ✅ | ✅ |
| Broadcast | ❌ | ❌ | ✅ | ✅ | ✅ |
| Add/edit devices | ❌ | ❌ | ✅ | ✅ | ✅ |
| Delete devices | ❌ | ❌ | ❌ | ✅ | ✅ |
| Manage ring groups | ❌ | ❌ | ✅ | ✅ | ✅ |
| Manage SIP trunks | ❌ | ❌ | ❌ | ✅ | ✅ |
| Listen to recordings | ❌ | ✅ | ✅ | ✅ | ✅ |

## Offline Behavior

- **Device-side:** Door stations and indoor monitors operate as a local SIP network. If the DM3 server is offline, direct SIP calls between devices on the same LAN continue working. Door station can still ring monitor, monitor can still unlock door (via direct device-to-device communication or local controller).
- **Sync strategy:** Device configuration (ring groups, SIP settings) is pushed from server. Call records are reported to server. If server is offline, calls still work locally but call history is not recorded centrally.
- **Event queuing:** Call events (start, answer, end) are buffered on devices and uploaded on reconnect. Recordings are stored locally on monitors (limited storage) and uploaded to MinIO when connected.
- **Conflict resolution:** Server wins for configuration. Devices operate autonomously for call routing using cached ring group config.
- **Local storage:** Door stations cache ring targets. Indoor monitors cache SIP registration and peer addresses. Typically 100-500 call records stored locally.
- **Mobile app calls during offline:** If server/SIP proxy is offline, mobile app cannot receive calls. Only local LAN devices work. This is an accepted limitation.

## UI Pages

| Route | Page | Key Components |
|-------|------|----------------|
| /secure/intercom | Intercom Dashboard | Device cards (door stations + monitors), stat cards (online/offline/busy), call history table, selected device config panel |

## Events & Audit Log

| Event Type | Trigger | Payload | Retention |
|------------|---------|---------|-----------|
| intercom.device.created | POST create | full device (no SIP password) | 1 year |
| intercom.device.updated | PUT update | diff | 1 year |
| intercom.device.deleted | DELETE | id + actor | permanent |
| intercom.device.offline | Heartbeat timeout | device_id, last_seen | 90 days |
| intercom.call.started | Door station button | caller_device, ring_group, snapshot | 1 year |
| intercom.call.answered | Call answered | call_id, answered_by | 1 year |
| intercom.call.missed | Timeout | call_id, caller, ring_group | 1 year |
| intercom.call.rejected | User rejected | call_id, rejected_by | 1 year |
| intercom.call.ended | Hangup | call_id, duration, result | 1 year |
| intercom.call.transferred | Transfer | call_id, from, to | 1 year |
| intercom.call.door_unlocked | Unlock during call | call_id, door_id, actor | permanent |
| intercom.broadcast.sent | Broadcast | target_devices, message, actor | 1 year |
| intercom.ring_group.created | POST create | full ring group | 1 year |
| intercom.ring_group.updated | PUT update | diff | 1 year |

## Integration Points

- **Depends on:**
  - `access-svc` — Door unlock commands (`cmd.door`)
  - `auth-svc` — JWT validation, user permissions
  - `identity-svc` — Resolve caller identity from credentials
  - `visitor-svc` — Link calls to visitor records
  - `notif-svc` — Push notifications for mobile app calls
  - MinIO — Call recording storage
- **Consumed by:**
  - `video-svc` — Door station camera feed can be viewed as CCTV
  - `emergency-svc` — Emergency broadcasts via intercom speakers
  - `automate-svc` — Call events as automation triggers
  - `report-svc` — Call analytics (answer rate, response time, peak hours)
- **External:**
  - SIP PBX (Asterisk, FreeSWITCH, 3CX)
  - Intercom hardware (Hikvision, Dahua, 2N, Akuvox)
  - WebRTC TURN/STUN servers for mobile calls

## Notes

- SIP proxy/registrar can be deployed as part of intercom-svc or use existing PBX infrastructure.
- Door stations from different brands may require different SIP profiles/codecs. Test each model.
- For residential deployments, each unit gets a "virtual ring group" mapped to the resident's mobile app.
- Video codec for intercom: H.264 Baseline Profile recommended for widest compatibility.
- Audio codec: Opus preferred for quality; G.711 as fallback for legacy devices.
- Call recording storage: ~1MB per minute of audio+video. Plan MinIO capacity accordingly.
