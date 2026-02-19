# Feature: Delivery Management

> Domain: MANAGE | Color: #8B5CF6 | Priority: P2
> Status: Draft | Owner: facility-svc team

## Overview
Delivery Management tracks packages and deliveries arriving at a building — from reception logging through recipient notification, pickup confirmation, and uncollected alerts. It supports carrier registration, photo capture of packages, smart locker integration, and provides a complete audit trail. This feature is particularly relevant for residential buildings (chung cư) and large office complexes where daily package volume is high.

## Data Models

### Delivery
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | — | Tenant isolation |
| site_id | uuid | yes | — | Site |
| package_id | string(50) | yes | auto | Human-readable ID (e.g., "PKG-20260219-001") |
| tracking_number | string(100) | no | — | Carrier tracking number |
| recipient_person_id | uuid | no | — | FK to Person (if known) |
| recipient_name | string(200) | yes | — | Recipient display name |
| recipient_phone | string(20) | no | — | Recipient phone |
| recipient_unit | string(50) | no | — | Unit/room/office number |
| recipient_department | string(100) | no | — | Department name |
| sender_name | string(200) | no | — | Sender name or company |
| carrier_id | uuid | no | — | FK to Carrier |
| carrier_name | string(200) | no | — | Carrier display name (denorm) |
| delivery_type | DeliveryTypeEnum | yes | package | Type of delivery |
| size_category | SizeCategoryEnum | no | medium | Package size |
| status | DeliveryStatusEnum | yes | pending | Current status |
| received_at | timestamp | yes | now() | When package was received at building |
| received_by | uuid | yes | — | Guard/receptionist who received |
| photo_refs | string[] | no | — | MinIO refs for package photos |
| storage_location | string(100) | no | — | Where package is stored (e.g., "Kệ A3", "Tủ locker #12") |
| locker_id | uuid | no | — | FK to Locker (if in smart locker) |
| locker_code | string(10) | no | — | One-time locker access code |
| notification_sent | boolean | no | false | Whether recipient was notified |
| notification_sent_at | timestamp | no | — | When notification was sent |
| notification_count | int | no | 0 | Number of notifications sent |
| collected_at | timestamp | no | — | When package was collected |
| collected_by | uuid | no | — | Person who collected (may differ from recipient) |
| collection_signature_ref | string(500) | no | — | Signature image ref |
| collection_photo_ref | string(500) | no | — | Photo of person collecting |
| returned_at | timestamp | no | — | If returned to sender |
| return_reason | text | no | — | Reason for return |
| notes | text | no | — | Admin notes |
| is_fragile | boolean | no | false | Fragile handling required |
| is_perishable | boolean | no | false | Time-sensitive (food, medicine) |
| estimated_value | decimal(12,2) | no | — | Declared value |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### Carrier
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | — | Tenant isolation |
| name | string(200) | yes | — | Carrier name (e.g., "GHN", "Viettel Post", "J&T Express") |
| code | string(20) | no | — | Short code |
| phone | string(20) | no | — | Carrier hotline |
| tracking_url_template | string(500) | no | — | URL template with `{tracking}` placeholder |
| logo_ref | string(500) | no | — | Logo image |
| status | string(20) | yes | active | active or inactive |
| delivery_count | int | no | 0 | Total deliveries (cached) |
| created_at | timestamp | yes | now() | Creation time |

### Locker
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | — | Tenant isolation |
| site_id | uuid | yes | — | Site |
| locker_number | string(20) | yes | — | Physical locker ID |
| size | SizeCategoryEnum | yes | — | Locker size |
| location | string(200) | no | — | Physical location description |
| status | LockerStatusEnum | yes | available | Current status |
| current_delivery_id | uuid | no | — | FK to Delivery |
| device_id | uuid | no | — | FK to smart locker controller device |
| created_at | timestamp | yes | now() | Creation time |

### DeliveryNotificationLog
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| delivery_id | uuid | yes | — | FK to Delivery |
| channel | string(30) | yes | — | sms, push, telegram, email, call |
| recipient_contact | string(200) | yes | — | Phone/email/handle used |
| sent_at | timestamp | yes | now() | When sent |
| status | string(20) | yes | — | sent, delivered, failed |
| error_message | string(500) | no | — | If failed |

