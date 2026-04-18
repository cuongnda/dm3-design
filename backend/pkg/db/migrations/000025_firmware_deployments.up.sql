-- Firmware OTA deployment tracking.
--
-- Each row represents a firmware push to a single device. The server publishes
-- a cfg.firmware MQTT message with a time-limited download token; the device
-- reports progress back via cfg.firmware.ack messages that update the status.

CREATE TABLE IF NOT EXISTS dm3_devices.firmware_deployments (
    id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id       UUID        NOT NULL,
    firmware_id     UUID        NOT NULL REFERENCES dm3_devices.firmwares(id),
    device_id       TEXT        NOT NULL,   -- devices.device_id (human-readable)
    device_db_id    UUID,                   -- devices.id (UUID FK for joins)
    version         TEXT        NOT NULL,   -- snapshot of firmware version at deploy time
    device_type     TEXT        NOT NULL,   -- snapshot of firmware device_type
    status          TEXT        NOT NULL DEFAULT 'pending',
                    -- pending | sent | downloading | installing | success | failed | expired
    download_token  TEXT        NOT NULL,   -- random token for authenticated download
    download_url    TEXT        NOT NULL DEFAULT '',
    expires_at      TIMESTAMPTZ NOT NULL,   -- token expiry (5 min from creation)
    error_message   TEXT        NOT NULL DEFAULT '',
    progress_pct    INT         NOT NULL DEFAULT 0,  -- 0-100
    deployed_by     UUID,                   -- user who triggered
    deployed_by_email TEXT,
    sent_at         TIMESTAMPTZ,            -- when MQTT message was published
    download_started_at TIMESTAMPTZ,
    install_started_at  TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fw_deploy_tenant
    ON dm3_devices.firmware_deployments (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fw_deploy_firmware
    ON dm3_devices.firmware_deployments (firmware_id);

CREATE INDEX IF NOT EXISTS idx_fw_deploy_device
    ON dm3_devices.firmware_deployments (device_id);

CREATE INDEX IF NOT EXISTS idx_fw_deploy_token
    ON dm3_devices.firmware_deployments (download_token)
    WHERE status IN ('pending', 'sent', 'downloading');

-- Retention: keep deployment history for 1 year
