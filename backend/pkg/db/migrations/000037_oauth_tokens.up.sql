-- ============================================================
-- Migration 000037: OAuth2 + API token plane
-- ------------------------------------------------------------
-- Introduces:
--   - `oauth_clients`       — third-party integration clients (client_credentials, authz_code, device_code grants)
--   - `oauth_api_tokens`    — long-lived API tokens (dm3_live_* / dm3_test_*), scoped, tenant-bound
--   - `oauth_device_codes`  — RFC 8628 device authorization flow state
--
-- The `/api/v1/auth/validate-api-key` endpoint (called by Traefik forwardAuth
-- for the `/api/v1/public/*` plane) queries `oauth_api_tokens` by token_hash.
-- See docs/specs/platform/auth.md and docs/architecture/api-gateway.md.
-- ============================================================

-- ------------------------------------------------------------
-- 1. oauth_clients — OAuth2 confidential clients
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dm3_auth.oauth_clients (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID REFERENCES dm3_auth.tenants(id) ON DELETE CASCADE,
    -- tenant_id NULL means system-wide client (system_admin owned). Tenant-scoped
    -- clients can only issue tokens for their own tenant.
    client_id           VARCHAR(64) NOT NULL UNIQUE,
    client_secret_hash  VARCHAR(128) NOT NULL,
    name                VARCHAR(100) NOT NULL,
    description         TEXT,
    redirect_uris       TEXT[] NOT NULL DEFAULT '{}',
    grant_types         TEXT[] NOT NULL DEFAULT '{client_credentials}'
                            CHECK (grant_types <@ ARRAY[
                                'client_credentials',
                                'authorization_code',
                                'refresh_token',
                                'urn:ietf:params:oauth:grant-type:device_code'
                            ]::TEXT[]),
    scopes              TEXT[] NOT NULL DEFAULT '{}',
    rate_limit_tier     VARCHAR(20) NOT NULL DEFAULT 'standard'
                            CHECK (rate_limit_tier IN ('basic', 'standard', 'premium', 'unlimited')),
    status              VARCHAR(20) NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active', 'revoked', 'expired')),
    created_by          UUID,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_oauth_clients_tenant
    ON dm3_auth.oauth_clients(tenant_id);
CREATE INDEX IF NOT EXISTS idx_oauth_clients_client_id
    ON dm3_auth.oauth_clients(client_id);
CREATE INDEX IF NOT EXISTS idx_oauth_clients_status
    ON dm3_auth.oauth_clients(status);

COMMENT ON TABLE dm3_auth.oauth_clients IS
    'OAuth2 confidential clients for third-party integrations. tenant_id NULL = system-wide client managed by system_admin.';
COMMENT ON COLUMN dm3_auth.oauth_clients.client_secret_hash IS
    'bcrypt hash of the client secret. Secret is shown only once at creation.';

-- ------------------------------------------------------------
-- 2. oauth_api_tokens — long-lived API tokens
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dm3_auth.oauth_api_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES dm3_auth.tenants(id) ON DELETE CASCADE,
    account_id      UUID NOT NULL REFERENCES dm3_auth.accounts(id) ON DELETE CASCADE,
    client_id       UUID REFERENCES dm3_auth.oauth_clients(id) ON DELETE SET NULL,
    -- client_id NULL means the token was issued directly by a tenant admin via
    -- the Console /settings/api-tokens page rather than through an OAuth client.
    name            VARCHAR(100) NOT NULL,
    token_prefix    VARCHAR(16) NOT NULL,
    -- prefix format: "dm3_live_xxxxxxxx" (first 16 chars of the raw token)
    -- used for identification in logs without exposing the full token
    token_hash      VARCHAR(128) NOT NULL UNIQUE,
    -- sha256 hex of the raw token, used for constant-time lookup
    scopes          TEXT[] NOT NULL DEFAULT '{}',
    ip_whitelist    INET[],
    -- NULL = any IP; non-NULL = token is rejected if caller IP is not in list
    rate_limit_tier VARCHAR(20) NOT NULL DEFAULT 'standard'
                        CHECK (rate_limit_tier IN ('basic', 'standard', 'premium', 'unlimited')),
    environment     VARCHAR(10) NOT NULL DEFAULT 'live'
                        CHECK (environment IN ('live', 'test')),
    status          VARCHAR(20) NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'revoked', 'expired')),
    last_used_at    TIMESTAMPTZ,
    last_used_ip    INET,
    usage_count     BIGINT NOT NULL DEFAULT 0,
    expires_at      TIMESTAMPTZ,
    -- NULL = never expires (tenant admin responsibility to rotate)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at      TIMESTAMPTZ,
    revoked_by      UUID,
    revoke_reason   VARCHAR(200)
);

