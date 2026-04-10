-- Ensure audit_logs table exists.
-- Migration 006 may have been skipped if the schema_migrations version
-- was already past 6 when the file was added to the repository.

CREATE TABLE IF NOT EXISTS dm3_audit.audit_logs (
    id          UUID DEFAULT gen_random_uuid(),
    time        TIMESTAMPTZ NOT NULL DEFAULT now(),
    tenant_id   UUID,
    actor_id    UUID,
    actor_email VARCHAR(255),
    actor_ip    INET,
    user_agent  TEXT,
    service     VARCHAR(50) NOT NULL,
    action      VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id   VARCHAR(255),
    entity_name VARCHAR(255),
    status      VARCHAR(20) DEFAULT 'success',
    old_values  JSONB,
    new_values  JSONB,
    metadata    JSONB DEFAULT '{}',
    PRIMARY KEY (id, time)
);

SELECT create_hypertable('dm3_audit.audit_logs', 'time',
    chunk_time_interval => INTERVAL '7 days',
    if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS idx_audit_tenant_time
    ON dm3_audit.audit_logs(tenant_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor_time
    ON dm3_audit.audit_logs(actor_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity
    ON dm3_audit.audit_logs(entity_type, entity_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action
    ON dm3_audit.audit_logs(action, time DESC);

SELECT add_retention_policy('dm3_audit.audit_logs',
    INTERVAL '2 years',
    if_not_exists => TRUE
);

ALTER TABLE dm3_audit.audit_logs SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'tenant_id, service',
    timescaledb.compress_orderby = 'time DESC'
);
SELECT add_compression_policy('dm3_audit.audit_logs',
    INTERVAL '30 days',
    if_not_exists => TRUE
);

REVOKE UPDATE, DELETE ON dm3_audit.audit_logs FROM dm3;
