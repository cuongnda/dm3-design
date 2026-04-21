# Company RBAC Recommendation

> Domain: PLATFORM | Color: #6B7280 | Priority: P0
> Status: Draft Recommendation | Owner: Platform Team
> Purpose: Product and architecture direction for intuitive company-owned roles before final customer-specific hardening
> Updated: 2026-04-18

## Why this document exists

The current fixed-role RBAC model is too rigid for real customer needs.

Customers do not think in abstract global roles like:
- admin
- manager
- operator
- viewer

They think in practical business roles like:
- Receptionist
- Security Supervisor
- HR Lead
- Kế toán
- Zone Technician
- Department Head

They also expect permissions to be limited by scope, for example:
- only my department
- only my zone
- only my site
- only my own records

This document recommends a direction that is:
- flexible enough for enterprise customers
- simple enough to explain and operate manually
- safe enough to ship in an MVP without building an over-engineered policy engine too early

This is a **working recommendation**, not the final immutable architecture.

---

## Core Recommendation

### Keep 3 fixed human roles
- `system_admin` — platform operators (Duali internal)
- `primary_manager` — top authority inside a company
- `member` — baseline authenticated tenant user (self-service only)

### Why `member` is a fixed role, not a custom one
Every authenticated tenant user needs the same minimum capabilities: view own access history, manage own face ID / dynamic QR / profile, receive own notifications. Making this a company-defined role would:
- force every tenant to create it manually during onboarding
- leak "read-own-data" logic into custom middleware bypasses (the exact anti-pattern this spec eliminates)
- make the mobile app's onboarding UX tenant-dependent

Defining `member` as a fixed role with a fixed seeded permission set and an implicit `self` scope solves all three. It's auto-granted when a user is created and cannot be revoked — it's the floor, not a grant.

### Everything else (beyond baseline self-service) becomes company-defined
Each company can create its own roles, for example:
- Viewer
- Receptionist
- Security Supervisor
- HR Manager
- Department Manager
- Zone Operator
- IT Admin

### Roles are assigned with scope
Permissions are not global by default. They are constrained by scope such as:
- company
- site
- department
- zone
- self

### Use templates, not blank complexity
Primary Manager should not build roles from scratch every time.
The product should offer practical templates that can be copied and adjusted.

---

## Product Principle

**Controlled flexibility beats raw flexibility.**

Customers often ask for maximum customization, but what they usually need is:
- understandable defaults
- editable templates
- clear scope boundaries
- predictable permission behavior

So the product should guide them with a manual, intuitive model first, then evolve later when real customer patterns become clear.

---

## Recommended Final Shape

## 1. Fixed top-level roles

### `system_admin`
- Duali/internal platform role
- global scope
- manages platform and all companies
- not part of company hierarchy

### `primary_manager`
- highest role inside a company
- full access to all company data and configuration
- can create/edit/delete company roles
- can assign roles to company users
- company bootstrap owner

### `member`
- baseline tenant user role
- auto-granted at `self` scope on user creation
- permissions are a fixed seeded set, all from the `core` plugin
- enables mobile-app self-service without any admin action
- never revoked; additive with custom role assignments
- is the answer to "what can an ordinary employee do by default?"

These are the only fixed human roles the platform should rely on long-term.

---

## 2. Company-defined custom roles

A company can create any role name it wants.

Examples:
- Viewer
- Receptionist
- Security Shift Lead
- HR Lead
- Building Manager
- Parking Operator
- IT Support

Each custom role contains:
- display name
- description
- permission bundle
- optional template origin

Important: these are **company-owned roles**, not global system roles.

---

## 3. Scope-aware role assignments

A role assignment should always answer 2 questions:

1. **What can this user do?** → permissions
2. **On which data/resources?** → scope

### Recommended scope types for MVP
- `company`
- `site`
- `department`
- `zone`
- `self`

This is enough for a useful first version.
Do not start with floor, room, building wing, asset class, etc. That gets messy too fast.

---

## 4. Permission model

Permissions should be normalized as:

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

### Standard actions
Use a stable action vocabulary:
- `read`
- `create`
- `update`
- `delete`
- `manage`
- `approve`
- `execute`
- `export`
- `configure`

---

## 5. Plugin gating is orthogonal to RBAC

DM3 ships plugin-gated capabilities (visitor, parking, cctv, intercom, smart_building). A company without the plugin should not see those features at all — regardless of whether a user happens to hold a role with the matching permission.

### The cleanest model: gate before permission
```text
Request → tenant boundary → plugin gate → permission → scope → allow/deny
```

This is the right order because:
1. **Plugin state is cheaper to check** than walking role assignments
2. **The error message is clearer** — "your company does not have visitor enabled" vs "you don't have permission"
3. **It decouples commercial state from authorization state** — plugin toggles don't require re-editing roles

