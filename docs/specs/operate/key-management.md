# Feature: Key Management

> Domain: OPERATE | Color: #4CAF50 | Priority: P2
> Status: NOT IMPLEMENTED | Owner: key-svc team

## Overview
Key Management tracks the inventory, checkout, return, and audit trail of physical keys and key-like assets (access cards, fobs, master keys). Supports electronic key cabinet integration, overdue alerts, approval workflows for restricted keys, and full audit trail for compliance. Designed for buildings that still maintain physical locks alongside electronic access control.

## Data Models

### KeyItem
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | — | Tenant reference |
| site_id | uuid | yes | — | Site reference |
| key_code | text | yes | — | Unique key identifier (e.g., "MK-A-001") |
| name | text | yes | — | Key name (e.g., "Chìa khóa phòng server tầng 3") |
| type | KeyType | yes | — | Key type |
| category | KeyCategory | yes | normal | Restriction level |
| description | text | no | — | Description / notes |
| location_desc | text | no | — | What this key opens |
| cabinet_id | uuid | no | — | Electronic cabinet reference |
| cabinet_slot | int | no | — | Slot number in cabinet |
| status | KeyStatus | yes | available | Current status |
| current_holder_id | uuid | no | — | User currently holding key |
| checkout_at | timestamptz | no | — | Current checkout time |
| expected_return | timestamptz | no | — | Expected return time |
| max_checkout_hours | int | yes | 24 | Max allowed checkout duration |
| requires_approval | bool | yes | false | Approval needed for checkout |
| approver_ids | uuid[] | no | — | Authorized approvers |
| authorized_persons | uuid[] | no | — | Users allowed to checkout |
| authorized_roles | text[] | no | — | Roles allowed to checkout |
| copy_number | int | no | 1 | Copy number (of total copies) |
| total_copies | int | no | 1 | Total copies of this key |
| parent_key_id | uuid | no | — | Master key reference |
| photo_ref | text | no | — | Key photo |
| metadata | jsonb | no | {} | Custom fields |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### KeyCabinet
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | — | Tenant reference |
| site_id | uuid | yes | — | Site reference |
| name | text | yes | — | Cabinet name |
| location | jsonb | yes | — | Physical location |
| model | text | no | — | Cabinet model |
| manufacturer | text | no | — | Manufacturer |
| total_slots | int | yes | — | Number of key slots |
| device_id | uuid | no | — | IoT device reference |
| access_method | text | yes | pin | pin / card / biometric |
| status | text | yes | online | online / offline / maintenance |
| last_heartbeat | timestamptz | no | — | Last device ping |
| metadata | jsonb | no | {} | Custom fields |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### KeyTransaction
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | — | Tenant reference |
| key_id | uuid | yes | — | Key reference |
| type | TransactionType | yes | — | Transaction type |
| user_id | uuid | yes | — | User involved |
| authorized_by | uuid | no | — | Approver (if approval required) |
| checkout_at | timestamptz | no | — | Checkout timestamp |
| expected_return | timestamptz | no | — | Expected return |
| returned_at | timestamptz | no | — | Actual return timestamp |
| purpose | text | no | — | Reason for checkout |
| notes | text | no | — | Transaction notes |
| cabinet_slot | int | no | — | Slot used |
| overdue | bool | no | false | Was/is overdue |
| overdue_hours | decimal(6,1) | no | — | Hours overdue |
| photo_ref | text | no | — | Evidence photo |
| metadata | jsonb | no | {} | Custom fields |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### KeyRequest
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | — | Tenant reference |
| key_id | uuid | yes | — | Requested key |
| requester_id | uuid | yes | — | Requesting user |
| approver_id | uuid | no | — | Assigned approver |
| status | RequestStatus | yes | pending | Request status |
| purpose | text | yes | — | Reason for request |
| requested_from | timestamptz | yes | — | Desired checkout time |
| requested_until | timestamptz | yes | — | Desired return time |
| approved_at | timestamptz | no | — | Approval timestamp |
| rejected_reason | text | no | — | Rejection reason |
| transaction_id | uuid | no | — | Resulting transaction |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### Enums
```
KeyType: physical_key | master_key | sub_master | card_key | fob | padlock | safe_key | cabinet_key
KeyCategory: normal | restricted | master | emergency
KeyStatus: available | checked_out | overdue | lost | damaged | decommissioned
TransactionType: checkout | return | transfer | lost_report | found_report
RequestStatus: pending | approved | rejected | expired | cancelled
```

## API Endpoints