### Enums
```
DeliveryTypeEnum: package | document | food | flowers | furniture | other
SizeCategoryEnum: small | medium | large | oversized
DeliveryStatusEnum: pending | notified | collected | returned | expired
LockerStatusEnum: available | occupied | maintenance | disabled
```

## API Endpoints

### GET /api/v1/deliveries
- **Auth:** Bearer token, role >= viewer
- **Query params:**
  | Param | Type | Default | Description |
  |-------|------|---------|-------------|
  | page | int | 1 | Page number |
  | limit | int | 20 | Items per page |
  | site_id | uuid | required | Filter by site |
  | status | string | — | Filter by status |
  | date | date | today | Filter by received date |
  | date_from | date | — | Range start |
  | date_to | date | — | Range end |
  | recipient | string | — | Search recipient name/phone/unit |
  | carrier_id | uuid | — | Filter by carrier |
  | uncollected_hours | int | — | Filter packages uncollected for >N hours |
- **Response 200:**
  ```json
  {
    "data": [{
      "id": "uuid",
      "package_id": "PKG-20260219-001",
      "recipient_name": "Nguyễn Văn An",
      "recipient_unit": "Căn hộ 1205",
      "sender_name": "Shopee Express",
      "carrier": "GHN",
      "status": "pending",
      "received_at": "2026-02-19T09:15:00+07:00",
      "has_photo": true,
      "storage_location": "Kệ B2",
      "hours_pending": 3.5
    }],
    "total": 15,
    "summary": {
      "pending": 6,
      "notified": 3,
      "collected": 12,
      "returned": 1
    }
  }
  ```

### POST /api/v1/deliveries
- **Auth:** role >= operator
- **Body:**
  ```json
  {
    "site_id": "uuid",
    "recipient_name": "Trần Thị Bích",
    "recipient_phone": "0987654321",
    "recipient_unit": "Văn phòng 803",
    "sender_name": "Amazon VN",
    "carrier_id": "uuid",
    "tracking_number": "GHN-VN2024123456",
    "delivery_type": "package",
    "size_category": "medium",
    "storage_location": "Kệ A3",
    "is_perishable": false,
    "notes": "2 kiện hàng"
  }
  ```
- **Side effects:** Auto-matches recipient to Person by phone/name, sends notification (push + SMS), audit log
- **Response 201:** Created delivery

### GET /api/v1/deliveries/{id}
- **Auth:** role >= viewer
- **Response 200:** Full delivery detail with photos, notification history, timeline

### PUT /api/v1/deliveries/{id}
- **Auth:** role >= operator

### POST /api/v1/deliveries/{id}/notify
- **Auth:** role >= operator
- **Body:** `{ "channels": ["push", "sms"], "message": "Bạn có bưu kiện tại sảnh lễ tân. Vui lòng đến nhận." }`
- **Side effects:** Sends notification, updates notification_count, logs in DeliveryNotificationLog

### POST /api/v1/deliveries/{id}/collect
- **Auth:** role >= operator
- **Body:**
  ```json
  {
    "collected_by_person_id": "uuid",
    "signature_ref": "minio://signatures/...",
    "photo_ref": "minio://collection-photos/...",
    "notes": "Người nhận ủy quyền cho đồng nghiệp"
  }
  ```
- **Side effects:** Updates status to `collected`, releases locker if applicable, audit log
- **Response 200:** Updated delivery

### POST /api/v1/deliveries/{id}/return
- **Auth:** role >= operator
- **Body:** `{ "reason": "Người nhận từ chối nhận hàng" }`
- **Side effects:** Updates status to `returned`, releases locker, audit log

### POST /api/v1/deliveries/{id}/photos
- **Auth:** role >= operator
- **Body:** `multipart/form-data` with image files
- **Response 200:** Photo URLs added to delivery

### POST /api/v1/deliveries/{id}/assign-locker
- **Auth:** role >= operator
- **Body:** `{ "locker_id": "uuid" }`
- **Side effects:** Assigns locker, generates access code, sends code to recipient via notification
- **Response 200:** `{ "locker_number": "L-012", "access_code": "847291" }`