### Why permissions carry a `plugin` tag instead of a separate gate
Each permission catalog entry declares one owning plugin (`visitor.visit.manage` → `visitor`; `identity.user.read` → `core`). This means:
- Admin UI can grey out permissions whose plugin is disabled (no clicks wasted)
- Runtime gate is a single-lookup cost (no per-endpoint plugin logic)
- Role definitions are plugin-state-independent: disabling a plugin doesn't corrupt role data; re-enabling restores function instantly

### Why `member` permissions are always `core`
If `member` depended on optional plugins, disabling a plugin would break mobile-app self-service for everyone. The `member` seeded permission set is strictly `plugin=core` by design: own profile, own history, own biometrics, own QR. These work on any commercial tier.

### Toggle authority
Plugin enable/disable is `system_admin` only. It's a billing/commercial decision, not a `primary_manager` operation. The admin UI exposes read-only visibility of enabled plugins so customers understand their current package.

---

## Recommended MVP Product Design

This version is designed to work well with a manual guide and intuitive admin UX.

## MVP Goals
- simple enough for Primary Manager to understand
- flexible enough for common real-world org structures
- no policy-engine rabbit hole yet
- support practical scoping by department/zone/site/self

### MVP Role Model
- fixed: `system_admin`, `primary_manager`
- custom: all other company roles

### MVP Scope Model
- company
- site
- department
- zone
- self

### MVP Permission Logic
- allow-only model
- no explicit deny rules
- no nested boolean conditions
- no attribute expressions yet

### MVP Assignment Model
A user can have multiple role assignments.

Example:
- Linh = `Receptionist` scoped to Site A
- Linh = `Viewer` scoped to company

This avoids ugly edge cases and reflects reality better.

---

## Recommended Data Model

### CompanyRole
| Field | Type | Description |
|---|---|---|
| id | uuid | Primary key |
| company_id | uuid | Owning company |
| name | string | Display name |
| description | text | Role explanation |
| template_key | string nullable | Source template if created from template |
| is_system_template_copy | boolean | True if copied from built-in template |
| status | enum(active, archived) | Lifecycle |
| created_by | uuid | Creator |
| updated_by | uuid | Last editor |
| created_at | timestamp | Creation time |
| updated_at | timestamp | Last update |

### CompanyRolePermission
| Field | Type | Description |
|---|---|---|
| id | uuid | Primary key |
| role_id | uuid | Role |
| permission_key | string | e.g. `attendance.leave.approve` |

### UserRoleAssignment
| Field | Type | Description |
|---|---|---|
| id | uuid | Primary key |
| company_id | uuid | Company isolation |
| user_id | uuid | Assigned user |
| role_id | uuid | Assigned role |
| scope_type | enum | company, site, department, zone, self |
| scope_id | uuid nullable | Null for company/self |
| effective_from | timestamp nullable | Optional |
| effective_to | timestamp nullable | Optional |
| created_by | uuid | Actor |
| created_at | timestamp | Creation time |

### Optional future table: RoleTemplate
Not required for MVP if templates are hardcoded in app config.

---

## Authorization Evaluation Rule

For MVP, use a very clear rule:

Access is allowed when:
1. user is `system_admin`, or
2. user is `primary_manager` of the same company, or
3. user has at least one role assignment that grants the required permission within the target scope

### Important behavior
- no cross-company access except `system_admin`
- scope match must be explicit
- multiple assignments are additive
- no deny rules in MVP

This keeps the model understandable.

---

## Scope Interpretation Guide

### `company`
Applies to all resources within the company.

Use for:
- overall viewers
- broad admins
- company-wide report access

### `site`
Applies to data/resources belonging to one site.

Use for:
- branch/site supervisors
- building-level operations

### `department`
Applies to users and workflows related to a department.

Use for:
- department heads
- HR approvals by department
- attendance review by department

### `zone`
Applies to location-based operational assets.

Use for:
- access points
- devices
- CCTV groups
- security operation scope

### `self`
Applies only to the acting user's own records.

Use for:
- own attendance
- own leave requests
- own profile/security

---

## Recommended Templates for Manual Guide

These templates are practical and easy to explain.

### 1. Viewer
**Purpose:** read-only visibility

Typical permissions:
- dashboard read
- event read
- report read
- user read

Suggested default scope:
- company

### 2. Receptionist
**Purpose:** front desk operations

Typical permissions:
- visitor visit create/update/manage
- delivery package manage
- resident/contact lookup read
- limited access event read

Suggested default scope:
- site or zone

### 3. Department Manager
**Purpose:** manage users/workflows for one department

Typical permissions:
- identity user read
- attendance record read
- attendance leave approve
- attendance overtime approve
- report read/export

