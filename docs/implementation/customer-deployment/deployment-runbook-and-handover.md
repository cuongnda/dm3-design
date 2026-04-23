# DM3 Deployment Runbook and Handover Template

Use this document during installation, commissioning, go-live, and customer handover.

## Document control
- Customer name:
- Site name:
- Deployment phase:
- Planned execution window:
- Vendor PM:
- Deployment lead:
- Customer technical owner:
- Customer operations owner:
- Version:
- Date:

## 1. Scope summary
- In-scope sites:
- In-scope doors and access points:
- In-scope device types:
- In-scope modules:
- Out-of-scope items:
- Dependencies and assumptions:

## 2. Team and contacts
| Role | Name | Company | Phone | Email |
|------|------|---------|-------|-------|
| Vendor PM |  |  |  |  |
| Deployment lead |  |  |  |  |
| Customer IT owner |  |  |  |  |
| Customer facilities/security owner |  |  |  |  |
| Escalation level 2 |  |  |  |  |

## 3. Prerequisites check on deployment day
- [ ] Approved pre-deployment checklist available
- [ ] Latest site drawings available
- [ ] Device inventory present onsite
- [ ] Network and power ready
- [ ] Required credentials, VPN, and admin access available
- [ ] Safety permit or work approval available if required

## 4. Execution steps

### A. Hardware installation
- Confirm door and reader labels match design
- Install controllers, readers, locks, sensors, and terminal devices
- Record serial numbers, MAC addresses, and final mounting locations
- Photograph each cabinet and critical door wiring before closeout

### B. Platform setup
- Create or verify tenant and site structure
- Configure buildings, floors, zones, and access points
- Create admin and operator accounts
- Import initial users and credentials if included
- Configure schedules, holidays, and access rules

### C. Device onboarding
- Register gateways, controllers, and terminals
- Apply naming convention
- Verify firmware version against project baseline
- Confirm heartbeat, sync, and event reporting

### D. Integration setup
- Configure intercom, CCTV, elevator, visitor, parking, or alarm integrations if in scope
- Validate event exchange and expected permissions boundary

### E. Validation and commissioning
- Test door release from local credential
- Test remote command from console
- Test schedule-based lock behavior
- Test denied access and audit visibility
- Test door forced-open and held-open alarms if supported
- Test controller behavior during WAN loss
- Test recovery after connectivity returns

## 5. Recommended commissioning tests for DM3
| Test | Expected result | Pass/Fail | Notes |
|------|-----------------|-----------|-------|
| Valid credential at normal door | Door opens, event logged |  |  |
| Invalid credential | Door remains locked, denial logged |  |  |
| Schedule outside allowed hours | Denial logged correctly |  |  |
| Controller offline from server | Critical doors continue local access decisions |  |  |
| Power recovery | Device returns with correct config and audit continuity |  |  |
| Alarm or fire input | Door behavior matches approved safety policy |  |  |
| Admin login | Customer admin can access agreed modules |  |  |

## 6. Issues and punch list
| ID | Issue | Severity | Owner | Target date | Status |
|----|-------|----------|-------|-------------|--------|
|  |  |  |  |  |  |

## 7. Handover items
- [ ] Final as-built device list delivered
- [ ] Final IP plan delivered
- [ ] Admin credentials transferred securely
- [ ] License summary delivered
- [ ] Backup and restore procedure delivered
- [ ] Support contacts delivered
- [ ] Warranty and SLA start date confirmed
- [ ] Open issues recorded and accepted

## 8. Customer training record
| Topic | Audience | Trainer | Date | Completed |
|------|----------|---------|------|-----------|
| Admin login and tenant navigation |  |  |  |  |
| User and credential management |  |  |  |  |
| Door monitoring and audit review |  |  |  |  |
| Alarm and incident handling |  |  |  |  |
| Basic troubleshooting and support escalation |  |  |  |  |

## 9. Operational handover notes
- Daily operator tasks:
- Weekly admin tasks:
- Backup ownership:
- Firmware and patch ownership:
- Support hours:
- Escalation path:

## 10. Signoff
### Vendor signoff
- Name:
- Role:
- Signature:
- Date:

### Customer signoff
- Name:
- Role:
- Signature:
- Date:

## DM3 recommended handover standard
The deployment should only move to closed status when:
- Customer confirms the agreed critical doors operate correctly
- Offline access continuity has been demonstrated or formally waived in writing
- Customer admin completes at least one live admin task successfully
- Licensing has been activated or a time-bounded temporary activation has been documented
- Every remaining issue has an owner and due date