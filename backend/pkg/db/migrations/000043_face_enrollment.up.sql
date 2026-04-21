-- Face enrollment roundtrip for terminals that enrol faces on-device.
--
-- 1. Add bd8500 to device / firmware model whitelists (the full qualifying set
--    is df970, ba8300, bd8500, ra08, dq200 plus the pre-existing dq8500 etc.).
-- 2. Guarantee one M_<user_code> face credential per user via partial unique
--    index. Prevents duplicate auto-created rows under concurrent create/edit.
-- 3. Backfill: create an invalid M_<user_code> face credential for every
--    existing user whose tenant owns at least one qualifying device. The
--    device-gateway PushPersonSync query filters status='active', so these
--    stay hidden until a face_result MQTT ack flips them.

-- ---- 1. Whitelist bd8500 ----------------------------------------------------

ALTER TABLE dm3_devices.devices DROP CONSTRAINT IF EXISTS chk_device_model;
ALTER TABLE dm3_devices.devices ADD CONSTRAINT chk_device_model CHECK (
    model IS NULL OR model IN (
        'ra08', 'ba8300', 'df970', 'dq200', 'dq8500', 'bd8500', 'icu970', 'lpr_desktop',
        'icu300n', 'ipopx', 'itouch_pop_x', 'icu400', 'dqmini_plus',
        'camera_dc', 'cctv', 'tungson', 'tbvision',
        'door_sensor', 'de960', 'de950'
    )
);

ALTER TABLE dm3_devices.firmwares DROP CONSTRAINT IF EXISTS chk_firmware_device_type;
ALTER TABLE dm3_devices.firmwares ADD CONSTRAINT chk_firmware_device_type CHECK (
    device_type IN (
        'ra08', 'ba8300', 'df970', 'dq200', 'dq8500', 'bd8500', 'icu970', 'lpr_desktop',
        'icu300n', 'ipopx', 'itouch_pop_x', 'icu400', 'dqmini_plus',
        'camera_dc', 'cctv',
        'door_sensor', 'de960', 'de950'
    )
);

-- ---- 2. Unique index on M_<user_code> face credentials ----------------------

CREATE UNIQUE INDEX IF NOT EXISTS idx_credentials_face_m_card
    ON dm3_identity.credentials (tenant_id, user_id)
    WHERE type = 'face' AND value LIKE 'M\_%' ESCAPE '\';

-- ---- 3. Backfill for existing users in qualifying tenants -------------------

INSERT INTO dm3_identity.credentials (
    tenant_id, user_id, type, value, status, valid_from, valid_until
)
SELECT
    u.tenant_id,
    u.id,
    'face',
    'M_' || COALESCE(NULLIF(u.user_code, ''), u.id::text),
    'invalid',
    now(),
    TIMESTAMPTZ '3000-01-01'
FROM dm3_identity.users u
WHERE (u.is_deleted = false OR u.is_deleted IS NULL)
  AND EXISTS (
      SELECT 1 FROM dm3_devices.devices d
      WHERE d.tenant_id = u.tenant_id
        AND d.model IN ('df970', 'ba8300', 'bd8500', 'ra08', 'dq200')
  )
ON CONFLICT (tenant_id, user_id)
   WHERE type = 'face' AND value LIKE 'M\_%' ESCAPE '\'
DO NOTHING;
