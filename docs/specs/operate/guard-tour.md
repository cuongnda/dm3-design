# Feature: Guard Tour & Patrol

> Domain: OPERATE | Color: #4CAF50 | Priority: P1
> Status: NOT IMPLEMENTED | Owner: patrol-svc team

## Overview
Guard Tour manages security patrol routes, checkpoint verification (NFC/QR), real-time tracking, incident reporting, and shift handover. Guards execute assigned patrol routes via mobile app, scanning NFC tags or QR codes at each checkpoint. The system monitors compliance in real-time, alerts supervisors of missed checkpoints, and provides comprehensive patrol analytics.

## Data Models

### PatrolRoute
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | — | Tenant reference |
| site_id | uuid | yes | — | Site reference |
| name | text | yes | — | Route name (e.g., "Tuyến tuần tra khu A — Đêm") |
| description | text | no | — | Route description |
| checkpoints | jsonb | yes | — | Ordered checkpoint list (see below) |
| estimated_duration_min | int | yes | — | Expected duration in minutes |
| distance_meters | int | no | — | Estimated route distance |
| schedule | jsonb | no | — | Recurring schedule {days, times, shifts} |
| max_deviation_min | int | yes | 10 | Max minutes late per checkpoint |
| sequential | bool | yes | true | Must visit checkpoints in order |
| active | bool | yes | true | Active flag |
| map_path | jsonb | no | — | GPS/floor-map waypoints |
| photo_refs | text[] | no | — | Route reference photos |
| metadata | jsonb | no | {} | Custom fields |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### Checkpoint
Embedded in PatrolRoute.checkpoints as JSONB array:
```json
[{
  "id": "uuid",
  "name": "Cổng chính — Gate 1",
  "type": "nfc",
  "tag_id": "NFC-A1B2C3D4",
  "location": {"lat": 10.77, "lng": 106.69, "floor": "G", "zone": "Entrance"},
  "sequence": 1,
  "time_window_min": 5,
  "instructions": "Kiểm tra cổng đóng, camera hoạt động",
  "required_actions": ["photo"],
  "estimated_time_min": 3
}]
```

### CheckpointTag
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | — | Tenant reference |
| site_id | uuid | yes | — | Site reference |
| tag_type | TagType | yes | — | nfc / qr / bluetooth |
| tag_id | text | yes | — | NFC UID or QR code value |
| name | text | yes | — | Location name |
| location | jsonb | yes | — | Physical location |
| status | text | yes | active | active / damaged / replaced |
| installed_at | date | no | — | Installation date |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### PatrolTour
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | — | Tenant reference |
| site_id | uuid | yes | — | Site reference |
| route_id | uuid | yes | — | Route being patrolled |
| guard_id | uuid | yes | — | Assigned guard |
| shift_id | uuid | no | — | Shift reference |
| status | TourStatus | yes | scheduled | Current status |
| scheduled_start | timestamptz | yes | — | Planned start time |
| scheduled_end | timestamptz | yes | — | Planned end time |
| actual_start | timestamptz | no | — | Actual start time |
| actual_end | timestamptz | no | — | Actual end time |
| scans | jsonb | no | [] | Checkpoint scan records (see below) |
| total_checkpoints | int | yes | — | Total checkpoints in route |
| scanned_checkpoints | int | yes | 0 | Successfully scanned |
| missed_checkpoints | int | yes | 0 | Missed checkpoints |
| incidents | jsonb | no | [] | Incidents reported during tour |
| gps_track | jsonb | no | [] | GPS breadcrumb trail |
| completion_percent | decimal(5,2) | no | 0 | Completion percentage |
| notes | text | no | — | Tour notes |
| handover_notes | text | no | — | Shift handover notes |
| metadata | jsonb | no | {} | Custom fields |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### Scan Record (embedded in PatrolTour.scans)
```json
[{
  "checkpoint_id": "uuid",
  "checkpoint_name": "Cổng chính",
  "scanned_at": "2026-02-19T22:15:00+07:00",
  "scan_method": "nfc",
  "tag_id": "NFC-A1B2C3D4",
  "on_time": true,
  "deviation_min": 0,
  "location": {"lat": 10.77, "lng": 106.69},
  "photo_ref": "minio://patrol/scan/img001.jpg",
  "notes": "OK — Cổng đã khóa"
}]
```

