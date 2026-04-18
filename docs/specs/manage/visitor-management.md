# Feature: Visitor Management

> Domain: MANAGE | Color: #8B5CF6 | Priority: P0
> Status: Draft | Owner: visitor-svc team

## Overview
Visitor Management handles the full lifecycle of building visitors — from pre-registration and invitation through check-in, temporary credential issuance, host notification, and check-out. It generates QR codes for frictionless self-service arrival, supports badge printing, manages watchlists (VIP/blacklist), and ensures all visitor credentials are time-limited and auto-expired. Visitor data integrates with access control devices for temporary physical access.

## Data Models

### Visit
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | — | Tenant isolation |
| access_areas | uuid[] | no | — | Allowed zone/access-point scope for the visit |
| visitor_id | uuid | yes | — | FK to Visitor |
| host_user_id | uuid | yes | — | FK to User (host/employee) |
| purpose | VisitPurposeEnum | yes | — | Reason for visit |
| purpose_note | string(500) | no | — | Additional detail |
| status | VisitStatusEnum | yes | pre_registered | Current status |
| expected_arrival | timestamp | yes | — | Expected check-in time |
| expected_departure | timestamp | no | — | Expected check-out time |
| actual_checkin | timestamp | no | — | Actual check-in time |
| actual_checkout | timestamp | no | — | Actual check-out time |
| checkin_method | CheckinMethodEnum | no | — | How visitor checked in |
| checkin_device_id | uuid | no | — | Terminal/device used for check-in |
| checkin_photo_ref | string(500) | no | — | Photo captured at check-in |
| checkout_by | uuid | no | — | User who processed checkout |
| qr_token | string(64) | yes | auto | Unique QR token for this visit |
| qr_expires_at | timestamp | yes | auto | QR validity window |
| badge_number | string(20) | no | — | Physical badge number if issued |
| temp_credential_id | uuid | no | — | FK to Credential (temp card/face) |
| escort_required | boolean | no | false | Visitor must be escorted |
| vehicle_plate | string(20) | no | — | Vehicle license plate if driving |
| items_carried | text | no | — | Items brought in (laptop, tools) |
| nda_signed | boolean | no | false | NDA/legal form signed |
| host_approved | boolean | no | false | Host approved the visit |
| host_approved_at | timestamp | no | — | When host approved |
| notes | text | no | — | Additional notes |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### Visitor
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | — | Tenant isolation |
| first_name | string(100) | yes | — | Given name |
| last_name | string(100) | yes | — | Family name |
| display_name | string(200) | no | auto | Full name |
| email | string(255) | no | — | Email for invitation |
| phone | string(20) | no | — | Phone number |
| company | string(200) | no | — | Visitor's company |
| national_id | string(30) | no | — | ID card number |
| photo_ref | string(500) | no | — | Profile/ID photo |
| watchlist_status | WatchlistEnum | no | none | VIP/blacklist status |
| watchlist_reason | text | no | — | Reason for watchlist entry |
| visit_count | int | no | 0 | Total visits to this site |
| last_visit_at | timestamp | no | — | Last visit timestamp |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### VisitorBadge
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| visit_id | uuid | yes | — | FK to Visit |
| badge_number | string(20) | yes | — | Physical badge ID |
| badge_type | BadgeTypeEnum | yes | standard | Badge category |
| issued_at | timestamp | yes | now() | When badge was issued |
| returned_at | timestamp | no | — | When badge was returned |
| printed | boolean | no | false | Whether badge was printed |
| print_data | jsonb | no | — | Badge layout data for printing |

### Watchlist
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | — | Tenant isolation |
| entry_type | WatchlistEnum | yes | — | vip or blacklisted |
| match_field | string(50) | yes | — | Field to match: name, national_id, email, phone, face |
| match_value | string(500) | yes | — | Value to match against |
| face_template_ref | string(500) | no | — | Face template for face-based matching |
| reason | text | yes | — | Why this user is on the watchlist |
| added_by | uuid | yes | — | Actor who added |
| expires_at | timestamp | no | — | Auto-removal date |
| created_at | timestamp | yes | now() | Creation time |

### Enums
```
VisitPurposeEnum: meeting | interview | delivery | maintenance | tour | contract_signing | other
VisitStatusEnum: pre_registered | approved | waiting | checked_in | checked_out | cancelled | no_show | rejected
CheckinMethodEnum: terminal_qr | terminal_manual | reception | self_service | mobile_qr
BadgeTypeEnum: standard | vip | contractor | temporary
WatchlistEnum: none | vip | blacklisted
```

## API Endpoints

