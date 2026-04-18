# Feature: Identity Management

> Domain: MANAGE | Color: #8B5CF6 | Priority: P0
> Status: Draft | Owner: identity-svc team

## Overview
Identity Management is the central user directory for Duall Master 3.0 — the single source of truth for every individual who interacts with a building. It manages user profiles, credentials (face templates, cards, PINs, QR codes, mobile BLE), department/group structures, and orchestrates credential synchronization to access control devices. All access decisions happen locally on devices; this service ensures devices have up-to-date user and credential data.

## Data Models

### User
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | — | Tenant isolation |
| site_id | uuid | yes | — | Site assignment |
| employee_id | string(50) | no | — | HR system ID (e.g., `NV-2024-0042`) |
| first_name | string(100) | yes | — | Given name |
| last_name | string(100) | yes | — | Family name |
| display_name | string(200) | no | auto | Computed: `last_name first_name` (Vietnamese order) |
| email | string(255) | no | — | Email address |
| phone | string(20) | no | — | Phone number |
| department_id | uuid | no | — | FK to Department |
| person_type | PersonTypeEnum | yes | employee | Type of user |
| status | PersonStatusEnum | yes | active | Current status |
| photo_ref | string(500) | no | — | MinIO object reference for profile photo |
| role_template_id | uuid | no | — | FK to RoleTemplate (access provisioning) |
| metadata | jsonb | no | {} | Extensible fields (national_id, date_of_birth, etc.) |
| pin_hash | string(256) | no | — | Hashed PIN for door access |
| notes | text | no | — | Admin notes |
| activated_at | timestamp | no | — | When first credential was issued |
| deactivated_at | timestamp | no | — | When all credentials were revoked |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |
| created_by | uuid | yes | — | Actor who created |
| updated_by | uuid | yes | — | Actor who last updated |

### Credential
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | — | Tenant isolation |
| user_id | uuid | yes | — | FK to User |
| type | CredentialTypeEnum | yes | — | Credential type |
| value | string(1024) | yes | — | Card UID, PIN hash, QR token, BLE key |
| face_template_ref | string(500) | no | — | MinIO ref for face template binary blob |
| face_photo_ref | string(500) | no | — | MinIO ref for enrollment photo |
| facility_code | string(20) | no | — | Wiegand facility code (cards) |
| card_format | CardFormatEnum | no | — | 26-bit, 34-bit, OSDP, MIFARE, etc. |
| status | CredentialStatusEnum | yes | active | Current status |
| valid_from | timestamp | no | now() | Start of validity |
| valid_until | timestamp | no | — | Expiry (null = no expiry) |
| is_primary | boolean | no | false | Primary credential for this type |
| issued_count | int | no | 0 | Times this credential was (re)issued |
| last_used_at | timestamp | no | — | Last successful access event |
| sync_version | bigint | yes | 1 | Monotonic version for device sync |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### Department
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | — | Tenant isolation |
| site_id | uuid | yes | — | Site scope |
| name | string(200) | yes | — | Department name (e.g., "Kỹ thuật") |
| code | string(50) | no | — | Short code (e.g., "KT") |
| parent_id | uuid | no | — | FK to self for hierarchy |
| head_user_id | uuid | no | — | FK to User (department head) |
| sort_order | int | no | 0 | Display ordering |
| status | DeptStatusEnum | yes | active | Active or archived |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### UserGroup
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | — | Tenant isolation |
| site_id | uuid | yes | — | Site scope |
| name | string(200) | yes | — | Group name (e.g., "VIP", "All Areas") |
| description | text | no | — | Group description |
| group_type | GroupTypeEnum | yes | access | Purpose of group |
| is_system | boolean | no | false | System-managed (cannot delete) |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### UserGroupMembership
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| user_id | uuid | yes | — | FK to User |
| group_id | uuid | yes | — | FK to UserGroup |
| valid_from | timestamp | no | now() | Membership start |
| valid_until | timestamp | no | — | Membership expiry |
| created_at | timestamp | yes | now() | Creation time |

