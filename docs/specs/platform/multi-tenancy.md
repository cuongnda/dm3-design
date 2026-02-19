# Feature: Multi-Tenancy & Site Management

> Domain: PLATFORM | Color: #6366F1 | Priority: P1
> Status: Draft | Owner: Platform Team

## Overview

The Multi-Tenancy system enables DM3 to serve multiple organizations (tenants) from a single deployment — each with complete data isolation, independent configuration, custom branding, and hierarchical site management. It supports both cloud SaaS (many tenants, one platform) and on-premise (single tenant, multiple sites) deployments. The site/organization hierarchy allows centralized management across regions, cities, buildings, floors, and zones. Cross-site admin roles enable portfolio-wide oversight while per-site configuration allows local autonomy. Usage quotas and billing integration support the SaaS business model.

## Data Models

### Tenant
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| slug | string(50) | yes | - | URL-safe identifier, unique globally |
| name | string(200) | yes | - | Organization name |
| display_name | string(200) | no | null | Public-facing name |
| type | TenantTypeEnum | yes | standard | Tenant category |
| tier | TierEnum | yes | starter | Subscription tier |
| status | TenantStatusEnum | yes | provisioning | Lifecycle status |
| owner_user_id | uuid | no | null | Primary account owner |
| contact_email | string(200) | yes | - | Billing/contact email |
| contact_phone | string(20) | no | null | Contact phone |
| country | string(2) | yes | VN | ISO country code |
| timezone | string(50) | yes | Asia/Ho_Chi_Minh | Default timezone |
| locale | string(10) | yes | vi | Default locale |
| branding | jsonb | no | {} | Branding configuration (BrandingConfig) |
| features | jsonb | yes | {} | Feature flags / licensed modules |
| quotas | jsonb | yes | {} | Usage quotas (QuotaConfig) |
| data_region | string(20) | yes | ap-southeast-1 | Data residency region |
| database_schema | string(50) | yes | auto | Assigned DB schema name |
| storage_bucket | string(100) | yes | auto | MinIO bucket for tenant files |
| mqtt_namespace | string(50) | yes | auto | MQTT topic namespace |
| provisioned_at | timestamp | no | null | When fully provisioned |
| suspended_at | timestamp | no | null | Suspension time |
| suspension_reason | string(200) | no | null | Why suspended |
| trial_expires_at | timestamp | no | null | Trial period end |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### BrandingConfig (embedded in Tenant.branding JSONB)
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| logo_url | string | no | Custom logo (stored in MinIO) |
| favicon_url | string | no | Custom favicon |
| primary_color | string | no | Brand primary color hex |
| secondary_color | string | no | Brand secondary color hex |
| login_background_url | string | no | Custom login page background |
| app_name | string | no | Custom app display name |
| support_email | string | no | Custom support email |
| support_url | string | no | Custom support page URL |
| custom_css | string | no | Additional CSS overrides |

### QuotaConfig (embedded in Tenant.quotas JSONB)
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| max_sites | int | yes | Maximum sites |
| max_doors | int | yes | Maximum doors across all sites |
| max_cameras | int | yes | Maximum cameras |
| max_users | int | yes | Maximum admin users |
| max_persons | int | yes | Maximum persons in identity DB |
| max_sensors | int | yes | Maximum IoT sensors |
| max_storage_gb | int | yes | Maximum storage (photos, clips) |
| max_api_requests_per_day | int | yes | Daily API request limit |
| max_automation_rules | int | yes | Maximum automation rules |
| features_enabled | string[] | yes | Licensed module IDs |