### GET /api/v1/visitors
- **Auth:** Bearer token, role >= viewer
- **Query params:**
  | Param | Type | Default | Description |
  |-------|------|---------|-------------|
  | page | int | 1 | Page number |
  | limit | int | 20 | Items per page (max 100) |
  | status | string | — | Filter by visit status |
  | date | date | today | Filter by expected arrival date |
  | host_id | uuid | — | Filter by host user |
  | search | string | — | Search visitor name, company, phone |
- **Response 200:**
  ```json
  {
    "data": [{
      "id": "uuid",
      "visitor": { "name": "Lê Quang Hải", "company": "FPT Software", "phone": "0987654321" },
      "host": { "id": "uuid", "name": "Nguyễn Văn An", "department": "Kỹ thuật" },
      "purpose": "meeting",
      "status": "checked_in",
      "expected_arrival": "2026-02-19T09:00:00Z",
      "actual_checkin": "2026-02-19T08:55:00Z",
      "badge_number": "V-042",
      "pre_registered": true
    }],
    "total": 20,
    "page": 1,
    "limit": 20
  }
  ```

### POST /api/v1/visitors
- **Auth:** role >= operator (or self-service by host employees)
- **Body:**
  ```json
  {
    "visitor": {
      "first_name": "Quang Hải",
      "last_name": "Lê",
      "email": "hai.le@fpt.com.vn",
      "phone": "0987654321",
      "company": "FPT Software"
    },
    "host_user_id": "uuid",
    "purpose": "meeting",
    "expected_arrival": "2026-02-20T09:00:00+07:00",
    "expected_departure": "2026-02-20T12:00:00+07:00",
    "access_areas": ["uuid-lobby", "uuid-meeting-zone"],
    "escort_required": false,
    "vehicle_plate": "30A-12345"
  }
  ```
- **Side effects:** Creates Visitor (or links to existing), creates Visit, generates QR token, sends invitation email/SMS to visitor, notifies host, audit log
- **Response 201:** Visit with QR code data

### GET /api/v1/visitors/{visit_id}
- **Auth:** role >= viewer
- **Response 200:** Full visit detail with visitor info, host info, credentials, timeline

### PUT /api/v1/visitors/{visit_id}
- **Auth:** role >= operator
- **Side effects:** If `access_areas` changed, update temp credential sync

### POST /api/v1/visitors/{visit_id}/approve
- **Auth:** Host user or role >= operator
- **Body:** `{ "approved": true, "note": "Đã xác nhận" }` or `{ "approved": false, "reason": "Không có lịch hẹn" }`
- **Side effects:** Updates status to `approved` or `rejected`, notifies visitor

### POST /api/v1/visitors/{visit_id}/checkin
- **Auth:** role >= operator (or self-service via terminal)
- **Body:**
  ```json
  {
    "checkin_method": "terminal_qr",
    "qr_token": "abc123...",
    "checkin_device_id": "uuid",
    "photo_ref": "minio://checkin-photos/...",
    "national_id": "024099001234",
    "items_carried": "Laptop Dell, túi công cụ",
    "nda_signed": true,
    "badge_number": "V-042"
  }
  ```
- **Side effects:** Updates visit status to `checked_in`, issues temporary credential (syncs to allowed devices via MQTT), notifies host ("Khách Lê Quang Hải đã đến"), audit log
- **Response 200:** Visit with temp credential details

### POST /api/v1/visitors/{visit_id}/checkout
- **Auth:** role >= operator (or self-service)
- **Body:** `{ "badge_returned": true, "items_returned": true }`
- **Side effects:** Updates status to `checked_out`, revokes temp credential (immediate sync to devices), returns badge to pool, audit log
- **Response 200:** Updated visit

### POST /api/v1/visitors/walkin
- **Auth:** role >= operator
- **Body:** Combined visitor + visit data for unregistered walk-in visitors
- **Side effects:** Creates visitor, visit, sends host approval request, holds visitor in `waiting` status until host approves

### GET /api/v1/visitors/qr/{qr_token}
- **Auth:** Public (used by self-service terminals)
- **Response 200:** Visit summary for check-in flow
- **Errors:** 404 (invalid token), 410 (expired token)

### GET /api/v1/visitors/today/summary
- **Auth:** role >= viewer
- **Response 200:**
  ```json
  {
    "waiting": 5,
    "checked_in": 12,
    "checked_out": 8,
    "no_show": 2,
    "total_expected": 27
  }
  ```

### GET /api/v1/visitors/watchlist
- **Auth:** role >= admin