### CredentialSyncState
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| device_id | uuid | yes | — | Target device |
| credential_id | uuid | yes | — | FK to Credential |
| user_id | uuid | yes | — | FK to User (denormalized for speed) |
| sync_status | SyncStatusEnum | yes | pending | Current sync state |
| sync_version | bigint | yes | — | Version to sync |
| device_version | bigint | no | 0 | Version confirmed by device |
| last_attempt_at | timestamp | no | — | Last sync attempt |
| last_success_at | timestamp | no | — | Last successful sync |
| error_message | string(500) | no | — | Last error if failed |
| retry_count | int | no | 0 | Number of retries |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### Enums
```
PersonTypeEnum: employee | visitor | contractor | resident | tenant_staff | other
PersonStatusEnum: active | inactive | suspended | terminated
CredentialTypeEnum: card | face | pin | qr | mobile_ble | fingerprint
CredentialStatusEnum: active | suspended | expired | revoked | lost
CardFormatEnum: wiegand_26 | wiegand_34 | osdp | mifare_classic | mifare_desfire | em4100
GroupTypeEnum: access | notification | department | custom
DeptStatusEnum: active | archived
SyncStatusEnum: pending | syncing | synced | failed | deleted
```

## API Endpoints

### GET /api/v1/identity/users
- **Auth:** Bearer token, role >= viewer
- **Query params:**
  | Param | Type | Default | Description |
  |-------|------|---------|-------------|
  | page | int | 1 | Page number |
  | limit | int | 20 | Items per page (max 100) |
  | site_id | uuid | required | Filter by site |
  | search | string | — | Full-text search on name, email, phone, employee_id |
  | department_id | uuid | — | Filter by department |
  | group_id | uuid | — | Filter by user group |
  | person_type | string | — | Filter by type |
  | status | string | — | Filter by status |
  | has_credential | string | — | Filter: `face`, `card`, `pin`, `mobile_ble` |
  | sort | string | name | Sort field |
  | order | string | asc | Sort order |
- **Response 200:**
  ```json
  {
    "data": [{
      "id": "uuid",
      "display_name": "Nguyễn Văn An",
      "email": "nguyen.van.an@company.vn",
      "phone": "0912345678",
      "department": { "id": "uuid", "name": "Kỹ thuật" },
      "person_type": "employee",
      "status": "active",
      "photo_url": "https://...",
      "credentials_summary": { "card": true, "face": true, "pin": false, "mobile_ble": true },
      "groups": ["All Areas", "VIP"],
      "created_at": "2026-01-15T08:00:00Z"
    }],
    "total": 156,
    "page": 1,
    "limit": 20
  }
  ```
- **Errors:** 401, 403, 422

### POST /api/v1/identity/users
- **Auth:** role >= operator
- **Body:**
  ```json
  {
    "site_id": "uuid",
    "first_name": "Văn An",
    "last_name": "Nguyễn",
    "email": "nguyen.van.an@company.vn",
    "phone": "0912345678",
    "department_id": "uuid",
    "person_type": "employee",
    "role_template_id": "uuid",
    "metadata": { "national_id": "024099001234", "date_of_birth": "1990-05-15" }
  }
  ```
- **Side effects:** audit log `user.created`, NATS publish `dm.{tenant}.identity.user.created`
- **Response 201:** Created User resource

### GET /api/v1/identity/users/{id}
- **Auth:** role >= viewer
- **Response 200:** Full user detail with credentials summary, groups, recent events

### PUT /api/v1/identity/users/{id}
- **Auth:** role >= operator
- **Body:** Partial update fields
- **Side effects:** audit log `user.updated`, if status changed → NATS `dm.{tenant}.identity.user.status_changed`, trigger credential sync if relevant fields changed

### DELETE /api/v1/identity/users/{id}
- **Auth:** role >= admin
- **Side effects:** Soft-delete; revokes all credentials; publishes `user.deleted`; triggers credential removal sync to all devices
- **Response 200:** `{ "deleted": true }`

### POST /api/v1/identity/users/{id}/credentials
- **Auth:** role >= operator
- **Body:**
  ```json
  {
    "type": "card",
    "value": "UID-001234",
    "card_format": "mifare_desfire",
    "facility_code": "100",
    "valid_from": "2026-02-19T00:00:00Z",
    "valid_until": "2027-02-19T00:00:00Z",
    "is_primary": true
  }
  ```
