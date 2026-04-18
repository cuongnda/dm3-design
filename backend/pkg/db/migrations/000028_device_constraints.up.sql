-- Add CHECK constraints for door_state and device_events.event_type to enforce
-- known enum values at the database level.

ALTER TABLE dm3_devices.devices
    ADD CONSTRAINT chk_door_state
    CHECK (door_state IN ('closed','open','held_open','forced','alarm') OR door_state IS NULL);

ALTER TABLE dm3_devices.device_events
    ADD CONSTRAINT chk_event_type
    CHECK (event_type IN ('online','offline','restart','firmware_update','config_ack','config_update','data_sync','door_state','alert','error'));
