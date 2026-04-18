# 2026-04-12 — Parking ↔ Access Integration

## Context

Before this change, `parking-svc` and `access-svc` were completely decoupled:
- no shared NATS subjects
- no cross-schema foreign keys
- no Go imports between the two packages
- duplicate vehicle models in `internal/models/parking.go` and `internal/parking/models.go`
- parking barriers were not registered as access points or devices
- parking sessions produced no access events
- parking zones had no link to access zones

The goal of this change is to make parking operate as part of the unified
access control system while preserving plugin-gated separation. Plugins
must stay independently deployable, so all cross-module links use **soft
foreign keys** (UUID columns with no hard `REFERENCES` constraint) and
**NATS events** rather than in-process Go imports.

## Decision

Five phases, delivered as migrations `000010` through `000012`:

### Phase 1 — Unified vehicle registry (migration 000010)

- `dm3_identity.vehicles` DROPPED.
- `dm3_parking.parking_vehicles` gains `visitor_id`, `rfid_tag`, `nfc_card_id`.
- Vehicle is the owner of triple credentials: plate + RFID + NFC.
- `visitor_id` is a soft FK into `dm3_visitor.visitors`.
- CHECK constraint: a vehicle belongs to a user OR a visitor, not both (neither is OK for anonymous vehicles).
- Unique indexes on `(tenant_id, rfid_tag)` and `(tenant_id, nfc_card_id)` where non-null.

### Phase 2 — Triple credential resolution

Parking entry/exit handlers resolve vehicles in priority order:

1. NFC card ID (highest confidence)
2. RFID tag
3. License plate (with OCR confidence recorded)

`matched_by` on `parking_sessions` is populated with `plate`, `rfid`, `nfc`,
`rfid+plate`, or `nfc+plate`.

### Phase 3 — NATS event bridge

`parking-svc` publishes on parking entry/exit:

```
Subject: dm3.parking.{tenant_id}.access.{direction}   # direction = entry | exit
```

`access-svc` runs a new consumer `ParkingAccessConsumer`
(`backend/internal/access/parking_access_consumer.go`) on the `PARKING`
JetStream, subscribes to `dm3.parking.*.access.*`, and inserts rows into
`dm3_access.access_events` with:

- `user_name = "vehicle:{plate}"` when no user_id is available
- `credential_type` derived from `matched_by`
- `decision` mapped from parking decision code
- `metadata.source = "parking"` and `metadata.session_id`, `metadata.zone_id`

This makes every parking entry/exit visible to the unified access event
timeline, analytics, and audit pipelines.

### Phase 4 — Barrier auto-registration (migration 000011)

`dm3_access.access_devices` gains `source VARCHAR(50)` and
`source_ref VARCHAR(255)`, with a unique partial index:

```sql
CREATE UNIQUE INDEX uq_access_device_source_ref
    ON dm3_access.access_devices(tenant_id, source, source_ref)
    WHERE source IS NOT NULL;
```

On parking zone create / update / delete, `parking-svc` publishes:

```
Subject: dm3.parking.{tenant_id}.zone.barrier_sync
```

`access-svc` runs a new consumer `ParkingBarrierConsumer` that:

- Upserts `access_devices` rows with `source=parking`, `source_ref=zone_id`, `type=barrier` (idempotent via the unique index above).
- Creates matching `access_points` for the zone.
- Links them via `access_point_devices` with roles `reader_in` and `reader_out`.
- On delete, marks them inactive rather than hard-deleting (preserves audit history).

Barrier devices now appear in the unified devices view alongside terminals,
controllers, cameras, and sensors — without any hard FK across the
schema boundary.

### Phase 5 — Opt-in access policy check (migration 000012)

`dm3_parking.parking_settings` gains:

```sql
enforce_access_rules BOOLEAN NOT NULL DEFAULT false
```

When this flag is true, `CreateParkingSession` runs a cross-module check
between the existing blacklist and capacity checks:

```sql
SELECT EXISTS(
  SELECT 1 FROM dm3_access.access_group_users agu
  JOIN dm3_access.access_group_access_points agap
       ON agap.access_group_id = agu.access_group_id
  JOIN dm3_access.access_points ap
       ON ap.id = agap.access_point_id
  WHERE agu.user_id = $1::uuid
    AND agu.tenant_id = $2::uuid
    AND ap.zone_id = $3::uuid
)
```

The check **gracefully degrades**:

- If the zone has no `access_zone_id` → allow (parking-only zone).
- If the vehicle has no `owner_user_id` → allow (anonymous / visitor).
- If `enforce_access_rules=false` → skip entirely (default behavior).

Only when rules are enabled AND the vehicle has an owner AND the query
returns false does entry get denied with reason `access_denied`.

## Consequences

### Positive

- Parking events flow into the same `access_events` hypertable that powers
  unified analytics, so reporting can mix gate entries and door entries
  without dual pipelines.
- Barrier gates are first-class access devices, reusable by any future
  access-svc feature (e.g., bulk device management, health dashboards).
- Vehicle registry has a single source of truth — the triple credential
  resolution (NFC > RFID > plate) is implementable because all three
  attributes live on one row.
- The cross-module access rule is **opt-in** at the tenant level, so
  existing deployments continue to work unchanged.
- Plugin-gated separation is preserved: no hard FKs, no Go imports from
  `internal/access` into `internal/parking` or vice versa. All integration
  flows through NATS subjects and soft FKs.

### Negative

- Reading parking + access context now requires querying two schemas, or
  subscribing to two consumers. This is the cost of plugin separation.
- Soft FKs do not enforce referential integrity at the DB layer, so
  orphaned `access_zone_id` or `visitor_id` pointers are possible. This
  is mitigated by consumer-side validation and by the fact that plugins
  are deployed together in the monolith today.
- The ER diagram's cross-schema edges are dashed (logical) rather than
  solid (FK-enforced), which is slightly less obvious to new readers.
  Documented in the legend.

## Affected files

- `backend/pkg/db/migrations/000010_parking_access_integration.up.sql` (new)
- `backend/pkg/db/migrations/000011_barrier_device_registration.up.sql` (new)
- `backend/pkg/db/migrations/000012_parking_enforce_access_rules.up.sql` (new)
- `backend/internal/access/parking_access_consumer.go` (new)
- `backend/internal/access/parking_barrier_consumer.go` (new)
- `backend/internal/access/handlers.go` (access_devices query updates)
- `backend/internal/models/access.go` (+Source, +SourceRef)
- `backend/internal/parking/events.go` (parking access event + barrier sync publishers)
- `backend/internal/parking/handlers.go` (triple credential resolution + access policy check)
- `backend/internal/parking/crud_handlers.go` (barrier sync on zone CRUD)
- `backend/internal/parking/settings_handlers.go` (+enforce_access_rules)
- `backend/cmd/access-svc/main.go` (wire up new consumers, PARKING stream ensure)
- `packages/api-client/src/parking.ts` (+enforce_access_rules in settings DTO)
- `diagrams/er-diagram.drawio` (reflected schema changes + integration annotation)
- `docs/IMPLEMENTATION_STATUS.md` (parking-svc section rewritten)
