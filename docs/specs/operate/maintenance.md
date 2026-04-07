# Feature: Maintenance & Work Orders

> Domain: OPERATE | Color: #4CAF50 | Priority: P1
> Status: Draft | Owner: maint-svc team

## Overview
Maintenance management handles the full lifecycle of work orders (corrective and preventive), asset tracking, technician assignment, SLA tracking, and parts inventory. Enables facility managers to create, assign, and track maintenance tasks while technicians execute work via mobile. Integrates with IoT sensors for predictive maintenance triggers and with identity-svc for technician management.

## Data Models

### Asset
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | — | Tenant reference |
| site_id | uuid | yes | — | Site reference |
| name | text | yes | — | Asset name (e.g., "Thang máy 1 — Tòa A") |
| asset_code | text | yes | — | Unique code (e.g., "ELV-A-001") |
| category | AssetCategory | yes | — | Asset category |
| location | jsonb | yes | — | {building, floor, zone, room} |
| manufacturer | text | no | — | Manufacturer name |
| model | text | no | — | Model number |
| serial_number | text | no | — | Serial number |
| install_date | date | no | — | Installation date |
| warranty_until | date | no | — | Warranty expiry |
| status | AssetStatus | yes | operational | Current status |
| criticality | text | yes | medium | low / medium / high / critical |
| photo_refs | text[] | no | — | Asset photos |
| linked_device_ids | uuid[] | no | — | IoT device references |
| specifications | jsonb | no | {} | Technical specs |
| vendor_id | uuid | no | — | Maintenance vendor |
| last_maintenance_at | timestamptz | no | — | Last maintenance date |
| next_maintenance_at | timestamptz | no | — | Next scheduled maintenance |
| metadata | jsonb | no | {} | Custom fields |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### WorkOrder
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | — | Tenant reference |
| site_id | uuid | yes | — | Site reference |
| wo_number | text | yes | auto | Human-readable number (WO-2026-00001) |
| title | text | yes | — | Short description |
| description | text | no | — | Detailed description |
| type | WOType | yes | — | Work order type |
| priority | WOPriority | yes | medium | Priority level |
| status | WOStatus | yes | open | Current status |
| category | text | no | — | Maintenance category (HVAC, electrical, plumbing, etc.) |
| asset_id | uuid | no | — | Related asset |
| location | jsonb | yes | — | {building, floor, zone, room} |
| reporter_id | uuid | yes | — | User who reported |
| assigned_to | uuid | no | — | Assigned technician |
| assigned_team | uuid | no | — | Assigned team |
| sla_id | uuid | no | — | Applicable SLA |
| sla_response_due | timestamptz | no | — | SLA response deadline |
| sla_resolution_due | timestamptz | no | — | SLA resolution deadline |
| sla_response_met | bool | no | — | Was response SLA met? |
| sla_resolution_met | bool | no | — | Was resolution SLA met? |
| responded_at | timestamptz | no | — | First response time |
| started_at | timestamptz | no | — | Work started time |
| completed_at | timestamptz | no | — | Work completed time |
| closed_at | timestamptz | no | — | Final closure time |
| resolution_notes | text | no | — | How issue was resolved |
| cost_labor | decimal(12,2) | no | 0 | Labor cost (VND) |
| cost_parts | decimal(12,2) | no | 0 | Parts cost (VND) |
| cost_external | decimal(12,2) | no | 0 | External vendor cost |
| photo_refs | text[] | no | — | Before/after photos |
| attachments | jsonb | no | [] | Attached documents |
| checklist | jsonb | no | [] | Task checklist [{task, done, completed_at}] |
| parent_wo_id | uuid | no | — | Parent work order (for sub-tasks) |
| schedule_id | uuid | no | — | PM schedule reference |
| parts_used | jsonb | no | [] | Parts consumed [{part_id, qty, cost}] |
| metadata | jsonb | no | {} | Custom fields |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### PreventiveSchedule
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | — | Tenant reference |
| site_id | uuid | yes | — | Site reference |
| name | text | yes | — | Schedule name |
| description | text | no | — | Scope of work |
| asset_id | uuid | no | — | Target asset |
| asset_category | AssetCategory | no | — | Or target all assets in category |
| frequency | text | yes | — | daily / weekly / monthly / quarterly / yearly / custom |
| interval_days | int | no | — | Custom interval in days |
| cron_expression | text | no | — | Cron for complex schedules |
| checklist_template | jsonb | yes | — | Default checklist for generated WOs |
| default_assignee | uuid | no | — | Default technician |
| default_priority | WOPriority | yes | medium | Default WO priority |
| estimated_hours | decimal(4,1) | no | — | Estimated labor hours |
| parts_required | jsonb | no | [] | Parts needed [{part_id, qty}] |
| last_generated_at | timestamptz | no | — | Last WO generated |
| next_due_at | timestamptz | no | — | Next WO due date |
| lead_days | int | yes | 7 | Days before due to generate WO |
| enabled | bool | yes | true | Active flag |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### Part
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | — | Tenant reference |
| site_id | uuid | yes | — | Site/warehouse |
| name | text | yes | — | Part name |
| part_number | text | yes | — | SKU/part number |
| category | text | no | — | Part category |
| unit | text | yes | — | Unit of measure (cái, bộ, mét, kg) |
| quantity_on_hand | int | yes | 0 | Current stock |
| reorder_point | int | yes | 0 | Minimum stock level |
| reorder_qty | int | yes | 0 | Quantity to reorder |
| unit_cost | decimal(12,2) | no | — | Cost per unit (VND) |
| location | text | no | — | Storage location |
| supplier | text | no | — | Supplier name |
| lead_time_days | int | no | — | Delivery lead time |
| status | text | yes | active | active / discontinued |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### SLA
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | — | Tenant reference |
| name | text | yes | — | SLA name |
| priority | WOPriority | yes | — | Applicable priority |
| response_hours | int | yes | — | Max hours to first response |
| resolution_hours | int | yes | — | Max hours to resolution |
| business_hours_only | bool | yes | true | Count only business hours |
| escalation_rules | jsonb | no | [] | Escalation chain |
| enabled | bool | yes | true | Active flag |
| created_at | timestamp | yes | now() | Creation time |

