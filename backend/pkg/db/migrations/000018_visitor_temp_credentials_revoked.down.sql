DROP INDEX IF EXISTS dm3_visitor.idx_temp_credentials_revoked_at;

ALTER TABLE dm3_visitor.temp_credentials
    DROP COLUMN IF EXISTS revoked_reason,
    DROP COLUMN IF EXISTS revoked_at;
