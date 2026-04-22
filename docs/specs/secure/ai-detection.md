# Feature: AI Detection — Video Analytics

> Domain: SECURE | Color: #F59E0B | Priority: P1
> Status: Draft | Owner: SECURE Team + AI Team

## Overview

AI Detection provides intelligent video analytics through a **hybrid provider architecture** that supports three execution modes: **camera-native AI**, **edge AI**, and **central AI**. It detects security-relevant events — intrusion, loitering, tailgating, abandoned objects, crowd formation, face recognition, license plate recognition, people counting, line crossing, wrong-direction movement, and behavioral anomalies. Events are classified, scored by confidence, normalized into a common DM3 event schema, and routed to operators for review. False positive handling is a core workflow: operators can mark events as false positives to improve future detection quality.

The base architecture must support mixed real-world deployments where some cameras have built-in AI and others do not. DM3 therefore owns the **event model, rule model, and review workflow**, while inference can happen in one of three places:
- **Camera-native AI:** camera or NVR generates analytics events directly
- **Edge AI:** a local box such as Jetson or x86 edge gateway analyzes nearby RTSP streams
- **Central AI:** `vision-svc` (Python/FastAPI) processes RTSP sub-streams from go2rtc using ONNX Runtime / YOLO models

This avoids hard-coupling the product to a single AI engine or camera vendor.

## Data Models

### AIDetectionEvent (Hypertable)
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | - | Tenant isolation |
| time | timestamptz | yes | - | Detection timestamp |
| camera_id | uuid | yes | - | Source camera |
| camera_name | string(100) | no | null | Denormalized |
| location | string(200) | no | null | Denormalized from camera |
| provider_type | AIProviderTypeEnum | yes | central_ai | camera_native / edge_ai / central_ai |
| provider_id | string(100) | no | null | Provider instance identifier (camera model, edge node, vision-svc worker) |
| source_event_id | string(200) | no | null | Upstream event ID from camera/NVR/edge engine |
| detection_type | DetectionTypeEnum | yes | - | Event classification |
| detection_subtype | string(50) | no | null | Specific sub-category |
| severity | DetectionSeverityEnum | yes | medium | Severity assessment |
| confidence | float | yes | - | ML confidence score 0.0-1.0 |
| description | string(500) | yes | - | Human-readable description |
| bounding_box | jsonb | no | null | `{x, y, width, height}` normalized 0-1 |
| snapshot_path | string(500) | no | null | MinIO path to annotated snapshot |
| clip_id | uuid | no | null | Linked video clip |
| user_id | uuid | no | null | Matched user (face recognition) |
| user_name | string(100) | no | null | Matched user name |
| plate_number | string(20) | no | null | Detected license plate |
| object_class | string(50) | no | null | Detected object class (YOLO) |
| object_count | int | no | null | Count for crowd/people counting |
| line_id | string(100) | no | null | Logical line definition for line-crossing / direction rules |
| zone_id | uuid | no | null | Logical zone/ROI that triggered the event |
| direction | string(50) | no | null | in / out / left_to_right / right_to_left / toward / away |
| track_id | string(100) | no | null | Stable track identifier when provider supports tracking |
| count_delta | int | no | null | Delta value for counting events (+1, -1) |
| false_positive | boolean | yes | false | Marked as false positive |
| false_positive_by | uuid | no | null | User who marked FP |
| false_positive_at | timestamp | no | null | When marked FP |
| reviewed | boolean | yes | false | Has been reviewed by operator |
| reviewed_by | uuid | no | null | Reviewer |
| reviewed_at | timestamp | no | null | Review time |
| action_taken | string(200) | no | null | What action was taken |
| linked_alarm_id | uuid | no | null | Created intrusion alarm |
| linked_access_event_id | uuid | no | null | Related access event |
| model_id | string(50) | no | null | ML model identifier + version, if inference-based |
| inference_time_ms | int | no | null | ML inference time, if available |
| raw_payload | jsonb | no | {} | Original vendor/provider payload for debugging and traceability |
| metadata | jsonb | no | {} | Extra normalized data (trajectory, dwell_time_ms, provider stats, etc.) |

