# Feature: Contractor Management

> Domain: MANAGE | Color: #8B5CF6 | Priority: P1
> Status: Draft | Owner: identity-svc team

## Overview
Contractor Management handles temporary workers from external companies who perform ongoing work at building sites (maintenance, cleaning, construction, security). Unlike visitors (single-visit), contractors have multi-day/month access with compliance requirements — safety training certificates, insurance, background checks, and badge expiry tracking. The system manages contractor companies, individual worker profiles, compliance document verification, area restrictions, and daily check-in/out logging.

## Data Models

### ContractorCompany
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | — | Tenant isolation |
| site_id | uuid | yes | — | Site scope |
| name | string(300) | yes | — | Company name (e.g., "Công ty TNHH Điện lạnh Đại Việt") |
| tax_id | string(20) | no | — | Mã số thuế |
| business_license | string(50) | no | — | Giấy phép kinh doanh |
| address | text | no | — | Company address |
| contact_name | string(200) | no | — | Primary contact user |
| contact_phone | string(20) | no | — | Contact phone |
| contact_email | string(255) | no | — | Contact email |
| contract_number | string(50) | no | — | Contract reference |
| contract_start | date | yes | — | Contract start date |
| contract_end | date | yes | — | Contract end date |
| max_workers | int | no | — | Max concurrent workers allowed |
| insurance_policy | string(100) | no | — | Insurance policy number |
| insurance_expiry | date | no | — | Insurance expiry date |
| status | CompanyStatusEnum | yes | active | Current status |
| compliance_score | int | no | 100 | Calculated compliance percentage |
| notes | text | no | — | Admin notes |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### ContractorWorker
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | — | Tenant isolation |
| company_id | uuid | yes | — | FK to ContractorCompany |
| user_id | uuid | yes | — | FK to User (identity-svc) — type=contractor |
| worker_role | string(100) | no | — | Role (e.g., "Đội trưởng", "Công nhân", "Kỹ thuật viên") |
| badge_number | string(20) | no | — | Assigned contractor badge |
| badge_issued_at | timestamp | no | — | Badge issue date |
| badge_expiry | date | no | — | Badge expiry date |
| access_areas | uuid[] | no | — | Allowed zones/doors |
| access_schedule | string(100) | no | — | Access schedule name (e.g., "07:00-17:00 T2-T6") |
| status | WorkerStatusEnum | yes | active | Current status |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### ComplianceDocument
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | — | Tenant isolation |
| owner_type | DocOwnerEnum | yes | — | Company or worker level |
| owner_id | uuid | yes | — | FK to company or worker |
| doc_type | ComplianceDocTypeEnum | yes | — | Type of document |
| doc_name | string(200) | yes | — | Document title |
| file_ref | string(500) | no | — | MinIO object reference |
| issued_date | date | no | — | When document was issued |
| expiry_date | date | no | — | When document expires |
| verified | boolean | no | false | Admin has verified authenticity |
| verified_by | uuid | no | — | Who verified |
| verified_at | timestamp | no | — | When verified |
| status | DocStatusEnum | yes | pending | Current status |
| notes | text | no | — | Admin notes |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### ContractorCheckin
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | — | Tenant isolation |
| worker_id | uuid | yes | — | FK to ContractorWorker |
| company_id | uuid | yes | — | FK to ContractorCompany (denorm) |
| site_id | uuid | yes | — | Site |
| checkin_time | timestamp | yes | — | Check-in time |
| checkout_time | timestamp | no | — | Check-out time |
| checkin_method | string(30) | no | — | card, face, qr, manual |
| checkin_device_id | uuid | no | — | Device used |
| work_area | string(200) | no | — | Area where work is performed |
| hours_worked | decimal(5,2) | no | — | Calculated from checkin/out |
| notes | text | no | — | Daily notes |

### Enums
```
CompanyStatusEnum: active | suspended | expired | terminated
WorkerStatusEnum: active | suspended | badge_expired | terminated
DocOwnerEnum: company | worker
ComplianceDocTypeEnum: safety_training | insurance | background_check | work_permit | equipment_cert | first_aid | fire_safety | electrical_license | other
DocStatusEnum: pending | verified | expired | rejected
```

## API Endpoints

### GET /api/v1/contractors/companies
- **Auth:** Bearer token, role >= viewer
- **Query params:**
  | Param | Type | Default | Description |
  |-------|------|---------|-------------|
  | page | int | 1 | Page number |
  | limit | int | 20 | Items per page |
  | site_id | uuid | required | Filter by site |
  | status | string | — | Filter by status |
  | search | string | — | Search company name, tax ID |
  | contract_expiring | boolean | — | Filter companies with contracts expiring within 30 days |
- **Response 200:**
  ```json
  {
    "data": [{
      "id": "uuid",
      "name": "Công ty TNHH Điện lạnh Đại Việt",
      "active_workers": 5,
      "total_workers": 7,
      "compliance_score": 86,
      "contract_end": "2026-12-31",
      "status": "active"
    }],
    "total": 5,
    "page": 1,
    "limit": 20
  }
  ```

