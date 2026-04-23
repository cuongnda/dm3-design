# DM3 Pre-Deployment Checklist Template

Use this checklist before hardware installation or production go-live.

## Document control
- Customer name:
- Project name:
- Project code:
- Deployment phase:
- Planned go-live date:
- Vendor PM:
- Deployment lead:
- Customer owner:
- Version:
- Date:

## 1. Commercial and scope readiness
- [ ] Contract or PO approved
- [ ] Scope baseline approved
- [ ] Bill of materials approved
- [ ] Delivery sites and door counts confirmed
- [ ] Edition and module scope confirmed
- [ ] Capacity assumptions confirmed, including doors, controllers, users, credentials, cameras, and parking devices if applicable
- [ ] License term and renewal owner confirmed
- [ ] Support SLA and escalation path confirmed

## 2. Site readiness
- [ ] Site survey completed and signed off
- [ ] Final device location plan approved
- [ ] Mounting surfaces and enclosures ready
- [ ] Power availability confirmed at all device points
- [ ] UPS scope defined for controllers, network, and servers where required
- [ ] Lock hardware type confirmed for each controlled door
- [ ] Fire alarm and emergency release interface requirements confirmed
- [ ] Elevator, parking, intercom, CCTV, or third-party integration scope confirmed if in project

## 3. Network and infrastructure readiness
- [ ] Customer network owner identified
- [ ] IP plan available for servers, gateways, controllers, terminals, and cameras if applicable
- [ ] DNS, NTP, and time zone confirmed
- [ ] Required ports and URLs allowlisted
- [ ] VPN or secure remote support path confirmed
- [ ] Server or cloud environment provisioned
- [ ] Backup destination defined
- [ ] Monitoring and alert recipients defined

## 4. DM3 platform readiness
- [ ] Tenant and company structure confirmed
- [ ] Site, building, floor, and zone structure confirmed
- [ ] Operator roles and admin accounts confirmed
- [ ] Credential model confirmed, for example card, QR, PIN, mobile, biometric
- [ ] Access schedules and holiday calendars provided
- [ ] Initial user import template prepared
- [ ] Device naming convention agreed
- [ ] Event retention and audit expectations agreed

## 5. Hardware and logistics readiness
- [ ] All required devices delivered or inbound with ETA
- [ ] Serial numbers or MAC addresses recorded
- [ ] Firmware baseline defined
- [ ] Spare device quantity defined
- [ ] Tools, ladders, labels, and consumables ready
- [ ] Installer access permits and working hours approved

## 6. Testing readiness
- [ ] FAT scope agreed
- [ ] SAT or UAT test cases agreed
- [ ] Critical door scenarios identified
- [ ] Offline operation test included in plan
- [ ] Fail-safe and fail-secure behavior confirmed per door
- [ ] Alarm, emergency, and forced-door scenarios included
- [ ] Handover acceptance criteria agreed

## 7. Training and handover readiness
- [ ] Customer admin trainees identified
- [ ] Training format and date agreed
- [ ] Support contacts document prepared
- [ ] Handover signoff template prepared
- [ ] Warranty start condition agreed

## 8. Licensing readiness
- [ ] Commercial license summary prepared
- [ ] Customer legal entity name confirmed for license issuance
- [ ] Deployment environment IDs confirmed, for example tenant id, gateway id, server id
- [ ] Activation method decided, online or assisted offline activation
- [ ] Renewal notice owners and contacts confirmed
- [ ] Grace and fail-safe behavior explained to customer
- [ ] Customer acknowledges that expired commercial license will not hard-stop essential door operations, but may limit new provisioning, reports, or premium modules after grace rules

## 9. Go / no-go review
- Go live decision:
- Decision date:
- Approved by vendor:
- Approved by customer:
- Blockers:
- Mitigations:

## Recommended DM3 exit criteria before onsite deployment
- No unresolved blocker on power, network, or lock wiring
- All critical doors have defined fail-safe or fail-secure policy
- At least one admin and one operator account prepared
- Licensing data ready for activation without onsite delay
- Offline access continuity test explicitly included in commissioning plan