# Feature: CCTV / Video Surveillance

> Domain: SECURE | Color: #EF4444 | Priority: P0
> Status: Draft | Owner: SECURE Team

## Overview

The CCTV system provides unified video surveillance management across multi-brand IP cameras and NVRs. It supports live viewing (multi-camera grid with PTZ control), recorded playback with timeline search, event-linked video clips, and NVR health monitoring. Video streaming uses **go2rtc** as the RTSP→WebRTC/HLS proxy for low-latency browser viewing. Cameras are managed server-side; recording happens on NVRs. The system integrates with Access Control (event-linked clips) and AI Detection (video analytics feed).

## Data Models

### Camera
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | - | Tenant isolation |
| site_id | uuid | yes | - | Site |
| name | string(100) | yes | - | Display name, e.g. "CAM-01" |
| location | string(200) | yes | - | e.g. "Sảnh chính" |
| floor | string(50) | no | null | e.g. "Tầng 1" |
| building | string(100) | no | null | e.g. "Tòa nhà A" |
| zone_id | uuid | no | null | Zone grouping |
| status | CameraStatusEnum | yes | offline | Connection status |
| brand | string(50) | no | null | Hikvision, Dahua, Hanwha, etc. |
| model | string(100) | no | null | Camera model |
| ip_address | inet | yes | - | Camera IP |
| port | int | yes | 554 | RTSP port |
| rtsp_url | string(500) | yes | - | RTSP stream URL |
| rtsp_sub_url | string(500) | no | null | Sub-stream URL (lower quality) |
| onvif_url | string(500) | no | null | ONVIF service URL |
| username | string(100) | yes | - | Camera auth (encrypted) |
| password | string(200) | yes | - | Camera auth (encrypted at rest) |
| nvr_id | uuid | no | null | Associated NVR |
| nvr_channel | int | no | null | Channel number on NVR |
| resolution | string(20) | no | null | e.g. "1920x1080" |
| fps | int | no | 25 | Frame rate |
| codec | string(20) | no | H.264 | H.264, H.265 |
| ptz_capable | boolean | yes | false | PTZ support |
| audio_enabled | boolean | yes | false | Audio capture |
| has_ir | boolean | yes | false | Infrared/night vision |
| ai_enabled | boolean | yes | false | Feed to AI detection |
| recording_mode | RecordingModeEnum | yes | continuous | Recording behavior |
| retention_days | int | yes | 30 | Recording retention |
| go2rtc_stream_id | string(100) | no | null | go2rtc stream identifier |
| linked_door_id | uuid | no | null | Linked access point |
| last_snapshot_at | timestamp | no | null | Last snapshot time |
| last_heartbeat_at | timestamp | no | null | Last ONVIF heartbeat |
| metadata | jsonb | no | {} | Extra data |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### NVR
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | - | Tenant isolation |
| site_id | uuid | yes | - | Site |
| name | string(100) | yes | - | e.g. "NVR-01 (Tòa nhà A)" |
| brand | string(50) | no | null | Brand |
| model | string(100) | no | null | Model |
| ip_address | inet | yes | - | NVR IP |
| port | int | yes | 80 | Web port |
| username | string(100) | yes | - | Auth (encrypted) |
| password | string(200) | yes | - | Auth (encrypted at rest) |
| status | NVRStatusEnum | yes | offline | Connection status |
| max_channels | int | yes | 16 | Max camera channels |
| active_channels | int | yes | 0 | Currently active channels |
| storage_total_gb | int | yes | - | Total storage capacity |
| storage_used_gb | int | yes | 0 | Used storage |
| storage_health | StorageHealthEnum | yes | healthy | Storage status |
| firmware_version | string(50) | no | null | Firmware |
| onvif_url | string(500) | no | null | ONVIF URL |
| last_heartbeat_at | timestamp | no | null | Last health check |
| metadata | jsonb | no | {} | Extra data |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### VideoClip
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | - | Tenant isolation |
| camera_id | uuid | yes | - | Source camera |
| start_time | timestamptz | yes | - | Clip start |
| end_time | timestamptz | yes | - | Clip end |
| duration_s | int | yes | - | Duration in seconds |
| trigger_type | ClipTriggerEnum | yes | - | What triggered extraction |
| trigger_ref_id | uuid | no | null | Reference (access event, AI event, etc.) |
| storage_path | string(500) | yes | - | MinIO object path |
| file_size_bytes | bigint | yes | - | File size |
| thumbnail_path | string(500) | no | null | Thumbnail image path |
| status | ClipStatusEnum | yes | pending | Extraction status |
| requested_by | uuid | no | null | User who requested (if manual) |
| metadata | jsonb | no | {} | Extra data |
| created_at | timestamp | yes | now() | Creation time |