### POST /api/v1/contractors/companies
- **Auth:** role >= admin
- **Body:**
  ```json
  {
    "site_id": "uuid",
    "name": "Công ty CP Xây dựng Hoàng Phát",
    "tax_id": "0312345678",
    "contact_name": "Trần Văn Hùng",
    "contact_phone": "0901234567",
    "contract_start": "2026-01-01",
    "contract_end": "2026-12-31",
    "max_workers": 10
  }
  ```
- **Side effects:** Audit log `contractor_company.created`
- **Response 201:** Created company

### GET /api/v1/contractors/companies/{id}
- **Auth:** role >= viewer
- **Response 200:** Full company detail with workers, compliance docs, checkin stats

### PUT /api/v1/contractors/companies/{id}
- **Auth:** role >= admin

### POST /api/v1/contractors/companies/{id}/workers
- **Auth:** role >= operator
- **Body:**
  ```json
  {
    "first_name": "Đức Anh",
    "last_name": "Trần",
    "phone": "0987654321",
    "worker_role": "Kỹ thuật viên",
    "access_areas": ["uuid-loading-dock", "uuid-basement"],
    "access_schedule": "07:00-17:00 T2-T6"
  }
  ```
- **Side effects:** Creates User (type=contractor) in identity-svc, creates ContractorWorker, issues badge, syncs credentials to allowed devices
- **Response 201:** Created worker with user_id

### GET /api/v1/contractors/companies/{id}/workers
- **Auth:** role >= viewer

### PUT /api/v1/contractors/workers/{id}
- **Auth:** role >= operator

### DELETE /api/v1/contractors/workers/{id}
- **Auth:** role >= admin
- **Side effects:** Revokes all credentials via identity-svc, removes from devices

### POST /api/v1/contractors/workers/{id}/checkin
- **Auth:** role >= operator (or auto via device event)
- **Body:** `{ "work_area": "Tầng hầm B2 — bảo trì điện", "checkin_method": "card" }`

### POST /api/v1/contractors/workers/{id}/checkout
- **Auth:** role >= operator

### POST /api/v1/contractors/companies/{id}/documents
- **Auth:** role >= operator
- **Body:** `multipart/form-data` with file + metadata
  ```json
  {
    "doc_type": "safety_training",
    "doc_name": "Chứng chỉ an toàn lao động",
    "expiry_date": "2027-01-15",
    "owner_type": "worker",
    "owner_id": "worker-uuid"
  }
  ```
- **Response 201:** Created document

### POST /api/v1/contractors/documents/{id}/verify
- **Auth:** role >= admin
- **Body:** `{ "verified": true, "notes": "Đã xác minh với cơ quan cấp" }`

### GET /api/v1/contractors/compliance/report
- **Auth:** role >= admin
- **Query params:** `site_id`, `company_id`
- **Response 200:** Compliance summary — workers with expired docs, missing training, expired badges

### GET /api/v1/contractors/checkins
- **Auth:** role >= viewer
- **Query params:** `site_id`, `company_id`, `worker_id`, `date_from`, `date_to`
- **Response 200:** Checkin/out records with hours worked

## MQTT Topics

| Topic | Direction | QoS | Payload Schema | Description |
|-------|-----------|-----|----------------|-------------|
| `dm/{tenant}/device/{device_id}/cfg/users` | server→device | 1 | Standard user credential sync | Contractor credentials use same sync mechanism as employees |
| `dm/{tenant}/device/{device_id}/evt/access` | device→server | 1 | Standard access event | Contractor access events auto-create checkin records |

## Business Rules

1. **BR-CON-001: Contract expiry blocks access.** When a company's contract expires, all workers' credentials are automatically suspended and a removal sync is pushed to devices. Workers cannot check in.

2. **BR-CON-002: Badge expiry enforcement.** Worker badges have an expiry date. 14 days before expiry, an alert is sent to the admin. On expiry day, the worker's device credentials are suspended. The badge must be renewed before re-entry.

3. **BR-CON-003: Safety training required.** Workers cannot be issued credentials until their `safety_training` compliance document is uploaded and verified. This is enforced at the API level during worker creation.

4. **BR-CON-004: Compliance score calculation.** Company compliance score = (workers with all required docs verified / total workers) × 100. Recalculated on every document change.

5. **BR-CON-005: Max worker limit.** Cannot add more active workers than `max_workers` for a company. Returns 422 with message.

6. **BR-CON-006: Area restriction enforcement.** Contractor credentials are synced only to devices in their `access_areas`. If a contractor attempts to use their credential at a non-authorized door, the device denies access locally.

7. **BR-CON-007: Schedule enforcement.** Contractor access schedules are embedded in the credential sync to devices. Devices enforce time-based access locally — a contractor with "07:00-17:00 T2-T6" schedule is denied at 18:00.

8. **BR-CON-008: Daily checkin from access events.** When a contractor's first access event of the day is received, a ContractorCheckin record is auto-created. The last access event before a configurable gap (default 4 hours) is treated as checkout.

9. **BR-CON-009: Insurance expiry alert.** If a company's insurance expires, an alert is sent to the site admin. If not renewed within 7 days, the company is suspended (all workers lose access).