CREATE INDEX IF NOT EXISTS idx_oauth_api_tokens_tenant
    ON dm3_auth.oauth_api_tokens(tenant_id);
CREATE INDEX IF NOT EXISTS idx_oauth_api_tokens_account
    ON dm3_auth.oauth_api_tokens(account_id);
CREATE INDEX IF NOT EXISTS idx_oauth_api_tokens_hash
    ON dm3_auth.oauth_api_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_oauth_api_tokens_status
    ON dm3_auth.oauth_api_tokens(status);
CREATE INDEX IF NOT EXISTS idx_oauth_api_tokens_expires
    ON dm3_auth.oauth_api_tokens(expires_at)
    WHERE expires_at IS NOT NULL;

COMMENT ON TABLE dm3_auth.oauth_api_tokens IS
    'Long-lived API tokens for third-party integrations. Prefix dm3_live_* or dm3_test_*. Looked up by token_hash during Traefik forwardAuth.';
COMMENT ON COLUMN dm3_auth.oauth_api_tokens.token_hash IS
    'sha256 hex of the full token. Constant-time match required.';
COMMENT ON COLUMN dm3_auth.oauth_api_tokens.scopes IS
    'Permission keys (e.g. identity.user.read). Subset of account permissions at creation time.';

-- ------------------------------------------------------------
-- 3. oauth_device_codes — RFC 8628 device authorization state
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dm3_auth.oauth_device_codes (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id     UUID NOT NULL REFERENCES dm3_auth.oauth_clients(id) ON DELETE CASCADE,
    device_code   VARCHAR(128) NOT NULL UNIQUE,
    user_code     VARCHAR(16) NOT NULL UNIQUE,
    -- user_code is the short human-typable code (e.g. "WDJB-MJHT")
    scopes        TEXT[] NOT NULL DEFAULT '{}',
    verification_uri VARCHAR(200) NOT NULL,
    interval_seconds INT NOT NULL DEFAULT 5,
    expires_at    TIMESTAMPTZ NOT NULL,
    approved_at   TIMESTAMPTZ,
    approved_by   UUID REFERENCES dm3_auth.accounts(id) ON DELETE SET NULL,
    tenant_id     UUID REFERENCES dm3_auth.tenants(id) ON DELETE SET NULL,
    -- tenant_id populated after user approves, used to scope issued token
    last_polled_at TIMESTAMPTZ,
    status        VARCHAR(20) NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'approved', 'denied', 'expired')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oauth_device_codes_device
    ON dm3_auth.oauth_device_codes(device_code);
CREATE INDEX IF NOT EXISTS idx_oauth_device_codes_user
    ON dm3_auth.oauth_device_codes(user_code);
CREATE INDEX IF NOT EXISTS idx_oauth_device_codes_expires
    ON dm3_auth.oauth_device_codes(expires_at);

COMMENT ON TABLE dm3_auth.oauth_device_codes IS
    'RFC 8628 device authorization flow state. Used by headless devices (guard stations, Android terminals) to obtain tokens via a user-approved code.';