### Vendor
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | — | Tenant reference |
| name | text | yes | — | Company name |
| contact_name | text | no | — | Primary contact |
| phone | text | no | — | Phone number |
| email | text | no | — | Email |
| specialties | text[] | no | — | Service categories |
| contract_until | date | no | — | Contract expiry |
| rating | decimal(2,1) | no | — | Performance rating (1-5) |
| status | text | yes | active | active / inactive |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### Enums
```
AssetCategory: hvac | elevator | electrical | plumbing | fire_safety | generator | door_hardware | camera | sensor | other
AssetStatus: operational | degraded | out_of_service | decommissioned
WOType: corrective | preventive | inspection | emergency | improvement
WOPriority: low | medium | high | critical
WOStatus: open | assigned | in_progress | on_hold | completed | verified | closed | cancelled
```

## API Endpoints

### GET /api/v1/maintenance/workorders
- **Auth:** Bearer token, role >= operator
- **Query params:**
  | Param | Type | Default | Description |
  |-------|------|---------|-------------|
  | page | int | 1 | Page number |
  | limit | int | 20 | Items per page (max 100) |
  | site_id | uuid | required | Filter by site |
  | status | WOStatus | — | Filter by status |
  | priority | WOPriority | — | Filter by priority |
  | type | WOType | — | Filter by type |
  | assigned_to | uuid | — | Filter by technician |
  | asset_id | uuid | — | Filter by asset |
  | category | text | — | Filter by category |
  | sla_breached | bool | — | Only SLA-breached WOs |
  | from | timestamptz | — | Created after |
  | to | timestamptz | — | Created before |
  | my_work | bool | false | Only assigned to me |
  | search | text | — | Full-text search title/description |
