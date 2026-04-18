# Feature: Company-Level RBAC

> Domain: PLATFORM | Color: #6B7280 | Priority: P0
> Status: Draft | Owner: Platform Team
> Source of Truth: Canonical RBAC definition for company-scoped authorization
> Updated: 2026-04-18 — rewritten for custom company roles + scoped assignments
> Related docs:
> - `docs/specs/platform/company-rbac-recommendation.md`
> - `docs/specs/platform/company-rbac-admin-guide.md`

## Overview

This document is the **single source of truth** for DM3 company-level authorization.

The canonical model is:
- fixed platform roles for top-level ownership only
- company-defined custom roles for normal business usage
- scope-aware assignments to control where permissions apply

This replaces the older fixed-role model that tried to hardcode many company roles globally.

## Canonical Model

### Fixed human roles
Only these fixed human roles are canonical:
- `system_admin`
- `primary_manager`

### Company-defined roles
All other company access should be modeled as **custom company roles** created by the Primary Manager or an authorized company admin.

Examples:
- Viewer
- Receptionist
- Security Supervisor
- HR Manager
- Department Head
- Zone Technician
- Parking Operator
- Company Admin

These names are company-facing labels, not platform-wide built-in global roles.

## Design Principles

1. **Company is the top-level tenant boundary.**
2. **Primary Manager has full authority inside a company.**
3. **All normal company roles should be customizable.**
4. **Permissions define what can be done.**
5. **Scope defines where it can be done.**
6. **Multiple role assignments per user are allowed and expected.**
7. **MVP should stay allow-only and avoid deny rules.**

## Role and Scope Mental Model

Use this sentence everywhere:

> A role answers **what this person can do**. Scope answers **where they can do it**.

This is the core mental model for the product, documentation, and UI.

## Fixed Roles

### `system_admin`
- global platform role
- used by Duali/internal operators
- can access all companies and platform-level administration
- outside company hierarchy
- not a customer/company staff role

### `primary_manager`
- highest authority inside a company
- has full access to all company data and configuration
- can create, edit, archive, and assign company roles
- can manage all scopes within that company
- is the default first user created when a company is created

## Company-Defined Roles

A company-defined role is a reusable permission bundle owned by one company.

It should contain:
- name
- description
- permission set
- optional template origin
- lifecycle status

### Examples
- Viewer
- Receptionist
- Department Manager
- Zone Operator
- HR Manager
- Company Admin
- Self-Service User

## Scope Model

### Supported scope types (canonical)
- `company`
- `site`
- `department`
- `zone`
- `self`

These are the canonical scope types for the current model.

### Scope meanings

#### `company`
Permissions apply across the whole company.

#### `site`
Permissions apply only to one site/building/branch.

#### `department`
Permissions apply only to users and workflows associated with a department.

#### `zone`
Permissions apply only to physical-area resources such as devices, access points, cameras, and zone-bound operations.

#### `self`
Permissions apply only to the acting user's own records.

## Permission Model

Permissions use the canonical key format:

```text
{domain}.{resource}.{action}
```

Examples:
- `identity.user.read`
- `identity.user.update`
- `attendance.record.read`
- `attendance.leave.approve`
- `device.read`
- `device.manage`
- `access.point.read`
- `access.point.manage`
- `visitor.visit.manage`
- `report.export`
- `company.settings.manage`

### Standard actions
Use these actions consistently where possible:
- `read`
- `create`
- `update`
- `delete`
- `manage`
- `approve`
- `execute`
- `export`
- `configure`

## Canonical Data Model

### CompanyRole
| Field | Type | Required | Description |
|---|---|---|---|
| id | uuid | yes | Primary key |
| company_id | uuid | yes | Owning company |
| name | string(150) | yes | Display name |
| description | text | no | Human-readable explanation |
| template_key | string(100) | no | Template origin if role was created from template |
| is_system_template_copy | boolean | yes | Whether created from a built-in template |
| status | string(20) | yes | active or archived |
| created_by | uuid | yes | Creator |
| updated_by | uuid | no | Last editor |
| created_at | timestamp | yes | Creation time |
| updated_at | timestamp | yes | Last update |

### CompanyRolePermission
| Field | Type | Required | Description |
|---|---|---|---|
| id | uuid | yes | Primary key |
| role_id | uuid | yes | Role reference |
| permission_key | string(150) | yes | Canonical permission key |