### Site
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | - | Tenant isolation |
| parent_site_id | uuid | no | null | Parent in hierarchy (null = top-level) |
| name | string(200) | yes | - | e.g. "Tòa nhà Landmark 72 — Hà Nội" |
| code | string(20) | yes | - | Short code, e.g. "HN-LM72" |
| type | SiteTypeEnum | yes | building | Site level in hierarchy |
| address | string(500) | no | null | Physical address |
| city | string(100) | no | null | City |
| country | string(2) | yes | VN | Country |
| timezone | string(50) | yes | Asia/Ho_Chi_Minh | Site timezone |
| latitude | float | no | null | GPS latitude |
| longitude | float | no | null | GPS longitude |
| settings | jsonb | no | {} | Site-specific settings |
| status | SiteStatusEnum | yes | active | Site status |
| device_count | int | yes | 0 | Cached device count |
| person_count | int | yes | 0 | Cached person count |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### Zone
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | - | Tenant isolation |
| site_id | uuid | yes | - | Parent site |
| parent_zone_id | uuid | no | null | Parent zone (for nesting) |
| name | string(100) | yes | - | e.g. "Tầng 3 — Khu vực kỹ thuật" |
| type | ZoneTypeEnum | yes | area | Zone category |
| floor | string(20) | no | null | Floor identifier |
| building | string(100) | no | null | Building within site |
| security_level | int | yes | 1 | 1=public, 5=restricted |
| occupancy_capacity | int | no | null | Maximum persons |
| current_occupancy | int | yes | 0 | Live count |
| metadata | jsonb | no | {} | Extra data |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### TenantUsage (Hypertable)
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| tenant_id | uuid | yes | - | Tenant |
| time | timestamptz | yes | - | Usage snapshot time |
| metric | string(50) | yes | - | e.g. "doors", "api_requests", "storage_gb" |
| value | float | yes | - | Current usage value |
| quota | float | yes | - | Quota limit |
| percentage | float | yes | - | Usage percentage |

### Enums
```
TenantTypeEnum: standard | reseller | internal | trial
TenantStatusEnum: provisioning | active | suspended | deactivating | deactivated
TierEnum: starter | professional | enterprise | custom
SiteTypeEnum: region | city | campus | building | floor
SiteStatusEnum: active | inactive | maintenance
ZoneTypeEnum: area | floor | room | corridor | stairwell | parking | outdoor
```

## API Endpoints

### GET /api/v1/tenants
- **Auth:** Bearer token, role = super_admin
- **Query params:**
  | Param | Type | Default | Description |
  |-------|------|---------|-------------|
  | page | int | 1 | Page number |
  | limit | int | 20 | Items per page (max 100) |
  | status | string | - | Filter by status |
  | tier | string | - | Filter by tier |
  | search | string | - | Search name/slug |
- **Response 200:** Paginated tenant list with usage summary
- **Errors:** 401, 403

### GET /api/v1/tenants/{id}
- **Auth:** role = super_admin OR tenant owner
- **Response 200:** Full tenant with branding, quotas, usage, sites
- **Errors:** 401, 403, 404

### POST /api/v1/tenants
- **Auth:** role = super_admin
- **Body:**
  ```json
  {
    "slug": "acme-corp",
    "name": "ACME Corporation Vietnam",
    "type": "standard",
    "tier": "professional",
    "contact_email": "admin@acme.vn",
    "country": "VN",
    "timezone": "Asia/Ho_Chi_Minh",
    "quotas": {
      "max_sites": 5,
      "max_doors": 100,
      "max_cameras": 50,
      "max_users": 20,
      "max_persons": 5000,
      "max_sensors": 100,
      "max_storage_gb": 50,
      "max_api_requests_per_day": 50000,
      "max_automation_rules": 50,
      "features_enabled": ["access", "visitor", "attendance", "parking", "cctv"]
    }
  }
  ```
- **Side effects:** Creates DB schema, MinIO bucket, MQTT namespace, Keycloak realm, initial admin user, audit log
- **Response 201:** Created tenant (status=provisioning)
- **Errors:** 401, 403, 409 (slug taken), 422

### PUT /api/v1/tenants/{id}
- **Auth:** role = super_admin OR tenant owner (limited fields)
- **Body:** Partial update (quotas, branding, settings)
- **Side effects:** Audit log
- **Response 200:** Updated tenant
- **Errors:** 401, 403, 404, 422

