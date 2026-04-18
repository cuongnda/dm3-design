# Feature: Multi-Tenancy — Company Management

> Domain: PLATFORM | Color: #6B7280 | Priority: P0
> Status: **Implementing** | Owner: Platform Team
> Updated: 2026-04-18 — company RBAC moved to canonical company-rbac.md

## Overview

The Multi-Tenancy system enables DM3 to serve multiple **Companies** (organizations/customers) from a single deployment, each with complete data isolation, independent configuration, and hierarchical site management.

**Key concept:** A **Company** is the top-level isolation boundary. Every piece of data (devices, doors, users, events) belongs to exactly one Company. Users belong to a Company and can only see/manage data within their Company.

Company authorization is defined canonically in:
- `docs/specs/platform/company-rbac.md`

### Two-Level Administration

| Level | Role | Scope | UI |
|-------|------|-------|----|
| **System Admin** | `system_admin` | All companies | System Admin Panel (`/system`) |
| **Primary Manager** | `primary_manager` | One company, full access | Main App (`/`) |
| **Other Company Users** | company-defined roles + scoped assignments | One company, limited by scope | Main App (`/`) |

- **System Admins** are not tied to any company. They manage the platform itself.
- **Company users** are always scoped to their company. They never see other companies' data.

### Company Lifecycle

```
Create Company → active → [suspend] → suspended → [activate] → active
                       → [deactivate] → deactivated (data retained X days)
```

When a Company is created:
1. Company record created in `dm3_auth.companies`
2. Default **Primary Manager** user auto-created with provided email
3. Random password generated and returned (must change on first login)
4. Starter role templates may be suggested for initial setup
5. Company is ready to use immediately

---

## Data Models

### Company (formerly "Tenant")
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key — used as `tenant_id` across all tables |
| name | string(255) | yes | - | Organization name, e.g. "ACME Corporation Vietnam" |
| code | string(50) | yes | - | Unique short code, e.g. "acme-vn" |
| plan | PlanEnum | yes | starter | Subscription tier |
| status | CompanyStatusEnum | yes | active | Lifecycle status |
| logo_url | string(500) | no | null | Company logo |
| address | text | no | null | Physical address |
| phone | string(50) | no | null | Contact phone |
| email | string(255) | no | null | Contact email |
| settings | jsonb | no | {} | Company-specific settings |
| max_devices | int | yes | 50 | Maximum devices allowed |
| max_users | int | yes | 20 | Maximum users allowed |
| created_at | timestamptz | yes | now() | Creation time |
| updated_at | timestamptz | yes | now() | Last update |

### User (updated, belongs to Company)
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | no | FK→tenants | NULL for `system_admin` |
| email | string(255) | yes | - | Unique login email |
| password_hash | string(255) | yes | - | bcrypt hash |
| name | string(255) | no | null | Display name |
| fixed_role | FixedRoleEnum | no | null | Fixed role only for `system_admin` or `primary_manager` |
| status | UserStatusEnum | yes | active | Account status |
| last_login | timestamptz | no | null | Last successful login |
| created_at | timestamptz | yes | now() | Creation time |
| updated_at | timestamptz | yes | now() | Last update |

### Site (within a Company)
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | FK→tenants | Tenant isolation |
| name | string(255) | yes | - | e.g. "Tòa nhà Sunrise — Quận 7" |
| address | text | no | null | Physical address |
| timezone | string(50) | yes | Asia/Ho_Chi_Minh | Site timezone |
| geo_lat | decimal | no | null | GPS latitude |
| geo_lng | decimal | no | null | GPS longitude |
| status | SiteStatusEnum | yes | active | Site status |
| created_at | timestamptz | yes | now() | Creation time |

### Enums

```
PlanEnum: starter | professional | enterprise
CompanyStatusEnum: active | suspended | deactivated
FixedRoleEnum: system_admin | primary_manager
UserStatusEnum: active | inactive | locked
SiteStatusEnum: active | inactive | maintenance
```

### Company Authorization Model

Canonical company-level RBAC is defined in:
- `docs/specs/platform/company-rbac.md`

This file focuses on company isolation and lifecycle, not the full authorization definition.

Summary:
- fixed roles: `system_admin`, `primary_manager`
- all other roles are company-defined
- permissions are constrained by scope
- multiple scoped assignments per user are allowed

---

## API Endpoints

### System Admin — Company Management

