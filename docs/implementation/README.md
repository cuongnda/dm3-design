# DM3 Implementation Docs

Practical delivery documents for customer rollout, deployment operations, and commercial packaging.

## Contents

### Customer deployment package
- [customer-deployment/README.md](./customer-deployment/README.md), installation package overview and recommended folder structure
- [customer-deployment/pre-deployment-checklist.md](./customer-deployment/pre-deployment-checklist.md), checklist template for sales handoff, survey, infrastructure readiness, and acceptance criteria
- [customer-deployment/deployment-runbook-and-handover.md](./customer-deployment/deployment-runbook-and-handover.md), deployment execution, verification, training, and handover template

### Licensing
- [licensing/license-framework.md](./licensing/license-framework.md), DM3 commercial model for editions, modules, capacities, terms, and service rules
- [licensing/license-technical-design.md](./licensing/license-technical-design.md), signed license payload, activation and renewal flow, enforcement points, and fail-safe design

## Intended users
- Sales and presales
- PMs and implementation leads
- Deployment engineers and support
- Product and engineering teams defining reusable standards

## Recommended usage
1. Start with the customer deployment package overview.
2. Copy the checklist and runbook templates into the customer project workspace.
3. Use the license framework during proposal and contract definition.
4. Use the technical design doc when implementing backend, edge, and console license behavior.

## Design intent
These docs assume DM3 is deployed for smart access control and smart building environments where safety and continuity matter. License state must shape features and commercial entitlement, but must not hard-stop essential door operations.