-- Track the physical door state reported by each device via MQTT.
-- Values: closed, open, held_open, forced, alarm (NULL = unknown/not a door device).

ALTER TABLE dm3_devices.devices
    ADD COLUMN IF NOT EXISTS door_state TEXT;
