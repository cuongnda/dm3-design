# Company Roles & Scope Admin Guide

> Audience: Primary Managers and company administrators
> Purpose: Practical guide for setting up roles and access in a way that is easy to understand and safe to operate
> Status: Draft Guide
> Updated: 2026-04-18

## The simple idea

There are only 2 things to decide:

1. **What can this person do?** → Role
2. **Where can they do it?** → Scope

That is the whole model.

Use this sentence in your head every time:

> A role answers **what this person can do**. Scope answers **where they can do it**.

---

## The fixed roles

### System Admin
- global DM3 platform role
- used by Duali/internal platform operators
- not a company staff role

### Primary Manager
- highest authority inside one company
- can see and manage all company data
- can create roles
- can assign roles
- can change company settings

### Member (automatic baseline)
- every active user in your company holds this role automatically
- lets users use the mobile app for **their own data only**:
  - view their own access history
  - manage their own face ID, fingerprint, dynamic QR
  - view and update their own profile
- cannot see other users' data, cannot change company settings, cannot manage devices
- cannot be revoked (it's the minimum, not a grant)
- does not appear in role lists or the "Assign Role" dialog — it's always on

If a user should only use the mobile app for personal features, you do not need to assign anything. `Member` is already there.

You only assign custom roles when the user needs to do more than personal self-service.

These three are the only fixed roles. Everything else should be created by the company.

---

## What is a custom role?

A custom role is a role your company creates for real job functions.

Examples:
- Viewer
- Receptionist
- Security Supervisor
- HR Manager
- Department Head
- Zone Technician
- Parking Operator

A role should describe a job, not a person.

✅ Good role names:
- Receptionist
- Department Manager
- Security Supervisor

❌ Bad role names:
- Linh Role
- Test Role 1
- Temporary Maybe Admin

---

## What is scope?

Scope limits where a role works.

A person may have the right permission, but only in a limited area.

### Scope types

#### 1. Company
Use when the role applies everywhere inside the company.

Example:
- Company Viewer
- Company Admin

#### 2. Site
Use when the role applies to one site/building/branch.

Example:
- Receptionist at Building A
- Site Operations Lead at Factory 2

#### 3. Department
Use when the role should only affect users or workflows in one department.

Example:
- Sales Department Manager
- HR Leave Approver

#### 4. Zone
Use when the role should only affect physical areas and their devices/resources.

Example:
- Lobby Security Supervisor
- Parking Zone Operator

#### 5. Self
Use when a person should only see or manage their own records.

Example:
- own attendance
- own leave requests
- own profile

---

## How to think before creating a role

Before creating a role, answer these 3 questions:

1. What job does this person actually do?
2. Which actions do they need?
3. What is the smallest scope that still lets them do their work?

That last question matters.

When in doubt, give the **smallest scope first**.
You can expand later.

---

## Recommended starter templates

These templates are safe and easy to understand.

### Viewer
**Use for:** people who only need to look

Typical permissions:
- view dashboard
- view events
- view users
- view reports

Typical scope:
- company, site, or department

### Receptionist
**Use for:** front desk staff

Typical permissions:
- manage visitor registration
- manage package/delivery intake
- search user/resident/contact info
- view limited access-related info

Typical scope:
- site or zone

### Department Manager
**Use for:** team heads

Typical permissions:
- view users in department
- view attendance in department
- approve leave in department
- approve overtime in department
- view/export department reports

Typical scope:
- department

### Zone Operator
**Use for:** device/access operations in an area

Typical permissions:
- view devices in zone
- manage devices in zone
- view access points
- manage access points
- execute operational commands

Typical scope:
- zone

### Company Admin
**Use for:** trusted company-level administrators

Typical permissions:
- manage users
- manage roles
- manage devices
- manage company configuration
- manage modules/settings

Typical scope:
- company

### Self-Service User
**Use for:** standard employees using their own account

Typical permissions:
- view own attendance
- create own leave request
- cancel own pending leave request
- update own profile/security settings

Typical scope:
- self

---

## How to create a role

### Step 1: Start from a template if possible
Do not start blank unless really needed.

Pick the closest template:
- Viewer
- Receptionist
- Department Manager
- Zone Operator
- Company Admin
- Self-Service User
- Blank Custom Role

### Step 2: Name the role clearly
Use a name that matches a real business function.

Good examples:
- HR Manager
- Main Lobby Security
- Branch Receptionist
- Parking Operator

### Step 3: Review permissions
Only keep permissions needed for the job.

Questions to ask:
- Do they need to edit, or only view?
- Do they need approval rights?
- Do they need export rights?
- Do they need configuration rights?

### Step 4: Save role
At this stage, the role defines only **what** can be done.
Not **where**.

---

## Why some permissions are greyed out

DM3 has optional features called **plugins**:
- Visitor management
- Parking
- CCTV
- Intercom
- Smart building

Your company is subscribed to some of these, not necessarily all. The baseline features (users, devices, access, attendance, reports) are always available.

### What you will see
When you edit a role's permissions:
- permissions from plugins your company **has** → selectable normally
- permissions from plugins your company **does not have** → greyed out, cannot be selected, with a tooltip explaining why

### If a plugin is turned off later
- roles that already contain those permissions keep them, greyed out
- affected users silently lose access to those features (they see "Upgrade" prompts in the app instead of errors)
- if the plugin is re-enabled later, everything works again without editing roles

### Who controls plugins
Only Duali/internal platform staff can enable or disable plugins (it's part of your service plan). Primary Manager can see which plugins are on but cannot toggle them.

You don't need to worry about this during role setup — the greyed-out state handles it automatically.

---

## How to assign a role to a user

### Step 1: Open the user
Open the user detail page.

### Step 2: Click Assign Role
Pick one role.

### Step 3: Choose scope
This is where many mistakes happen. Slow down here.

Pick the smallest scope that fits the job:
- whole company
- one site
- one department
- one zone
- self only

### Step 4: Select the target
Examples:
- Department = Sales
- Zone = Main Lobby
- Site = Building A

### Step 5: Save
Now the user has that role in that scope.

### Step 6: Add another role if needed
It is normal for one user to have multiple assignments.

Example:
- Viewer at company scope
- Department Manager for HR department

That is okay and often better than making one bloated role.

---

## Good examples

## Example 1: Sales Department Head
**Need:** approve leave and view attendance for Sales team only

Recommended setup:
- Role: `Department Manager`
- Scope: `Department = Sales`

Result:
- can review Sales users and workflows
- cannot manage Marketing or Operations

## Example 2: Lobby guard
**Need:** manage devices and operational events in lobby only

Recommended setup:
- Role: `Zone Operator`
- Scope: `Zone = Main Lobby`

Result:
- can work on lobby devices and access points
- cannot manage parking or office floors

## Example 3: HR staff
**Need:** work with people records and leave in HR-related departments

Recommended setup:
- Role: `HR Manager` (template based on Department Manager)
- Scope: `Department = HR`

If they also need broader company people access, add another assignment intentionally.

## Example 4: Executive who only wants reports
**Need:** view data, no editing

Recommended setup:
- Role: `Viewer`
- Scope: `Company`

---

## Common mistakes to avoid

### Mistake 1: Giving company scope too early
If someone only works in one zone or department, do not give company-wide scope.

### Mistake 2: Making one giant role for everything
If a person has 2 different responsibilities, prefer 2 assignments.
That is clearer and easier to audit.

### Mistake 3: Naming roles after people
Roles should survive staff changes.
Name the job, not the person.

### Mistake 4: Creating too many similar roles
Examples:
- Receptionist 1
- Receptionist 2
- Receptionist Temp

Instead:
- use one role
- vary the scope assignment

### Mistake 5: Using edit/manage permissions when read-only is enough
Always start with the least power needed.

---

## Quick decision guide

If the person should...

### ...only look at information
Use:
- Viewer

### ...manage front-desk workflows
Use:
- Receptionist

### ...approve team workflows
Use:
- Department Manager

### ...control devices/resources in one area
Use:
- Zone Operator

### ...run company-wide setup and administration
Use:
- Company Admin

### ...only use their own personal features
Use:
- Self-Service User

---

## When to create a new custom role

Create a new role when:
- the job function is genuinely different
- permission set is meaningfully different
- many users will likely need the same setup

Do **not** create a new role when:
- the only difference is scope
- the job is basically the same
- it is a one-off exception that can be handled by one extra assignment

Example:
- Same Receptionist role can be used for 5 sites with different scope assignments
- no need to create 5 separate receptionist roles unless permissions really differ

---

## Simple admin rule of thumb

### Role = job
### Scope = boundary
### Multiple assignments = normal

If you remember those 3 lines, the system will make sense.

---

## Suggested first rollout for a new company

For a practical first setup, create these roles:
1. Viewer
2. Self-Service User
3. Receptionist
4. Department Manager
5. Zone Operator
6. Company Admin

Then assign scope as needed.

This is enough for most first deployments.

---

## FAQ

### Can one user have more than one role?
Yes. This is normal.

### Should I create a separate role for every department?
Usually no.
Use one role, like Department Manager, and assign different department scopes.

### Should I create a separate role for every zone?
Usually no.
Use one role, like Zone Operator, and assign different zone scopes.

### What if I am not sure which scope to use?
Start smaller:
- department instead of company
- zone instead of site
- self instead of department

You can expand later.

### Who can do everything in a company?
Primary Manager.

---

## Sanity check: does this model make sense?

Yes, because it matches how real businesses think:
- people have jobs
- jobs need permissions
- permissions should only work in the right area

It is also practical because:
- easy to explain
- easy to assign manually
- easy to audit later
- flexible without becoming a mess

That is why this guide is the recommended mental model for DM3 company access setup.