### GET /api/v1/keys
- **Auth:** Bearer token, role >= viewer
- **Query params:**
  | Param | Type | Default | Description |
  |-------|------|---------|-------------|
  | page | int | 1 | Page number |
  | limit | int | 20 | Items per page (max 100) |
  | site_id | uuid | required | Filter by site |
  | status | KeyStatus | — | Filter by status |
  | type | KeyType | — | Filter by type |
  | category | KeyCategory | — | Filter by category |
  | cabinet_id | uuid | — | Filter by cabinet |
  | holder_id | uuid | — | Filter by current holder |
  | overdue | bool | — | Only overdue keys |
  | search | text | — | Search name/code |
- **Response 200:**
  ```json
  {
    "data": [{
      "id": "uuid",
      "key_code": "MK-A-001",
      "name": "Chìa khóa phòng server tầng 3",
      "type": "physical_key",
      "category": "restricted",
      "status": "checked_out",
      "current_holder": {"id": "uuid", "name": "Nguyễn Văn A"},
      "checkout_at": "2026-02-19T08:00:00+07:00",
      "expected_return": "2026-02-19T17:00:00+07:00",
      "overdue": false,
      "cabinet": {"id": "uuid", "name": "Tủ chìa sảnh", "slot": 15}
    }],
    "total": 85,
    "summary": {
      "total_keys": 85,
      "available": 62,
      "checked_out": 20,
      "overdue": 2,
      "lost": 1
    }
  }
  ```

### POST /api/v1/keys
- **Auth:** role >= admin
- **Body:**
  ```json
  {
    "site_id": "uuid",
    "key_code": "MK-A-001",
    "name": "Chìa khóa phòng server tầng 3",
    "type": "physical_key",
    "category": "restricted",
    "cabinet_id": "uuid",
    "cabinet_slot": 15,
    "max_checkout_hours": 8,
    "requires_approval": true,
    "approver_ids": ["uuid"],
    "authorized_roles": ["facility_manager", "it_admin"]
  }
  ```
- **Response 201:** Created key

### GET /api/v1/keys/{id}
- **Auth:** role >= viewer
- **Response 200:** Full key detail with current holder, transaction history, cabinet status

### PUT /api/v1/keys/{id}
- **Auth:** role >= admin
- **Response 200:** Updated key

### DELETE /api/v1/keys/{id}
- **Auth:** role >= site_admin
- **Validation:** Key must be available (not checked out)
- **Response 204:** No content

### POST /api/v1/keys/{id}/checkout
- **Auth:** authorized user or role >= operator
- **Body:**
  ```json
  {
    "user_id": "uuid",
    "purpose": "Bảo trì server định kỳ",
    "expected_return": "2026-02-19T17:00:00+07:00"
  }
  ```
- **Validation:** Key available, user authorized, approval if required
- **Side effects:** Update key status, open cabinet slot, create transaction, audit log, schedule overdue check
- **Response 200:** Transaction record

### POST /api/v1/keys/{id}/return
- **Auth:** current holder or role >= operator
- **Body:**
  ```json
  {
    "notes": "Hoàn thành bảo trì"
  }
  ```
- **Side effects:** Update key status to available, close transaction, update cabinet slot, audit log
- **Response 200:** Completed transaction

### POST /api/v1/keys/{id}/report-lost
- **Auth:** current holder or role >= operator
- **Body:** `{"notes": "Bị mất trong quá trình di chuyển", "last_known_location": "Tầng 5"}`
- **Side effects:** Key status → lost, alert admin, create incident, consider lock change recommendation, audit log
- **Response 200:** Updated key

### GET /api/v1/keys/requests
- **Auth:** role >= operator
- **Query params:** site_id, status, requester_id, key_id
- **Response 200:** Request list

### POST /api/v1/keys/requests
- **Auth:** any authenticated user
- **Body:**
  ```json
  {
    "key_id": "uuid",
    "purpose": "Cần vào phòng server để thay ổ cứng",
    "requested_from": "2026-02-20T09:00:00+07:00",
    "requested_until": "2026-02-20T12:00:00+07:00"
  }
  ```
- **Side effects:** Notify approver, audit log
- **Response 201:** Created request

### POST /api/v1/keys/requests/{id}/approve
- **Auth:** designated approver
- **Body:** `{"notes": "Đã duyệt"}`
- **Side effects:** Update request status, notify requester, audit log
- **Response 200:** Approved request

### POST /api/v1/keys/requests/{id}/reject
- **Auth:** designated approver
- **Body:** `{"reason": "Không có nhu cầu rõ ràng"}`
- **Side effects:** Notify requester, audit log
- **Response 200:** Rejected request