- **Response 200:**
  ```json
  {
    "data": [{
      "id": "uuid",
      "wo_number": "WO-2026-00042",
      "title": "Điều hòa tầng 5 không mát",
      "type": "corrective",
      "priority": "high",
      "status": "assigned",
      "asset": {"id": "uuid", "name": "HVAC Unit 5F-01"},
      "location": {"building": "Tòa A", "floor": "Tầng 5"},
      "assigned_to": {"id": "uuid", "name": "Trần Văn B"},
      "sla_response_due": "2026-02-19T12:00:00+07:00",
      "sla_resolution_due": "2026-02-20T17:00:00+07:00",
      "created_at": "2026-02-19T08:30:00+07:00"
    }],
    "total": 42,
    "summary": {
      "open": 12,
      "in_progress": 8,
      "overdue": 3,
      "completed_today": 5,
      "avg_resolution_hours": 18.5
    }
  }
  ```

### POST /api/v1/maintenance/workorders
- **Auth:** role >= operator
- **Body:**
  ```json
  {
    "site_id": "uuid",
    "title": "Điều hòa tầng 5 không mát",
    "description": "AC unit making noise, not cooling. Room temp 32°C.",
    "type": "corrective",
    "priority": "high",
    "category": "hvac",
    "asset_id": "uuid",
    "location": {"building": "Tòa A", "floor": "Tầng 5", "room": "501"},
    "photo_refs": ["minio://maintenance/photos/img001.jpg"],
    "checklist": [
      {"task": "Kiểm tra gas điều hòa"},
      {"task": "Vệ sinh filter"},
      {"task": "Kiểm tra compressor"}
    ]
  }
  ```
- **Side effects:** Auto-assign SLA, calculate deadlines, notify assigned technician, audit log
- **Response 201:** Created work order

### GET /api/v1/maintenance/workorders/{id}
- **Auth:** role >= operator
- **Response 200:** Full WO detail with timeline, comments, parts used, photos

### PUT /api/v1/maintenance/workorders/{id}
- **Auth:** assigned technician or role >= admin
- **Body:** Partial update (status, assignment, notes, etc.)
- **Side effects:** SLA tracking updates, notifications on status change, audit log
- **Response 200:** Updated work order

### POST /api/v1/maintenance/workorders/{id}/assign
- **Auth:** role >= admin
- **Body:** `{"assigned_to": "uuid"}`
- **Side effects:** Notify technician, set responded_at if first assignment, audit log
- **Response 200:** Updated work order

### POST /api/v1/maintenance/workorders/{id}/start
- **Auth:** assigned technician
- **Side effects:** Set started_at, status → in_progress, audit log
- **Response 200:** Updated work order

### POST /api/v1/maintenance/workorders/{id}/complete
- **Auth:** assigned technician
- **Body:**
  ```json
  {
    "resolution_notes": "Replaced compressor, recharged gas. Working normally.",
    "cost_labor": 500000,
    "cost_parts": 2000000,
    "parts_used": [{"part_id": "uuid", "quantity": 1}],
    "photo_refs": ["minio://maintenance/photos/after001.jpg"],
    "checklist": [
      {"task": "Kiểm tra gas điều hòa", "done": true},
      {"task": "Vệ sinh filter", "done": true},
      {"task": "Kiểm tra compressor", "done": true}
    ]
  }
  ```
- **Side effects:** Set completed_at, update SLA tracking, deduct parts inventory, notify reporter, audit log
- **Response 200:** Updated work order

### POST /api/v1/maintenance/workorders/{id}/verify
- **Auth:** reporter or role >= admin
- **Body:** `{"verified": true, "rating": 5, "comment": "Tốt lắm"}`
- **Side effects:** Set status → verified/closed, update vendor rating, audit log
- **Response 200:** Updated work order

