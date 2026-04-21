-- Revert to original model whitelist (without tungson, tbvision)
ALTER TABLE dm3_devices.devices DROP CONSTRAINT IF EXISTS chk_device_model;
ALTER TABLE dm3_devices.devices ADD CONSTRAINT chk_device_model CHECK (
    model IS NULL OR model IN (
        'ra08', 'ba8300', 'df970', 'dq200', 'dq8500', 'icu970', 'lpr_desktop',
        'icu300n', 'ipopx', 'itouch_pop_x', 'icu400', 'dqmini_plus',
        'camera_dc', 'cctv',
        'door_sensor', 'de960', 'de950'
    )
);