### GET /api/v1/keys/cabinets
- **Auth:** role >= operator
- **Query params:** site_id, status
- **Response 200:** Cabinet list with slot occupancy

### POST /api/v1/keys/cabinets
- **Auth:** role >= admin
- **Body:** Cabinet registration
- **Response 201:** Created cabinet

### GET /api/v1/keys/cabinets/{id}
- **Auth:** role >= operator
- **Response 200:** Cabinet detail with all slot statuses

### GET /api/v1/keys/transactions
- **Auth:** role >= operator
- **Query params:** site_id, key_id, user_id, type, from, to, overdue
- **Response 200:** Transaction list

### GET /api/v1/keys/dashboard
- **Auth:** role >= operator
- **Query params:** site_id
- **Response 200:**
  ```json
  {
    "total_keys": 85,
    "available": 62,
    "checked_out": 20,
    "overdue": 2,
    "lost": 1,
    "pending_requests": 3,
    "overdue_details": [
      {"key": "MK-A-001", "holder": "Nguyễn Văn A", "overdue_hours": 4.5}
    ],
    "today_checkouts": 8,
    "today_returns": 6,
    "cabinets": [{"name": "Tủ chìa sảnh", "status": "online", "slots_used": 45, "total_slots": 60}]
  }
  ```

## MQTT Topics

| Topic | Direction | QoS | Payload Schema | Description |
|-------|-----------|-----|----------------|-------------|
| dm3/{site}/key/cabinet/{id}/slot/{slot}/cmd | server→device | 1 | `{"action":"unlock","user_id":"...","transaction_id":"..."}` | Unlock specific cabinet slot |
| dm3/{site}/key/cabinet/{id}/slot/{slot}/status | device→server | 1 | `{"key_present":true,"door_open":false,"timestamp":"..."}` | Slot sensor status |
| dm3/{site}/key/cabinet/{id}/status | device→server | 1 | `{"online":true,"door_status":"closed","battery_percent":95}` | Cabinet health |
| dm3/{site}/key/cabinet/{id}/access | device→server | 1 | `{"user_id":"...","method":"card","slot":15,"action":"open","timestamp":"..."}` | Cabinet access event |

## Business Rules
1. **Authorization check:** IF key.requires_approval = false THEN checkout allowed for authorized_persons or authorized_roles. IF requires_approval = true THEN approved request required before checkout.
2. **Single holder:** IF key status = checked_out THEN no other user can checkout the same key. Transfer requires return first (or explicit transfer action by admin).
3. **Overdue detection:** IF now() > transaction.expected_return AND key not returned THEN mark key as overdue, send notification to holder + admin at intervals (1h, 4h, 24h).
4. **Cabinet slot sync:** IF key returned to cabinet THEN sensor detects key_present=true, server auto-completes transaction. IF key removed without server authorization THEN alert security.
5. **Lost key protocol:** IF key reported lost AND key.category = master THEN auto-create high-priority maintenance work order for lock change assessment.
6. **Emergency key access:** IF emergency mode active THEN emergency keys (category=emergency) released without approval. All transactions logged with emergency flag.
7. **Maximum checkout duration:** IF checkout duration would exceed max_checkout_hours THEN warn at checkout, enforce hard limit with auto-escalation to admin.
8. **End of business auto-check:** At end of business day (configurable), scan all keys. IF any expected-return-today keys not returned THEN send batch reminder notification.
9. **Key transfer audit:** IF admin transfers key from user A to user B THEN close transaction A, create new transaction B, full audit trail maintained.
10. **Restricted key logging:** IF key.category = restricted OR master THEN all checkouts require purpose field, photo evidence optional but recommended.
11. **Duplicate checkout prevention:** IF user already holds another key from same set (same parent_key_id) THEN warn/block depending on policy.
12. **Cabinet offline fallback:** IF cabinet offline THEN manual checkout via operator with physical override. Log as "manual_override" in transaction.

## Permissions Matrix

