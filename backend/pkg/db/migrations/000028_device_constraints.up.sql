-- Add CHECK constraints for door_state and device_events.event_type to enforce
-- known enum values at the database level. Wrapped in DO blocks so the
-- migration is idempotent — if a prior attempt failed partway, re-running is
-- safe. Allowlists include the full set of values emitted by the current
-- device-gateway codebase, not just a minimal starter set.

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_door_state'
    ) THEN
        ALTER TABLE dm3_devices.devices
            ADD CONSTRAINT chk_door_state
            CHECK (door_state IS NULL OR door_state IN (
                'closed','open','held_open','forced','alarm','locked'
            ));
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_event_type'
    ) THEN
        ALTER TABLE dm3_devices.device_events
            ADD CONSTRAINT chk_event_type
            CHECK (event_type IN (
                'online','offline','restart','firmware_update',
                'config_ack','config_update','data_sync','door_state',
                'alert','error','command_response','sync','door_command'
            ));
    END IF;
END $$;