### POST /api/v1/tenants/{id}/suspend
- **Auth:** role = super_admin
- **Body:** `{ "reason": "Quá hạn thanh toán" }`
- **Side effects:** Sets status=suspended, disables API access (except read-only), stops device sync, audit log
- **Response 200:** Suspended tenant

### POST /api/v1/tenants/{id}/activate
- **Auth:** role = super_admin
- **Side effects:** Restores full access, resumes device sync, audit log
- **Response 200:** Activated tenant

### POST /api/v1/tenants/{id}/deactivate
- **Auth:** role = super_admin
- **Body:** `{ "data_retention_days": 90, "export_data": true }`
- **Side effects:** Begins deactivation: exports data, schedules deletion after retention period, audit log
- **Response 200:** Deactivating tenant

### GET /api/v1/tenants/{id}/usage
- **Auth:** role = super_admin OR tenant owner
- **Query params:** from, to, metrics
- **Response 200:** Usage metrics over time

### PUT /api/v1/tenants/{id}/branding
- **Auth:** role >= site_admin (own tenant)
- **Body:** BrandingConfig
- **Side effects:** Audit log
- **Response 200:** Updated branding

### GET /api/v1/sites
- **Auth:** Bearer token, role >= viewer
- **Query params:**
  | Param | Type | Default | Description |
  |-------|------|---------|-------------|
  | page | int | 1 | Page number |
  | limit | int | 20 | Items per page (max 100) |
  | parent_id | uuid | - | Filter by parent site |
  | type | string | - | Filter by site type |
  | status | string | - | Filter by status |
  | search | string | - | Search name/code |