### POST /api/v1/maintenance/workorders/{id}/comment
- **Auth:** any involved party
- **Body:** `{"text": "Đã đặt hàng linh kiện, dự kiến 2 ngày", "photo_refs": []}`
- **Response 201:** Created comment

### GET /api/v1/maintenance/assets
- **Auth:** role >= viewer
- **Query params:** site_id, category, status, criticality, search
- **Response 200:** Asset list with maintenance status

### POST /api/v1/maintenance/assets
- **Auth:** role >= admin
- **Body:** Asset creation payload
- **Response 201:** Created asset

### GET /api/v1/maintenance/assets/{id}
- **Auth:** role >= viewer
- **Response 200:** Full asset detail with maintenance history, linked devices, specs

### GET /api/v1/maintenance/assets/{id}/history
- **Auth:** role >= viewer
- **Query params:** from, to, type
- **Response 200:** Maintenance history for asset

### GET /api/v1/maintenance/schedules
- **Auth:** role >= operator
- **Query params:** site_id, asset_id, enabled
- **Response 200:** Preventive maintenance schedule list

### POST /api/v1/maintenance/schedules
- **Auth:** role >= admin
- **Body:** Schedule creation payload
- **Response 201:** Created schedule

### PUT /api/v1/maintenance/schedules/{id}
- **Auth:** role >= admin
- **Body:** Schedule update
- **Response 200:** Updated schedule

### GET /api/v1/maintenance/parts
- **Auth:** role >= operator
- **Query params:** site_id, category, low_stock, search
- **Response 200:** Parts inventory list

### POST /api/v1/maintenance/parts
- **Auth:** role >= admin
- **Body:** Part creation payload
- **Response 201:** Created part

### PUT /api/v1/maintenance/parts/{id}/adjust
- **Auth:** role >= operator
- **Body:** `{"adjustment": -2, "reason": "Used in WO-2026-00042", "work_order_id": "uuid"}`
- **Side effects:** Update stock, check reorder point, audit log
- **Response 200:** Updated part with new quantity

### GET /api/v1/maintenance/vendors
- **Auth:** role >= operator
- **Query params:** site_id, specialty, status
- **Response 200:** Vendor list

### POST /api/v1/maintenance/vendors
- **Auth:** role >= admin
- **Body:** Vendor creation payload
- **Response 201:** Created vendor

### GET /api/v1/maintenance/slas
- **Auth:** role >= admin
- **Query params:** tenant_id
- **Response 200:** SLA definitions

### POST /api/v1/maintenance/slas
- **Auth:** role >= admin
- **Body:** SLA definition
- **Response 201:** Created SLA

### GET /api/v1/maintenance/dashboard
- **Auth:** role >= operator
- **Query params:** site_id, from, to
- **Response 200:**
  ```json
  {
    "open_work_orders": 12,
    "in_progress": 8,
    "overdue": 3,
    "completed_this_month": 45,
    "avg_resolution_hours": 18.5,
    "sla_compliance_percent": 87.5,
    "by_category": {"hvac": 5, "electrical": 3, "plumbing": 4},
    "by_priority": {"critical": 1, "high": 4, "medium": 10, "low": 5},
    "upcoming_pm": 7,
    "low_stock_parts": 3,
    "technician_workload": [
      {"name": "Trần Văn B", "active": 3, "completed_this_week": 8}
    ],
    "cost_this_month": {"labor": 5000000, "parts": 12000000, "external": 3000000}
  }
  ```

## MQTT Topics

| Topic | Direction | QoS | Payload Schema | Description |
|-------|-----------|-----|----------------|-------------|
| dm3/{site}/maintenance/wo/{id}/status | server→device | 1 | `{"wo_number":"WO-2026-00042","status":"assigned","assigned_to":"..."}` | WO status update push |
| dm3/{site}/iot/sensor/{id}/alert | device→server | 1 | `{"type":"temperature_high","value":85,"threshold":70,"asset_id":"..."}` | Sensor alert triggering auto-WO |
| dm3/{site}/maintenance/technician/{id}/location | device→server | 0 | `{"lat":10.77,"lng":106.69,"floor":"5","timestamp":"..."}` | Technician location tracking |

