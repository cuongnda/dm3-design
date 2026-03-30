-- 011_audit_service.sql — Audit Service Tables

-- Schema for audit service
CREATE SCHEMA IF NOT EXISTS dm3_audit;

-- ============================================================
-- Audit events table — immutable audit trail
-- ============================================================
CREATE TABLE IF NOT EXISTS dm3_audit.audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    event_type VARCHAR(50) NOT NULL, -- access, auth, user, door, rule, device, visitor, system, etc.
    actor_id UUID, -- who performed the action (nullable for system events)
    actor_type VARCHAR(20) NOT NULL DEFAULT 'user', -- user, system, device, api
    actor_name VARCHAR(255), -- display name of actor
    action VARCHAR(50) NOT NULL, -- created, updated, deleted, accessed, granted, denied, etc.
    resource VARCHAR(50) NOT NULL, -- user, door, rule, device, visitor, etc.
    resource_id VARCHAR(255), -- ID of the resource being acted upon
    resource_name VARCHAR(255), -- display name of resource
    old_value JSONB, -- before change (for updates/deletes)
    new_value JSONB, -- after change (for creates/updates)
    ip_address INET, -- source IP address
    user_agent TEXT, -- browser/client user agent
    session_id VARCHAR(255), -- session identifier
    result VARCHAR(20) NOT NULL DEFAULT 'success', -- success, failure, error
    error_msg TEXT, -- error description if result = failure/error
    metadata JSONB DEFAULT '{}', -- additional context data
    timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
    chain_hash VARCHAR(64), -- SHA-256 hash for integrity verification
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Convert to hypertable for time-series performance
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM timescaledb_information.hypertables
        WHERE hypertable_name = 'audit_events'
    ) THEN
        PERFORM create_hypertable('dm3_audit.audit_events', 'timestamp',
            partitioning_column => 'tenant_id', number_partitions => 4);
    END IF;
