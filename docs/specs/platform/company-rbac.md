# Feature: Company-Level RBAC

> Domain: PLATFORM | Color: #6B7280 | Priority: P0
> Status: Draft | Owner: Platform Team
> Source of Truth: Canonical RBAC definition for company-scoped roles and permissions
> Updated: 2026-04-18 — consolidated from auth, multi-tenancy, and architecture docs

## Overview

This document is the **single source of truth** for DM3 company-level RBAC.

It defines:
- the canonical role model for DM3
- which roles are system-wide vs company-scoped
- the base permission structure
- company-level role capabilities
- how feature specs should reference authorization

If other documents conflict with this file, **this file wins**.

## Scope

This spec covers:
- platform-level roles
- company-scoped human user roles
- permission naming conventions
- role inheritance and intended usage
- how feature specs should express authorization

This spec does **not** define every per-feature permission matrix. Feature specs may narrow access further, but they must build on the canonical role model here.

## Design Principles

1. **Company is the top-level isolation boundary.** All non-system users belong to exactly one company.
2. **System administration is separate from company administration.** Duali staff platform operators are not mixed with tenant/company users.
3. **Roles are stable, permissions are extensible.** Avoid inventing new global roles per feature.
4. **Feature modules should authorize by permission, not by hard-coded role names, when implementation matures.**
5. **Specs may use role shorthand for readability**, but the underlying model is permission-based.

## Canonical Role Model

### System-wide Role

| Role | Scope | Description |
|---|---|---|
| `system_admin` | Global | Duali/internal platform operator with access to all companies and system administration functions |

### Company-Scoped Roles

| Role | Scope | Description |
|---|---|---|
| `primary_manager` | Single company | Company owner / highest authority inside one company. Full company administration. Default first user created with a new company |
| `admin` | Single company | Company administrator with broad configuration and operational control, but not system-wide powers |
| `manager` | Single company | Team or department manager with approval and oversight responsibilities |
| `operator` | Single company | Operational staff handling day-to-day workflows |
| `viewer` | Single company | Read-only user |

## Deprecated / Non-Canonical Role Names

The following names exist in older docs or architecture brainstorming and are **not canonical application roles** for current DM3 company RBAC:
- `super_admin`
- `tenant_admin`
- `site_admin`
- `security_admin`
- `security_operator`
- `hr_admin`
- `facility_admin`
- `reception`
- `resident`
- `api_integration`

### How to interpret them now
- `super_admin` → use `system_admin`
- `tenant_admin` / `site_admin` → use `primary_manager` or `admin` depending on scope
- domain-specific labels like `security_admin`, `hr_admin`, `reception` → model these as **job functions / permission bundles / future custom roles**, not canonical global roles
- `api_integration` is not a human RBAC role, it should be modeled via API tokens/scopes

## Role Hierarchy

```text
system_admin
  └─ outside company hierarchy

primary_manager
  └─ admin
      └─ manager
          └─ operator
              └─ viewer
```

### Notes
- `system_admin` is separate and not part of company inheritance.
- `primary_manager` is the highest role inside a company.
- `admin` exists to avoid overusing `primary_manager` for normal company administrators.
- `manager` is for approval + supervisory workflows.
- `operator` is for execution workflows.
- `viewer` is read-only.

## Identity & Scoping Rules

### User scope
- `system_admin` has no company binding
- all other users must have `company_id` / `tenant_id`
- a company-scoped token must never access another company

### JWT claims
Current and future tokens should express company scope clearly.

Minimum required claims:
```json
{
  "sub": "user-uuid",
  "cid": "company-uuid",
  "role": "admin",
  "permissions": ["identity.user.read", "access.rule.manage"]
}
```

Notes:
- `cid` is null only for `system_admin`
- `role` is the primary canonical role
- `permissions` is the normalized enforcement layer

## Permission Model

### Permission naming convention
Permissions follow:

```text
{domain}.{resource}.{action}
```

Examples:
- `identity.user.read`
- `identity.user.manage`
- `access.point.read`
- `access.rule.manage`
- `attendance.record.read`
- `attendance.leave.approve`
- `visitor.visit.manage`
- `system.company.manage`

### Action vocabulary
Use these standard actions where possible:
- `read`
- `create`
- `update`
- `delete`
- `manage` (full CRUD + admin action)
- `approve`
- `issue`
- `revoke`
- `execute`
- `export`
- `configure`

## Base Company Permission Bundles

These are the canonical default bundles.

### `viewer`
- read-only access to permitted company modules
- no approval actions
- no destructive changes

Typical permissions:
- `dashboard.read`
- `event.read`
- `identity.user.read`
- `access.point.read`
- `access.rule.read`
- `visitor.visit.read`
- `report.read`

