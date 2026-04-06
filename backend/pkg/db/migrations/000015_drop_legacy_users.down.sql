-- Rollback: restore persons, users, user_companies (structure only)
-- Data is not restored

CREATE TABLE IF NOT EXISTS dm3_identity.persons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID,
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dm3_auth.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    roles TEXT[] DEFAULT '{"viewer"}',
    role VARCHAR(50),
    status VARCHAR(20) DEFAULT 'active',
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dm3_auth.user_companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES dm3_auth.users(id) ON DELETE CASCADE,
    company_id UUID,
    role VARCHAR(50) DEFAULT 'viewer',
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE dm3_auth.accounts ALTER COLUMN company_id SET NOT NULL;

ALTER TABLE dm3_auth.refresh_tokens DROP CONSTRAINT IF EXISTS refresh_tokens_user_id_fkey;
