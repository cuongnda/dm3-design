-- 000011_barrier_device_registration.down.sql
-- Reverse Phase 4: remove source tracking from access_devices.

DROP INDEX IF EXISTS dm3_access.uq_access_device_source_ref;

ALTER TABLE dm3_access.access_devices
    DROP COLUMN IF EXISTS source_ref,
    DROP COLUMN IF EXISTS source;
