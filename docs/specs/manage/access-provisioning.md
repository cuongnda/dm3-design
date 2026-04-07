# Feature: Access Provisioning

> Domain: MANAGE | Color: #8B5CF6 | Priority: P0
> Status: Draft | Owner: MANAGE Team

## Overview

Access Provisioning is the policy engine that determines who gets access to what — managing the full lifecycle from request to approval to provisioning to revocation. It provides role-based access templates for automatic provisioning on hire, self-service request portals for ad-hoc access, approval workflows with multi-level chains, bulk provisioning for large groups, and scheduled/temporary access with auto-expiry. **Access rules are synced down to devices; the server manages templates, workflows, and lifecycle automation.** Integration with HR/identity systems enables zero-touch onboarding and instant revocation on termination.

## Data Models

### AccessTemplate
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | - | Tenant isolation |
| site_id | uuid | yes | - | Site scope |
| name | string(100) | yes | - | e.g. "Nhân viên kỹ thuật — Tòa B" |
| description | string(500) | no | null | Template description |
| department | string(100) | no | null | Auto-match department |
| job_role | string(100) | no | null | Auto-match job role |
| door_ids | uuid[] | yes | - | Doors granted by this template |
| zone_ids | uuid[] | no | [] | Zone-based grant (alternative to door_ids) |
| schedule_id | uuid | no | null | Time schedule reference |
| credential_types | CredentialTypeEnum[] | yes | - | Required credential types |
| anti_passback | boolean | yes | false | Enable anti-passback |
| multi_factor | boolean | yes | false | Require MFA |
| valid_duration_days | int | no | null | Auto-expiry days from provisioning (null = permanent) |
| auto_provision | boolean | yes | false | Auto-apply on matching hire |
| auto_deprovision | boolean | yes | true | Auto-revoke on termination |
| requires_approval | boolean | yes | false | Require approval for manual requests |
| approval_chain_id | uuid | no | null | Approval chain reference |
| max_concurrent_users | int | no | null | Capacity limit |
| current_user_count | int | yes | 0 | Cached count |
| enabled | boolean | yes | true | Active toggle |
| created_by | uuid | yes | - | Creator |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### AccessRequest
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | - | Tenant isolation |
| site_id | uuid | yes | - | Site scope |
| request_number | string(20) | yes | auto | Human-readable ID, e.g. "REQ-2026-0042" |
| type | RequestTypeEnum | yes | - | Request category |
| requester_id | uuid | yes | - | User requesting |
| beneficiary_id | uuid | yes | - | User who gets access (may differ from requester) |
| template_id | uuid | no | null | From template (if template-based request) |
| door_ids | uuid[] | no | [] | Specific doors (if custom request) |
| zone_ids | uuid[] | no | [] | Specific zones (if custom request) |
| schedule_id | uuid | no | null | Requested schedule |
| valid_from | timestamp | yes | now() | Access start date |
| valid_until | timestamp | no | null | Access end date (null = permanent, requires higher approval) |
| reason | string(500) | yes | - | Business justification |
| status | RequestStatusEnum | yes | pending | Current status |
| priority | PriorityEnum | yes | normal | Request priority |
| approval_chain_id | uuid | no | null | Approval chain |
| current_approver_id | uuid | no | null | Current pending approver |
| approvals | jsonb | yes | [] | Array of {approver_id, decision, comment, decided_at} |
| provisioned_at | timestamp | no | null | When access was actually provisioned |
| provisioned_rule_ids | uuid[] | no | [] | Access rules created by this request |
| revoked_at | timestamp | no | null | When access was revoked |
| revoke_reason | string(200) | no | null | Revocation reason |
| metadata | jsonb | no | {} | Extra data |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### ApprovalChain
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | - | Tenant isolation |
| site_id | uuid | yes | - | Site scope |
| name | string(100) | yes | - | e.g. "Phê duyệt 2 cấp — Quản lý + An ninh" |
| steps | jsonb | yes | - | Array of ApprovalStep |
| escalation_timeout_hours | int | yes | 48 | Auto-escalate after hours |
| auto_approve_on_timeout | boolean | yes | false | Auto-approve or auto-deny on timeout |
| enabled | boolean | yes | true | Active toggle |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### ApprovalStep (embedded in ApprovalChain.steps JSONB)
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| order | int | yes | Step order (1-based) |
| name | string(100) | yes | e.g. "Quản lý trực tiếp" |
| approver_type | ApproverTypeEnum | yes | How to resolve approver |
| approver_id | uuid | no | Specific user (if type=specific) |
| approver_role | string | no | Role to match (if type=role) |
| can_delegate | boolean | yes | Approver can delegate to another |
| required | boolean | yes | Must approve (vs optional/informational) |