### AIDetectionRule
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | - | Tenant isolation |
| site_id | uuid | yes | - | Site |
| name | string(100) | yes | - | e.g. "Phát hiện xâm nhập - Hàng rào" |
| detection_type | DetectionTypeEnum | yes | - | What to detect |
| camera_ids | uuid[] | yes | - | Which cameras to analyze |
| execution_mode | RuleExecutionModeEnum | yes | native_first | native_first / edge_only / central_only / hybrid |
| enabled | boolean | yes | true | Active toggle |
| confidence_threshold | float | yes | 0.70 | Min confidence to report |
| roi_zones | jsonb | no | null | Regions of interest `[{points: [{x,y}...], name: "zone1"}]` |
| line_definitions | jsonb | no | null | Logical line config for line crossing / wrong direction |
| schedule_id | uuid | no | null | Only active during schedule |
| cooldown_ms | int | yes | 60000 | Min time between same-type events for same camera |
| severity_override | DetectionSeverityEnum | no | null | Override default severity |
| auto_create_alarm | boolean | yes | false | Auto-create intrusion alarm |
| auto_extract_clip | boolean | yes | true | Auto-extract video clip |
| notify_roles | string[] | no | [] | Roles to notify immediately |
| notify_users | uuid[] | no | [] | Specific users to notify |
| loitering_threshold_ms | int | no | 300000 | For loitering: time before trigger (5 min default) |
| crowd_threshold_count | int | no | 10 | For crowd: min people count |
| direction_mode | string(50) | no | null | Allowed direction config for wrong-direction and line-crossing rules |
| metadata | jsonb | no | {} | Extra type-specific config |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### AICameraCapability
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| camera_id | uuid | yes | - | Camera reference |
| native_motion | boolean | yes | false | Camera/NVR can emit motion events |
| native_person_detection | boolean | yes | false | Built-in person detection |
| native_people_count | boolean | yes | false | Built-in people counting |
| native_line_crossing | boolean | yes | false | Built-in line-crossing analytics |
| native_wrong_direction | boolean | yes | false | Built-in direction analytics |
| native_face_recognition | boolean | yes | false | Built-in face recognition |
| native_plate_recognition | boolean | yes | false | Built-in LPR |
| rtsp_available | boolean | yes | true | RTSP available for external inference |
| onvif_events | boolean | yes | false | Supports ONVIF analytics/event feed |
| webhook_events | boolean | yes | false | Supports vendor webhook / push event delivery |
| edge_ai_supported | boolean | yes | true | Camera can be assigned to edge AI node |
| central_ai_supported | boolean | yes | true | Camera can be assigned to central AI |
| preferred_mode | RuleExecutionModeEnum | yes | native_first | Default execution preference |
| last_verified_at | timestamp | no | null | Last capability probe |
| metadata | jsonb | no | {} | Vendor-specific capability detail |

### AIModel
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | string(50) | yes | - | Model identifier, e.g. "yolov8n-user" |
| name | string(100) | yes | - | Display name |
| version | string(20) | yes | - | Model version |
| type | AIModelTypeEnum | yes | - | Model type |
| framework | string(20) | yes | onnx | Runtime (onnx, tensorrt) |
| input_resolution | string(20) | yes | - | e.g. "640x640" |
| classes | string[] | yes | - | Detectable classes |
| file_path | string(500) | yes | - | Path to model file |
| gpu_required | boolean | yes | false | Needs GPU |
| avg_inference_ms | int | no | null | Average inference time |
| status | AIModelStatusEnum | yes | inactive | Loaded status |
| created_at | timestamp | yes | now() | Creation time |