### VideoBookmark
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | - | Tenant isolation |
| camera_id | uuid | yes | - | Camera |
| timestamp | timestamptz | yes | - | Bookmarked moment |
| label | string(200) | yes | - | User label |
| notes | text | no | null | Notes |
| created_by | uuid | yes | - | User |
| created_at | timestamp | yes | now() | Creation time |

### Enums
```
CameraStatusEnum: online | offline | recording | error
NVRStatusEnum: online | offline | error | maintenance
StorageHealthEnum: healthy | warning | critical | full
RecordingModeEnum: continuous | motion | event | schedule | off
ClipTriggerEnum: manual | access_event | ai_event | alarm | motion
ClipStatusEnum: pending | extracting | ready | failed | expired
```

## API Endpoints

### GET /api/v1/video/cameras
- **Auth:** Bearer token, role >= viewer
- **Query params:**
  | Param | Type | Default | Description |
  |-------|------|---------|-------------|
  | page | int | 1 | Page number |
  | limit | int | 20 | Max 100 |
  | site_id | uuid | required | Site filter |
  | status | string | - | online,offline,recording,error |
  | floor | string | - | Floor filter |
  | nvr_id | uuid | - | NVR filter |
  | ai_enabled | boolean | - | AI-enabled only |
  | search | string | - | Name, location search |
- **Response 200:**
  ```json
  {
    "data": [
      {
        "id": "uuid",
        "name": "CAM-01",
        "location": "Sảnh chính",
        "floor": "Tầng 1",
        "status": "recording",
        "fps": 30,
        "nvr": { "id": "uuid", "name": "NVR-01 (Tòa nhà A)" },
        "ptz_capable": false,
        "ai_enabled": true,
        "linked_door_id": "uuid"
      }
    ],
    "total": 16,
    "page": 1,
    "limit": 20
  }
  ```

### GET /api/v1/video/cameras/{id}
- **Auth:** role >= viewer
- **Response 200:** Full camera with NVR info, linked door, recent clips, stream URLs

### POST /api/v1/video/cameras
- **Auth:** role >= admin
- **Body:**
  ```json
  {
    "name": "CAM-17",
    "site_id": "uuid",
    "location": "Hành lang D Tầng 2",
    "floor": "Tầng 2",
    "ip_address": "192.168.1.117",
    "rtsp_url": "rtsp://192.168.1.117:554/Streaming/Channels/101",
    "username": "admin",
    "password": "encrypted_password",
    "nvr_id": "uuid",
    "nvr_channel": 17,
    "recording_mode": "continuous",
    "retention_days": 30
  }
  ```
- **Side effects:** Audit log, register stream in go2rtc, ONVIF probe for capabilities
- **Response 201:** Created camera

### PUT /api/v1/video/cameras/{id}
- **Auth:** role >= admin
- **Body:** Partial update
- **Side effects:** Audit log, update go2rtc stream config if RTSP URL changed
- **Response 200:** Updated camera

### DELETE /api/v1/video/cameras/{id}
- **Auth:** role >= site_admin
- **Side effects:** Audit log, remove go2rtc stream, unlink from doors/AI
- **Response 204**
- **Errors:** 401, 403, 404

### GET /api/v1/video/cameras/{id}/stream
- **Auth:** role >= viewer
- **Query params:**
  | Param | Type | Default | Description |
  |-------|------|---------|-------------|
  | format | string | webrtc | webrtc, hls, mse |
  | quality | string | main | main (high), sub (low) |
