-- Migration 000006: Visitor Temporary Credentials
-- Adds dm3_visitor.temp_credentials table for storing temporary access
-- credentials created for approved visits. Stored in dm3_visitor schema
-- because visitor credentials are not tied to dm3_identity.users.

CREATE TABLE IF NOT EXISTS dm3_visitor.temp_credentials (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID NOT NULL,
    visit_id     UUID NOT NULL,
    visitor_id   UUID NOT NULL,
    type         VARCHAR(50) NOT NULL DEFAULT 'temporary',
    holder_type  VARCHAR(20) NOT NULL DEFAULT 'visitor',
    value        TEXT NOT NULL DEFAULT '',
    status       VARCHAR(20) NOT NULL DEFAULT 'active',
    valid_from   TIMESTAMPTZ,
    valid_until  TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_temp_credentials_visit
    ON dm3_visitor.temp_credentials(visit_id);
CREATE INDEX IF NOT EXISTS idx_temp_credentials_visitor
    ON dm3_visitor.temp_credentials(visitor_id);
CREATE INDEX IF NOT EXISTS idx_temp_credentials_tenant
    ON dm3_visitor.temp_credentials(tenant_id);
CREATE INDEX IF NOT EXISTS idx_temp_credentials_status
    ON dm3_visitor.temp_credentials(status);

CREATE TRIGGER trg_temp_credentials_updated_at
    BEFORE UPDATE ON dm3_visitor.temp_credentials
    FOR EACH ROW EXECUTE FUNCTION dm3_visitor.set_updated_at();
