-- 000006: Revert audit log table

-- Restore UPDATE/DELETE permissions before dropping
GRANT UPDATE, DELETE ON dm3_audit.audit_logs TO dm3;

-- Remove policies (must be removed before dropping hypertable)
SELECT remove_compression_policy('dm3_audit.audit_logs', if_exists => TRUE);
SELECT remove_retention_policy('dm3_audit.audit_logs', if_exists => TRUE);

-- Drop the table (cascades hypertable chunks and indexes)
DROP TABLE IF EXISTS dm3_audit.audit_logs CASCADE;