## Business Rules
1. **Auto-SLA assignment:** IF work order created THEN match priority to SLA definition, calculate response_due and resolution_due based on business hours.
2. **SLA escalation chain:** IF SLA response_due breached THEN notify supervisor. IF resolution_due at 80% THEN warn assignee. IF resolution_due breached THEN notify site_admin and log SLA breach.
3. **Auto work order from IoT:** IF iot-svc sensor reading exceeds critical threshold AND no open WO exists for that asset THEN auto-create corrective WO with priority=high.
4. **PM schedule generation:** IF preventive schedule next_due_at - lead_days <= today AND no open WO for this schedule THEN auto-generate preventive WO with template checklist and default assignee.
5. **Parts inventory deduction:** IF work order completed with parts_used THEN deduct from inventory. IF quantity_on_hand <= reorder_point THEN notify admin of low stock and auto-create purchase request.
6. **Technician workload balancing:** IF assigning WO THEN show technician current workload (active WOs count). Warn if technician has > 5 active WOs.
7. **Warranty check:** IF WO created for asset under warranty THEN flag WO as "Under Warranty — contact vendor" and auto-populate vendor info.
8. **Duplicate detection:** IF WO created for same asset with similar title within 24h THEN warn reporter of potential duplicate.
9. **Completion requirements:** IF WO type = preventive THEN all checklist items must be completed before status can change to completed.
10. **Cost tracking:** Total WO cost = cost_labor + cost_parts + cost_external. Monthly cost rollups per asset, category, and site for budgeting.
11. **Photo evidence:** IF WO priority >= high THEN before/after photos required for completion.
12. **Status flow enforcement:** WO status transitions: open → assigned → in_progress → completed → verified → closed. On-hold allowed from assigned/in_progress. Cancel allowed from open/assigned.
13. **Asset health scoring:** Asset health = f(age, WO frequency, last PM date, criticality). Degraded assets auto-prioritized for next PM cycle.
14. **Business hours:** SLA calculations use site-configured business hours (default: Mon-Sat 08:00-17:00 ICT). Vietnamese holidays excluded if configured.

## Permissions Matrix

| Action | viewer | operator | admin | site_admin | super_admin |
|--------|--------|----------|-------|------------|-------------|
| View work orders | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create work orders | ❌ | ✅ | ✅ | ✅ | ✅ |
| Assign technician | ❌ | ❌ | ✅ | ✅ | ✅ |
| Update WO status | ❌ | ✅* | ✅ | ✅ | ✅ |
| Complete WO | ❌ | ✅* | ✅ | ✅ | ✅ |
| Verify/close WO | ❌ | ❌ | ✅ | ✅ | ✅ |
| Cancel WO | ❌ | ❌ | ✅ | ✅ | ✅ |
| Manage assets | ❌ | ❌ | ✅ | ✅ | ✅ |
| Manage PM schedules | ❌ | ❌ | ✅ | ✅ | ✅ |
| Manage parts inventory | ❌ | ✅ | ✅ | ✅ | ✅ |
| Manage SLAs | ❌ | ❌ | ❌ | ✅ | ✅ |
| Manage vendors | ❌ | ❌ | ✅ | ✅ | ✅ |
| View dashboard | ✅ | ✅ | ✅ | ✅ | ✅ |
| Export reports | ❌ | ❌ | ✅ | ✅ | ✅ |

*\* operator can only update/complete WOs assigned to them*

