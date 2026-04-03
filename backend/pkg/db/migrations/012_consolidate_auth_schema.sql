-- 012_consolidate_auth_schema.sql - Consolidate all authentication into dm3_auth schema

-- Create accounts table in auth schema (replaces scattered user tables)
CREATE TABLE IF NOT EXISTS dm3_auth.accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES dm3_auth.companies(id),
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    
    -- Personal Information
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    full_name VARCHAR(255) GENERATED ALWAYS AS (
        CASE 
            WHEN first_name IS NOT NULL AND last_name IS NOT NULL 
            THEN first_name || ' ' || last_name
            ELSE COALESCE(first_name, last_name, email)
        END
    ) STORED,
    
    -- Role and Permissions
    role VARCHAR(50) NOT NULL DEFAULT 'operator',
    permissions TEXT[] DEFAULT '{}',
    
    -- Status and Metadata
    status VARCHAR(20) DEFAULT 'active',
    email_verified BOOLEAN DEFAULT false,
    phone VARCHAR(50),
    avatar_url VARCHAR(500),
    locale VARCHAR(10) DEFAULT 'vi',
    timezone VARCHAR(50) DEFAULT 'Asia/Saigon',
    
    -- Security
    two_factor_enabled BOOLEAN DEFAULT false,
    two_factor_secret VARCHAR(32),
    last_login TIMESTAMPTZ,
    login_count INT DEFAULT 0,
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    
    CONSTRAINT accounts_email_company_unique UNIQUE (email, company_id),
    CONSTRAINT accounts_status_check CHECK (status IN ('active', 'inactive', 'suspended', 'deleted')),
    CONSTRAINT accounts_role_check CHECK (role IN ('system_admin', 'primary_manager', 'manager', 'operator', 'viewer'))
);

-- Create sessions table for proper session management
CREATE TABLE IF NOT EXISTS dm3_auth.sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES dm3_auth.accounts(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES dm3_auth.companies(id),
    
    -- Session Data
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    refresh_token_hash VARCHAR(64),
    user_agent TEXT,
    ip_address INET,
    device_fingerprint VARCHAR(255),
    
    -- Security
    is_active BOOLEAN DEFAULT true,
    expires_at TIMESTAMPTZ NOT NULL,
    last_activity TIMESTAMPTZ DEFAULT now(),
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT now(),
    
    CONSTRAINT sessions_expires_check CHECK (expires_at > created_at)
);

-- Create password reset tokens table
CREATE TABLE IF NOT EXISTS dm3_auth.password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES dm3_auth.accounts(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    
    CONSTRAINT password_reset_not_expired CHECK (expires_at > created_at)
);

-- Create email verification tokens table
CREATE TABLE IF NOT EXISTS dm3_auth.email_verification_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES dm3_auth.accounts(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    
    CONSTRAINT email_verification_not_expired CHECK (expires_at > created_at)
);

-- Create account permissions view for easier access control
CREATE OR REPLACE VIEW dm3_auth.account_permissions AS
SELECT 
    a.id as account_id,
    a.company_id,
    a.email,
    a.role,
    a.permissions as custom_permissions,
    a.status,
    c.name as company_name,
    c.code as company_code,
    c.plan as company_plan,
    c.status as company_status,
    
    -- Role-based permissions
    CASE a.role
        WHEN 'system_admin' THEN ARRAY[
            'system:manage', 'companies:manage', 'users:manage', 
            'devices:manage', 'access:manage', 'audit:view'
        ]
        WHEN 'primary_manager' THEN ARRAY[
            'company:manage', 'users:manage', 'devices:manage', 
            'access:manage', 'reports:view'
        ]
        WHEN 'manager' THEN ARRAY[
            'users:create', 'users:update', 'devices:manage', 
            'access:update', 'reports:view'
        ]
        WHEN 'operator' THEN ARRAY[
            'devices:view', 'access:view', 'persons:manage'
        ]
        WHEN 'viewer' THEN ARRAY[
            'devices:view', 'access:view', 'persons:view'
        ]
        ELSE ARRAY[]::TEXT[]
    END as role_permissions,
    
    -- Combined permissions (role + custom)
    CASE a.role
        WHEN 'system_admin' THEN ARRAY[
            'system:manage', 'companies:manage', 'users:manage', 
            'devices:manage', 'access:manage', 'audit:view'
        ] || COALESCE(a.permissions, ARRAY[]::TEXT[])
        WHEN 'primary_manager' THEN ARRAY[
            'company:manage', 'users:manage', 'devices:manage', 
            'access:manage', 'reports:view'
        ] || COALESCE(a.permissions, ARRAY[]::TEXT[])
        WHEN 'manager' THEN ARRAY[
            'users:create', 'users:update', 'devices:manage', 
            'access:update', 'reports:view'
        ] || COALESCE(a.permissions, ARRAY[]::TEXT[])
        WHEN 'operator' THEN ARRAY[
            'devices:view', 'access:view', 'persons:manage'
        ] || COALESCE(a.permissions, ARRAY[]::TEXT[])
        WHEN 'viewer' THEN ARRAY[
            'devices:view', 'access:view', 'persons:view'
        ] || COALESCE(a.permissions, ARRAY[]::TEXT[])
        ELSE COALESCE(a.permissions, ARRAY[]::TEXT[])
    END as all_permissions
    
