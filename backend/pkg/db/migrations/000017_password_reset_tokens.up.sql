-- Password reset tokens for self-service password recovery
CREATE TABLE IF NOT EXISTS dm3_auth.password_reset_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES dm3_auth.accounts(id) ON DELETE CASCADE,
    token_hash  VARCHAR(128) NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_password_reset_tokens_hash ON dm3_auth.password_reset_tokens (token_hash) WHERE used_at IS NULL;
CREATE INDEX idx_password_reset_tokens_user ON dm3_auth.password_reset_tokens (user_id);
