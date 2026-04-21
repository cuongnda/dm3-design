-- Migration 000038: Kiosk tokens + visitor default access areas
-- Adds dm3_auth.kiosk_tokens for long-lived bearer tokens used by kiosk
-- devices (e.g. the LPR .NET app) that register walk-in visitors via the
-- legacy-register adapter. Tokens are stored as SHA-256 hashes; the
-- cleartext is returned to the admin once on create and never again.
--
-- Also adds default_access_areas to dm3_visitor.visitor_settings so the
-- kiosk flow can place walk-in visits in a pre-configured set of zones
-- when the device doesn't carry a real access-group UUID.

CREATE TABLE IF NOT EXISTS dm3_auth.kiosk_tokens (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID NOT NULL REFERENCES dm3_auth.tenants(id) ON DELETE CASCADE,
    name         VARCHAR(200) NOT NULL,
    token_hash   CHAR(64) NOT NULL UNIQUE,   -- sha256 hex of the cleartext token
    created_by   UUID,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at TIMESTAMPTZ,
    revoked_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_kiosk_tokens_tenant
    ON dm3_auth.kiosk_tokens(tenant_id)
    WHERE revoked_at IS NULL;

ALTER TABLE dm3_visitor.visitor_settings
    ADD COLUMN IF NOT EXISTS default_access_areas UUID[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS default_host_user_id UUID;
