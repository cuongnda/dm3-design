# DM3 License Technical Design

## Purpose
This document proposes a practical technical design for DM3 licensing that supports commercial control without creating unsafe access-control behavior.

## Design goals
- Signed, verifiable license data
- Works for cloud-connected and restricted-network deployments
- Clear edition, module, capacity, and term enforcement points
- Graceful degradation for expired or invalid commercial entitlements
- No hard-stop of essential door operations on already commissioned controllers

## Non-negotiable safety rule
License failure, expiry, or temporary inability to contact the licensing service must not force critical doors into a non-operational state.

In DM3, real-time door decisions should continue from locally provisioned policy on controllers or gateways. License state influences management-plane capabilities, provisioning, and premium functions, not immediate life-safety or essential access operation.

## Architecture overview

### Components
- **License issuer**: internal service or back-office tool that creates signed licenses
- **License validation library**: shared verification logic used by backend services and optionally gateways
- **License store**: persisted current license and status per tenant or deployment
- **Console admin UI**: shows entitlement, warnings, renewal status, and restricted actions
- **Gateway/controller cache**: optional compact entitlement cache for local awareness, not for hard-stop door control

### Recommended scope of a license
Primary scope should be **tenant deployment**, with optional bindings to environment identifiers.

Examples:
- tenant_id
- deployment_id
- environment, for example production or staging
- approved gateway_ids or hardware fingerprint list for isolated deployments when needed

## License payload proposal
Use a signed JSON payload. JWS is a practical default because it is widely supported and easy to transport.

### Recommended signing model
- Asymmetric signature, for example Ed25519 or ES256
- Private key held only by issuer
- Public key distributed with DM3 services for verification
- Include key id for rotation

### Example payload
```json
{
  "iss": "dm3-license-service",
  "kid": "lic-2026-q2",
  "sub": "tenant:acme-tower",
  "license_id": "lic_01JXYZ...",
  "customer": {
    "legal_name": "Acme Tower Management Co., Ltd.",
    "customer_code": "ACME-TWR"
  },
  "deployment": {
    "tenant_id": "tenant_acme_tower",
    "deployment_id": "prod_hcm_main",
    "environment": "production",
    "bound_gateway_ids": ["gw-hcm-01", "gw-hcm-02"]
  },
  "edition": "professional",
  "modules": [
    "core_access",
    "identity",
    "visitor",
    "parking",
    "analytics"
  ],
  "capacity": {
    "doors": 64,
    "named_users": 5000,
    "controllers": 16,
    "parking_lanes": 2,
    "intercom_stations": 0
  },
  "term": {
    "starts_at": "2026-05-01T00:00:00Z",
    "expires_at": "2027-04-30T23:59:59Z",
    "grace_days": 30
  },
  "policy": {
    "allow_offline_validation": true,
    "allow_existing_access_after_expiry": true,
    "allow_new_provisioning_after_expiry": false,
    "max_overage_percent": 10
  },
  "issued_at": "2026-04-20T10:00:00Z",
  "not_before": "2026-05-01T00:00:00Z",
  "version": 1
}
```

## Data model recommendations

### Persisted license record
Keep a normalized local record in addition to the original signed payload.

Suggested fields:
- license_id
- tenant_id
- deployment_id
- raw_payload
- signature_status
- effective_status
- edition
- modules
- capacities
- starts_at
- expires_at
- grace_ends_at
- last_verified_at
- last_refresh_at
- restriction_level
- warning_state

### Effective status enum
- `active`
- `expiring_soon`
- `grace`
- `expired_limited`
- `invalid_signature`
- `not_yet_valid`
- `superseded`

### Restriction level enum
- `none`
- `warn_only`
- `restrict_growth`
- `restrict_premium`
- `admin_lockdown_noncritical`

Do not define a restriction level that disables core door operation.

## Validation flow

### Online activation flow
1. Customer deployment is prepared with tenant and environment identifiers.
2. Back-office issues signed license.
3. DM3 backend imports or fetches license.
4. Validation library checks signature, issuer, key id, term, and scope binding.
5. License record is stored and marked effective.
6. Console shows current entitlement and expiration timeline.

### Assisted offline activation flow
Use for isolated networks or regulated sites.
1. Deployment exports a license request file containing tenant and approved environment identifiers.
2. Back-office generates signed license offline.
3. Deployment admin imports the signed license file through console or secure CLI.
4. System validates locally and stores effective result.
5. No continuous internet requirement after import.

