-- Revert: remove lpr_desktop model from CHECK constraints
ALTER TABLE dm3_devices.devices DROP CONSTRAINT IF EXISTS chk_device_model;
ALTER TABLE dm3_devices.devices ADD CONSTRAINT chk_device_model CHECK (model IS NULL OR model IN (
    'ra08','ba8300','df970','dq200','dq8500','icu970',
    'icu300n','ipopx','itouch_pop_x','icu400',
    'camera_dc','cctv',
    'door_sensor','de960','de950',
    'dqmini_plus'
));

ALTER TABLE dm3_devices.firmwares DROP CONSTRAINT IF EXISTS chk_firmware_device_type;
ALTER TABLE dm3_devices.firmwares ADD CONSTRAINT chk_firmware_device_type CHECK (device_type IN (
    'ra08','ba8300','df970','dq200','dq8500','icu970',
    'icu300n','ipopx','itouch_pop_x','icu400',
    'camera_dc','cctv',
    'door_sensor','de960','de950',
    'dqmini_plus'
));