## Offline Behavior
- **Mobile app (technician):** Cache assigned work orders (up to 50 active). Allow status updates, photo capture, checklist completion, and comments offline. Queue all changes for sync.
- **Work order creation:** Offline WO creation queued with local ID. On sync, server assigns WO number and SLA deadlines.
- **Parts adjustment:** Offline parts consumption logged locally. On sync, server verifies stock and reconciles. If stock insufficient, WO flagged for review.
- **Sync strategy:** On reconnection, mobile app pushes all queued changes in chronological order. Server processes each change, applies business rules (SLA calculation based on original timestamps), and resolves conflicts.
- **Conflict resolution:** Last-write-wins for WO field updates. If WO was reassigned while offline, notify technician of reassignment. Comments are append-only, no conflicts.
- **Local storage:** Active WOs: ~500KB for 50 WOs. Photos cached locally until sync (up to 100MB, auto-purge oldest after upload). Asset database: ~2MB for 500 assets. TTL: WOs refresh every 10 minutes when online.

## UI Pages
| Route | Page | Key Components |
|-------|------|----------------|
| /operate/maintenance | Dashboard | KPIs, overdue alerts, workload chart, cost summary |
| /operate/maintenance/workorders | Work order list | DataTable, Kanban view, filters, bulk actions |
| /operate/maintenance/workorders/:id | WO detail | Timeline, checklist, photos, comments, cost, SLA bar |
| /operate/maintenance/workorders/new | Create WO | Asset picker, location, priority, checklist builder |
| /operate/maintenance/assets | Asset registry | DataTable, category filters, health indicators |
| /operate/maintenance/assets/:id | Asset detail | Specs, maintenance history, linked devices, health score |
| /operate/maintenance/schedules | PM schedules | Schedule list, calendar view, next due dates |
| /operate/maintenance/parts | Parts inventory | Stock levels, low-stock alerts, transaction history |
| /operate/maintenance/vendors | Vendor directory | Vendor list, contracts, ratings |

## Events & Audit Log

| Event Type | Trigger | Payload | Retention |
|------------|---------|---------|-----------|
| maintenance.wo.created | POST create | full WO | 2 years |
| maintenance.wo.assigned | POST assign | wo_id + assignee + actor | 2 years |
| maintenance.wo.started | POST start | wo_id + technician | 1 year |
| maintenance.wo.completed | POST complete | wo_id + resolution + costs | 2 years |
| maintenance.wo.verified | POST verify | wo_id + rating + actor | 2 years |
| maintenance.wo.closed | Status → closed | wo_id + actor | 2 years |
| maintenance.wo.cancelled | Status → cancelled | wo_id + actor + reason | permanent |
| maintenance.wo.sla_breached | SLA deadline passed | wo_id + sla_type + overdue_hours | permanent |
| maintenance.asset.created | POST asset | full asset | 2 years |
| maintenance.asset.updated | PUT asset | diff only | 1 year |
| maintenance.part.adjusted | Stock adjustment | part_id + adjustment + reason | 1 year |
| maintenance.part.low_stock | Below reorder point | part_id + current_qty + reorder_point | 90 days |
| maintenance.schedule.generated | PM auto-generated | schedule_id + wo_id | 1 year |

## Integration Points
- **Depends on:** identity-svc (technician profiles), iot-svc (sensor alerts trigger WOs), notif-svc (WO notifications, SLA alerts), tenant-svc (site hierarchy), auth-svc (JWT), device-gw (linked device health)
- **Consumed by:** analytics/report-svc (maintenance KPIs, cost reports), automate-svc (maintenance triggers), ai-asst-svc (maintenance queries, troubleshooting), booking-svc (room out-of-service during maintenance)
- **External:** Vendor management systems, ERP (asset sync, purchase orders), accounting (cost export)

## Notes
- Work order numbers auto-increment per tenant per year: WO-{YYYY}-{NNNNN}
- Vietnamese context: maintenance categories and checklist templates available in Vietnamese
- SLA business hours default to Vietnamese working schedule (Mon-Sat, excluding Tết and public holidays)
- Parts inventory supports Vietnamese units (cái, bộ, cuộn, mét, kg)
- Mobile app supports barcode/QR scanning for asset lookup and parts tracking
- Consider integration with building management system (BMS) for automated fault detection in Phase 3
