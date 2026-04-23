# DM3 Customer Deployment Installation Package

## Purpose
This package defines the standard document set and folder structure used to prepare, execute, and hand over a DM3 customer deployment.

It is designed to be:
- Reusable across projects
- Easy for PMs, deployment engineers, support, and customers to follow
- Concrete enough for real site execution, not just planning

## Recommended package structure

```text
customer-deployment/
├── 00-project-summary/
│   └── customer-project-brief.md
├── 01-scope-and-commercial/
│   ├── signed-scope.md
│   ├── approved-bom.xlsx
│   └── license-summary.md
├── 02-site-and-network/
│   ├── site-survey.md
│   ├── device-location-plan.pdf
│   ├── ip-plan.xlsx
│   └── network-port-whitelist.md
├── 03-installation-and-configuration/
│   ├── deployment-runbook-and-handover.md
│   ├── commissioning-record.xlsx
│   └── system-parameter-sheet.md
├── 04-training-and-handover/
│   ├── admin-training-attendance.md
│   ├── support-contacts.md
│   └── handover-signoff.md
└── 05-operations/
    ├── backup-restore-plan.md
    ├── maintenance-plan.md
    └── incident-escalation.md
```

## Minimum standard package for every deployment
For every DM3 customer deployment, the team should produce at least:
1. Project brief
2. Approved scope and bill of materials
3. Site survey and network readiness record
4. Pre-deployment checklist
5. Deployment runbook
6. License summary
7. Handover and training record
8. Support and escalation contacts

## Recommended defaults for DM3

### Deployment model
- Default topology: centralized DM3 backend with tenant isolation per customer
- Default environment split: staging for FAT/UAT, production for live operation
- Default network posture: outbound-only device connectivity where possible, fixed allowlist for required services
- Default authentication: named admin accounts only, no shared permanent admin login

### Access control operational defaults
- Controllers and terminals must continue local decision-making during WAN loss
- Core door access decisions must not depend on real-time license revalidation
- Time synchronization source must be defined before go-live
- Emergency egress and life-safety behavior must be validated on site before handover

### Documentation defaults
- One package owner on vendor side, usually implementation PM
- One signoff owner on customer side, usually facilities/security manager or IT lead
- All final docs stored in one customer folder with date and version

## Delivery phases

### 1. Presales to project handoff
- Confirm scope, site count, door count, device classes, and target go-live date
- Confirm edition, modules, capacities, and commercial term
- Assign PM, deployment lead, and customer owner

### 2. Pre-deployment readiness
- Complete site survey
- Validate infrastructure, network, power, mounting, and civil readiness
- Confirm device inventory and serial numbers
- Freeze implementation scope for phase 1

### 3. Deployment and commissioning
- Install hardware
- Configure tenant, sites, zones, devices, operators, and rules
- Test normal operation, offline behavior, alarm flows, and audit visibility

### 4. Training and handover
- Train system admins and operators
- Hand over credentials, support path, and maintenance responsibilities
- Capture punch list and closure owner

## Acceptance baseline
A deployment is not ready for handover until all are true:
- Devices are online or intentionally documented as deferred
- Door, schedule, and credential rules work as approved
- Offline operation is tested for critical doors
- Event and audit logs are visible in DM3
- Customer admin can perform agreed daily operations
- Open issues are documented with owner and due date

## Related docs
- [pre-deployment-checklist.md](./pre-deployment-checklist.md)
- [deployment-runbook-and-handover.md](./deployment-runbook-and-handover.md)
- [../licensing/license-framework.md](../licensing/license-framework.md)