### BulkProvisionJob
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | - | Tenant isolation |
| site_id | uuid | yes | - | Site scope |
| name | string(100) | yes | - | Job description |
| template_id | uuid | yes | - | Template to apply |
| user_ids | uuid[] | yes | - | Target users |
| total_count | int | yes | - | Total users |
| processed_count | int | yes | 0 | Processed so far |
| success_count | int | yes | 0 | Successfully provisioned |
| failed_count | int | yes | 0 | Failed |
| status | JobStatusEnum | yes | pending | Job status |
| errors | jsonb | no | [] | Array of {user_id, error} |
| created_by | uuid | yes | - | Initiator |
| started_at | timestamp | no | null | Processing start |
| completed_at | timestamp | no | null | Processing end |
| created_at | timestamp | yes | now() | Creation time |

### Enums
```
RequestTypeEnum: template_based | custom | temporary | scheduled | extension | revocation
RequestStatusEnum: draft | pending | approved | rejected | provisioned | expired | revoked | cancelled
PriorityEnum: low | normal | high | urgent
ApproverTypeEnum: specific | role | manager | department_head | security_admin
JobStatusEnum: pending | processing | completed | failed | cancelled
CredentialTypeEnum: card | face | fingerprint | pin | qr | mobile_ble
```

## API Endpoints

### GET /api/v1/provisioning/templates
- **Auth:** Bearer token, role >= viewer
- **Query params:**
  | Param | Type | Default | Description |
  |-------|------|---------|-------------|
  | page | int | 1 | Page number |
  | limit | int | 20 | Items per page (max 100) |
  | site_id | uuid | required | Filter by site |
  | department | string | - | Filter by department |
  | job_role | string | - | Filter by role |
  | auto_provision | boolean | - | Filter auto-provision templates |
  | search | string | - | Search name |
- **Response 200:** Paginated list of AccessTemplate
- **Errors:** 401, 403, 422

### GET /api/v1/provisioning/templates/{id}
- **Auth:** role >= viewer
- **Response 200:** Full template with nested doors, zones, schedule, current users
- **Errors:** 401, 403, 404

### POST /api/v1/provisioning/templates
- **Auth:** role >= admin
- **Body:**
  ```json
  {
    "name": "Nhân viên kế toán — Tầng 4",
    "site_id": "uuid",
    "department": "Kế toán",
    "job_role": "Accountant",
    "door_ids": ["uuid1", "uuid2", "uuid3"],
    "schedule_id": "uuid",
    "credential_types": ["face", "card"],
    "auto_provision": true,
    "auto_deprovision": true,
    "requires_approval": false
  }
  ```
- **Side effects:** Audit log. If auto_provision=true, retroactively provisions all matching unprovisioned users.
- **Response 201:** Created template
- **Errors:** 401, 403, 422

### PUT /api/v1/provisioning/templates/{id}
- **Auth:** role >= admin
- **Body:** Partial update
- **Side effects:** Audit log. If doors/schedule changed, re-syncs access rules to affected devices.
- **Response 200:** Updated template
- **Errors:** 401, 403, 404, 422

### DELETE /api/v1/provisioning/templates/{id}
- **Auth:** role >= site_admin
- **Side effects:** Audit log. Does NOT auto-revoke existing access — requires explicit bulk revocation.
- **Response 204**
- **Errors:** 401, 403, 404, 409 (has active provisions — must revoke first or force)

### POST /api/v1/provisioning/requests
- **Auth:** role >= viewer (self-service for own access), role >= operator (for others)
- **Body:**
  ```json
  {
    "type": "template_based",
    "site_id": "uuid",
    "beneficiary_id": "uuid",
    "template_id": "uuid",
    "valid_from": "2026-03-01T00:00:00Z",
    "valid_until": "2026-06-30T23:59:59Z",
    "reason": "Dự án chuyển đổi số — cần truy cập phòng server"
  }
  ```
- **Side effects:** Audit log, determines approval chain, notifies first approver
- **Response 201:**
  ```json
  {
    "id": "uuid",
    "request_number": "REQ-2026-0042",
    "status": "pending",
    "current_approver": { "id": "uuid", "name": "Nguyễn Văn Minh" },
    "approval_chain": [
      { "order": 1, "name": "Quản lý trực tiếp", "status": "pending" },
      { "order": 2, "name": "Trưởng phòng An ninh", "status": "waiting" }
    ]
  }
  ```
- **Errors:** 401, 403, 422, 409 (duplicate active request for same beneficiary + template)