- **Side effects:** audit log `credential.created`, triggers sync to all devices user has access to via MQTT
- **Response 201:** Created credential

### GET /api/v1/identity/users/{id}/credentials
- **Auth:** role >= viewer
- **Response 200:** List of credentials for user

### PUT /api/v1/identity/users/{user_id}/credentials/{cred_id}
- **Auth:** role >= operator
- **Side effects:** Increments `sync_version`, triggers re-sync to devices

### DELETE /api/v1/identity/users/{user_id}/credentials/{cred_id}
- **Auth:** role >= operator
- **Side effects:** Sets status to `revoked`, triggers credential removal from all devices

### POST /api/v1/identity/users/{id}/credentials/face/enroll
- **Auth:** role >= operator
- **Body:** `multipart/form-data` with photo file (JPEG/PNG, min 480x640)
- **Processing:** Calls vision-svc gRPC to extract face template → stores template in MinIO → creates Credential record → triggers sync
- **Response 201:** `{ "credential_id": "uuid", "quality_score": 0.92 }`

### POST /api/v1/identity/users/{id}/suspend
- **Auth:** role >= admin
- **Body:** `{ "reason": "Điều tra nội bộ" }`
- **Side effects:** Sets user status to `suspended`, suspends all credentials, triggers immediate credential removal from all devices (priority sync), audit log

### POST /api/v1/identity/users/{id}/reactivate
- **Auth:** role >= admin
- **Side effects:** Sets user status to `active`, reactivates previously-active credentials, triggers sync

### POST /api/v1/identity/users/import
- **Auth:** role >= admin
- **Body:** `multipart/form-data` with CSV/Excel file
- **Processing:** Validates, creates users in batch, returns summary with errors
- **Response 200:** `{ "imported": 45, "skipped": 3, "errors": [{"row": 12, "reason": "Duplicate email"}] }`

### GET /api/v1/identity/departments
- **Auth:** role >= viewer
- **Query params:** `site_id` (required), `include_tree` (boolean)
- **Response 200:** Flat or tree structure of departments

### POST /api/v1/identity/departments
- **Auth:** role >= admin
- **Body:** `{ "site_id": "uuid", "name": "Phòng Kỹ thuật", "code": "KT", "parent_id": "uuid" }`

### GET /api/v1/identity/groups
- **Auth:** role >= viewer

### POST /api/v1/identity/groups
- **Auth:** role >= admin

### POST /api/v1/identity/groups/{id}/members
- **Auth:** role >= operator
- **Body:** `{ "user_ids": ["uuid1", "uuid2"], "valid_until": "2026-12-31T23:59:59Z" }`
- **Side effects:** Updates group membership, triggers access rule re-evaluation and credential sync for affected users

### DELETE /api/v1/identity/groups/{id}/members
- **Auth:** role >= operator
- **Body:** `{ "user_ids": ["uuid1"] }`

### GET /api/v1/identity/sync/status
- **Auth:** role >= admin
- **Query params:** `site_id`, `device_id`, `user_id`
- **Response 200:** Sync state summary — pending, synced, failed counts per device

### POST /api/v1/identity/sync/retry
- **Auth:** role >= admin
- **Body:** `{ "device_id": "uuid" }` or `{ "credential_id": "uuid" }`
- **Side effects:** Re-queues failed syncs

## MQTT Topics

| Topic | Direction | QoS | Payload Schema | Description |
|-------|-----------|-----|----------------|-------------|
| `dm/{tenant}/device/{device_id}/cfg/users` | server→device | 1 | `{ "action": "add\|update\|delete", "user_id": "uuid", "credentials": [...], "sync_version": 42 }` | Push user credentials to device |
| `dm/{tenant}/device/{device_id}/cfg/users/bulk` | server→device | 1 | `{ "users": [...], "sync_version": 42 }` | Bulk sync (initial or full re-sync) |
| `dm/{tenant}/device/{device_id}/cfg/users/ack` | device→server | 1 | `{ "user_id": "uuid", "sync_version": 42, "status": "ok\|error", "error": "..." }` | Device confirms credential sync |
| `dm/{tenant}/device/{device_id}/evt/access` | device→server | 1 | `{ "user_id": "uuid", "credential_type": "face", "decision": "granted", "time": "..." }` | Access event from device |