### Incident
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | — | Tenant reference |
| site_id | uuid | yes | — | Site reference |
| tour_id | uuid | no | — | Related tour |
| guard_id | uuid | yes | — | Reporting guard |
| type | IncidentType | yes | — | Incident category |
| severity | text | yes | medium | low / medium / high / critical |
| title | text | yes | — | Short description |
| description | text | no | — | Detailed description |
| location | jsonb | yes | — | Incident location |
| photo_refs | text[] | no | — | Evidence photos |
| video_refs | text[] | no | — | Evidence videos |
| status | text | yes | reported | reported / acknowledged / investigating / resolved / closed |
| assigned_to | uuid | no | — | Assigned investigator |
| resolution | text | no | — | Resolution description |
| resolved_at | timestamptz | no | — | Resolution time |
| metadata | jsonb | no | {} | Custom fields |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### ShiftHandover
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | — | Tenant reference |
| site_id | uuid | yes | — | Site reference |
| outgoing_guard_id | uuid | yes | — | Guard ending shift |
| incoming_guard_id | uuid | yes | — | Guard starting shift |
| shift_date | date | yes | — | Shift date |
| shift_type | text | yes | — | morning / afternoon / night |
| handover_time | timestamptz | yes | — | Actual handover time |
| notes | text | yes | — | Handover notes |
| pending_issues | jsonb | no | [] | Unresolved issues |
| equipment_checklist | jsonb | no | [] | Equipment status check |
| acknowledged | bool | yes | false | Incoming guard acknowledged |
| acknowledged_at | timestamptz | no | — | Acknowledgment time |
| created_at | timestamp | yes | now() | Creation time |

### Enums
```
TagType: nfc | qr | bluetooth
TourStatus: scheduled | in_progress | completed | missed | cancelled
IncidentType: security_breach | suspicious_person | equipment_damage | safety_hazard | unauthorized_access | fire_smoke | water_leak | noise_complaint | trespassing | other
```

## API Endpoints

### GET /api/v1/patrol/routes
- **Auth:** Bearer token, role >= viewer
- **Query params:**
  | Param | Type | Default | Description |
  |-------|------|---------|-------------|
  | site_id | uuid | required | Filter by site |
  | active | bool | — | Filter active only |
- **Response 200:**
  ```json
  {
    "data": [{
      "id": "uuid",
      "name": "Tuyến tuần tra khu A — Đêm",
      "checkpoints_count": 12,
      "estimated_duration_min": 45,
      "schedule": {"days": ["mon","tue","wed","thu","fri","sat","sun"], "times": ["22:00","02:00"]},
      "active": true,
      "last_completed_tour": "2026-02-19T02:48:00+07:00",
      "compliance_percent": 95.2
    }],
    "total": 6
  }
  ```

### POST /api/v1/patrol/routes
- **Auth:** role >= admin
- **Body:**
  ```json
  {
    "site_id": "uuid",
    "name": "Tuyến tuần tra khu A — Đêm",
    "checkpoints": [
      {"name": "Cổng chính", "type": "nfc", "tag_id": "NFC-A1B2C3D4", "location": {"floor": "G"}, "sequence": 1, "instructions": "Kiểm tra cổng đóng"}
    ],
    "estimated_duration_min": 45,
    "max_deviation_min": 10,
    "sequential": true,
    "schedule": {"days": ["mon","tue","wed","thu","fri","sat","sun"], "times": ["22:00","02:00"]}
  }
  ```
- **Response 201:** Created route

### PUT /api/v1/patrol/routes/{id}
- **Auth:** role >= admin
- **Response 200:** Updated route

### DELETE /api/v1/patrol/routes/{id}
- **Auth:** role >= site_admin
- **Response 204:** No content

### GET /api/v1/patrol/tours
- **Auth:** role >= operator
- **Query params:** site_id, route_id, guard_id, status, from, to, shift_type
- **Response 200:**
  ```json
  {
    "data": [{
      "id": "uuid",
      "route": {"id": "uuid", "name": "Tuyến tuần tra khu A — Đêm"},
      "guard": {"id": "uuid", "name": "Lê Văn C"},
      "status": "completed",
      "scheduled_start": "2026-02-19T22:00:00+07:00",
      "actual_start": "2026-02-19T22:02:00+07:00",
      "actual_end": "2026-02-19T22:48:00+07:00",
      "completion_percent": 100,
      "scanned_checkpoints": 12,
      "missed_checkpoints": 0,
      "incidents_count": 1
    }],
    "total": 120
  }
  ```

