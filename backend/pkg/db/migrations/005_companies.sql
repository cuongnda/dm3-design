-- 005_companies.sql — Multi-tenant company management

CREATE TABLE IF NOT EXISTS dm3_auth.companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) NOT NULL UNIQUE,
    plan VARCHAR(50) DEFAULT 'starter',
    status VARCHAR(20) DEFAULT 'active',
    logo_url VARCHAR(500),
    address TEXT,
    phone VARCHAR(50),
    email VARCHAR(255),
    settings JSONB DEFAULT '{}',
    max_devices INT DEFAULT 50,
    max_users INT DEFAULT 20,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add company_id FK to users
ALTER TABLE dm3_auth.users ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES dm3_auth.companies(id);
ALTER TABLE dm3_auth.users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'viewer';

-- Seed default company
INSERT INTO dm3_auth.companies (id, name, code, plan, status)
VALUES ('00000000-0000-0000-0000-000000000001', 'Duali Demo', 'duali-demo', 'enterprise', 'active')
ON CONFLICT DO NOTHING;

-- Update existing admin user
UPDATE dm3_auth.users SET company_id = '00000000-0000-0000-0000-000000000001', role = 'primary_manager' WHERE email = 'admin@duali.com';

-- Create system admin
INSERT INTO dm3_auth.users (email, password_hash, name, roles, company_id, role, status)
VALUES ('sysadmin@duali.com', '$2a$10$iS5Aj0mDX558xGR5eIOGyeCw9d0XNdKQYcRadgXlrfOE5gg9Cn6Ty', 'System Admin', '{"system_admin"}', NULL, 'system_admin', 'active')
ON CONFLICT (email) DO NOTHING;