- **Response 200:**
  ```json
  {
    "stream_id": "cam-01",
    "format": "webrtc",
    "sdp_offer_url": "https://go2rtc.local/api/webrtc?src=cam-01",
    "hls_url": "https://go2rtc.local/api/stream.m3u8?src=cam-01",
    "ice_servers": [
      { "urls": "stun:stun.l.google.com:19302" }
    ],
    "expires_at": "2026-02-19T10:15:00Z"
  }
  ```

### POST /api/v1/video/cameras/{id}/snapshot
- **Auth:** role >= viewer
- **Response 200:** `{ "url": "https://...", "captured_at": "...", "width": 1920, "height": 1080 }`
- **Side effects:** ONVIF snapshot command or go2rtc frame grab

### POST /api/v1/video/cameras/{id}/ptz
- **Auth:** role >= operator
- **Body:**
  ```json
  {
    "action": "move",
    "pan": 0.5,
    "tilt": -0.3,
    "zoom": 0.0,
    "speed": 0.5,
    "preset": null
  }
  ```
- **Errors:** 403 (not PTZ capable), 503 (camera offline)

### GET /api/v1/video/cameras/{id}/playback
- **Auth:** role >= viewer
- **Query params:**
  | Param | Type | Default | Description |
  |-------|------|---------|-------------|
  | from | timestamp | required | Start time |
  | to | timestamp | required | End time |
  | speed | float | 1.0 | Playback speed (0.25-16x) |
- **Response 200:**
  ```json
  {
    "playback_url": "https://go2rtc.local/api/webrtc?src=cam-01-playback&from=...",
    "segments": [
      { "start": "2026-02-19T08:00:00Z", "end": "2026-02-19T09:00:00Z", "available": true }
    ],
    "gaps": []
  }
  ```

### POST /api/v1/video/cameras/{id}/clips
- **Auth:** role >= operator
- **Body:**
  ```json
  {
    "start_time": "2026-02-19T09:15:00Z",
    "end_time": "2026-02-19T09:16:00Z",
    "trigger_type": "manual",
    "label": "Sự cố cửa phòng server"
  }
  ```
- **Side effects:** Async clip extraction job, audit log
- **Response 202:**
  ```json
  { "clip_id": "uuid", "status": "pending", "estimated_seconds": 30 }
  ```

### GET /api/v1/video/clips
- **Auth:** role >= viewer
- **Query params:** site_id, camera_id, trigger_type, from, to, page, limit
- **Response 200:** Paginated clips with download URLs

### GET /api/v1/video/clips/{id}/download
- **Auth:** role >= viewer
- **Response 302:** Redirect to MinIO pre-signed URL (1h expiry)

### GET /api/v1/video/nvrs
- **Auth:** role >= viewer
- **Query params:** site_id (required), status, page, limit
- **Response 200:** Paginated NVR list with storage stats

### POST /api/v1/video/nvrs
- **Auth:** role >= admin
- **Body:** NVR creation payload
- **Side effects:** Audit log, ONVIF discovery for channels
- **Response 201:** Created NVR

### PUT /api/v1/video/nvrs/{id}
- **Auth:** role >= admin
- **Response 200:** Updated NVR

### GET /api/v1/video/nvrs/{id}/health
- **Auth:** role >= operator
- **Response 200:**
  ```json
  {
    "nvr_id": "uuid",
    "status": "online",
    "uptime_hours": 720,
    "storage_used_gb": 2800,
    "storage_total_gb": 4000,
    "storage_pct": 70,
    "storage_health": "healthy",
    "estimated_days_remaining": 14,
    "active_channels": 8,
    "failed_channels": [],
    "temperature_c": 42,
    "last_check": "2026-02-19T09:00:00Z"
  }
  ```

### POST /api/v1/video/bookmarks
- **Auth:** role >= operator
- **Body:** `{ "camera_id": "uuid", "timestamp": "...", "label": "Người lạ khu vực kho", "notes": "..." }`
- **Response 201:** Created bookmark

### GET /api/v1/video/bookmarks
- **Auth:** role >= viewer
- **Query params:** site_id, camera_id, from, to, page, limit
- **Response 200:** Paginated bookmarks

## MQTT Topics

