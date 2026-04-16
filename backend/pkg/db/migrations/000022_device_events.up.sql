-- Device lifecycle event log.
--
-- Captures on/off transitions, commands, syncs, emergency responses, errors
-- and other lifecycle events that are not access-control events (those live
-- in dm3_access.access_events). Written directly by device-gateway — both
-- from MQTT callbacks (online/offline) and HTTP handlers (commands, syncs).

CREATE TABLE IF NOT EXISTS dm3_devices.device_events (
    id          UUID        DEFAULT gen_random_uuid(),
    tenant_id   UUID        NOT NULL,
    time        TIMESTAMPTZ NOT NULL DEFAULT now(),
    device_id   TEXT        NOT NULL,  -- devices.device_id (human-readable)
    event_type  TEXT        NOT NULL,  -- online, offline, restart, command, door_command, sync, emergency, config_ack, error
    description TEXT        NOT NULL DEFAULT '',
    actor_id    UUID,                  -- NULL for device/system-initiated events
    actor_email TEXT,
    metadata    JSONB       DEFAULT '{}',
    PRIMARY KEY (tenant_id, time, id)
);

SELECT create_hypertable(
    'dm3_devices.device_events', 'time',
    if_not_exists => TRUE,
    migrate_data  => TRUE
);

CREATE INDEX IF NOT EXISTS idx_device_events_device
    ON dm3_devices.device_events (tenant_id, device_id, time DESC);

-- Retention: 1 year (these are operational, not audit)
SELECT add_retention_policy('dm3_devices.device_events', INTERVAL '1 year', if_not_exists => TRUE);
