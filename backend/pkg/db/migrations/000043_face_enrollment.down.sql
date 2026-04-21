-- Reverse 000043_face_enrollment.up.sql.

DELETE FROM dm3_identity.credentials
WHERE type = 'face'
  AND status = 'invalid'
  AND value LIKE 'M\_%' ESCAPE '\';

DROP INDEX IF EXISTS dm3_identity.idx_credentials_face_m_card;

ALTER TABLE dm3_devices.firmwares DROP CONSTRAINT IF EXISTS chk_firmware_device_type;
ALTER TABLE dm3_devices.firmwares ADD CONSTRAINT chk_firmware_device_type CHECK (
    device_type IN (
        'ra08', 'ba8300', 'df970', 'dq200', 'dq8500', 'icu970', 'lpr_desktop',
        'icu300n', 'ipopx', 'itouch_pop_x', 'icu400', 'dqmini_plus',
        'camera_dc', 'cctv',
        'door_sensor', 'de960', 'de950'
    )
);

ALTER TABLE dm3_devices.devices DROP CONSTRAINT IF EXISTS chk_device_model;
ALTER TABLE dm3_devices.devices ADD CONSTRAINT chk_device_model CHECK (
    model IS NULL OR model IN (
        'ra08', 'ba8300', 'df970', 'dq200', 'dq8500', 'icu970', 'lpr_desktop',
        'icu300n', 'ipopx', 'itouch_pop_x', 'icu400', 'dqmini_plus',
        'camera_dc', 'cctv', 'tungson', 'tbvision',
        'door_sensor', 'de960', 'de950'
    )
);