**Base path:** `/api/v1/system/companies`
**Auth:** Bearer token, role = `system_admin`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/system/companies` | List all companies (with user/device counts) |
| POST | `/api/v1/system/companies` | Create company + auto-create Primary Manager |
| GET | `/api/v1/system/companies/{id}` | Company detail with full stats |
| PUT | `/api/v1/system/companies/{id}` | Update company info |
| DELETE | `/api/v1/system/companies/{id}` | Suspend company (soft delete) |

#### POST /api/v1/system/companies — Create Company

**Request:**
```json
{
  "name": "ACME Corporation Vietnam",
  "code": "acme-vn",
  "email": "admin@acme.vn",
  "plan": "professional",
  "address": "123 Nguyen Hue, Q1, HCMC",
  "phone": "+84 28 1234 5678",
  "max_devices": 100,
  "max_users": 50
}
```

**Response 201:**
```json
{
  "company": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "ACME Corporation Vietnam",
    "code": "acme-vn",
    "plan": "professional",
    "status": "active"
  },
  "primary_manager": {
    "email": "admin@acme.vn",
    "password": "Xk9#mP2$vL7n",
    "name": "Primary Manager",
    "fixed_role": "primary_manager"
  }
}
```

**Side effects:**
1. Creates company record
2. Creates user with `fixed_role=primary_manager`
3. MQTT namespace `dm/{tenant_id}/` ready for devices

#### GET /api/v1/system/companies — List Companies

**Response 200:**
```json
[
  {
    "id": "00000000-0000-0000-0000-000000000001",
    "name": "Duali Demo",
    "code": "duali-demo",
    "plan": "enterprise",
    "status": "active",
    "user_count": 3,
    "device_count": 11,
    "created_at": "2026-02-19T00:00:00Z"
  }
]
```

---

### Company-Scoped APIs (all other endpoints)

All existing APIs are now **automatically filtered by tenant_id** from the JWT token:

```
JWT Claims: { sub: "user-uuid", cid: "tenant-uuid", fixed_role: "primary_manager", ... }
                                  ↓
Auth middleware extracts cid → injects into request context
                                  ↓
Authorization layer evaluates permission + scope
                                  ↓
All DB queries remain bounded by: WHERE tenant_id = $tenant_id
```

**No API changes needed** — the filtering is transparent to the client.

---

## Tenant Isolation Architecture

### Data Layer
- Every table has `tenant_id` column = `company.id`
- All queries filtered by `tenant_id` from JWT context
- PostgreSQL Row-Level Security (RLS) as future hardening (not required for v1)

### MQTT Layer
- Topic hierarchy: `dm/{tenant_id}/device/{device_id}/...`
- EMQX ACL rules: devices can only pub/sub within their tenant namespace
- Device JWT contains tenant_id for broker-side validation

### Storage Layer
- Managed assets use the shared objectstore abstraction with a shared MinIO bucket (`dm3`) in local/runtime defaults
- Isolation is enforced by tenant-prefixed object keys, for example `tenants/{tenant_id}/access/zones/{zone_id}/map.{ext}` and `tenants/{tenant_id}/identity/users/{user_id}/...`
- Services keep public asset serving behind domain routes where applicable (`/assets/...`, `/photos/...`, firmware download endpoints) instead of exposing raw object URLs

### API Layer
- Auth middleware extracts `tenant_id` from JWT
- All handlers receive tenant_id via request context
- System admin endpoints (`/system/*`) bypass company filtering

---

## Seed Data

### Default Company
```
Name: Duali Demo
Code: duali-demo
Plan: enterprise
ID: 00000000-0000-0000-0000-000000000001
```

### Default Users
| Email | Password | Role | Company |
|-------|----------|------|---------|
| sysadmin@duali.com | sysadmin123 | system_admin | — (none) |
| admin@duali.com | admin123 | primary_manager | Duali Demo |

Role semantics and scoped company access are defined in `docs/specs/platform/company-rbac.md`.

---

## System Admin UI

Separate interface at `/system` with distinct visual treatment (different accent color).

### Pages
1. **Company List** — table with search, filter by plan/status
2. **Create Company** — form → auto-creates Primary Manager
3. **Company Detail** — stats overview, user list, device count, edit info
4. **System Settings** — platform-level configuration (future)

### Design Notes
- Same dark theme as main app
- Distinct accent color (e.g., orange/red) to differentiate from company UI
- Minimal — system admins need efficiency, not eye candy
- Company list should show key metrics at a glance (users, devices, status)

---

## Migration Path (from current state)

Current state: all data uses default tenant_id `00000000-...-000000000001`.

Migration steps:
1. Create `companies` table
2. Insert default "Duali Demo" company with the existing UUID
3. Add `tenant_id` to users table, link existing users
4. Create system_admin user
5. Update JWT to include `cid` (tenant_id) and `role`
6. Add tenant filtering middleware to all services
7. All existing data automatically belongs to "Duali Demo" company

**Zero data loss. Zero downtime.**