## Business Rules

1. **BR-ID-001: Unique credential per type per user.** A user can have at most one active credential of each type (one active card, one active face template, one active PIN). Creating a new one of the same type auto-revokes the previous one.

2. **BR-ID-002: Card UID uniqueness.** A card UID must be unique across the entire tenant. Attempting to assign an already-assigned card returns 409 Conflict with the current holder's name.

3. **BR-ID-003: Face quality threshold.** Face enrollment must meet a minimum quality score of 0.7 (configurable per site). Photos below threshold are rejected with guidance ("Ánh sáng không đủ", "Khuôn mặt bị che").

4. **BR-ID-004: PIN format.** PINs must be 4-8 digits. PINs are stored as bcrypt hashes. Common PINs (1234, 0000, sequential) are rejected.

5. **BR-ID-005: Credential expiry auto-revoke.** A background job runs every 15 minutes checking `valid_until`. Expired credentials are set to `expired` status and a removal sync is triggered to devices. A warning notification is sent 7 days before expiry.

6. **BR-ID-006: Suspend cascades to credentials.** Suspending a user immediately suspends all their credentials and triggers priority sync (within 5 seconds for online devices).

7. **BR-ID-007: Terminate cascades and is irreversible.** Setting status to `terminated` revokes all credentials permanently, removes from all groups, triggers immediate device sync, and archives the record. Reactivation requires admin creating a new record.

8. **BR-ID-008: Department deletion blocked if members exist.** Cannot delete a department that has active users. Must reassign users first.

9. **BR-ID-009: Group membership with access rules.** When a user is added to a group that has associated access rules, credential sync is triggered for all doors in those rules.

10. **BR-ID-010: Sync version monotonic increment.** Every credential change increments `sync_version`. Devices only accept updates with version > their current version, preventing out-of-order updates.

11. **BR-ID-011: HR sync deduplication.** When syncing from HR/ERP systems, `employee_id` is the dedup key. Matching records are updated; new records are created; missing records are flagged (not auto-terminated — requires admin review).

12. **BR-ID-012: Photo storage policy.** Profile photos are resized to max 800x800 and stored in MinIO. Face enrollment photos are stored separately at original resolution for re-enrollment purposes.

13. **BR-ID-013: Bulk import limit.** CSV/Excel import is limited to 1,000 rows per request. Larger imports must be split. Import is transactional — all-or-nothing per batch.

14. **BR-ID-014: Credential sync priority.** Credential revocations and suspensions use QoS 2 MQTT and are retried every 10 seconds until device confirms. New credential additions use QoS 1 with standard retry.

## Permissions Matrix

| Action | viewer | operator | admin | site_admin | super_admin |
|--------|--------|----------|-------|------------|-------------|
| List users | ✅ | ✅ | ✅ | ✅ | ✅ |
| View user detail | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create user | ❌ | ✅ | ✅ | ✅ | ✅ |
| Update user | ❌ | ✅ | ✅ | ✅ | ✅ |
| Delete user | ❌ | ❌ | ✅ | ✅ | ✅ |
| Suspend/terminate | ❌ | ❌ | ✅ | ✅ | ✅ |
| Manage credentials | ❌ | ✅ | ✅ | ✅ | ✅ |
| Enroll face | ❌ | ✅ | ✅ | ✅ | ✅ |
| Bulk import | ❌ | ❌ | ✅ | ✅ | ✅ |
| Manage departments | ❌ | ❌ | ✅ | ✅ | ✅ |
| Manage groups | ❌ | ❌ | ✅ | ✅ | ✅ |
| View sync status | ❌ | ✅ | ✅ | ✅ | ✅ |
| Retry sync | ❌ | ❌ | ✅ | ✅ | ✅ |

## Offline Behavior

