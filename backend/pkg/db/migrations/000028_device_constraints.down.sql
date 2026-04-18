ALTER TABLE dm3_devices.device_events
    DROP CONSTRAINT IF EXISTS chk_event_type;

ALTER TABLE dm3_devices.devices
    DROP CONSTRAINT IF EXISTS chk_door_state;
