-- 000008_refactor_devices.down.sql
-- Revert device refactor

ALTER TABLE dm3_devices.devices
    DROP CONSTRAINT IF EXISTS chk_device_type,
    DROP CONSTRAINT IF EXISTS chk_device_status,
    DROP CONSTRAINT IF EXISTS chk_verify_logic,
    DROP CONSTRAINT IF EXISTS chk_device_model;

DROP INDEX IF EXISTS dm3_devices.idx_devices_model;
DROP INDEX IF EXISTS dm3_devices.idx_devices_type;

ALTER TABLE dm3_devices.devices
    DROP COLUMN IF EXISTS model,
    DROP COLUMN IF EXISTS ip_address,
    DROP COLUMN IF EXISTS mac_address,
    DROP COLUMN IF EXISTS timezone,
    DROP COLUMN IF EXISTS open_relay_ms,
    DROP COLUMN IF EXISTS verify_methods,
    DROP COLUMN IF EXISTS verify_logic;

ALTER TABLE dm3_devices.devices
    ADD COLUMN IF NOT EXISTS status_detail VARCHAR(50),
    ADD COLUMN IF NOT EXISTS site_id VARCHAR(100);