### GET /api/v1/provisioning/requests
- **Auth:** role >= viewer (sees own requests), role >= operator (sees team), role >= admin (sees all)
- **Query params:** site_id (required), status, type, requester_id, beneficiary_id, from, to, page, limit
- **Response 200:** Paginated list of AccessRequest

### GET /api/v1/provisioning/requests/{id}
- **Auth:** role >= viewer (own requests or assigned approver)
- **Response 200:** Full request with approval timeline, provisioned rules
- **Errors:** 401, 403, 404

### POST /api/v1/provisioning/requests/{id}/approve
- **Auth:** Must be the current_approver_id
- **Body:** `{ "comment": "Đồng ý — phù hợp yêu cầu dự án" }`
- **Side effects:** Records approval, advances to next step or provisions access if final step, notifies requester, audit log
- **Response 200:**
  ```json
  {
    "request_id": "uuid",
    "status": "approved",
    "next_step": null,
    "provisioned": true,
    "provisioned_rule_ids": ["uuid1"]
  }
  ```
- **Errors:** 401, 403, 404, 409 (not current approver or already decided)

### POST /api/v1/provisioning/requests/{id}/reject
- **Auth:** Must be the current_approver_id
- **Body:** `{ "comment": "Không đủ lý do — cần phê duyệt từ CTO" }`
- **Side effects:** Rejects request, notifies requester, audit log
- **Response 200:** Rejected request
- **Errors:** 401, 403, 404, 409

### POST /api/v1/provisioning/requests/{id}/cancel
- **Auth:** requester_id or role >= admin
- **Body:** `{ "reason": "Không cần nữa" }`
- **Side effects:** Cancels pending request, audit log
- **Response 200:** Cancelled request
- **Errors:** 401, 403, 404, 409 (already provisioned — use revoke)

### POST /api/v1/provisioning/requests/{id}/revoke
- **Auth:** role >= admin
- **Body:** `{ "reason": "Dự án kết thúc", "immediate": true }`
- **Side effects:** Removes access rules, triggers device sync, audit log
- **Response 200:** Revoked request
- **Errors:** 401, 403, 404, 409 (not in provisioned state)

### POST /api/v1/provisioning/bulk
- **Auth:** role >= admin
- **Body:**
  ```json
  {
    "site_id": "uuid",
    "template_id": "uuid",
    "user_ids": ["uuid1", "uuid2", "...", "uuid50"],
    "valid_from": "2026-03-01T00:00:00Z",
    "valid_until": null
  }
  ```
- **Side effects:** Creates BulkProvisionJob, processes asynchronously, creates access rules, triggers device sync, audit log
- **Response 202:**
  ```json
  {
    "job_id": "uuid",
    "status": "processing",
    "total_count": 50
  }
  ```
- **Errors:** 401, 403, 422, 413 (max 500 users per bulk job)

### GET /api/v1/provisioning/bulk/{id}
- **Auth:** role >= admin
- **Response 200:** Full job with progress, errors
- **Errors:** 401, 403, 404

### POST /api/v1/provisioning/auto-provision
- **Auth:** role >= site_admin (or triggered by HR sync)
- **Body:** `{ "user_id": "uuid", "event": "hired" }`
- **Description:** Trigger auto-provisioning for a user based on their department/role matching templates
- **Side effects:** Finds matching templates, creates access rules, triggers device sync, audit log
- **Response 200:**
  ```json
  {
    "user_id": "uuid",
    "templates_matched": 3,
    "rules_created": 3,
    "doors_provisioned": 12
  }
  ```

### POST /api/v1/provisioning/auto-deprovision
- **Auth:** role >= site_admin (or triggered by HR sync)
- **Body:** `{ "user_id": "uuid", "event": "terminated" }`
- **Description:** Revoke ALL access for a user immediately
- **Side effects:** Deletes all access rules for user, removes from all user groups, blacklists credentials, triggers immediate device sync (priority), audit log
- **Response 200:**
  ```json
  {
    "user_id": "uuid",
    "rules_revoked": 5,
    "credentials_disabled": 3,
    "devices_synced": 15,
    "blacklist_pushed": true
  }
  ```

### GET /api/v1/provisioning/users/{user_id}/access-summary
- **Auth:** role >= viewer (own), role >= operator (others)
- **Response 200:**
  ```json
  {
    "user_id": "uuid",
    "user_name": "Nguyễn Thị Lan",
    "templates": [{ "id": "uuid", "name": "...", "provisioned_at": "..." }],
    "doors": [{ "id": "uuid", "name": "...", "schedule": "...", "valid_until": "..." }],
    "pending_requests": 1,
    "total_active_rules": 8
  }
  ```