### Enums
```
DetectionTypeEnum: intrusion | loitering | tailgating | abandoned_object | crowd | people_count | line_crossing | wrong_direction | face_match | face_unknown | plate_recognized | plate_unknown | fighting | running | falling | fire_smoke | smoking | uniform | helmet | object_removed | perimeter_breach
DetectionSeverityEnum: critical | high | medium | low | info
AIProviderTypeEnum: camera_native | edge_ai | central_ai
RuleExecutionModeEnum: native_first | edge_only | central_only | hybrid
AIModelTypeEnum: object_detection | face_recognition | plate_recognition | pose_estimation | anomaly_detection | tracking
AIModelStatusEnum: active | inactive | loading | error
```

## API Endpoints

### GET /api/v1/ai/events
- **Auth:** Bearer token, role >= viewer
- **Query params:**
  | Param | Type | Default | Description |
  |-------|------|---------|-------------|
  | site_id | uuid | required | Site filter |
  | camera_id | uuid | - | Camera filter |
  | detection_type | string | - | Type filter (comma-separated) |
  | severity | string | - | Severity filter |
  | false_positive | boolean | - | Filter FP/non-FP |
  | reviewed | boolean | - | Filter reviewed/unreviewed |
  | min_confidence | float | - | Min confidence threshold |
  | from | timestamp | -24h | Start time |
  | to | timestamp | now | End time |
  | page | int | 1 | Page |
  | limit | int | 50 | Max 200 |
- **Response 200:**
  ```json
  {
    "data": [
      {
        "id": "uuid",
        "time": "2026-02-19T07:02:00Z",
        "detection_type": "intrusion",
        "location": "Cổng phụ phía Bắc",
        "camera_name": "CAM-05",
        "confidence": 0.94,
        "description": "Người lạ leo hàng rào",
        "false_positive": false,
        "reviewed": false,
        "severity": "critical",
        "snapshot_url": "https://..."
      }
    ],
    "total": 25,
    "page": 1,
    "limit": 50,
    "stats": {
      "total": 25,
      "by_type": { "intrusion": 5, "loitering": 6, "tailgating": 5, "abandoned_object": 5, "crowd": 4 },
      "false_positive_count": 6,
      "unreviewed_count": 12
    }
  }
  ```

### GET /api/v1/ai/events/{id}
- **Auth:** role >= viewer
- **Response 200:** Full event with snapshot URL, clip URL, linked alarm, linked user

### POST /api/v1/ai/events/{id}/review
- **Auth:** role >= operator
- **Body:**
  ```json
  {
    "false_positive": true,
    "action_taken": "Xác nhận: tài xế chờ khách, không phải lảng vảng",
    "notes": ""
  }
  ```
- **Side effects:** Audit log, update FP stats for model tuning, if `false_positive=false` + `action_taken`, can auto-create alarm
- **Response 200:** Updated event

### POST /api/v1/ai/events/{id}/create-alarm
- **Auth:** role >= operator
- **Body:** `{ "zone_id": "uuid", "severity": "high" }`
- **Side effects:** Creates AlarmEvent in intrusion-detection, links to AI event, audit log
- **Response 201:** Created alarm with link

### GET /api/v1/ai/rules
- **Auth:** role >= admin
- **Query params:** site_id (required), detection_type, camera_id, enabled
- **Response 200:** List of detection rules

### POST /api/v1/ai/rules
- **Auth:** role >= admin
- **Body:**
  ```json
  {
    "name": "Phát hiện xâm nhập - Hàng rào phía Bắc",
    "site_id": "uuid",
    "detection_type": "intrusion",
    "camera_ids": ["uuid"],
    "confidence_threshold": 0.75,
    "roi_zones": [
      {
        "name": "fence_zone",
        "points": [{"x":0.1,"y":0.2},{"x":0.9,"y":0.2},{"x":0.9,"y":0.8},{"x":0.1,"y":0.8}]
      }
    ],
    "cooldown_ms": 60000,
    "auto_create_alarm": true,
    "auto_extract_clip": true,
    "notify_roles": ["guard"]
  }
  ```