END $$;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_audit_events_tenant ON dm3_audit.audit_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_event_type ON dm3_audit.audit_events(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_events_actor ON dm3_audit.audit_events(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_actor_type ON dm3_audit.audit_events(actor_type);
CREATE INDEX IF NOT EXISTS idx_audit_events_action ON dm3_audit.audit_events(action);
CREATE INDEX IF NOT EXISTS idx_audit_events_resource ON dm3_audit.audit_events(resource);
CREATE INDEX IF NOT EXISTS idx_audit_events_resource_id ON dm3_audit.audit_events(resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_result ON dm3_audit.audit_events(result);
CREATE INDEX IF NOT EXISTS idx_audit_events_timestamp ON dm3_audit.audit_events(timestamp DESC);

-- Enable trigram extension for full-text search (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Full-text search index
CREATE INDEX IF NOT EXISTS idx_audit_events_search ON dm3_audit.audit_events 
    USING gin((
        COALESCE(actor_name, '') || ' ' || 
        COALESCE(resource_name, '') || ' ' || 
        action || ' ' || 
        resource || ' ' || 
        COALESCE(error_msg, '') || ' ' ||
        COALESCE(metadata::text, '')
    ) gin_trgm_ops);

-- Compression policy (compress after 7 days)
SELECT add_compression_policy('dm3_audit.audit_events', INTERVAL '7 days');

-- Retention policy (keep raw data for 7 years for compliance)
SELECT add_retention_policy('dm3_audit.audit_events', INTERVAL '7 years');

-- ============================================================
-- Integrity checkpoints — periodic verification points
-- ============================================================
CREATE TABLE IF NOT EXISTS dm3_audit.integrity_checkpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    last_event_id UUID NOT NULL, -- last event included in this checkpoint
    event_count BIGINT NOT NULL, -- total events verified
    chain_hash VARCHAR(64) NOT NULL, -- cumulative hash at this checkpoint
    verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    verified_by VARCHAR(50) NOT NULL DEFAULT 'system', -- system, admin
    status VARCHAR(20) NOT NULL DEFAULT 'verified', -- verified, compromised
    error_details TEXT, -- details if status = compromised
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_integrity_checkpoints_tenant ON dm3_audit.integrity_checkpoints(tenant_id);
CREATE INDEX IF NOT EXISTS idx_integrity_checkpoints_verified_at ON dm3_audit.integrity_checkpoints(verified_at DESC);

-- ============================================================
-- Row Level Security for multi-tenancy
-- ============================================================
ALTER TABLE dm3_audit.audit_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON dm3_audit.audit_events;
CREATE POLICY tenant_isolation ON dm3_audit.audit_events
    USING (
        tenant_id = COALESCE(
            NULLIF(current_setting('app.current_tenant', true), '')::uuid,
            tenant_id
        )
    );

ALTER TABLE dm3_audit.integrity_checkpoints ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON dm3_audit.integrity_checkpoints;
CREATE POLICY tenant_isolation ON dm3_audit.integrity_checkpoints
    USING (
        tenant_id = COALESCE(
            NULLIF(current_setting('app.current_tenant', true), '')::uuid,
            tenant_id
        )
    );

-- ============================================================
-- Continuous aggregates for reporting performance
-- ============================================================

-- Daily audit summary by event type
CREATE MATERIALIZED VIEW IF NOT EXISTS dm3_audit.daily_audit_summary
WITH (timescaledb.continuous) AS
SELECT 
    tenant_id,
    time_bucket('1 day', timestamp) AS day,
    event_type,
    actor_type,
    action,
    resource,
    result,
    COUNT(*) as event_count,
    COUNT(DISTINCT actor_id) as unique_actors,
    COUNT(*) FILTER (WHERE result = 'failure') as failure_count
FROM dm3_audit.audit_events
GROUP BY tenant_id, day, event_type, actor_type, action, resource, result;

-- Add refresh policy for daily summary
SELECT add_continuous_aggregate_policy('dm3_audit.daily_audit_summary',
    start_offset => INTERVAL '3 days',
    end_offset => INTERVAL '1 day',
    schedule_interval => INTERVAL '1 hour'
);

-- Hourly access activity (for detailed access reports)
CREATE MATERIALIZED VIEW IF NOT EXISTS dm3_audit.hourly_access_summary
WITH (timescaledb.continuous) AS
SELECT 
    tenant_id,
    time_bucket('1 hour', timestamp) AS hour,
    actor_id,
    actor_name,
    resource_id as door_id,
    resource_name as door_name,
    action as decision,
    COUNT(*) as access_count
FROM dm3_audit.audit_events
WHERE event_type = 'access' AND resource = 'door'
GROUP BY tenant_id, hour, actor_id, actor_name, resource_id, resource_name, action;

-- Add refresh policy for hourly access summary
SELECT add_continuous_aggregate_policy('dm3_audit.hourly_access_summary',
    start_offset => INTERVAL '2 hours',
    end_offset => INTERVAL '30 minutes',
    schedule_interval => INTERVAL '30 minutes'
);

-- ============================================================
-- Views for common queries
-- ============================================================

-- High-risk audit events view
CREATE OR REPLACE VIEW dm3_audit.high_risk_events AS
SELECT 
    id, tenant_id, timestamp, event_type, actor_id, actor_name, actor_type,
    action, resource, resource_id, resource_name, result, error_msg, metadata
FROM dm3_audit.audit_events
WHERE 
    (resource = 'user' AND action IN ('created', 'deleted', 'suspended', 'activated')) OR
    (resource = 'door' AND action IN ('created', 'deleted', 'unlocked', 'locked')) OR
    (resource = 'rule' AND action IN ('created', 'updated', 'deleted')) OR
    (resource = 'device' AND action IN ('provisioned', 'deprovisioned', 'disabled')) OR
    (resource = 'company' AND action IN ('created', 'updated', 'deleted')) OR
    (resource = 'settings' AND action = 'updated') OR
    (event_type = 'emergency') OR
    (result = 'failure' AND event_type IN ('auth', 'access'))
ORDER BY timestamp DESC;

-- Recent activity view (last 24 hours)
CREATE OR REPLACE VIEW dm3_audit.recent_activity AS
SELECT 
    id, tenant_id, timestamp, event_type, actor_id, actor_name, actor_type,
    action, resource, resource_id, resource_name, result, error_msg
FROM dm3_audit.audit_events
WHERE timestamp >= now() - interval '24 hours'
ORDER BY timestamp DESC
LIMIT 1000;

-- Failed events view
CREATE OR REPLACE VIEW dm3_audit.failed_events AS
SELECT 
    id, tenant_id, timestamp, event_type, actor_id, actor_name, actor_type,
    action, resource, resource_id, resource_name, result, error_msg, metadata
FROM dm3_audit.audit_events
WHERE result IN ('failure', 'error')
ORDER BY timestamp DESC;

-- ============================================================
-- Functions for integrity verification
-- ============================================================

-- Function to calculate hash chain for a given tenant
CREATE OR REPLACE FUNCTION dm3_audit.calculate_hash_chain(tenant_uuid UUID)
RETURNS TABLE(event_id UUID, calculated_hash TEXT) AS $$
DECLARE
    event_record RECORD;
    last_hash TEXT := '';
    event_data TEXT;
    hash_input TEXT;
BEGIN
    FOR event_record IN
        SELECT id, tenant_id, event_type, actor_type, action, resource, 
               result, timestamp, chain_hash
        FROM dm3_audit.audit_events
        WHERE tenant_id = tenant_uuid
        ORDER BY timestamp ASC, id ASC
    LOOP
        -- Create hash input
        hash_input := event_record.tenant_id::text || '|' ||
                     event_record.event_type || '|' ||
                     event_record.actor_type || '|' ||
                     event_record.action || '|' ||
                     event_record.resource || '|' ||
                     event_record.result || '|' ||
                     event_record.timestamp::text || '|' ||
                     last_hash || '|' ||
                     extract(epoch from event_record.timestamp)::text;
        
        -- Calculate SHA-256 hash
        event_id := event_record.id;
        calculated_hash := encode(digest(hash_input, 'sha256'), 'hex');
        
        -- Update last_hash for next iteration
        last_hash := calculated_hash;
        
        RETURN NEXT;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Trigger to prevent audit event modification
-- ============================================================
CREATE OR REPLACE FUNCTION dm3_audit.prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
    -- Audit events are immutable - no updates or deletes allowed
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'Audit events cannot be modified';
    END IF;
    
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Audit events cannot be deleted';
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Apply immutability trigger
DROP TRIGGER IF EXISTS prevent_audit_modification ON dm3_audit.audit_events;
CREATE TRIGGER prevent_audit_modification
    BEFORE UPDATE OR DELETE ON dm3_audit.audit_events
    FOR EACH ROW EXECUTE FUNCTION dm3_audit.prevent_audit_modification();

-- ============================================================
-- Performance optimization
-- ============================================================

-- Create partial indexes for common queries
CREATE INDEX IF NOT EXISTS idx_audit_events_recent 
    ON dm3_audit.audit_events(tenant_id, timestamp DESC) 
    WHERE timestamp >= now() - interval '30 days';

CREATE INDEX IF NOT EXISTS idx_audit_events_failures 
    ON dm3_audit.audit_events(tenant_id, timestamp DESC) 
    WHERE result IN ('failure', 'error');

CREATE INDEX IF NOT EXISTS idx_audit_events_access 
    ON dm3_audit.audit_events(tenant_id, timestamp DESC, actor_id) 
    WHERE event_type = 'access';

-- ============================================================
-- Sample audit events for demo
-- ============================================================
INSERT INTO dm3_audit.audit_events (tenant_id, event_type, actor_type, action, resource, result, timestamp, metadata) VALUES
('00000000-0000-0000-0000-000000000001', 'system', 'system', 'started', 'audit_service', 'success', now(), '{"service_version": "1.0.0"}'),
('00000000-0000-0000-0000-000000000001', 'system', 'system', 'integrity_check', 'audit_log', 'success', now(), '{"events_verified": 1, "status": "clean"}')
ON CONFLICT DO NOTHING;

-- ============================================================
-- Performance monitoring
-- ============================================================

-- View to monitor audit service performance
CREATE OR REPLACE VIEW dm3_audit.audit_performance AS
SELECT 
    COUNT(*) as total_events,
    COUNT(*) FILTER (WHERE timestamp >= now() - interval '1 hour') as events_last_hour,
    COUNT(*) FILTER (WHERE timestamp >= now() - interval '1 day') as events_last_day,
    COUNT(DISTINCT tenant_id) as active_tenants,
    COUNT(*) FILTER (WHERE result = 'failure') as failed_events,
    AVG(EXTRACT(EPOCH FROM (created_at - timestamp))) as avg_processing_delay_seconds,
    MAX(timestamp) as latest_event_time
FROM dm3_audit.audit_events
WHERE timestamp >= now() - interval '7 days';

-- ============================================================
-- Grant permissions to audit service
-- ============================================================

-- Audit service should only have INSERT permissions on audit_events
-- and full access to integrity_checkpoints
-- (This would be configured in production with dedicated DB user)

COMMENT ON SCHEMA dm3_audit IS 'Audit service schema - immutable audit trail with integrity verification';
COMMENT ON TABLE dm3_audit.audit_events IS 'Immutable audit events with SHA-256 integrity chain';
COMMENT ON TABLE dm3_audit.integrity_checkpoints IS 'Periodic integrity verification checkpoints';
COMMENT ON FUNCTION dm3_audit.calculate_hash_chain IS 'Calculate integrity hash chain for verification';
COMMENT ON TRIGGER prevent_audit_modification ON dm3_audit.audit_events IS 'Prevents modification of audit events for data integrity';