### POST /api/v1/patrol/tours
- **Auth:** system (scheduler) or role >= admin
- **Body:** `{"route_id": "uuid", "guard_id": "uuid", "scheduled_start": "...", "scheduled_end": "..."}`
- **Side effects:** Notify guard, create scheduled tour
- **Response 201:** Created tour

### POST /api/v1/patrol/tours/{id}/start
- **Auth:** assigned guard
- **Body:** `{"location": {"lat": 10.77, "lng": 106.69}}`
- **Side effects:** Set actual_start, status → in_progress, start GPS tracking, audit log
- **Response 200:** Updated tour

### POST /api/v1/patrol/tours/{id}/scan
- **Auth:** assigned guard
- **Body:**
  ```json
  {
    "checkpoint_id": "uuid",
    "tag_id": "NFC-A1B2C3D4",
    "scan_method": "nfc",
    "location": {"lat": 10.77, "lng": 106.69},
    "photo_ref": "minio://patrol/scan/img001.jpg",
    "notes": "OK — Cổng đã khóa"
  }
  ```
- **Validation:** Verify tag_id matches checkpoint, check sequence if sequential route, validate GPS proximity
- **Side effects:** Update scanned_checkpoints, check time deviation, audit log
- **Response 200:** Updated tour with scan result

### POST /api/v1/patrol/tours/{id}/complete
- **Auth:** assigned guard
- **Body:** `{"notes": "Tuyến đường an toàn, không có sự cố", "handover_notes": "Cổng B cần kiểm tra thêm"}`
- **Side effects:** Set actual_end, calculate completion_percent, flag missed checkpoints, audit log
- **Response 200:** Completed tour

### POST /api/v1/patrol/tours/{id}/incident
- **Auth:** assigned guard or role >= operator
- **Body:**
  ```json
  {
    "type": "suspicious_person",
    "severity": "high",
    "title": "Người lạ khu vực sảnh lúc 2h sáng",
    "description": "Nam giới, khoảng 30 tuổi, mặc áo đen, đi quanh sảnh.",
    "location": {"lat": 10.77, "lng": 106.69, "floor": "G", "zone": "Lobby"},
    "photo_refs": ["minio://patrol/incident/img001.jpg"]
  }
  ```
- **Side effects:** Create incident, alert security supervisor, link to video-svc for camera lookup, audit log
- **Response 201:** Created incident

### GET /api/v1/patrol/incidents
- **Auth:** role >= operator
- **Query params:** site_id, type, severity, status, guard_id, from, to
- **Response 200:** Incident list

### PUT /api/v1/patrol/incidents/{id}
- **Auth:** role >= admin
- **Body:** Status updates, assignment, resolution
- **Response 200:** Updated incident

### GET /api/v1/patrol/checkpoint-tags
- **Auth:** role >= admin
- **Query params:** site_id, type, status
- **Response 200:** Tag registry

### POST /api/v1/patrol/checkpoint-tags
- **Auth:** role >= admin
- **Body:** Tag registration
- **Response 201:** Created tag

### POST /api/v1/patrol/shift-handover
- **Auth:** outgoing guard
- **Body:**
  ```json
  {
    "site_id": "uuid",
    "incoming_guard_id": "uuid",
    "shift_type": "night",
    "notes": "Ca trực bình thường. Cổng B camera lỗi đã báo IT.",
    "pending_issues": [{"description": "Camera cổng B offline", "severity": "medium"}],
    "equipment_checklist": [
      {"item": "Bộ đàm", "status": "ok"},
      {"item": "Đèn pin", "status": "ok"},
      {"item": "Chìa khóa tủ điện", "status": "ok"}
    ]
  }
  ```
- **Side effects:** Notify incoming guard, audit log
- **Response 201:** Created handover

### POST /api/v1/patrol/shift-handover/{id}/acknowledge
- **Auth:** incoming guard
- **Response 200:** Handover acknowledged

### GET /api/v1/patrol/dashboard
- **Auth:** role >= operator
- **Query params:** site_id, from, to
- **Response 200:**
  ```json
  {
    "tours_today": {"completed": 8, "in_progress": 1, "missed": 0, "scheduled": 4},
    "compliance_percent": 96.5,
    "avg_completion_percent": 98.2,
    "incidents_today": 2,
    "open_incidents": 5,
    "guards_on_duty": 4,
    "missed_checkpoints_today": 3,
    "active_tours": [{
      "guard": "Lê Văn C",
      "route": "Tuyến khu A",
      "progress_percent": 67,
      "last_scan": "2026-02-19T22:30:00+07:00",
      "on_schedule": true
    }]
  }
  ```