FROM dm3_auth.accounts a
JOIN dm3_auth.companies c ON a.company_id = c.id
WHERE a.status != 'deleted' AND c.status != 'deleted';

-- Migrate existing users from dm3_auth.users to dm3_auth.accounts
DO $$
BEGIN
    -- Only migrate if old users table exists and has data
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'dm3_auth' AND table_name = 'users') THEN
        
        INSERT INTO dm3_auth.accounts (
            id, company_id, email, password_hash, full_name, role, status, 
            last_login, created_at
        )
        SELECT 
            id,
            company_id,
            email,
            password_hash,
            name as full_name,
            COALESCE(role, 'operator') as role,
            COALESCE(status, 'active') as status,
            last_login,
            COALESCE(created_at, now())
        FROM dm3_auth.users
        WHERE id NOT IN (SELECT id FROM dm3_auth.accounts)
        ON CONFLICT (email, company_id) DO NOTHING;
        
        -- Log migration results
        RAISE NOTICE 'Migrated % users to accounts table', 
            (SELECT COUNT(*) FROM dm3_auth.users);
            
    END IF;
END $$;

-- Create indexes for performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_accounts_company_status ON dm3_auth.accounts(company_id, status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_accounts_email_company ON dm3_auth.accounts(email, company_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_accounts_role ON dm3_auth.accounts(role);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_accounts_last_login ON dm3_auth.accounts(last_login);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sessions_account_active ON dm3_auth.sessions(account_id, is_active);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sessions_token_hash ON dm3_auth.sessions(token_hash);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sessions_expires_at ON dm3_auth.sessions(expires_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_password_reset_token_hash ON dm3_auth.password_reset_tokens(token_hash);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_password_reset_expires ON dm3_auth.password_reset_tokens(expires_at);

-- Create triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_accounts_updated_at 
    BEFORE UPDATE ON dm3_auth.accounts 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sessions_last_activity
    BEFORE UPDATE ON dm3_auth.sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create function to cleanup expired tokens
CREATE OR REPLACE FUNCTION cleanup_expired_auth_tokens()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER := 0;
BEGIN
    -- Cleanup expired sessions
    DELETE FROM dm3_auth.sessions WHERE expires_at < now();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Cleanup expired password reset tokens
    DELETE FROM dm3_auth.password_reset_tokens WHERE expires_at < now();
    
    -- Cleanup expired email verification tokens
    DELETE FROM dm3_auth.email_verification_tokens WHERE expires_at < now();
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Create function to get account with permissions
CREATE OR REPLACE FUNCTION get_account_with_permissions(account_email TEXT, company_uuid UUID)
RETURNS TABLE(
    account_id UUID,
    email TEXT,
    password_hash TEXT,
    full_name TEXT,
    role TEXT,
    permissions TEXT[],
    status TEXT,
    company_id UUID,
    company_name TEXT,
    company_code TEXT,
    company_plan TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ap.account_id,
        ap.email,
        a.password_hash,
        a.full_name,
        ap.role,
        ap.all_permissions,
        ap.status,
        ap.company_id,
        ap.company_name,
        ap.company_code,
        ap.company_plan
    FROM dm3_auth.account_permissions ap
    JOIN dm3_auth.accounts a ON ap.account_id = a.id
    WHERE ap.email = account_email 
    AND ap.company_id = company_uuid
    AND ap.status = 'active'
    AND ap.company_status = 'active';
END;
$$ LANGUAGE plpgsql;

-- Add comments for documentation
COMMENT ON TABLE dm3_auth.accounts IS 'Consolidated user accounts with tenant isolation';
COMMENT ON TABLE dm3_auth.sessions IS 'Active user sessions with security tracking';
COMMENT ON TABLE dm3_auth.password_reset_tokens IS 'Secure password reset tokens';
COMMENT ON TABLE dm3_auth.email_verification_tokens IS 'Email verification tokens for new accounts';
COMMENT ON VIEW dm3_auth.account_permissions IS 'Account permissions view with role-based and custom permissions';

COMMENT ON FUNCTION get_account_with_permissions(TEXT, UUID) IS 'Get account details with computed permissions for authentication';
COMMENT ON FUNCTION cleanup_expired_auth_tokens() IS 'Cleanup expired authentication tokens - run periodically';

-- Insert system admin if not exists
INSERT INTO dm3_auth.accounts (
    email, password_hash, full_name, role, status, company_id, email_verified
) VALUES (
    'sysadmin@duali.com',
    '$2a$10$iS5Aj0mDX558xGR5eIOGyeCw9d0XNdKQYcRadgXlrfOE5gg9Cn6Ty', -- admin123
    'System Administrator',
    'system_admin',
    'active',
    NULL, -- System admin doesn't belong to any specific company
    true
) ON CONFLICT (email, COALESCE(company_id, '00000000-0000-0000-0000-000000000000')) DO NOTHING;