| Topic | Direction | QoS | Payload Schema | Description |
|-------|-----------|-----|----------------|-------------|
| `dm/{tid}/device/{did}/sta` (camera heartbeat) | device→server | 0 | `{type:"status.camera", data:{camera_id, status, fps, bitrate_kbps, uptime_s}}` | Camera health from NVR/device |
| `dm/{tid}/device/{did}/evt` (type: camera.motion) | device→server | 1 | `{camera_id, region, intensity, snapshot}` | Motion detection event from camera |
| `dm/{tid}/device/{did}/evt` (type: camera.tamper) | device→server | 1 | `{camera_id, tamper_type: "covered|moved|defocused"}` | Camera tamper detection |
| `dm/{tid}/device/{did}/evt` (type: nvr.storage) | device→server | 1 | `{nvr_id, storage_used_gb, storage_total_gb, health}` | NVR storage alert |
| `dm/{tid}/device/{did}/cmd` (type: cmd.snapshot) | server→device | 2 | `{camera: "main", quality: 85, max_width: 1280}` | Capture snapshot command |

## Business Rules

1. **BR-CC-001 — go2rtc Proxy:** All video streams to web/mobile clients go through go2rtc. Direct RTSP access to cameras is never exposed to end users. go2rtc handles RTSP→WebRTC (low latency) and RTSP→HLS (compatibility fallback).
2. **BR-CC-002 — Stream Authentication:** go2rtc stream URLs include a time-limited JWT token (1 hour). Expired tokens are rejected. Token includes tenant_id, user_id, camera_ids the user can view.
3. **BR-CC-003 — Storage Alerts:** When NVR storage exceeds 80%, emit a `warning` alert. At 95%, emit a `critical` alert. At 100%, oldest recordings are overwritten (circular buffer on NVR).
4. **BR-CC-004 — Camera Offline Detection:** If no heartbeat from camera/NVR for 60 seconds, status changes to `offline`. An alert is created and pushed to operators.
5. **BR-CC-005 — Recording Retention:** Clips and recordings are retained for `retention_days` per camera configuration. After expiry, recordings are deleted from NVR. Extracted clips in MinIO follow separate retention (1 year default).
6. **BR-CC-006 — Event-Linked Clips:** When an access event occurs at a door with `camera_id` set, automatically extract a 10-second clip (5s before, 5s after) and link to the access event. Async job, best-effort.
7. **BR-CC-007 — Multi-Camera Grid:** Users can view up to 16 cameras simultaneously in a grid (1×1, 2×2, 3×3, 4×4). Each stream uses sub-stream quality in grid mode, main stream in single view.
8. **BR-CC-008 — PTZ Access Control:** PTZ operations require `operator` role or higher. PTZ commands are logged in audit. Concurrent PTZ from multiple users: last command wins.
9. **BR-CC-009 — Credential Security:** Camera/NVR passwords are encrypted at rest (AES-256-GCM) and never returned in API responses. Only `***` placeholder shown.
10. **BR-CC-010 — ONVIF Discovery:** On NVR creation, system probes ONVIF to discover connected cameras and auto-populates camera entries. Admin reviews and confirms.
11. **BR-CC-011 — Playback Gap Detection:** When requesting playback, system reports recording gaps so the UI can display them on the timeline. Gaps are detected from NVR recording metadata.
12. **BR-CC-012 — Camera Tamper Alert:** Camera built-in tamper detection (covered, moved, defocused) triggers immediate critical alert with snapshot.

## Permissions Matrix

| Action | viewer | operator | admin | site_admin | super_admin |
|--------|--------|----------|-------|------------|-------------|
| View camera list | ✅ | ✅ | ✅ | ✅ | ✅ |
| Live view | ✅ | ✅ | ✅ | ✅ | ✅ |
| Playback | ✅ | ✅ | ✅ | ✅ | ✅ |
| Take snapshot | ✅ | ✅ | ✅ | ✅ | ✅ |
| PTZ control | ❌ | ✅ | ✅ | ✅ | ✅ |
| Extract clip | ❌ | ✅ | ✅ | ✅ | ✅ |
| Create bookmark | ❌ | ✅ | ✅ | ✅ | ✅ |
| Add/edit cameras | ❌ | ❌ | ✅ | ✅ | ✅ |
| Delete cameras | ❌ | ❌ | ❌ | ✅ | ✅ |
| Add/edit NVRs | ❌ | ❌ | ✅ | ✅ | ✅ |
| Delete NVRs | ❌ | ❌ | ❌ | ✅ | ✅ |
| View NVR health | ❌ | ✅ | ✅ | ✅ | ✅ |
| Download clips | ✅ | ✅ | ✅ | ✅ | ✅ |