### GET /api/v1/deliveries/carriers
- **Auth:** role >= viewer

### POST /api/v1/deliveries/carriers
- **Auth:** role >= admin
- **Body:** `{ "name": "GHTK", "code": "GHTK", "tracking_url_template": "https://giaohangtietkiem.vn/tracking/{tracking}" }`

### GET /api/v1/deliveries/lockers
- **Auth:** role >= viewer
- **Query params:** `site_id`, `status`

### GET /api/v1/deliveries/report
- **Auth:** role >= admin
- **Query params:** `site_id`, `date_from`, `date_to`
- **Response 200:** Statistics — volume by carrier, avg collection time, uncollected rate, peak hours

## MQTT Topics

| Topic | Direction | QoS | Payload Schema | Description |
|-------|-----------|-----|----------------|-------------|
| `dm/{tenant}/device/{device_id}/cmd/locker` | server→device | 1 | `{ "action": "open", "locker_number": "L-012", "code": "847291" }` | Open smart locker |
| `dm/{tenant}/device/{device_id}/evt/locker` | device→server | 1 | `{ "locker_number": "L-012", "event": "opened\|closed", "time": "..." }` | Locker event (opened = package collected) |

## Business Rules

1. **BR-DEL-001: Auto-notification on receipt.** When a delivery is created and a recipient phone/push token is available, a notification is automatically sent within 1 minute. Notification includes package ID and collection location.

2. **BR-DEL-002: Uncollected alerts.** Packages uncollected for >24 hours (configurable) trigger a reminder notification to the recipient. After 48 hours, an alert is sent to the building admin. After 7 days, status changes to `expired`.

3. **BR-DEL-003: Perishable priority.** Perishable deliveries (food, flowers) trigger immediate notification with "URGENT" flag. If uncollected for >4 hours, an alert escalates to admin.

4. **BR-DEL-004: Recipient auto-matching.** On delivery creation, the system attempts to match `recipient_name` + `recipient_phone` to a Person in identity-svc. If matched, the person's push notification token is used. If not matched, SMS is used.

5. **BR-DEL-005: Collection verification.** Collection requires either: (a) the recipient collecting in person (verified by face/card at terminal or manual confirmation), or (b) a delegate with a photo + signature capture.

6. **BR-DEL-006: Locker code expiry.** Smart locker one-time codes expire after 48 hours. After expiry, the admin must reassign or manually open the locker.

7. **BR-DEL-007: Locker size matching.** When auto-assigning lockers, the system matches package size to locker size. Oversized packages cannot use lockers.

8. **BR-DEL-008: Package ID format.** Package IDs follow the pattern `PKG-{YYYYMMDD}-{sequence}` where sequence resets daily. This provides a human-friendly reference for phone communication.

9. **BR-DEL-009: Photo required for high-value.** Deliveries with declared value > 1,000,000 VND require at least one photo at receipt time.

10. **BR-DEL-010: Notification throttle.** Maximum 3 notifications per delivery to the same recipient. After 3 notifications, further reminders are admin-only.

11. **BR-DEL-011: Carrier tracking link.** If a carrier has a `tracking_url_template` and the delivery has a `tracking_number`, the notification includes a clickable tracking link.

12. **BR-DEL-012: Daily delivery log.** A summary of all deliveries received/collected is generated at end of day and available as a downloadable report for building management.

## Permissions Matrix

| Action | viewer | operator | admin | site_admin | super_admin |
|--------|--------|----------|-------|------------|-------------|
| List deliveries | ✅ | ✅ | ✅ | ✅ | ✅ |
| View delivery detail | ✅ | ✅ | ✅ | ✅ | ✅ |
| Log new delivery | ❌ | ✅ | ✅ | ✅ | ✅ |
| Update delivery | ❌ | ✅ | ✅ | ✅ | ✅ |
| Confirm collection | ❌ | ✅ | ✅ | ✅ | ✅ |
| Return delivery | ❌ | ✅ | ✅ | ✅ | ✅ |
| Send notification | ❌ | ✅ | ✅ | ✅ | ✅ |
| Manage lockers | ❌ | ❌ | ✅ | ✅ | ✅ |
| Manage carriers | ❌ | ❌ | ✅ | ✅ | ✅ |
| View reports | ❌ | ✅ | ✅ | ✅ | ✅ |
| Export reports | ❌ | ❌ | ✅ | ✅ | ✅ |