### GET /api/v1/provisioning/approval-chains
- **Auth:** role >= admin
- **Query params:** site_id (required)
- **Response 200:** Paginated approval chains

### POST /api/v1/provisioning/approval-chains
- **Auth:** role >= site_admin
- **Body:** ApprovalChain object
- **Response 201:** Created chain

## MQTT Topics

| Topic | Direction | QoS | Payload Schema | Description |
|-------|-----------|-----|----------------|-------------|
| `dm/{tid}/device/{did}/cfg` (type: cfg.person_sync) | server→device | 2 | User add/update/remove delta | Provisioning triggers user sync |
| `dm/{tid}/device/{did}/cfg` (type: cfg.access_rules) | server→device | 2 | Rules add/update/remove delta | New access rules pushed to devices |
| `dm/{tid}/device/{did}/cfg` (type: cfg.blacklist) | server→device | 2 | Blacklist entries | Deprovision pushes blacklist with QoS 2 |

## Business Rules

1. **BR-AP-001 — Auto-Provision on Hire:** When a new user is created (via HR sync or manual entry) with a matching department + job_role, all templates with `auto_provision=true` that match are automatically applied. No approval needed.
2. **BR-AP-002 — Instant Deprovision on Termination:** When a user's status changes to `terminated`, ALL access is revoked within 60 seconds. Credentials are blacklisted with QoS 2 priority push. This is the highest-priority sync operation.
3. **BR-AP-003 — Approval Chain Sequence:** Approval steps execute in order. Step N+1 is not notified until step N approves. Any rejection at any step rejects the entire request.
4. **BR-AP-004 — Escalation Timeout:** If an approver doesn't respond within `escalation_timeout_hours`, the request is either auto-approved (if `auto_approve_on_timeout=true`) or escalated to the next higher authority.
5. **BR-AP-005 — Self-Service Scope:** Users with `viewer` role can only request access for themselves. Users with `operator` can request for their direct reports. Admins can request for anyone.
6. **BR-AP-006 — Temporary Access Auto-Expiry:** Requests with `valid_until` set automatically expire — access rules are removed and device sync is triggered at the expiry time. A cron job checks every minute for expiring access.
7. **BR-AP-007 — Permanent Access Requires Higher Approval:** Requests with `valid_until=null` (permanent access) require site_admin approval regardless of the template's approval chain.
8. **BR-AP-008 — Capacity Limits:** Templates with `max_concurrent_users` reject new provisions when capacity is reached. Existing provisions must be revoked or expired before new ones are accepted.
9. **BR-AP-009 — No Duplicate Active Access:** A user cannot have two active provisions from the same template. Attempting to create a duplicate returns 409. Extensions must use the `extension` request type.
10. **BR-AP-010 — Bulk Job Throttling:** Bulk provisioning processes at 10 users/second to avoid overwhelming device sync. Jobs with >100 users run during off-peak hours (configurable).
11. **BR-AP-011 — Delegation:** Approvers can delegate their approval to another user with equal or higher role. Delegation is logged in the audit trail.
12. **BR-AP-012 — Request Expiry:** Pending requests that are not actioned within 30 days are auto-cancelled with reason "request_expired". Requester is notified.
13. **BR-AP-013 — Template Change Impact:** When a template's doors/schedule change, existing provisions are updated and device sync is triggered for all affected users. Users are notified of the change.
14. **BR-AP-014 — Emergency Revocation Override:** auto-deprovision bypasses all normal sync throttling — blacklist push is immediate and uses QoS 2 on all devices.

## Permissions Matrix

| Action | viewer | operator | admin | site_admin | super_admin |
|--------|--------|----------|-------|------------|-------------|
| List templates | ✅ | ✅ | ✅ | ✅ | ✅ |
| View template detail | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create/edit templates | ❌ | ❌ | ✅ | ✅ | ✅ |
| Delete templates | ❌ | ❌ | ❌ | ✅ | ✅ |
| Request access (self) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Request access (others) | ❌ | ✅ | ✅ | ✅ | ✅ |
| Approve/reject requests | ❌ | ❌ | ✅ | ✅ | ✅ |
| View all requests | ❌ | ❌ | ✅ | ✅ | ✅ |
| Bulk provisioning | ❌ | ❌ | ✅ | ✅ | ✅ |
| Auto-provision trigger | ❌ | ❌ | ❌ | ✅ | ✅ |
| Auto-deprovision trigger | ❌ | ❌ | ❌ | ✅ | ✅ |
| Revoke access | ❌ | ❌ | ✅ | ✅ | ✅ |
| Manage approval chains | ❌ | ❌ | ❌ | ✅ | ✅ |
| View user access summary | ✅ (own) | ✅ | ✅ | ✅ | ✅ |

