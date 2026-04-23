# DM3 License Framework

## Purpose
This document defines a reusable commercial licensing model for Duall Master 3.0 that sales, PMs, finance, product, and engineering can apply consistently across customer deployments.

The model is designed for access control and smart building environments, where business enforcement must not create unsafe door behavior.

## Licensing principles
1. Essential access operations must remain safe during license expiry or temporary licensing faults.
2. Commercial packaging should be simple enough for sales and customers to understand.
3. Technical enforcement should align with operational value, not create friction in daily use.
4. Capacity metrics should follow how customers buy and operate systems.
5. Premium modules can degrade gracefully, but core security operations need continuity.

## Recommended commercial model
DM3 licenses use five layers:
1. **Edition**: overall product tier
2. **Modules**: optional functional packages
3. **Capacity**: licensed operational scale
4. **Term**: subscription or support validity period
5. **Services**: implementation, training, support, and SLA attached commercially but not encoded as runtime feature switches unless needed

## 1. Edition model

### Essentials
Best for single-site or small multi-site deployments needing core access control.

Included by default:
- Tenant and site management
- Users and credentials
- Doors, controllers, and readers
- Schedules and holidays
- Audit trail and event history
- Basic dashboards and reporting
- Local controller operation and offline continuity

### Professional
Best for growing customers with multiple sites or operational integrations.

Includes Essentials, plus:
- Advanced role and operational workflows
- Visitor or parking modules where purchased
- Advanced reporting and exports
- API and selected third-party integrations
- Staging environment option

### Enterprise
Best for large multi-site, high-availability, or integration-heavy customers.

Includes Professional, plus:
- High-capacity scale bands
- Advanced integration support
- Multi-region or dedicated deployment options
- Premium support and governance options
- Roadmap-level extensibility subject to contract

## 2. Module model
Modules are add-ons or bundled entitlements depending on edition.

### Core module families
- **Secure**: access control, intrusion, intercom, CCTV-related workflows
- **Manage**: identity, attendance, visitor, workforce operations
- **Operate**: parking, logistics, command workflows
- **Smart**: analytics, automation, AI assistant
- **Platform**: API access, advanced audit, SSO, integration adapters

### Recommended initial DM3 module catalog
- Core Access Control
- Identity Management
- Device Provisioning
- Visitor Management
- Attendance
- Parking
- Intercom
- CCTV Connector
- Analytics
- Automation
- API and Integration Pack
- SSO and Advanced Security Pack

## 3. Capacity model
DM3 should avoid overly complex per-feature counting. Use a small set of primary capacity units.

### Primary billable capacity units
- Doors or controlled access points
- Controllers or gateways
- Named users or managed identities
- Credential volume when materially different from named users
- Sites or buildings for distributed deployments
- Cameras, parking lanes, intercom stations, or terminals only when related modules are sold

### Recommended default rule
For standard access control deals, price primarily by:
1. Door count band
2. Named user band
3. Module add-ons

### Recommended capacity bands
#### Door bands
- 1 to 16 doors
- 17 to 64 doors
- 65 to 256 doors
- 257 to 1000 doors
- 1000+ doors by custom quote

#### Named user bands
- Up to 500
- 501 to 2,000
- 2,001 to 10,000
- 10,000+ by custom quote

### Overage policy
- Soft warning at 80 percent of licensed capacity
- Admin warning and sales notification at 95 percent
- Graceful overage allowance up to 110 percent for 30 days by default
- No hard block on existing door access due to capacity overage
- New provisioning may be restricted after grace, with explicit admin warning

## 4. Term model

### Recommended terms
- 12 months default subscription term
- 36 months encouraged for enterprise contracts
- Perpetual device-side right to continue essential local access on already commissioned hardware, subject to safety policy
- Annual support and update entitlement tracked separately where perpetual commercial models are offered

### Renewal windows
- Renewal reminder at 90, 60, and 30 days before expiry
- Visible admin warning in console during last 30 days
- Grace period after expiry: 30 days recommended for cloud and support entitlements

## 5. Enforcement policy by feature type

### Must remain available even when commercial term expires
- Existing local controller access decisions
- Door unlock behavior already provisioned on controllers, subject to door safety policy
- Emergency egress and fire-alarm related behavior
- Viewing current alarm state for safety operations if technically feasible
- Audit capture on devices and deferred sync when connectivity returns

### May move to limited mode after grace period
- New tenant or site provisioning
- Adding new devices beyond licensed baseline
- New user or credential creation beyond baseline
- Premium reports and exports
- Analytics, AI, automation, and selected third-party integrations
- Software updates and premium support response commitments

### Recommended customer-facing message
License expiry does not disable safe operation of already commissioned access points. Commercial expiry mainly affects entitlement to add new scale, premium modules, cloud services, updates, and support according to contract.

## 6. Packaging examples

### Example A, small office
- Edition: Essentials
- Capacity: 8 doors, 200 named users
- Modules: Core Access Control, Identity Management
- Term: 12 months

### Example B, multi-building apartment
- Edition: Professional
- Capacity: 64 doors, 5,000 users, 4 intercom stations, 2 parking lanes
- Modules: Access Control, Visitor, Parking, Intercom, Analytics
- Term: 36 months

### Example C, industrial campus
- Edition: Enterprise
- Capacity: 250 doors, 12,000 users, attendance and API integration
- Modules: Access Control, Identity, Attendance, API and Integration Pack, SSO
- Term: 36 months with premium SLA

## 7. Commercial governance rules
- Every quote must clearly show edition, modules, capacities, and term
- Every deployment package must include a one-page license summary
- Sales cannot promise runtime behavior that conflicts with safety rules in the technical design
- Any exception to default grace or fail-safe policy must be approved by product and engineering

## 8. DM3 default recommendations
- Default edition for most paid deployments: Professional
- Default term for new commercial customers: 12 months
- Default grace after expiry: 30 days for commercial entitlement, indefinite safe continuity for already commissioned essential access functions on controllers
- Default overage handling: warn first, restrict growth later, never hard-stop existing critical access operations