## Offline Behavior

- **Device-side:** Delivery management is primarily a server-side feature with minimal device dependency. Smart lockers have their own offline behavior — locker codes are stored locally on the locker controller, so a recipient can open their locker even if the server is offline.
- **Sync strategy:** Delivery records are created on the server. If the web/mobile app loses connectivity, delivery logging falls back to paper-based recording. When connectivity returns, deliveries are entered retroactively.
- **Locker offline:** Smart locker controllers cache valid access codes locally. When offline, lockers still respond to valid codes. When back online, locker open/close events are uploaded and matched to deliveries.
- **Notification retry:** If notification fails (SMS gateway down), the system retries 3 times with exponential backoff (1min, 5min, 15min). Failed notifications are visible in the delivery detail.
- **Local storage:** Smart locker controllers store up to 1,000 active access codes locally. Expired codes are purged daily.
- **Conflict resolution:** Delivery status transitions are strictly ordered (pending→notified→collected/returned). If conflicting updates arrive, the more advanced status wins.

## UI Pages

| Route | Page | Key Components |
|-------|------|----------------|
| /manage/deliveries | Delivery list | DataTable with status tabs (Pending/Collected/Returned), date picker, carrier filter, uncollected hours indicator |
| /manage/deliveries/:id | Delivery detail | Package info, photos, notification timeline, collection confirmation form |
| /manage/deliveries/new | Log delivery | Quick form: recipient + carrier + photo capture + storage location |
| /manage/deliveries/lockers | Locker grid | Visual grid of lockers with status colors, occupancy info |
| /manage/deliveries/report | Statistics | Charts: volume by carrier, collection time distribution, peak hours, uncollected rate |

## Events & Audit Log

| Event Type | Trigger | Payload | Retention |
|------------|---------|---------|-----------|
| delivery.received | POST create | full delivery | 1 year |
| delivery.notified | POST notify | delivery_id + channels | 1 year |
| delivery.collected | POST collect | delivery_id + collector + time | 1 year |
| delivery.returned | POST return | delivery_id + reason | 1 year |
| delivery.expired | cron job | delivery_id + days_uncollected | 1 year |
| delivery.locker_assigned | POST assign-locker | delivery_id + locker_id + code | 1 year |
| delivery.locker_opened | device event | delivery_id + locker_id + time | 1 year |
| carrier.created | POST carrier | full carrier | 3 years |

## Integration Points

- **Depends on:**
  - `identity-svc` — recipient person lookup (phone/name matching)
  - `notif-svc` — push notifications, SMS, Telegram messages
  - `device-gw` — smart locker MQTT commands
  - `auth-svc` — JWT validation
- **Consumed by:**
  - `report-svc` — delivery analytics
- **External:**
  - SMS gateway (Twilio, Zalo ZNS, FPT SMS)
  - Smart locker hardware (via MQTT)
  - Carrier tracking APIs (future: auto-track incoming packages)

## Notes

- Common Vietnamese carriers: GHN (Giao Hàng Nhanh), GHTK (Giao Hàng Tiết Kiệm), Viettel Post, J&T Express, Grab Express, Shopee Express, Lazada Logistics.
- For residential buildings (chung cư), the delivery feature is heavily used — average 20-50 packages/day for a 500-unit building. The UI is optimized for quick logging by security guards at the reception desk.
- Package photos are stored in MinIO under `{tenant}/deliveries/{delivery_id}/` with 90-day retention for collected packages, 1-year retention for uncollected/disputed.
- The mobile resident app (future) allows residents to see their pending deliveries and get real-time notifications. Residents can also delegate collection to others via the app.
- Smart locker integration supports multiple protocols: direct MQTT for IP-connected lockers, and Bluetooth relay via guard's mobile app for standalone lockers.
