-- 000008_refactor_devices.up.sql
-- Refactor dm3_devices.devices: add model, network, verify config; add CHECK constraints

-- Add new columns
ALTER TABLE dm3_devices.devices
    ADD COLUMN IF NOT EXISTS model           VARCHAR(50),
    ADD COLUMN IF NOT EXISTS ip_address      INET,
    ADD COLUMN IF NOT EXISTS mac_address     MACADDR,
    ADD COLUMN IF NOT EXISTS timezone        VARCHAR(50) DEFAULT 'Asia/Ho_Chi_Minh',
    ADD COLUMN IF NOT EXISTS open_relay_ms   INT DEFAULT 3000,
    ADD COLUMN IF NOT EXISTS verify_methods  TEXT[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS verify_logic    VARCHAR(5) DEFAULT 'or';

-- Drop obsolete columns
ALTER TABLE dm3_devices.devices
    DROP COLUMN IF EXISTS status_detail,
    DROP COLUMN IF EXISTS site_id;

-- Add CHECK constraints
-- Device type: terminal, controller, camera, sensor
ALTER TABLE dm3_devices.devices
    DROP CONSTRAINT IF EXISTS chk_device_type;
ALTER TABLE dm3_devices.devices
    ADD CONSTRAINT chk_device_type CHECK (type IN ('terminal', 'controller', 'camera', 'sensor'));

-- Connection status: online, offline, warning
ALTER TABLE dm3_devices.devices
    DROP CONSTRAINT IF EXISTS chk_device_status;
ALTER TABLE dm3_devices.devices
    ADD CONSTRAINT chk_device_status CHECK (status IN ('online', 'offline', 'warning'));

-- Verify logic: or, and
ALTER TABLE dm3_devices.devices
    DROP CONSTRAINT IF EXISTS chk_verify_logic;
ALTER TABLE dm3_devices.devices
    ADD CONSTRAINT chk_verify_logic CHECK (verify_logic IN ('or', 'and'));

-- Device model must match firmware device_type list
ALTER TABLE dm3_devices.devices
    DROP CONSTRAINT IF EXISTS chk_device_model;
ALTER TABLE dm3_devices.devices
    ADD CONSTRAINT chk_device_model CHECK (model IS NULL OR model IN (
        'ra08','ba8300','df970','dq200','dq8500','icu970',
        'icu300n','ipopx','itouch_pop_x','icu400',
        'camera_dc','cctv',
        'door_sensor','de960','de950'
    ));

-- Index on model for firmware queries
CREATE INDEX IF NOT EXISTS idx_devices_model ON dm3_devices.devices(model);
CREATE INDEX IF NOT EXISTS idx_devices_type  ON dm3_devices.devices(type);

-- Normalize any legacy status values to 'offline'
UPDATE dm3_devices.devices SET status = 'offline'
    WHERE status NOT IN ('online', 'offline', 'warning');
