-- Idempotency for NATS-delivered access events.
--
-- Events carry a stable `id` (UUID-ish) minted at the device/edge. JetStream can
-- and will redeliver a message on consumer ack failure, crash, or leader
-- election; without an idempotency key, every redelivery would duplicate the
-- row in the hypertable.
--
-- We store the event's external id on the row and enforce uniqueness per
-- tenant. access_events is partitioned by `time`, and TimescaleDB requires
-- every unique index on a hypertable to include the partitioning column —
-- hence (tenant_id, time, event_id). Since the published message bytes are
-- identical across redeliveries, `time` is stable for a given event_id and
-- this still dedupes the JetStream redelivery case that motivated the change.

ALTER TABLE dm3_access.access_events
    ADD COLUMN IF NOT EXISTS event_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_access_events_tenant_event
    ON dm3_access.access_events (tenant_id, "time", event_id)
    WHERE event_id IS NOT NULL;
