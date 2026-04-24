-- ============================================================
-- dm3_devices.device_log_requests
-- ============================================================
-- Tracks the lifecycle of a remote-log pull from a device:
-- admin requests → server presigns a PUT URL + publishes cmd.logs → device
-- uploads gzipped log to MinIO → device publishes cmd.logs.resp → server
-- flips status to 'uploaded' and stores the byte/line counts for audit.
--
-- One row per request so operators can re-pull (with a fresh request_id)
-- without losing the history of what was fetched before.
-- ============================================================

CREATE TABLE IF NOT EXISTS dm3_devices.device_log_requests (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          UUID NOT NULL REFERENCES dm3_auth.tenants(id),
    device_db_id       UUID REFERENCES dm3_devices.devices(id) ON DELETE SET NULL,
    device_id          TEXT NOT NULL,                      -- devices.device_id (human id)
    request_id         UUID NOT NULL UNIQUE,               -- echoed back by the device in cmd.logs.resp
    status             VARCHAR(20) NOT NULL DEFAULT 'sent', -- sent | uploaded | failed | expired
    object_key         TEXT NOT NULL,                      -- MinIO key the device PUTs to
    upload_url_expires_at TIMESTAMPTZ NOT NULL,            -- presigned PUT URL TTL
    from_ts            TIMESTAMPTZ,                        -- optional filter: earliest log line
    to_ts              TIMESTAMPTZ,                        -- optional filter: latest log line
    lines_max          INTEGER,                            -- optional cap on lines device sends
    level_min          VARCHAR(20),                        -- optional min level: info | warn | error
    lines_uploaded     BIGINT,                             -- reported by device on ack
    bytes              BIGINT,                             -- reported by device on ack
    error_message      TEXT,                               -- set when status='failed'
    requested_by       UUID REFERENCES dm3_identity.users(id),
    requested_by_email VARCHAR(255),
    sent_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at       TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_device_log_requests_tenant ON dm3_devices.device_log_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_device_log_requests_device ON dm3_devices.device_log_requests(device_id);
CREATE INDEX IF NOT EXISTS idx_device_log_requests_status ON dm3_devices.device_log_requests(status);
CREATE INDEX IF NOT EXISTS idx_device_log_requests_sent_at ON dm3_devices.device_log_requests(sent_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_device_log_requests_request_id ON dm3_devices.device_log_requests(request_id);