| Action | viewer | operator | admin | site_admin | super_admin |
|--------|--------|----------|-------|------------|-------------|
| View key inventory | ✅ | ✅ | ✅ | ✅ | ✅ |
| View transactions | ❌ | ✅ | ✅ | ✅ | ✅ |
| Checkout (authorized) | ❌ | ✅ | ✅ | ✅ | ✅ |
| Return key | ❌ | ✅ | ✅ | ✅ | ✅ |
| Request key | ✅ | ✅ | ✅ | ✅ | ✅ |
| Approve requests | ❌ | ❌ | ✅* | ✅ | ✅ |
| Report lost | ❌ | ✅ | ✅ | ✅ | ✅ |
| Transfer key | ❌ | ❌ | ✅ | ✅ | ✅ |
| Manage keys | ❌ | ❌ | ✅ | ✅ | ✅ |
| Manage cabinets | ❌ | ❌ | ✅ | ✅ | ✅ |
| Delete keys | ❌ | ❌ | ❌ | ✅ | ✅ |
| Emergency override | ❌ | ❌ | ✅ | ✅ | ✅ |
| View audit reports | ❌ | ❌ | ✅ | ✅ | ✅ |

*\* admin can approve only if designated as approver for that key*

## Offline Behavior
- **Key cabinet:** Continue operating with cached authorization list. Accept card/PIN access, unlock slots per cached rules. Buffer all transactions locally (up to 5,000 events).
- **Mobile app (operator):** Cache key inventory and authorized users list. Allow manual checkout/return logging offline. Queue for sync.
- **Sync strategy:** On reconnection, cabinet uploads all buffered transactions. Server reconciles key states. Mobile-queued transactions merged chronologically.
- **Conflict resolution:** Physical state wins — if cabinet sensor says key is present but server thinks checked_out, flag for manual reconciliation. Server creates "discrepancy" alert.
- **Local storage:** Cabinet: authorization list ~1MB, transaction buffer ~2MB. Mobile: key inventory ~500KB. TTL: authorization list refreshed every 4 hours.

## UI Pages
| Route | Page | Key Components |
|-------|------|----------------|
| /operate/keys | Dashboard | Key overview, overdue alerts, cabinet status |
| /operate/keys/inventory | Key inventory | DataTable, filters, status indicators |
| /operate/keys/inventory/:id | Key detail | Status, current holder, transaction history |
| /operate/keys/checkout | Checkout form | Key picker, user search, purpose, duration |
| /operate/keys/requests | Approval queue | Pending requests, approve/reject actions |
| /operate/keys/transactions | Transaction log | Full audit trail, filters, export |
| /operate/keys/cabinets | Cabinet management | Cabinet list, slot map, health status |
| /operate/keys/cabinets/:id | Cabinet detail | Slot grid, real-time status, access log |

## Events & Audit Log

| Event Type | Trigger | Payload | Retention |
|------------|---------|---------|-----------|
| key.created | POST create | full key | permanent |
| key.updated | PUT update | diff only | permanent |
| key.deleted | DELETE | key_id + actor | permanent |
| key.checked_out | POST checkout | transaction + key + user + purpose | permanent |
| key.returned | POST return | transaction + key + user + duration | permanent |
| key.transferred | Transfer action | from_person + to_person + key | permanent |
| key.overdue | Auto-detection | key_id + holder + overdue_hours | permanent |
| key.lost | Report lost | key_id + holder + notes | permanent |
| key.found | Report found | key_id + finder + location | permanent |
| key.request.created | POST request | full request | 1 year |
| key.request.approved | Approval action | request_id + approver | permanent |
| key.request.rejected | Rejection action | request_id + approver + reason | permanent |
| key.cabinet.accessed | Cabinet door opened | cabinet_id + user + method | 1 year |
| key.cabinet.slot_opened | Slot unlocked | cabinet_id + slot + user + key | permanent |
| key.cabinet.unauthorized | Unauthorized attempt | cabinet_id + user + method | permanent |

## Integration Points
- **Depends on:** identity-svc (user lookup, authorization), notif-svc (overdue alerts, approval notifications), device-gw (cabinet device management), tenant-svc (site hierarchy), auth-svc (JWT)
- **Consumed by:** analytics/report-svc (key usage reports, compliance), automate-svc (key triggers — e.g., fire mode release all emergency keys), maintenance-svc (lost key → lock change WO), audit-svc (compliance trail)
- **External:** Electronic key cabinet hardware (e.g., Traka, KeyWatcher, Morse Watchmans), NFC/RFID readers for cabinet access

## Notes
- All key transactions are permanently retained (never purged) for compliance and security audit
- Vietnamese building context: many buildings use a mix of physical keys and electronic access — this module bridges that gap
- Master key hierarchy: master_key → sub_master → individual keys. Loss of master key has cascading security implications
- Consider key cabinet API integration protocols — most major brands support TCP/IP with proprietary protocols
- Emergency key release should integrate with fire alarm system via automate-svc
