-- Audit log table for tracking all mutations, auth events, and system actions.
-- Uses TimescaleDB hypertable for time-series performance.

CREATE TABLE IF NOT EXISTS dm3_audit.audit_logs (
    id          UUID DEFAULT gen_random_uuid(),
    time        TIMESTAMPTZ NOT NULL DEFAULT now(),
    tenant_id   UUID,                           -- NULL for system-level actions
    actor_id    UUID,                           -- account ID of the person acting
    actor_email VARCHAR(255),                   -- denormalized for fast display
    actor_ip    INET,                           -- client IP address
    user_agent  TEXT,                           -- HTTP User-Agent header
    service     VARCHAR(50) NOT NULL,           -- auth-svc, identity-svc, access-svc, device-gateway
    action      VARCHAR(100) NOT NULL,          -- e.g. "company.create", "auth.login"
    entity_type VARCHAR(50) NOT NULL,           -- e.g. "tenant", "account", "access_device"
    entity_id   VARCHAR(255),                   -- UUID or composite key of affected entity
    entity_name VARCHAR(255),                   -- human-readable name (denormalized)
    status      VARCHAR(20) DEFAULT 'success',  -- success | failure | error
    old_values  JSONB,                          -- previous state (for updates)
    new_values  JSONB,                          -- new state (for creates/updates)
    metadata    JSONB DEFAULT '{}',             -- extra context (request_id, etc.)
    PRIMARY KEY (id, time)
);

-- Convert to hypertable (7-day chunks)
SELECT create_hypertable('dm3_audit.audit_logs', 'time',
    chunk_time_interval => INTERVAL '7 days',
    if_not_exists => TRUE
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_audit_tenant_time
    ON dm3_audit.audit_logs(tenant_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor_time
    ON dm3_audit.audit_logs(actor_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity
    ON dm3_audit.audit_logs(entity_type, entity_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action
    ON dm3_audit.audit_logs(action, time DESC);

-- Automatic retention: drop chunks older than 2 years
SELECT add_retention_policy('dm3_audit.audit_logs',
    INTERVAL '2 years',
    if_not_exists => TRUE
);

-- Compression policy: compress chunks older than 30 days
ALTER TABLE dm3_audit.audit_logs SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'tenant_id, service',
    timescaledb.compress_orderby = 'time DESC'
);
SELECT add_compression_policy('dm3_audit.audit_logs',
    INTERVAL '30 days',
    if_not_exists => TRUE
);

-- Security: application user can only INSERT and SELECT audit logs (no tampering)
REVOKE UPDATE, DELETE ON dm3_audit.audit_logs FROM dm3;