### UserRoleAssignment
| Field | Type | Required | Description |
|---|---|---|---|
| id | uuid | yes | Primary key |
| company_id | uuid | yes | Tenant boundary |
| user_id | uuid | yes | Assigned user |
| role_id | uuid | yes | Assigned company role |
| scope_type | ScopeTypeEnum | yes | company, site, department, zone, self |
| scope_id | uuid | no | Required for site/department/zone |
| effective_from | timestamp | no | Optional start time |
| effective_to | timestamp | no | Optional expiry time |
| created_by | uuid | yes | Actor who assigned role |
| created_at | timestamp | yes | Creation time |

### Enums
```text
FixedRoleEnum: system_admin | primary_manager
ScopeTypeEnum: company | site | department | zone | self
RoleStatusEnum: active | archived
```

## Role Templates

The system should provide starter templates for fast manual setup.

Recommended built-in templates:
- Viewer
- Receptionist
- Department Manager
- Zone Operator
- Company Admin
- Self-Service User
- Blank Custom Role

Templates are not canonical global roles.
They are only starting points that companies can copy and modify.

## Authorization Evaluation Rules

Access is allowed when:
1. the acting user is `system_admin`, or
2. the acting user is `primary_manager` of the same company, or
3. the acting user has at least one valid role assignment that grants the required permission within the target scope

### Additional rules
- company boundary is always enforced first
- no company-scoped user may access another company's data
- multiple role assignments are additive
- no explicit deny rules in MVP
- if no permission+scope match exists, access is denied

## Scope Matching Rules

### Company-scoped resources
A `company` assignment matches any resource within the same company.

### Site-scoped resources
A `site` assignment matches resources belonging to that site.

### Department-scoped resources
A `department` assignment matches:
- users in that department
- workflows attached to that department
- department-filtered reports and approvals

### Zone-scoped resources
A `zone` assignment matches:
- devices in that zone
- access points in that zone
- cameras/resources mapped to that zone
- zone-based operational workflows

### Self-scoped resources
A `self` assignment matches only the current user's own records.

## Multiple Role Assignments

A user may have more than one role assignment.

Examples:
- Viewer at company scope
- Department Manager for HR department
- Zone Operator for Main Lobby

This is canonical behavior and should be supported directly.

## What is canonical vs non-canonical

### Canonical
- `system_admin`
- `primary_manager`
- company-defined custom roles
- scoped assignments
- permission keys in `{domain}.{resource}.{action}` format

### Non-canonical old global role names
The following should not be treated as fixed global RBAC roles anymore:
- `admin`
- `manager`
- `operator`
- `viewer`
- `site_admin`
- `super_admin`
- `tenant_admin`
- `security_admin`
- `security_operator`
- `hr_admin`
- `facility_admin`
- `reception`
- `resident`
- `api_integration`

Interpretation:
- some of these may remain useful as **template names** or **custom company role names**
- but they are not canonical built-in global roles

## API / UI Guidance

### UI guidance
The admin UX should guide setup in this order:
1. choose role template
2. name the role
3. review permissions
4. assign role to user
5. choose scope
6. save

### Feature spec guidance
Feature specs should prefer permission-based auth language.

Recommended examples:
- `Auth: requires permission attendance.record.read within matching scope`
- `Auth: requires permission attendance.leave.approve within matching department or company scope`
- `Auth: requires permission device.manage within matching zone/site/company scope`

Temporary shorthand is allowed in product docs/manuals, but implementation specs should converge on permission + scope language.

## Default Company Bootstrap

When a company is created:
1. create company
2. create first user with fixed role `primary_manager`
3. require password change on first login
4. optionally suggest starter templates for role setup

This is the canonical bootstrap process.

## MVP Boundaries

The current canonical model intentionally excludes:
- deny rules
- advanced boolean policy expressions
- unlimited custom scope types
- contextual ABAC rules
- raw policy-engine UX

These may be added later only if justified by real customer demand.

## Migration Notes

### From older fixed-role docs
Old docs may mention:
- `admin`
- `manager`
- `operator`
- `viewer`

These should now be interpreted as:
- common template names, or
- common company custom roles, not built-in platform roles

### From older architecture docs
Old labels like:
- `super_admin`
- `tenant_admin`
- `site_admin`
- `security_admin`

should be replaced by either:
- `system_admin`
- `primary_manager`
- permission bundles inside custom company roles

## References

Supporting documents:
- `docs/specs/platform/company-rbac-recommendation.md`
- `docs/specs/platform/company-rbac-admin-guide.md`
- `docs/specs/platform/auth.md`
- `docs/specs/platform/multi-tenancy.md`

## Notes

- This document is the canonical RBAC source of truth for DM3 company authorization.
- If other docs conflict with this one, this document wins.
- The recommendation doc explains why this direction was chosen.
- The admin guide explains how humans should actually use it.