## Offline Behavior

- **Device-side:** Devices are unaware of provisioning workflows. They only receive the resulting access rules and user data via normal sync channels. Provisioning is entirely a server-side workflow.
- **Sync strategy:** After provisioning creates/updates/revokes access rules, the normal incremental sync mechanism pushes changes to devices. Standard cursor-based delta sync.
- **Conflict resolution:** Server wins. Provisioning is server-only logic — no device-side conflicts possible.
- **Local storage:** N/A — provisioning runs entirely on server. Devices store only the resulting access rules and user data.
- **Deprovision during offline:** If a device is offline when deprovision occurs, the blacklist entry is queued. On reconnect, blacklist sync (QoS 2) is the first sync operation — executed before any user or rule sync.

## UI Pages

| Route | Page | Key Components |
|-------|------|----------------|
| /manage/provisioning | Provisioning Dashboard | Stat cards (pending requests, active provisions, expiring soon), request list |
| /manage/provisioning/templates | Template List | DataTable with department/role filters, template builder dialog |
| /manage/provisioning/templates/:id | Template Detail | Door picker, schedule, capacity meter, current users list |
| /manage/provisioning/requests | Request List | Status tabs, approval timeline, bulk actions |
| /manage/provisioning/requests/:id | Request Detail | Approval chain progress, approver actions, provision status |
| /manage/provisioning/requests/new | New Request | Template selector or custom door picker, date range, reason |
| /manage/provisioning/bulk | Bulk Provisioning | User multi-select, template picker, progress tracker |
| /manage/provisioning/users/:id | User Access | Access summary, active templates, expiring access, request history |

## Events & Audit Log

| Event Type | Trigger | Payload | Retention |
|------------|---------|---------|-----------|
| provisioning.template.created | POST create | full template | 1 year |
| provisioning.template.updated | PUT update | diff only | 1 year |
| provisioning.template.deleted | DELETE | id + actor | permanent |
| provisioning.request.created | POST create | full request | 2 years |
| provisioning.request.approved | POST approve | request_id, approver, step, comment | 2 years |
| provisioning.request.rejected | POST reject | request_id, approver, step, comment | 2 years |
| provisioning.request.cancelled | POST cancel | request_id, actor, reason | 2 years |
| provisioning.request.provisioned | Auto after final approval | request_id, rules_created, doors | 2 years |
| provisioning.request.expired | Cron job | request_id, valid_until | 2 years |
| provisioning.request.revoked | POST revoke | request_id, actor, reason | permanent |
| provisioning.auto_provision | HR sync trigger | user_id, templates_matched, rules_created | 2 years |
| provisioning.auto_deprovision | Termination trigger | user_id, rules_revoked, credentials_disabled | permanent |
| provisioning.bulk.started | POST bulk | job_id, template_id, person_count | 1 year |
| provisioning.bulk.completed | Job finish | job_id, success/failed counts | 1 year |
| provisioning.approval.delegated | Delegation | request_id, from_approver, to_approver | 2 years |
| provisioning.approval.escalated | Timeout | request_id, escalated_to | 2 years |

## Integration Points

- **Depends on:**
  - `identity-svc` — User data, department, job role, status changes (gRPC)
  - `access-svc` — Access rule CRUD, user group management, device sync orchestration
  - `auth-svc` — JWT validation, role verification
  - `notif-svc` — Approval notifications, expiry reminders, provision confirmations
- **Consumed by:**
  - `report-svc` — Provisioning analytics: approval times, template usage, access distribution
  - `audit-svc` — All provisioning events for compliance
  - `automate-svc` — HR events can trigger automation rules
- **External:**
  - HR systems (SAP, Oracle HCM, BambooHR) — user lifecycle events via webhook/API
  - Active Directory / LDAP — group membership sync
  - Identity providers (Azure AD, Okta) — attribute-based provisioning

## Notes

- Auto-deprovision is the single most critical provisioning operation. It must complete within 60 seconds of termination event, including blacklist push to all devices.
- Templates should map to organizational roles, not individual access. If more than 5% of provisions are custom (non-template), the template library needs expansion.
- Bulk provisioning is commonly used during office moves, department reorganizations, or new building onboarding.
- The self-service portal reduces admin burden by 60-80% in typical deployments — users request their own access with business justification.
- Approval chain configuration is per-site. Different sites may have different approval requirements based on security level.