### `operator`
- operational execution within company
- can process workflows but not own global/company settings

Typical permissions:
- all `viewer` permissions
- `visitor.visit.manage`
- `delivery.package.manage`
- `parking.session.manage`
- `attendance.record.update`
- `access.command.execute`
- selected create/update actions in operational modules

### `manager`
- supervisory role over teams/departments
- can approve workflow items and view broader operational data

Typical permissions:
- all `operator` permissions
- `attendance.leave.approve`
- `attendance.overtime.approve`
- `report.export`
- `identity.user.read` across managed scope
- broader analytics / staffing visibility

### `admin`
- broad company administration
- can manage company users, configuration, devices, and modules inside one company

Typical permissions:
- all `manager` permissions
- `identity.user.manage`
- `auth.user.manage`
- `access.rule.manage`
- `access.point.manage`
- `device.manage`
- `company.settings.manage`
- `plugin.manage`
- policy/configuration permissions within company scope

### `primary_manager`
- highest authority inside one company
- effectively full company control
- reserved for company owner / designated top administrator

Typical permissions:
- all `admin` permissions
- company ownership actions
- billing/subscription-sensitive company actions (if exposed in product)
- promote/demote company admins
- irreversible company-level approval actions

### `system_admin`
- global platform role only
- manages all companies and platform settings

Typical permissions:
- `system.company.manage`
- `system.company.read`
- `system.user.support`
- `system.audit.read`
- `system.config.manage`
- cross-company diagnostics/support

## Canonical Role Permissions Matrix

| Capability | system_admin | primary_manager | admin | manager | operator | viewer |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| View own company data | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| View other companies' data | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Manage platform companies | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Manage own company profile/settings | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Manage company users | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Assign company roles | ❌ | ✅ | ✅* | ❌ | ❌ | ❌ |
| Manage devices / access config | ❌ | ✅ | ✅ | ✅** | ❌ | ❌ |
| Approve workflows (leave, OT, etc.) | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Execute daily operations | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Read dashboards / events / reports | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Export reports | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Cross-company support/debugging | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

Notes:
- `admin` role assignment may be limited from assigning/removing `primary_manager`
- `manager` device/access changes should be limited to operational scope, not full company-wide structural administration

## Company Lifecycle + Default User

When a company is created:
1. create company record
2. create first company user with role `primary_manager`
3. require password change on first login
4. all future company users are scoped under that company

`primary_manager` is therefore the canonical bootstrap company role.

## Authorization Rules for Feature Specs

### Required rule
Feature specs must reference only canonical roles from this file when using role shorthand:
- `system_admin`
- `primary_manager`
- `admin`
- `manager`
- `operator`
- `viewer`

### Preferred writing style
For readability in specs today:
- `Auth: role >= viewer`
- `Auth: role >= operator`
- `Auth: role >= manager`
- `Auth: role >= admin`
- `Auth: role = system_admin`

### Avoid
Do not introduce new global role names in feature specs like:
- `site_admin`
- `super_admin`
- `tenant_admin`

If a feature needs finer access control, define **permissions**, not a new top-level role.

## API Tokens and Service Access

API tokens are not human roles.
They should use scopes, not company RBAC roles.

Examples:
- `identity.user.read`
- `visitor.visit.write`
- `attendance.record.read`

A machine client may act within one company scope, but it is not modeled as `operator` or `admin`.

## Migration / Cleanup Guidance

### From old docs using v1-only roles
Old roles:
- `system_admin`
- `primary_manager`
- `manager`
- `operator`
- `viewer`

These remain valid, but add `admin` as canonical company administrator role moving forward.

### From old docs using v2/spec-template roles
Old roles:
- `viewer`, `operator`, `admin`, `site_admin`, `super_admin`

Replace with:
- `viewer` → `viewer`
- `operator` → `operator`
- `admin` → `admin`
- `site_admin` → usually `primary_manager` or `admin` depending on intended scope
- `super_admin` → `system_admin`

### From architecture brainstorming roles
Map them into permissions or custom bundles, not canonical roles.

## References

This file consolidates and supersedes role-model inconsistencies previously spread across:
- `docs/specs/platform/auth.md`
- `docs/specs/platform/multi-tenancy.md`
- `docs/architecture/system-architecture.md`
- generic role matrices in feature specs / `docs/specs/SPEC_TEMPLATE.md`

## Notes

- The platform should evolve toward permission-first enforcement with role bundles defined centrally.
- If DM3 later supports custom roles per company, those custom roles must still derive from the permission model here.
- Until then, this file is the canonical RBAC baseline for all company-scoped authorization.