- **Side effects:** Audit log, provider routing update, and reconfiguration of the selected execution target (`vision-svc`, edge node, or native event adapter)
- **Response 201:** Created rule

### PUT /api/v1/ai/rules/{id}
- **Auth:** role >= admin
- **Response 200:** Updated rule

### DELETE /api/v1/ai/rules/{id}
- **Auth:** role >= admin
- **Response 204**

### GET /api/v1/ai/models
- **Auth:** role >= admin
- **Response 200:** List of available AI models with status, performance metrics

### POST /api/v1/ai/models/{id}/activate
- **Auth:** role >= site_admin
- **Side effects:** Load model into vision-svc GPU/CPU memory
- **Response 200:** Model activated

### POST /api/v1/ai/models/{id}/deactivate
- **Auth:** role >= site_admin
- **Response 200:** Model deactivated, memory freed

### GET /api/v1/ai/stats
- **Auth:** role >= viewer
- **Query params:** site_id, from, to
- **Response 200:**
  ```json
  {
    "total_events": 1234,
    "by_type": { "intrusion": 150, "loitering": 320, "...": "..." },
    "false_positive_rate": 0.12,
    "avg_confidence": 0.82,
    "avg_review_time_minutes": 4.5,
    "top_cameras": [
      { "camera_id": "uuid", "camera_name": "CAM-05", "event_count": 89 }
    ],
    "hourly_distribution": [
      { "hour": 0, "count": 15 },
      { "hour": 1, "count": 8 }
    ]
  }
  ```

## MQTT Topics

| Topic | Direction | QoS | Payload Schema | Description |
|-------|-----------|-----|----------------|-------------|
| N/A — AI events are normalized server-side and published via NATS | internal | - | - | Native camera, edge AI, and central AI all converge into the same DM3 event bus |

**NATS Subjects (internal):**
| Subject | Direction | Description |
|---------|-----------|-------------|
| `ai.detection.raw` | native adapter / edge node / vision-svc → ai pipeline | Raw provider event before normalization |
| `ai.detection.event` | ai pipeline → alert-svc and consumers | New normalized AI detection event |
| `ai.detection.face_match` | ai pipeline → access-svc | Face recognized in video feed |
| `ai.detection.plate` | ai pipeline → parking-svc | License plate detected |
| `ai.detection.rule_config` | access-svc → providers | Detection rule configuration update |
| `ai.detection.provider.heartbeat` | edge node / adapter / vision-svc → platform | Provider/node health status |

## Business Rules