### POST /api/v1/visitors/watchlist
- **Auth:** role >= admin
- **Body:** `{ "entry_type": "blacklisted", "match_field": "national_id", "match_value": "024099009999", "reason": "Đã bị cấm vào tòa nhà — sự cố 2025-12" }`

## MQTT Topics

| Topic | Direction | QoS | Payload Schema | Description |
|-------|-----------|-----|----------------|-------------|
| `dm/{tenant}/device/{device_id}/cfg/users` | server→device | 1 | `{ "action": "add", "user_id": "uuid", "credentials": [...], "valid_until": "...", "sync_version": N }` | Push temporary visitor credential to device |
| `dm/{tenant}/device/{device_id}/cfg/users` | server→device | 2 | `{ "action": "delete", "user_id": "uuid", "sync_version": N }` | Remove visitor credential on checkout/expiry |
| `dm/{tenant}/visitor/checkin` | server→clients | 1 | `{ "visit_id": "uuid", "visitor_name": "...", "host_name": "..." }` | Real-time checkin notification to dashboard |

## Business Rules

1. **BR-VIS-001: QR token validity window.** QR tokens are valid from 1 hour before `expected_arrival` to 4 hours after (configurable per tenant or zone policy). Expired tokens return HTTP 410.

2. **BR-VIS-002: Blacklist check on check-in.** Every check-in (QR, manual, walk-in) triggers a watchlist check against name, national_id, phone, and face (if photo captured). Blacklisted visitors are blocked with an alert to security. VIP visitors trigger a welcome notification.

3. **BR-VIS-003: Host approval for walk-ins.** Walk-in visitors (no pre-registration) require host approval before check-in. Host receives push notification + SMS. If host doesn't respond within 15 minutes, security is notified to follow up.

4. **BR-VIS-004: Auto-checkout at end of day.** All visitors still checked-in at tenant closing time (default 22:00, configurable) are auto-checked-out. An alert is sent to security for any visitor checked-in past closing time without checkout.

5. **BR-VIS-005: Temporary credential auto-expiry.** Visitor credentials are created with `valid_until` matching `expected_departure` (or end-of-day if not specified). Devices enforce expiry locally. Server also sends explicit revocation at expiry as a backup.

6. **BR-VIS-006: Badge pool management.** Physical badge numbers are managed in a pool. On check-in, next available badge is assigned. On checkout, badge returns to pool. Badges not returned trigger an alert after 24 hours.

7. **BR-VIS-007: Returning visitor recognition.** When creating a visit for a phone/email that matches an existing visitor record, the system links to the existing visitor (avoiding duplicates). Visit history is preserved.

8. **BR-VIS-008: Pre-registration requires host.** Every visit must have a host (employee). The host must be an active user in the identity system.

9. **BR-VIS-009: Photo capture at check-in.** If site policy requires photo capture, check-in via terminal automatically captures a photo. This photo can be used for face-based access if the visitor's access areas include face-reader doors.

10. **BR-VIS-010: No-show marking.** Visitors who don't check in within 2 hours of expected arrival are auto-marked as `no_show`. Host is notified.

11. **BR-VIS-011: Concurrent visit limit.** A visitor can have at most one active visit (status = `checked_in`) per tenant at a time unless future zone policy says otherwise.

12. **BR-VIS-012: Invitation re-send.** Pre-registered visitors can have their invitation (email/SMS with QR) re-sent up to 3 times. Each re-send generates a new QR token (old one is invalidated).

13. **BR-VIS-013: Escort enforcement.** If `escort_required` is true, the visitor's temporary credential is limited to doors that also have the host's credential synced. Access is granted only when host authenticates within 30 seconds of visitor.

## Permissions Matrix

| Action | viewer | operator | admin | site_admin | super_admin |
|--------|--------|----------|-------|------------|-------------|
| List visits | ✅ | ✅ | ✅ | ✅ | ✅ |
| View visit detail | ✅ | ✅ | ✅ | ✅ | ✅ |
| Pre-register visitor | ❌ | ✅ | ✅ | ✅ | ✅ |
| Check-in visitor | ❌ | ✅ | ✅ | ✅ | ✅ |
| Check-out visitor | ❌ | ✅ | ✅ | ✅ | ✅ |
| Approve/reject (as host) | ✅* | ✅* | ✅ | ✅ | ✅ |
| Walk-in registration | ❌ | ✅ | ✅ | ✅ | ✅ |
| Manage watchlist | ❌ | ❌ | ✅ | ✅ | ✅ |
| View watchlist | ❌ | ✅ | ✅ | ✅ | ✅ |
| Export visitor log | ❌ | ❌ | ✅ | ✅ | ✅ |

