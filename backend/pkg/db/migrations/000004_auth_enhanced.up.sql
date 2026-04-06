-- 004_auth_enhanced.sql — Refresh tokens, roles, seed data

-- Refresh tokens table
CREATE TABLE IF NOT EXISTS dm3_auth.refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES dm3_auth.users(id) ON DELETE CASCADE,
    tenant_id UUID,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON dm3_auth.refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON dm3_auth.refresh_tokens(token_hash);

-- Add updated_at to users if missing
ALTER TABLE dm3_auth.users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Seed default admin user (password: admin123, bcrypt hash)
INSERT INTO dm3_auth.users (email, password_hash, name, roles, status)
VALUES (
    'admin@duali.com',
    '$2b$12$npOZArrFi4NNiuhqOCthxusfTqXHaKXbbXhWDv1Df2mF6svcqg1.S',
    'Admin',
    '{"admin"}',
    'active'
) ON CONFLICT (email) DO NOTHING;
