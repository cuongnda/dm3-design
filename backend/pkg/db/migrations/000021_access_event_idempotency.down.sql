DROP INDEX IF EXISTS dm3_access.uq_access_events_tenant_event;

ALTER TABLE dm3_access.access_events
    DROP COLUMN IF EXISTS event_id;