*Host employees can approve/reject their own visitors regardless of role.

## Offline Behavior

- **Device-side:** Visitor temporary credentials are synced to devices the same way as employee credentials (via MQTT `cfg/users`). Devices store visitor credentials locally with `valid_until` embedded. Even if the server goes offline, devices grant/deny visitor access based on local data and enforce expiry time.
- **Sync strategy:** On check-in, the server creates a temporary user record + credential and pushes to all relevant access devices. On check-out, a delete is pushed. If a device is offline during check-in, the credential is queued and pushed when the device reconnects.
- **Conflict resolution:** Server-wins. If a visitor's credential was supposed to be revoked (checkout/expiry) but the device was offline, the `valid_until` on the device ensures access is denied after expiry. When the device reconnects, the explicit delete is also processed.
- **Local storage:** Visitor credentials consume the same device storage as employee credentials. Sites typically have <50 active visitors at a time, so impact is minimal.
- **Terminal offline:** Self-service check-in terminals that lose server connectivity fall back to "manual mode" — security guard handles check-in. The terminal queues the check-in request and processes it when connectivity returns.
- **QR validation offline:** QR tokens include a cryptographic signature (HMAC-SHA256 with tenant-scoped key, with room for future zone-specific policy). Terminals can validate QR authenticity offline by verifying the signature and checking the embedded expiry timestamp. Full visit details are fetched when online.

## UI Pages

| Route | Page | Key Components |
|-------|------|----------------|
| /manage/visitors | Visit list | DataTable with status tabs (Waiting/Checked-in/Checked-out), date picker, host filter, search |
| /manage/visitors/:id | Visit detail | Visitor info card, visit timeline, credential status, linked access events |
| /manage/visitors/new | Pre-register | Multi-step: visitor info → host selection → access areas → schedule → confirm |
| /manage/visitors/checkin | Check-in flow | QR scanner, manual search, photo capture, badge assignment, NDA form |
| /manage/visitors/dashboard | Today's overview | Summary cards (waiting/in/out/no-show), real-time check-in feed |
| /manage/visitors/watchlist | Watchlist mgmt | VIP and blacklist tables, add/remove entries |

## Events & Audit Log

| Event Type | Trigger | Payload | Retention |
|------------|---------|---------|-----------|
| visit.pre_registered | POST create | full visit | 3 years |
| visit.approved | POST approve | visit_id + host_id + actor | 3 years |
| visit.rejected | POST approve (false) | visit_id + reason + actor | 3 years |
| visit.checked_in | POST checkin | visit_id + visitor + method + device | 3 years |
| visit.checked_out | POST checkout | visit_id + duration | 3 years |
| visit.auto_checkout | cron job | visit_id + reason | 3 years |
| visit.no_show | cron job | visit_id + visitor + host | 3 years |
| visit.cancelled | PUT cancel | visit_id + actor + reason | 3 years |
| watchlist.added | POST watchlist | entry details + actor | permanent |
| watchlist.removed | DELETE watchlist | entry_id + actor | permanent |
| watchlist.match | check-in trigger | visit_id + watchlist_entry_id + match_type | permanent |
| visitor.credential_synced | device ack | device_id + visitor_id + version | 1 year |

## Integration Points

- **Depends on:**
  - `identity-svc` — host user lookup, temporary user creation, credential management
  - `device-gw` — MQTT sync of temporary credentials to access devices
  - `vision-svc` — face matching for watchlist check at check-in (gRPC)
  - `notif-svc` — host notification (push, SMS, Telegram), visitor invitation (email, SMS)
  - `auth-svc` — JWT validation
- **Consumed by:**
  - `access-svc` — visitor access events linked to visits
  - `report-svc` — visitor analytics (volume, duration, host ranking)
  - `attend-svc` — contractor visit tracking
- **External:**
  - Email/SMS gateway for invitations
  - Badge printer hardware (via device-gw or direct USB)
  - Self-service terminals (Android app consuming visitor APIs)

## Notes

- QR codes encode: `dm3://visit/{qr_token}` — terminals and mobile apps decode this format.
- Visitor photos captured at check-in are stored in MinIO under `{tenant}/visitors/{visit_id}/checkin.jpg` with 90-day retention policy.
- For high-security sites, visitor check-in can require both QR scan + face capture + national ID scan. This is configurable per site.
- Vietnamese context: visitor purposes include "Họp dự án" (project meeting), "Phỏng vấn" (interview), "Ký hợp đồng" (contract signing), etc.
- The system supports group visits (e.g., 10 visitors for a factory tour). A single pre-registration can include multiple visitors with the same host, purpose, and schedule.