- **Response 200:** Paginated site list (filtered by user's `sites` claim)
- **Errors:** 401, 403, 422

### GET /api/v1/sites/{id}
- **Auth:** role >= viewer, must have site in token's `sites`
- **Response 200:** Full site with zones, device count, person count, child sites
- **Errors:** 401, 403, 404

### POST /api/v1/sites
- **Auth:** role >= site_admin
- **Body:**
  ```json
  {
    "name": "Văn phòng Đà Nẵng",
    "code": "DN-HQ",
    "type": "building",
    "parent_site_id": "uuid-region-central",
    "address": "123 Nguyễn Văn Linh, Đà Nẵng",
    "city": "Đà Nẵng",
    "timezone": "Asia/Ho_Chi_Minh"
  }
  ```
- **Side effects:** Validates quota (max_sites), audit log
- **Response 201:** Created site
- **Errors:** 401, 403, 422, 429 (quota exceeded)

### PUT /api/v1/sites/{id}
- **Auth:** role >= site_admin
- **Body:** Partial update
- **Side effects:** Audit log
- **Response 200:** Updated site

### DELETE /api/v1/sites/{id}
- **Auth:** role >= super_admin
- **Side effects:** Cascades to zones, reassigns devices, audit log
- **Response 204**
- **Errors:** 401, 403, 404, 409 (has active devices — must migrate first)

### GET /api/v1/sites/{id}/hierarchy
- **Auth:** role >= viewer
- **Response 200:** Full tree: site → child sites → zones

### GET /api/v1/zones
- **Auth:** role >= viewer
- **Query params:** site_id (required), type, floor, parent_zone_id, page, limit
- **Response 200:** Paginated zone list

### POST /api/v1/zones
- **Auth:** role >= admin
- **Body:** Zone object
- **Response 201:** Created zone

### PUT /api/v1/zones/{id}
- **Auth:** role >= admin
- **Body:** Partial update
- **Response 200:** Updated zone

### DELETE /api/v1/zones/{id}
- **Auth:** role >= site_admin
- **Response 204**

## MQTT Topics

| Topic | Direction | QoS | Payload Schema | Description |
|-------|-----------|-----|----------------|-------------|
| `dm/{tid}/...` | both | varies | All topics namespaced by tenant_id | Tenant isolation at MQTT level |

MQTT tenant isolation is enforced by EMQX ACL rules — devices can only publish/subscribe to topics within their tenant namespace.

## Business Rules

1. **BR-MT-001 — Complete Data Isolation:** Each tenant's data is stored in a separate PostgreSQL schema. Cross-tenant queries are physically impossible at the database level. MQTT topics, MinIO buckets, and Valkey key prefixes are all tenant-namespaced.
2. **BR-MT-002 — Tenant-Scoped JWT:** All JWT tokens include `tenant_id` claim. Every API request is filtered by tenant_id — there is no way to access another tenant's data with a standard token.
3. **BR-MT-003 — Site Access Scoping:** Users have a `sites` array in their JWT. API queries for site-scoped resources filter by both tenant_id AND the user's authorized sites. A user cannot see resources from sites not in their token.
4. **BR-MT-004 — Quota Enforcement:** All resource creation endpoints check tenant quotas before proceeding. Exceeding a quota returns 429 with a clear error message indicating the limit and current usage.
5. **BR-MT-005 — Tier-Based Features:** Feature flags in `features_enabled` gate access to modules. Attempting to access a disabled feature returns 403 with `feature_not_licensed` error.
6. **BR-MT-006 — Tenant Provisioning Automation:** Creating a tenant triggers an async provisioning pipeline: create DB schema → run migrations → create MinIO bucket → configure MQTT ACL → create Keycloak realm → create initial admin user → set status=active.
7. **BR-MT-007 — Suspension Behavior:** Suspended tenants retain read-only API access (GET requests only). Device sync pauses. New data cannot be created. This allows data export before deactivation.
8. **BR-MT-008 — Data Residency:** Tenant data is stored in the configured `data_region`. Data never leaves the designated region. This is critical for government and military tenants.
9. **BR-MT-009 — Hierarchical Settings:** Site settings inherit from tenant defaults but can be overridden locally. Zone settings inherit from site. Cascade: tenant → region → building → floor → zone.
10. **BR-MT-010 — Cross-Site Admin:** Users with role=site_admin and multiple sites in their token can manage all their assigned sites. super_admin can access all sites in the tenant.
11. **BR-MT-011 — White-Label Branding:** Branding config is loaded at login and applied across web console and mobile app. Each tenant sees their own logo, colors, and app name.
12. **BR-MT-012 — Trial Expiry:** Trial tenants auto-suspend 7 days after `trial_expires_at`. Data is retained for 30 days before deactivation.
13. **BR-MT-013 — Zone Security Levels:** Zones have security levels 1-5. Higher security zones require higher role levels for configuration changes. Level 5 zones (e.g., server rooms) require super_admin for any modification.
14. **BR-MT-014 — Usage Tracking:** Usage metrics are recorded hourly as time-series data. Quota approaching (80%) and exceeded alerts are sent to tenant owner and super_admin.

## Permissions Matrix

| Action | viewer | operator | admin | site_admin | super_admin |
|--------|--------|----------|-------|------------|-------------|
| List own sites | ✅ | ✅ | ✅ | ✅ | ✅ |
| View site detail | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create sites | ❌ | ❌ | ❌ | ✅ | ✅ |
| Update sites | ❌ | ❌ | ❌ | ✅ | ✅ |
| Delete sites | ❌ | ❌ | ❌ | ❌ | ✅ |
| List/view zones | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create/update zones | ❌ | ❌ | ✅ | ✅ | ✅ |
| Delete zones | ❌ | ❌ | ❌ | ✅ | ✅ |
| View tenant info | ❌ | ❌ | ❌ | ✅ | ✅ |
| Update tenant branding | ❌ | ❌ | ❌ | ✅ | ✅ |
| Update tenant quotas | ❌ | ❌ | ❌ | ❌ | ✅ |
| Create/manage tenants | ❌ | ❌ | ❌ | ❌ | ✅ |
| Suspend/activate tenants | ❌ | ❌ | ❌ | ❌ | ✅ |
| View usage metrics | ❌ | ❌ | ❌ | ✅ | ✅ |

## Offline Behavior

- **Device-side:** Devices are unaware of multi-tenancy. Their MQTT topic prefix includes tenant_id, but this is configured at device provisioning and doesn't change. Devices operate normally regardless of tenant status on server.
- **Sync strategy:** If a tenant is suspended, device sync pauses — devices continue with their last synced data. On reactivation, full sync is triggered.
- **Conflict resolution:** N/A — tenancy is server-side only.
- **Local storage:** N/A.
- **Suspended tenant devices:** Devices continue granting/denying access based on cached data. New person or rule changes are not synced until tenant is reactivated.

## UI Pages

| Route | Page | Key Components |
|-------|------|----------------|
| /admin/tenants | Tenant List | DataTable with status, tier, usage bars (super_admin only) |
| /admin/tenants/:id | Tenant Detail | Info, branding editor, quota config, usage charts, site tree |
| /admin/tenants/new | Tenant Provisioning | Step wizard: info → quotas → features → admin user → review |
| /settings/sites | Site List | Hierarchical tree view, map view with pins |
| /settings/sites/:id | Site Detail | Info, zone editor, device summary, settings inheritance |
| /settings/sites/:id/zones | Zone Manager | Floor plan view or tree view, zone CRUD, security levels |
| /settings/branding | Branding | Logo upload, color picker, preview, custom CSS |

## Events & Audit Log

| Event Type | Trigger | Payload | Retention |
|------------|---------|---------|-----------|
| tenant.created | POST create | full tenant (minus secrets) | permanent |
| tenant.updated | PUT update | diff only | permanent |
| tenant.suspended | POST suspend | tenant_id, actor, reason | permanent |
| tenant.activated | POST activate | tenant_id, actor | permanent |
| tenant.deactivated | POST deactivate | tenant_id, actor, retention_days | permanent |
| tenant.provisioned | Async pipeline complete | tenant_id, duration_ms | permanent |
| tenant.branding.updated | PUT branding | tenant_id, actor, diff | 1 year |
| tenant.quota.updated | PUT quotas | tenant_id, actor, old/new quotas | permanent |
| tenant.quota.warning | Usage >= 80% | tenant_id, metric, percentage | 90 days |
| tenant.quota.exceeded | Usage >= 100% | tenant_id, metric, value | 1 year |
| site.created | POST create | full site | 1 year |
| site.updated | PUT update | diff | 1 year |
| site.deleted | DELETE | site_id, actor | permanent |
| zone.created | POST create | full zone | 1 year |
| zone.updated | PUT update | diff | 1 year |
| zone.deleted | DELETE | zone_id, actor | permanent |

## Integration Points

- **Depends on:**
  - TimescaleDB — Schema-per-tenant data isolation
  - MinIO — Bucket-per-tenant file storage
  - EMQX — ACL rules for MQTT topic isolation
  - Keycloak — Realm-per-tenant for SSO/auth isolation
  - Valkey — Tenant-prefixed cache keys
  - `auth-svc` — Tenant-scoped JWT claims
- **Consumed by:**
  - ALL services — Every service reads `tenant_id` from JWT and filters data accordingly
  - `notif-svc` — Quota alerts
  - `audit-svc` — Tenant lifecycle events
  - `report-svc` — Cross-site aggregated analytics
- **External:**
  - Billing systems — Usage data for invoicing (SaaS model)
  - DNS management — Custom domain mapping per tenant (optional)

## Notes

- On-premise deployments use a single tenant with tenant_id hardcoded. The multi-tenancy layer still exists but with no cross-tenant complexity.
- Tenant provisioning takes 30-60 seconds (DB migration is the bottleneck). Status transitions: provisioning → active.
- Schema-per-tenant was chosen over row-level security for stronger isolation guarantees. The tradeoff is migration complexity — each schema must be migrated independently.
- The tenant slug is used in URLs (`{slug}.duall.io`) for SaaS deployments. On-premise uses custom domains.
- Feature flags in `features_enabled` map directly to module IDs from the pricing tiers in the vision doc.