Suggested default scope:
- department

### 4. Zone Operator
**Purpose:** operational control in specific zones

Typical permissions:
- device read/manage
- access point read/manage
- access command execute
- event read

Suggested default scope:
- zone

### 5. Company Admin
**Purpose:** broad company administration without being the owner

Typical permissions:
- company settings manage
- user manage
- role manage (optional, depending on policy)
- device manage
- plugin/module configure

Suggested default scope:
- company

### 6. Self-Service User
**Purpose:** own data only

Typical permissions:
- own attendance read
- own leave create/cancel
- own profile update

Suggested default scope:
- self

---

## Recommended Manual UX Flow

This is the important part. The UX should feel obvious.

### Create a role
1. Go to **Users & Roles**
2. Click **Create Role**
3. Choose one of:
   - Viewer
   - Receptionist
   - Department Manager
   - Zone Operator
   - Company Admin
   - Blank Custom Role
4. Enter role name
5. Review default permissions
6. Save role

### Assign role to user
1. Open user detail
2. Click **Assign Role**
3. Select role
4. Select scope type
   - whole company
   - selected site
   - selected department
   - selected zone
   - self only
5. Choose specific scope value if needed
6. Save assignment

### Mental model for admins
Use this sentence everywhere in help text:

> A role answers **what this person can do**. Scope answers **where they can do it**.

That sentence is gold. Keep it.

---

## Manual Guide Recommendation

For the first release, documentation should favor concrete examples over abstract theory.

### The manual should explain:
- What is Primary Manager
- What is a custom role
- What is scope
- Common role patterns
- How to assign multiple roles
- How to avoid giving too much access

### Example guide snippets

#### Example A: Department Head
- Role: `Department Manager`
- Scope: `Department = Sales`
- Result: can see/manage attendance and people workflows only for Sales

#### Example B: Lobby Security
- Role: `Zone Operator`
- Scope: `Zone = Main Lobby`
- Result: can monitor and manage devices/access points only in the Main Lobby

#### Example C: Staff self-service
- Role: `Self-Service User`
- Scope: `Self`
- Result: can submit leave, view own attendance, no access to others

---

## What not to build in MVP

To avoid making this too complex too early, do **not** build these in v1:

### 1. Deny rules
Example: “allow everything except zone B”.
This becomes confusing and hard to debug.

### 2. Arbitrary boolean policy expressions
Example:
- department in X and site in Y unless weekend and not overtime approver

That is too much for now.

### 3. Unlimited scope types
Do not start with:
- floor
- room
- corridor
- parking lane
- building wing
- asset group

Add only after real customer demand patterns are clear.

### 4. Fully dynamic policy engine UI
That will be expensive and confusing before the permission model stabilizes.

---

## Advice for Sales / Customer Discovery

If customers say:
- “We want fully customizable permissions”

Guide them to:
- customizable role names
- built-in templates
- scope-limited assignments
- multiple roles per person

This usually satisfies 80 to 90 percent of real needs without building a monster.

### Good discovery questions
When a customer asks for custom RBAC, ask:
1. What job titles do you actually use today?
2. Which data should each role see?
3. Is the boundary by department, site, or physical zone?
4. Who approves leave/overtime/access requests?
5. Do people need more than one role at the same time?

These questions produce usable product decisions much faster than asking about “permissions” in the abstract.

---

## Future Phases

## Phase 2
Add:
- more polished permission catalog UI
- role assignment expiry dates
- multi-scope assignments in one role grant
- role usage audit view
- permission simulation / "why was access denied?"

## Phase 3
Add only if strongly demanded:
- custom approval chains
- temporary delegated access
- scoped report filters at finer granularity
- configurable role templates per industry
- advanced conditional policies

## Phase 4, only if truly needed
- ABAC / policy engine
- expression builder
- deny rules
- contextual rules (time, device type, risk level)

This should be delayed until real customer patterns prove it is necessary.

---

## Recommendation Summary

### What we should do now
- keep `system_admin` and `primary_manager` fixed
- make all other roles company-defined
- use templates for fast setup
- assign roles with scope
- support multiple role assignments per user
- ship with a simple manual and example-based UX

### What we should not do now
- do not hardcode many global roles
- do not build deny rules
- do not build a full policy engine
- do not support unlimited scope types yet

### Why this is the best direction
Because it gives us:
- flexibility without chaos
- intuitive setup for real operators
- room to evolve once actual customer requirements become concrete

---

## Suggested next documents

After aligning on this direction, the next useful docs are:
1. `company-rbac.md` rewrite to reflect this model as canonical
2. a practical admin manual: **How to create roles and assign scope**
3. API/data-model spec for custom roles + scoped assignments
4. permission catalog draft by domain

For now, this document is the recommended bridge between product intention and future implementation detail.
