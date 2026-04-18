-- 000011_barrier_device_registration.up.sql
-- Phase 4: Allow access_devices to track their registration source
-- so parking barriers can be auto-registered and managed idempotently.

-- ============================================================
-- 1. Add source tracking to access_devices
-- ============================================================
ALTER TABLE dm3_access.access_devices
    ADD COLUMN IF NOT EXISTS source VARCHAR(50),
    ADD COLUMN IF NOT EXISTS source_ref VARCHAR(255);

COMMENT ON COLUMN dm3_access.access_devices.source IS
    'Origin of device registration: manual (default), parking, visitor, etc.';
COMMENT ON COLUMN dm3_access.access_devices.source_ref IS
    'Source-specific reference ID, e.g. parking zone ID + device index.';

-- Unique constraint to prevent duplicate auto-registrations
CREATE UNIQUE INDEX IF NOT EXISTS uq_access_device_source_ref
    ON dm3_access.access_devices(tenant_id, source, source_ref)
    WHERE source IS NOT NULL;