10. **BR-CON-010: Document retention.** Compliance documents (files) are stored in MinIO with a retention period matching the contract end date + 2 years for legal compliance.

11. **BR-CON-011: Worker termination cascade.** Terminating a worker revokes all credentials, removes device sync, marks badge as returned, and updates compliance score.

12. **BR-CON-012: Duplicate worker prevention.** A worker (matched by phone number) cannot be active in multiple contractor companies at the same site simultaneously.

## Permissions Matrix

| Action | viewer | operator | admin | site_admin | super_admin |
|--------|--------|----------|-------|------------|-------------|
| List companies/workers | ✅ | ✅ | ✅ | ✅ | ✅ |
| View detail | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create company | ❌ | ❌ | ✅ | ✅ | ✅ |
| Update company | ❌ | ❌ | ✅ | ✅ | ✅ |
| Add/remove workers | ❌ | ✅ | ✅ | ✅ | ✅ |
| Upload documents | ❌ | ✅ | ✅ | ✅ | ✅ |
| Verify documents | ❌ | ❌ | ✅ | ✅ | ✅ |
| View compliance report | ❌ | ✅ | ✅ | ✅ | ✅ |
| Suspend/terminate | ❌ | ❌ | ✅ | ✅ | ✅ |
| View checkin records | ✅ | ✅ | ✅ | ✅ | ✅ |

## Offline Behavior

- **Device-side:** Contractor credentials are synced to devices identically to employee credentials. Devices store contractor user records with embedded access schedule and expiry. Access decisions are fully local — a contractor's card/face works even when the server is offline, as long as the credential was previously synced.
- **Sync strategy:** Same as identity management — MQTT push with monotonic sync versions. Contractor credential changes (new worker, badge renewal, area change) trigger incremental sync. Contract expiry triggers bulk credential removal.
- **Conflict resolution:** Server-wins. Schedule and expiry are embedded in device-side data, so even stale data has correct time restrictions.
- **Local storage:** Contractors share the device user database with employees and visitors. Typical contractor load is 25-100 workers per site.
- **Checkin during offline:** If the server is offline, access events are buffered on devices. When connectivity restores, events are uploaded and ContractorCheckin records are retroactively created from the buffered events.
- **Compliance enforcement during offline:** Compliance document expiry is enforced server-side. If a document expires while a device is offline, the credential remains active on the device until the server sends a suspension sync. However, badge expiry dates embedded in credentials are enforced locally by devices.

## UI Pages

| Route | Page | Key Components |
|-------|------|----------------|
| /manage/contractors | Company list | DataTable with compliance score bars, contract dates, active worker counts |
| /manage/contractors/:companyId | Company detail | Company info, worker list, compliance documents tab, checkin log tab |
| /manage/contractors/:companyId/workers/:workerId | Worker detail | Profile, credentials, compliance docs, checkin history, access areas map |
| /manage/contractors/compliance | Compliance dashboard | Expired docs, expiring badges, companies below threshold, action items |

## Events & Audit Log

| Event Type | Trigger | Payload | Retention |
|------------|---------|---------|-----------|
| contractor_company.created | POST create | full company | 7 years |
| contractor_company.updated | PUT update | diff | 7 years |
| contractor_company.suspended | status change | id + reason + actor | 7 years |
| contractor_company.expired | cron job | id + contract_end | 7 years |
| contractor_worker.created | POST worker | worker + company | 7 years |
| contractor_worker.terminated | DELETE worker | id + actor | 7 years |
| contractor_worker.badge_expired | cron job | worker_id + badge_expiry | 3 years |
| compliance_doc.uploaded | POST document | doc details | 7 years |
| compliance_doc.verified | POST verify | doc_id + verifier | 7 years |
| compliance_doc.expired | cron job | doc_id + expiry_date | 7 years |
| contractor.checkin | auto/manual | worker_id + time + area | 3 years |
| contractor.checkout | auto/manual | worker_id + time + hours | 3 years |

## Integration Points

- **Depends on:**
  - `identity-svc` — user creation (type=contractor), credential management, credential sync
  - `device-gw` — MQTT credential sync to access devices
  - `auth-svc` — JWT validation
  - `notif-svc` — expiry alerts, compliance warnings
- **Consumed by:**
  - `access-svc` — contractor access events in analytics
  - `attend-svc` — contractor time tracking (optional)
  - `report-svc` — contractor compliance reports, hours worked reports
- **External:**
  - Document verification services (future)
  - Contractor company portals (webhook for status updates)

## Notes

- Contractor management is implemented as a layer on top of identity-svc. Each contractor worker has a corresponding User record with `person_type=contractor`. The ContractorWorker table adds contractor-specific fields (company, badge, compliance).
- Vietnamese compliance requirements include: "Chứng chỉ an toàn lao động" (workplace safety certificate), "Bảo hiểm tai nạn lao động" (workplace accident insurance), "Giấy phép lao động" (work permit for foreign workers).
- For construction sites, additional compliance docs may include: electrical license, crane operator certification, confined space training.
- The compliance score is displayed prominently in the UI with color coding: green (90-100%), yellow (70-89%), red (<70%).