## Renewal flow
1. Existing license remains active until expiry.
2. Renewal license can be imported before current expiry.
3. System validates renewal and marks it as next effective license.
4. On reaching start time, renewal becomes current automatically.
5. Warning banners clear after successful activation.

## Enforcement model

### Management plane enforcement, allowed
Enforce license state on:
- Creating new tenants, sites, devices, users, and credentials beyond limits
- Enabling premium modules
- Running premium analytics or advanced reports
- Accessing update channels or premium support actions
- API routes tied to premium modules

### Operational plane enforcement, not allowed
Do not gate these on real-time license checks:
- Credential validation already downloaded to controller
- Door release logic already provisioned to controller
- Fire-alarm release and emergency egress behavior
- Existing offline access rules required for site safety

## Capacity handling

### Recommended algorithm
- Compute current usage per tenant regularly
- Compare against licensed capacity
- Trigger warning at 80 percent
- Trigger escalation at 95 percent
- Enter over-capacity grace up to configured threshold and duration
- Restrict new provisioning after grace, not live operations

### Examples of allowed restrictions
- Block adding the 65th door when license is 64 doors and grace is exhausted
- Block issuing new premium visitor invitations after module expiry
- Allow existing commissioned doors to continue operating

## Fail-safe behavior

### Expired license
Recommended behavior:
- Mark status as `grace` then `expired_limited`
- Show persistent admin warnings
- Allow existing doors and credentials already deployed to continue functioning
- Restrict new provisioning and premium modules after grace
- Keep audit collection running whenever technically possible

### Invalid or tampered license
Recommended behavior:
- Reject activation of the tampered license
- Keep last known valid license in effect if still within stored continuity policy
- Raise high-severity admin alert and support event
- Never push a tampered state that disables already commissioned critical doors

### License server unreachable
Recommended behavior:
- Use cached signed license and local clock
- Do not require continuous online revalidation for production operation
- Surface warning only if renewal window is approaching or cache is stale

### Clock skew
Recommended behavior:
- Detect major skew and warn admins
- Use controller and server NTP monitoring as part of deployment checklist
- Avoid immediate severe restriction on first skew detection unless security policy requires it

## Backend integration points

### Suggested ownership
- Auth or platform service owns central license status API
- Access service consumes effective entitlement for provisioning-time checks
- Device gateway may receive compact entitlement summary for display or noncritical local checks
- Console reads a single normalized license endpoint

### Suggested APIs
- `GET /platform/license`
- `POST /platform/license/import`
- `POST /platform/license/request-offline`
- `GET /platform/license/usage`
- `GET /platform/license/events`

## UI behavior recommendations
- Show edition, modules, capacities, expiry date, and current usage
- Show a clear banner at 90, 60, and 30 days before expiry
- Explain exactly what will be restricted, in plain language
- Explicitly reassure admins that existing essential door operations will continue according to configured fail-safe policy
- Provide a guided renewal or import action from the admin console

## Security recommendations
- Use asymmetric signatures only, not shared-secret licenses for production
- Rotate signing keys with `kid`
- Log every import, renewal, validation failure, and status transition to audit trail
- Protect offline activation files with checksum and operator confirmation
- Store raw license artifact and normalized parsed fields

## Proposed implementation phases

### Phase 1, minimum viable licensing
- Signed tenant-level license import
- Validation library in backend
- Console license status page
- Warnings and basic provisioning restrictions
- Fail-safe continuity rules for access operations documented and tested

### Phase 2, stronger commercial controls
- Usage tracking and overage workflow
- Renewal staging and automatic switchover
- Module-specific API enforcement
- Offline activation request and import flow

### Phase 3, enterprise readiness
- Key rotation tooling
- Multi-deployment license bundles
- Dedicated support and audit event export
- Fine-grained integration entitlements

## Test scenarios
- Valid license activation
- Renewal before expiry
- Expired license enters grace correctly
- Grace exhaustion restricts new provisioning only
- Tampered payload rejected
- License server unavailable but cached license continues
- Controller remains operational during backend license faults
- Admin UI messaging matches actual enforcement behavior

## Recommended DM3 defaults
- Signed JWS license with Ed25519
- Tenant deployment scope
- 30-day grace after expiry
- 10 percent soft overage allowance for 30 days
- Warning schedule at 90, 60, and 30 days
- No real-time online dependency for operational continuity
- No license-triggered hard stop for already commissioned essential access points