1. **BR-AI-001 — Confidence Threshold:** Events below the rule's `confidence_threshold` are discarded and not stored. Default threshold is 0.70 (70%). Adjustable per rule.
2. **BR-AI-002 — Cooldown Period:** Same detection type from the same camera within `cooldown_ms` is deduplicated. Only the highest confidence event is kept. Prevents alert fatigue.
3. **BR-AI-003 — False Positive Feedback Loop:** When an operator marks an event as false positive, the event is tagged in the training dataset. Periodic model retraining (offline) uses FP feedback to improve accuracy.
4. **BR-AI-004 — Auto-Alarm Creation:** When `auto_create_alarm=true` on a rule, and confidence >= threshold, an AlarmEvent is automatically created in the intrusion detection system with the appropriate zone and severity.
5. **BR-AI-005 — Auto-Clip Extraction:** When `auto_extract_clip=true`, a 30-second video clip (15s before, 15s after detection) is automatically extracted and linked to the event.
6. **BR-AI-006 — ROI Zones:** Detection rules can define regions of interest within the camera frame. Only objects/events within ROI trigger alerts. Objects outside ROI are ignored. Useful for excluding roads, trees, etc.
7. **BR-AI-007 — Hybrid Provider Routing:** DM3 chooses execution based on camera capability and rule `execution_mode`. `native_first` prefers camera/NVR-generated analytics when supported, otherwise falls back to edge AI, then central AI.
8. **BR-AI-008 — Provider-Agnostic Event Model:** Regardless of source, all analytics events must be normalized into `AIDetectionEvent` before entering operator workflows, alerting, reporting, or automation.
9. **BR-AI-009 — Deduplication Across Providers:** When native AI and external AI can both emit equivalent events for the same camera/time window, DM3 deduplicates by camera, detection type, time proximity, and track/zone metadata to avoid duplicate alerts.
10. **BR-AI-010 — Graceful Degradation:** If edge AI node is offline or overloaded, eligible cameras may fail over to central AI. If central AI is unavailable, native camera/NVR events continue to be accepted when supported.
7. **BR-AI-007 — Schedule-Based Detection:** Rules with `schedule_id` only run during scheduled periods. e.g., loitering detection only active after business hours. Reduces false positives during busy periods.
8. **BR-AI-008 — Loitering Duration:** Loitering detection requires a user to remain in the ROI for `loitering_threshold_ms` (default 5 min). Tracking persists across frames. User leaving and returning resets the timer.
9. **BR-AI-009 — Crowd Counting Threshold:** Crowd events trigger when user count in ROI exceeds `crowd_threshold_count`. The `object_count` field stores the actual count.
10. **BR-AI-010 — Face Recognition Access Integration:** When a known face is detected by AI (not at a door reader), if the face matches a blacklisted user, an immediate critical alert is generated. If VIP, a notification is sent.
11. **BR-AI-011 — Tailgating Detection:** Tailgating is detected when the AI observes two or more users passing through a door/turnstile on a single credential. Links to access event from the same door within a 10-second window.
12. **BR-AI-012 — Model Resource Management:** Only active models consume GPU/CPU memory. Maximum concurrent models depends on hardware (GPU VRAM). System prevents loading models that would exceed available resources.
13. **BR-AI-013 — Processing Priority:** Critical zones (perimeter, server room) get processing priority over general areas. When GPU is saturated, lower-priority camera feeds are processed at reduced frame rate.
14. **BR-AI-014 — Event Annotation:** All AI events include an annotated snapshot showing bounding boxes, confidence scores, and detection type overlaid on the image. Stored in MinIO.
15. **BR-AI-015 — Review SLA:** Unreviewed critical/high events older than 30 minutes trigger an escalation notification to admins. Review rate is tracked as a KPI.

## Permissions Matrix

| Action | viewer | operator | admin | site_admin | super_admin |
|--------|--------|----------|-------|------------|-------------|
| View AI events | ✅ | ✅ | ✅ | ✅ | ✅ |
| View event details | ✅ | ✅ | ✅ | ✅ | ✅ |
| Review events (mark FP) | ❌ | ✅ | ✅ | ✅ | ✅ |
| Create alarm from event | ❌ | ✅ | ✅ | ✅ | ✅ |
| View detection rules | ❌ | ✅ | ✅ | ✅ | ✅ |
| Create/edit rules | ❌ | ❌ | ✅ | ✅ | ✅ |
| Delete rules | ❌ | ❌ | ✅ | ✅ | ✅ |
| View AI models | ❌ | ❌ | ✅ | ✅ | ✅ |
| Activate/deactivate models | ❌ | ❌ | ❌ | ✅ | ✅ |
| View AI stats | ✅ | ✅ | ✅ | ✅ | ✅ |

## Offline Behavior

- **Device-side:** AI Detection supports three execution locations: camera-native AI, edge AI nodes, and central `vision-svc`. Cameras and NVRs continue recording regardless of DM3 server connectivity.
- **Edge AI:** Edge nodes can continue local inference during upstream WAN/server interruptions, buffering events for later delivery if configured. This is especially useful for people counting, line crossing, and site-local alerting.
- **Sync strategy:** Rules remain server-authoritative, but providers cache their assigned rules and capability state for short-term continuity.
- **Reconnection:** When `vision-svc` or an edge node restarts, it resumes processing currently assigned camera feeds from current time. No historical catch-up unless explicitly supported by the provider.
- **Local storage:** Native AI and edge AI providers may buffer events transiently. Canonical persisted events and snapshots still live in TimescaleDB and MinIO after normalization.
- **Graceful degradation:** If GPU is unavailable, `vision-svc` falls back to CPU inference at reduced frame rate (1 FPS instead of 5 FPS). If edge AI node is unavailable, DM3 may reroute supported cameras to central AI. If central AI is unavailable, native camera/NVR events continue to be accepted when available.