## MQTT Topics

| Topic | Direction | QoS | Payload Schema | Description |
|-------|-----------|-----|----------------|-------------|
| dm3/{site}/patrol/tour/{id}/scan | device→server | 1 | `{"checkpoint_id":"...","tag_id":"...","location":{...},"timestamp":"..."}` | Checkpoint scan from mobile |
| dm3/{site}/patrol/tour/{id}/location | device→server | 0 | `{"lat":10.77,"lng":106.69,"accuracy":5,"timestamp":"..."}` | Guard GPS location update |
| dm3/{site}/patrol/tour/{id}/status | server→device | 1 | `{"status":"in_progress","next_checkpoint":"Cổng B","time_remaining_min":5}` | Tour status push to guard |
| dm3/{site}/patrol/alert/missed | server→client | 1 | `{"tour_id":"...","guard":"...","checkpoint":"...","overdue_min":5}` | Missed checkpoint alert to supervisor |
| dm3/{site}/patrol/incident/new | server→client | 1 | `{"incident_id":"...","type":"...","severity":"high","location":{...}}` | New incident alert |

## Business Rules
1. **Missed checkpoint detection:** IF checkpoint not scanned within scheduled_time + max_deviation_min THEN mark checkpoint as missed, alert supervisor immediately via push notification.
2. **Tour auto-miss:** IF tour not started within 15 minutes of scheduled_start THEN mark tour as "missed", alert supervisor, create incident record.
3. **Sequential enforcement:** IF route.sequential = true AND guard scans checkpoint out of sequence THEN accept scan but flag as "out of order" and log deviation.
4. **GPS proximity validation:** IF guard GPS location > 50 meters from checkpoint location THEN accept scan but flag as "location mismatch" for review.
5. **Tag fraud detection:** IF same NFC tag scanned with < 1 minute interval THEN reject duplicate scan. IF multiple tags scanned too quickly (< time between checkpoints / 3) THEN flag for rapid-scan review.
6. **Incident auto-escalation:** IF incident severity = critical THEN immediately notify all on-duty supervisors, site_admin, and trigger video recording at nearest camera.
7. **Shift handover required:** IF guard shift ends THEN handover must be completed before new guard starts. If no handover within 30 min, alert supervisor.
8. **Minimum tour completion:** IF tour completion < 80% THEN flag for supervisor review. Guard must provide explanation for missed checkpoints.
9. **Weather/emergency override:** IF emergency mode active on site THEN all non-essential patrols auto-cancelled, guards redirected to emergency posts.
10. **Guard fatigue prevention:** IF guard has completed > 4 consecutive tours without break THEN alert supervisor of fatigue risk.
11. **Photo requirement:** IF checkpoint.required_actions includes "photo" THEN scan without photo attachment is flagged as incomplete.
12. **Night tour enhanced tracking:** IF tour scheduled between 22:00-06:00 THEN GPS update frequency increased to every 30 seconds (vs 2 min daytime).
13. **Compliance scoring:** Route compliance = (scanned_on_time / total_checkpoints) × 100. Guard compliance = avg compliance across all tours. Monthly compliance report auto-generated.

## Permissions Matrix

| Action | viewer | operator (guard) | admin | site_admin | super_admin |
|--------|--------|------------------|-------|------------|-------------|
| View dashboard | ✅ | ✅ | ✅ | ✅ | ✅ |
| View tours | ✅ | ✅ | ✅ | ✅ | ✅ |
| Execute tour (scan/start/complete) | ❌ | ✅* | ❌ | ❌ | ❌ |
| Report incident | ❌ | ✅ | ✅ | ✅ | ✅ |
| Manage incidents | ❌ | ❌ | ✅ | ✅ | ✅ |
| Manage routes | ❌ | ❌ | ✅ | ✅ | ✅ |
| Manage checkpoint tags | ❌ | ❌ | ✅ | ✅ | ✅ |
| Assign tours | ❌ | ❌ | ✅ | ✅ | ✅ |
| Create shift handover | ❌ | ✅* | ✅ | ✅ | ✅ |
| View guard location | ❌ | ❌ | ✅ | ✅ | ✅ |
| Delete routes | ❌ | ❌ | ❌ | ✅ | ✅ |
| Export reports | ❌ | ❌ | ✅ | ✅ | ✅ |

