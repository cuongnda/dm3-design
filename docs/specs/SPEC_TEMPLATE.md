# Feature: [Feature Name]

> Domain: [SECURE|MANAGE|OPERATE|SMART|PLATFORM] | Color: [hex] | Priority: [P0|P1|P2]
> Status: Draft | Owner: [team]

## Overview
One paragraph — what this feature does, why it exists, who uses it.

## Data Models

### [ModelName]
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### Enums
```
StatusEnum: active | inactive | suspended
```

## API Endpoints

### GET /api/v1/[resource]
- **Auth:** Bearer token, role >= [minimum_role]
- **Query params:**
  | Param | Type | Default | Description |
  |-------|------|---------|-------------|
  | page | int | 1 | Page number |
  | limit | int | 20 | Items per page (max 100) |
  | site_id | uuid | required | Filter by site |
- **Response 200:**
  ```json
  { "data": [...], "total": 0, "page": 1, "limit": 20 }
  ```
- **Errors:** 401, 403, 422

### POST /api/v1/[resource]
- **Auth:** role >= [minimum_role]
- **Body:**
  ```json
  { "name": "string", "site_id": "uuid" }
  ```
- **Side effects:** [audit log, MQTT publish, notification, etc.]
- **Response 201:** Created resource

## MQTT Topics

| Topic | Direction | QoS | Payload Schema | Description |
|-------|-----------|-----|----------------|-------------|
| dm3/{site}/[topic] | server→device | 1 | `{...}` | ... |
| dm3/{site}/[topic] | device→server | 1 | `{...}` | ... |

## Business Rules
1. [Rule with clear IF/THEN logic]
2. [Constraint or validation rule]
3. [Automatic behavior / trigger]

## Permissions Matrix

| Action | viewer | operator | admin | site_admin | super_admin |
|--------|--------|----------|-------|------------|-------------|
| List | ✅ | ✅ | ✅ | ✅ | ✅ |
| View detail | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create | ❌ | ✅ | ✅ | ✅ | ✅ |
| Update | ❌ | ✅ | ✅ | ✅ | ✅ |
| Delete | ❌ | ❌ | ✅ | ✅ | ✅ |

## Offline Behavior
- **Device-side:** [What happens when device loses connectivity]
- **Sync strategy:** [How data syncs when back online]
- **Conflict resolution:** [Last-write-wins / server-wins / merge]
- **Local storage:** [What's cached on device, max size, TTL]

## UI Pages
| Route | Page | Key Components |
|-------|------|----------------|
| /[domain]/[feature] | List view | DataTable, filters, stat cards |
| /[domain]/[feature]/:id | Detail view | Tabs, actions, timeline |

## Events & Audit Log

| Event Type | Trigger | Payload | Retention |
|------------|---------|---------|-----------|
| [feature].created | POST create | full resource | 1 year |
| [feature].updated | PUT update | diff only | 1 year |
| [feature].deleted | DELETE | id + actor | permanent |

## Integration Points
- **Depends on:** [other features/services this feature calls]
- **Consumed by:** [other features/services that call this feature]
- **External:** [third-party integrations if any]

## Notes
- [Implementation hints, edge cases, known limitations]
- [References to Vision doc, architecture decisions]