## UI Pages

| Route | Page | Key Components |
|-------|------|----------------|
| /secure/ai-detection | AI Detection Dashboard | Type-based stat cards (intrusion, loitering, tailgating, abandoned object, crowd), type filter tabs, event list with confidence bar, FP toggle button, annotated snapshot preview |

## Events & Audit Log

| Event Type | Trigger | Payload | Retention |
|------------|---------|---------|-----------|
| ai.event.detected | ML inference | detection_type, camera, confidence, snapshot | 1 year |
| ai.event.reviewed | Operator review | event_id, reviewer, false_positive, action | 1 year |
| ai.event.alarm_created | Create alarm from AI event | event_id, alarm_id | permanent |
| ai.rule.created | POST create | full rule | 1 year |
| ai.rule.updated | PUT update | diff | 1 year |
| ai.rule.deleted | DELETE | id + actor | permanent |
| ai.model.activated | Model loaded | model_id, gpu_memory_mb | 90 days |
| ai.model.deactivated | Model unloaded | model_id | 90 days |
| ai.model.error | Model crash/error | model_id, error_message | 1 year |

## Integration Points

- **Depends on:**
  - `video-svc` / go2rtc — RTSP sub-stream feed for central or edge analysis
  - camera/NVR vendor adapters — native analytics events via ONVIF, webhook, SDK, or polling
  - edge AI nodes — Jetson or x86 gateways for site-local inference
  - `identity-svc` — Face recognition database (face templates for known users)
  - MinIO — Snapshot and clip storage
  - GPU hardware — NVIDIA GPU recommended for real-time central inference
- **Consumed by:**
  - `alarm-svc` — Auto-created intrusion alarms
  - `access-svc` — Face match → blacklist alert, VIP notification
  - `parking-svc` — License plate recognition for parking entry/exit
  - `automate-svc` — AI events as automation triggers (e.g., loitering → alert guard)
  - `report-svc` — AI analytics (detection trends, FP rates, camera hotspots)
  - `notif-svc` — Real-time alerts for critical detections
- **External:**
  - ONNX Runtime / TensorRT for model inference
  - Pre-trained models: YOLOv8 (object detection), ArcFace (face recognition), LPRNet (plate recognition)
  - camera vendor AI event protocols (ONVIF analytics, vendor webhooks, proprietary SDKs)

## Notes

- `vision-svc` processes camera sub-streams at 5 FPS by default (configurable). Main stream is too heavy for AI at scale.
- Hybrid routing is the default architectural direction: use native camera analytics first when good enough, edge AI for site-local fallback/latency, and central AI for cameras without built-in analytics or when heavier models are needed.
- GPU recommendation for central inference: NVIDIA RTX 3060+ for small deployments (<20 cameras), RTX 4090 / A4000 for medium (20-50), A100 for large (50+).
- Edge AI nodes may use Jetson or x86 hardware. Typical early rollout starts with simple features such as people counting and line crossing before advanced behavior detection.
- Face recognition requires explicit opt-in per site due to privacy regulations. PDPA/GDPR compliance required.
- License plate format is Vietnam-specific by default (e.g., "30A-12345", "51G-123.45"). Regex patterns configurable per site.
- False positive rate target: <15% after initial tuning period (2 weeks). Achieved through ROI tuning, schedule constraints, and confidence threshold adjustment.
- Model retraining with site-specific FP data is a periodic offline process (weekly/monthly), not real-time.