*\* guard can only execute tours assigned to them and create their own handovers*

## Offline Behavior
- **Mobile app (guard):** Cache assigned tours with all checkpoint data (tag IDs, GPS coordinates, instructions). Allow full tour execution offline — NFC/QR scanning works locally. Queue all scans, incidents, GPS tracks for sync.
- **NFC scanning:** NFC tag reading is purely local — no server connection needed. Tag validation against cached checkpoint data.
- **Photo capture:** Photos stored locally, queued for upload. Thumbnails created immediately, full resolution synced when online.
- **GPS tracking:** GPS track buffered locally (up to 24h of breadcrumbs). Batch-uploaded on reconnection.
- **Sync strategy:** On reconnection, push all queued scans with original timestamps. Server calculates on-time/missed status based on scan timestamps (not sync time). Incidents synced with priority.
- **Conflict resolution:** Scans are append-only, no conflicts. Tour status: server reconciles based on all received scans. If tour was marked "missed" by server but guard was scanning offline, server auto-corrects status.
- **Local storage:** Tour data: ~200KB per tour (checkpoints, map data). GPS buffer: ~5MB for 24h. Photo queue: up to 200MB. TTL: tours cached for 48h, auto-purge completed.

## UI Pages
| Route | Page | Key Components |
|-------|------|----------------|
| /operate/patrol | Dashboard | Live guard map, active tours, compliance chart, incident feed |
| /operate/patrol/routes | Route management | Route list, map editor, checkpoint sequencer |
| /operate/patrol/routes/:id | Route detail | Map view, checkpoint list, schedule, compliance history |
| /operate/patrol/tours | Tour history | DataTable, filters, completion heatmap |
| /operate/patrol/tours/:id | Tour detail | Map with GPS track, checkpoint timeline, incidents |
| /operate/patrol/incidents | Incident log | DataTable, severity filters, status tracking |
| /operate/patrol/incidents/:id | Incident detail | Photos, location, timeline, resolution |
| /operate/patrol/handovers | Shift handovers | Handover log, pending acknowledgments |
| /operate/patrol/live | Live tracking | Real-time guard positions on site map |

## Events & Audit Log

| Event Type | Trigger | Payload | Retention |
|------------|---------|---------|-----------|
| patrol.tour.scheduled | Tour created | tour_id + route + guard | 1 year |
| patrol.tour.started | Guard starts tour | tour_id + actual_start + location | 1 year |
| patrol.tour.scan | Checkpoint scanned | tour_id + checkpoint + on_time + location | 1 year |
| patrol.tour.completed | Tour completed | tour_id + completion_percent + missed | 1 year |
| patrol.tour.missed | Tour not started | tour_id + guard + scheduled_start | permanent |
| patrol.checkpoint.missed | Checkpoint overdue | tour_id + checkpoint + overdue_min | 1 year |
| patrol.incident.reported | Incident created | full incident | 2 years |
| patrol.incident.resolved | Incident resolved | incident_id + resolution + actor | 2 years |
| patrol.handover.created | Shift handover | handover_id + guards + notes | 1 year |
| patrol.handover.acknowledged | Incoming guard ACK | handover_id + incoming_guard | 1 year |
| patrol.route.created | Route created | full route | 1 year |
| patrol.route.updated | Route modified | route_id + diff | 1 year |
| patrol.guard.location | GPS update | guard_id + location (sampled) | 90 days |

## Integration Points
- **Depends on:** identity-svc (guard profiles, shift assignments), notif-svc (missed checkpoint alerts, incident notifications), tenant-svc (site maps, zones), auth-svc (JWT), video-svc (incident camera lookup)
- **Consumed by:** analytics/report-svc (patrol compliance, incident trends), automate-svc (patrol triggers), ai-asst-svc (patrol queries), access-svc (guard location for emergency dispatch)
- **External:** NFC tags (NTAG213/215), QR code labels, mobile GPS, guard station display

## Notes
- NFC tags use NTAG213 (144 bytes) or NTAG215 (504 bytes) — waterproof enclosures for outdoor checkpoints
- QR codes as backup when NFC tags damaged — printed with UV-resistant ink
- GPS accuracy in indoor environments may be limited — consider BLE beacons for indoor positioning in Phase 3
- Vietnamese guard shifts typically: morning (06:00-14:00), afternoon (14:00-22:00), night (22:00-06:00)
- Incident severity mapping: critical = immediate danger, high = security concern, medium = operational issue, low = informational
