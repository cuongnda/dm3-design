DROP TABLE IF EXISTS dm3_devices.used_nonces CASCADE;
DROP TABLE IF EXISTS dm3_devices.pending_registrations CASCADE;
DROP TABLE IF EXISTS dm3_devices.provisioning_tokens CASCADE;
ALTER TABLE dm3_devices.devices
    DROP COLUMN IF EXISTS status_detail,
    DROP COLUMN IF EXISTS hardware_fingerprint,
    DROP COLUMN IF EXISTS provisioned_at,
    DROP COLUMN IF EXISTS provisioned_by;