## Offline Behavior

- **Device-side:** Cameras and NVRs operate completely independently of the DM3 server. Recording continues on NVR regardless of server connectivity. NVRs have their own storage and circular buffer management.
- **Sync strategy:** Camera/NVR configuration is managed server-side only (not synced to devices like access control). Loss of server connectivity means: no live view through go2rtc, no clip extraction, no new alerts — but recording continues on NVR.
- **Reconnection:** On server reconnect, NVR health is re-polled, camera statuses are re-evaluated, any missed motion/tamper events stored on NVR are re-ingested (if NVR supports event replay).
- **Conflict resolution:** Server is source of truth for camera configuration. NVR is source of truth for recorded footage.
- **Local storage:** NVRs store all recordings locally. go2rtc buffers are in-memory only (no persistence). Extracted clips are stored in MinIO.
- **Edge case:** If go2rtc crashes, live streams drop but NVR recording continues. go2rtc auto-restarts and re-establishes RTSP connections.

## UI Pages

| Route | Page | Key Components |
|-------|------|----------------|
| /secure/cctv | Camera Grid | NVR stats bar, grid size selector (1×1 to 4×4), camera cards with status, floor filter |
| /secure/cctv/:id | Camera Detail | Large video player, PTZ controls, camera info panel, NVR info, playback timeline, recording status |

## Events & Audit Log

| Event Type | Trigger | Payload | Retention |
|------------|---------|---------|-----------|
| video.camera.created | POST create | full camera (no password) | 1 year |
| video.camera.updated | PUT update | diff (no password) | 1 year |
| video.camera.deleted | DELETE | id + actor | permanent |
| video.camera.offline | Heartbeat timeout | camera_id, last_seen | 90 days |
| video.camera.tampered | Camera tamper event | camera_id, tamper_type, snapshot | permanent |
| video.ptz.moved | PTZ command | camera_id, actor, pan/tilt/zoom | 90 days |
| video.clip.extracted | Clip ready | clip_id, camera_id, trigger, duration | 1 year |
| video.clip.downloaded | Download request | clip_id, actor | 90 days |
| video.nvr.created | POST create | full NVR (no password) | 1 year |
| video.nvr.storage_warning | Storage >80% | nvr_id, used_gb, total_gb | 90 days |
| video.nvr.storage_critical | Storage >95% | nvr_id, used_gb, total_gb | 1 year |
| video.bookmark.created | POST bookmark | bookmark_id, camera_id, timestamp, label | 1 year |

## Integration Points

- **Depends on:**
  - `go2rtc` — RTSP→WebRTC/HLS proxy (deployed as sidecar)
  - `auth-svc` — JWT validation, stream token generation
  - MinIO — Clip and snapshot storage
- **Consumed by:**
  - `access-svc` — Event-linked video clips (door camera)
  - `vision-svc` — AI video analytics feed (RTSP sub-stream)
  - `alarm-svc` — Alarm verification via camera snapshot
  - `intercom-svc` — Door station video feed
  - `automate-svc` — Camera events trigger automation rules
  - `patrol-svc` — Guard can view cameras from mobile during patrol
- **External:**
  - IP cameras (ONVIF, proprietary SDKs for Hikvision/Dahua)
  - NVRs (ONVIF, ISAPI, proprietary APIs)

## Notes

- go2rtc is deployed as a separate container/process. video-svc manages go2rtc configuration via its REST API.
- Camera passwords should be rotated regularly. System can auto-rotate if camera supports ONVIF password change.
- For large deployments (100+ cameras), consider multiple go2rtc instances with load balancing.
- Sub-streams (lower resolution, ~720p) should be used for grid view and AI analytics. Main stream for single camera view and clip extraction.
- NVR storage calculation: 1080p@25fps H.265 ≈ 1.5 TB/camera/month. Plan accordingly.