- **Device-side:** Each access control device stores a local user database with credential data (face templates, card UIDs, PIN hashes). Devices make all access decisions locally — the server is NEVER in the decision loop. When a device is offline, it continues granting/denying access based on its local database.
- **Sync strategy:** Server pushes credential changes to devices via MQTT. Each credential change increments a monotonic `sync_version`. When a device reconnects after being offline, it reports its last `sync_version` per user. The server computes the delta and pushes only changed records. For initial provisioning or corrupted state, a full bulk sync can be triggered.
- **Conflict resolution:** Server-wins. The server's user database is authoritative. If a device has stale data, the server's version always overwrites. Sync versions ensure ordering.
- **Local storage:** Devices typically store 10,000–50,000 user records (face templates ~2KB each, card UIDs ~100B each). Face templates are compressed. A site with 5,000 users uses ~12MB of device storage for face templates.
- **Event buffering:** Access events that occur while the device is offline are stored locally on the device (up to 100,000 events). When connectivity is restored, events are uploaded in chronological order via MQTT, then the device receives any pending credential updates.
- **Priority sync:** Credential revocations (suspend/terminate) are flagged as priority. When the device comes online, priority deletes are processed before any additions. This ensures a terminated employee's credentials are removed even if there's a large sync backlog.
- **Sync monitoring:** The `CredentialSyncState` table tracks per-device, per-credential sync status. An admin dashboard shows: devices with pending syncs, failed syncs, time since last successful sync. Alerts fire if any device is >1 hour behind on syncs.

## UI Pages

| Route | Page | Key Components |
|-------|------|----------------|
| /manage/identities | User list | DataTable with search, department/status filters, credential icons, bulk actions |
| /manage/identities/:id | User detail | Profile header, credential tabs (Card/Face/PIN/Mobile), group membership, access history timeline, sync status |
| /manage/identities/new | Create user | Multi-step form: basic info → department → credentials → groups |
| /manage/identities/import | Bulk import | File upload, column mapping, validation preview, import progress |
| /manage/departments | Department tree | Hierarchical tree view, drag-drop reorder, member count badges |
| /manage/groups | Group list | DataTable, member count, linked access rules |

## Events & Audit Log

| Event Type | Trigger | Payload | Retention |
|------------|---------|---------|-----------|
| user.created | POST create | full resource | 7 years |
| user.updated | PUT update | diff only | 7 years |
| user.suspended | POST suspend | id + reason + actor | 7 years |
| user.terminated | POST terminate | id + reason + actor | permanent |
| user.reactivated | POST reactivate | id + actor | 7 years |
| user.deleted | DELETE | id + actor | permanent |
| credential.created | POST credential | type + user_id + actor | 7 years |
| credential.revoked | DELETE credential | type + user_id + actor | 7 years |
| credential.expired | auto job | type + user_id | 7 years |
| credential.synced | device ack | device_id + user_id + version | 1 year |
| credential.sync_failed | device nack | device_id + user_id + error | 1 year |
| group.member_added | POST members | group_id + user_ids | 7 years |
| group.member_removed | DELETE members | group_id + user_ids | 7 years |
| user.imported | POST import | count + filename + actor | 7 years |

## Integration Points

- **Depends on:**
  - `auth-svc` — JWT validation, user permissions
  - `vision-svc` — face template extraction during enrollment (gRPC)
  - `device-gw` — MQTT credential sync to devices
  - `access-svc` — access rules that reference user groups (gRPC query)
  - `tenant-svc` — tenant configuration, site hierarchy
- **Consumed by:**
  - `access-svc` — queries user/credential data for rule management and analytics
  - `visitor-svc` — creates temporary user records with visitor type
  - `attend-svc` — reads user data for attendance records
  - `report-svc` — user analytics, department reports
  - `notif-svc` — sends credential expiry warnings
- **External:**
  - HR/ERP systems (REST webhook or scheduled sync)
  - Active Directory / LDAP (user sync)

## Notes

- Face template format is device-specific. identity-svc stores a canonical template (from vision-svc) and device-gw converts to device-specific format during sync.
- The system supports multi-site users (e.g., an employee with access to Tòa nhà Landmark 72 and Tòa nhà Vietcombank Tower). Each site maintains its own credential sync state.
- Vietnamese names follow family-name-first convention. `display_name` is auto-generated as `last_name + first_name` but can be overridden.
- For GDPR/PDPA compliance, user data export and deletion APIs exist but are controlled by super_admin role.
