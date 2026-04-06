-- 013_refactor_schema_dmpw_pattern_fixed.sql
-- Fixed version: Refactor to match dmpw-api pattern

-- ============================================================
-- STEP 1: Drop and recreate accounts table with correct structure
-- ============================================================

-- Drop existing tables to avoid conflicts
DROP TABLE IF EXISTS dm3_auth.accounts CASCADE;
DROP TABLE IF EXISTS dm3_auth.sessions CASCADE;
DROP TABLE IF EXISTS dm3_auth.password_reset_tokens CASCADE;
DROP TABLE IF EXISTS dm3_auth.email_verification_tokens CASCADE;

-- Create accounts table following dmpw-api pattern
CREATE TABLE dm3_auth.accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES dm3_auth.companies(id), -- nullable for system admins
    username VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    phone_number VARCHAR(50),
    
    -- Authentication & Type (following dmpw pattern)
    root_flag BOOLEAN DEFAULT false,
    type SMALLINT DEFAULT 1, -- 1=normal, 2=admin, etc. (instead of role string)
    dynamic_role_id UUID, -- for future role system
    
    -- User Preferences
    timezone VARCHAR(50) DEFAULT 'Asia/Saigon',
    language VARCHAR(10) DEFAULT 'vi',
    preferred_system INT DEFAULT 1,
    
    -- Security & Session
    refresh_token VARCHAR(512),
    create_date_refresh_token TIMESTAMPTZ,
    current_login_info JSONB,
    device_token VARCHAR(255),
    update_password_on TIMESTAMPTZ,
    login_config JSONB,
    
    -- Audit
    created_by UUID,
    created_on TIMESTAMPTZ DEFAULT now(),
    updated_by UUID,
    updated_on TIMESTAMPTZ DEFAULT now(),
    is_deleted BOOLEAN DEFAULT false,
    
    CONSTRAINT accounts_type_check CHECK (type IN (1, 2, 3, 4, 5)), -- 1=operator, 2=manager, 3=admin, 4=primary_manager, 5=system_admin
    UNIQUE (username, company_id)
);

-- Create unique index that handles NULL company_id for system admins
CREATE UNIQUE INDEX idx_accounts_username_company_unique 
ON dm3_auth.accounts(username, COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::UUID));

-- ============================================================
-- STEP 2: Rename persons to users and enhance with dmpw fields
-- ============================================================

-- Rename persons to users to match dmpw-api pattern
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'dm3_identity' AND table_name = 'persons') THEN
        ALTER TABLE dm3_identity.persons RENAME TO users;
    END IF;
END $$;

-- Add missing fields from dmpw-api User model
ALTER TABLE dm3_identity.users ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES dm3_auth.companies(id);
ALTER TABLE dm3_identity.users ADD COLUMN IF NOT EXISTS account_id UUID; -- will add FK later
ALTER TABLE dm3_identity.users ADD COLUMN IF NOT EXISTS department_id UUID; -- will add FK later  
ALTER TABLE dm3_identity.users ADD COLUMN IF NOT EXISTS access_group_id UUID; -- will add FK later
ALTER TABLE dm3_identity.users ADD COLUMN IF NOT EXISTS user_code VARCHAR(100);
ALTER TABLE dm3_identity.users ADD COLUMN IF NOT EXISTS emp_number VARCHAR(100);
ALTER TABLE dm3_identity.users ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE dm3_identity.users ADD COLUMN IF NOT EXISTS city VARCHAR(100);
ALTER TABLE dm3_identity.users ADD COLUMN IF NOT EXISTS home_phone VARCHAR(50);
ALTER TABLE dm3_identity.users ADD COLUMN IF NOT EXISTS office_phone VARCHAR(50);
ALTER TABLE dm3_identity.users ADD COLUMN IF NOT EXISTS post_code VARCHAR(20);
ALTER TABLE dm3_identity.users ADD COLUMN IF NOT EXISTS nationality VARCHAR(100);
ALTER TABLE dm3_identity.users ADD COLUMN IF NOT EXISTS position VARCHAR(255);
ALTER TABLE dm3_identity.users ADD COLUMN IF NOT EXISTS job VARCHAR(255);
ALTER TABLE dm3_identity.users ADD COLUMN IF NOT EXISTS responsibility VARCHAR(255);
ALTER TABLE dm3_identity.users ADD COLUMN IF NOT EXISTS sex BOOLEAN; -- true=male, false=female
ALTER TABLE dm3_identity.users ADD COLUMN IF NOT EXISTS birth_day DATE;
ALTER TABLE dm3_identity.users ADD COLUMN IF NOT EXISTS effective_date DATE;
ALTER TABLE dm3_identity.users ADD COLUMN IF NOT EXISTS expired_date DATE;
ALTER TABLE dm3_identity.users ADD COLUMN IF NOT EXISTS issued_date DATE;
ALTER TABLE dm3_identity.users ADD COLUMN IF NOT EXISTS pass_type SMALLINT DEFAULT 0; -- 0=card, 1=password, 2=biometric
ALTER TABLE dm3_identity.users ADD COLUMN IF NOT EXISTS permission_type SMALLINT DEFAULT 1;
ALTER TABLE dm3_identity.users ADD COLUMN IF NOT EXISTS work_type SMALLINT DEFAULT 1;
ALTER TABLE dm3_identity.users ADD COLUMN IF NOT EXISTS working_type_id UUID;
ALTER TABLE dm3_identity.users ADD COLUMN IF NOT EXISTS is_master_card BOOLEAN DEFAULT false;
ALTER TABLE dm3_identity.users ADD COLUMN IF NOT EXISTS grade VARCHAR(100);
ALTER TABLE dm3_identity.users ADD COLUMN IF NOT EXISTS approver_id_1 UUID; -- first approver account
ALTER TABLE dm3_identity.users ADD COLUMN IF NOT EXISTS approver_id_2 UUID; -- second approver account  
ALTER TABLE dm3_identity.users ADD COLUMN IF NOT EXISTS approval_status INT DEFAULT 0;
ALTER TABLE dm3_identity.users ADD COLUMN IF NOT EXISTS alias_data_info JSONB;
ALTER TABLE dm3_identity.users ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;

-- Rename photo_url to avatar if exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'dm3_identity' AND table_name = 'users' AND column_name = 'photo_url') THEN
        ALTER TABLE dm3_identity.users RENAME COLUMN photo_url TO avatar;
    END IF;
END $$;

-- Sync data
UPDATE dm3_identity.users SET company_id = tenant_id WHERE company_id IS NULL;

-- ============================================================
-- STEP 3: Create departments table
-- ============================================================

CREATE TABLE IF NOT EXISTS dm3_identity.departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES dm3_auth.companies(id),
    parent_id UUID REFERENCES dm3_identity.departments(id),
    department_manager_id UUID, -- will be FK to accounts later
    name VARCHAR(255) NOT NULL,
    number VARCHAR(100),
    access_group_id UUID, -- default access group for department
    
    -- Audit
    created_by UUID,
    created_on TIMESTAMPTZ DEFAULT now(),
    updated_by UUID,
    updated_on TIMESTAMPTZ DEFAULT now(),
    is_deleted BOOLEAN DEFAULT false
);

-- Create indexes
CREATE INDEX idx_departments_company ON dm3_identity.departments(company_id);
CREATE INDEX idx_departments_parent ON dm3_identity.departments(parent_id);
CREATE INDEX idx_departments_manager ON dm3_identity.departments(department_manager_id);

-- ============================================================
-- STEP 4: Create access groups table
-- ============================================================

CREATE TABLE IF NOT EXISTS dm3_access.access_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES dm3_auth.companies(id),
    parent_id UUID REFERENCES dm3_access.access_groups(id),
    name VARCHAR(255) NOT NULL,
    is_default BOOLEAN DEFAULT false,
    type SMALLINT DEFAULT 1,
    
    -- Audit
    created_by UUID,
    created_on TIMESTAMPTZ DEFAULT now(),
    updated_by UUID, 
    updated_on TIMESTAMPTZ DEFAULT now(),
    is_deleted BOOLEAN DEFAULT false
);

CREATE INDEX idx_access_groups_company ON dm3_access.access_groups(company_id);

-- ============================================================
-- STEP 5: Add foreign key constraints (after accounts table exists)
-- ============================================================

-- Add FK constraints after tables exist
ALTER TABLE dm3_identity.users 
ADD CONSTRAINT fk_users_account 
FOREIGN KEY (account_id) REFERENCES dm3_auth.accounts(id);

ALTER TABLE dm3_identity.users 
ADD CONSTRAINT fk_users_department 
FOREIGN KEY (department_id) REFERENCES dm3_identity.departments(id);

ALTER TABLE dm3_identity.users 
ADD CONSTRAINT fk_users_access_group 
FOREIGN KEY (access_group_id) REFERENCES dm3_access.access_groups(id);

ALTER TABLE dm3_identity.departments 
ADD CONSTRAINT fk_departments_manager 
FOREIGN KEY (department_manager_id) REFERENCES dm3_auth.accounts(id);

-- Create performance indexes
CREATE INDEX idx_accounts_company_type ON dm3_auth.accounts(company_id, type);
CREATE INDEX idx_accounts_username ON dm3_auth.accounts(username);
CREATE INDEX idx_accounts_root_flag ON dm3_auth.accounts(root_flag);

CREATE INDEX idx_users_company_status ON dm3_identity.users(company_id, status);
CREATE INDEX idx_users_account_id ON dm3_identity.users(account_id);
CREATE INDEX idx_users_department_id ON dm3_identity.users(department_id);
CREATE INDEX idx_users_user_code ON dm3_identity.users(user_code);

-- ============================================================
-- STEP 6: Migrate existing data
-- ============================================================

DO $$
DECLARE
    user_record RECORD;
    default_dept_id UUID;
    default_access_group_id UUID;
    account_id UUID;
BEGIN
    -- Create default department and access group for each company
    FOR user_record IN 
        SELECT DISTINCT company_id FROM dm3_identity.users WHERE company_id IS NOT NULL
    LOOP
        -- Create default department
        INSERT INTO dm3_identity.departments (company_id, name, number)
        VALUES (user_record.company_id, 'Default Department', 'DEFAULT')
        RETURNING id INTO default_dept_id;
        
        -- Create default access group
        INSERT INTO dm3_access.access_groups (company_id, name, is_default, type)
        VALUES (user_record.company_id, 'Default Access Group', true, 1)
        RETURNING id INTO default_access_group_id;
        
        -- Update users without department
        UPDATE dm3_identity.users 
        SET department_id = default_dept_id, 
            access_group_id = default_access_group_id
        WHERE company_id = user_record.company_id 
            AND department_id IS NULL;
    END LOOP;

    -- Migrate from existing users table if it exists in auth schema
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'dm3_auth' AND table_name = 'users') THEN
        
        FOR user_record IN 
            SELECT id, company_id, email, password_hash, name, role, status, last_login, created_at
            FROM dm3_auth.users
        LOOP
            -- Create account
            INSERT INTO dm3_auth.accounts (
                company_id, username, password_hash, type, root_flag, 
                timezone, language, created_on
            ) VALUES (
                user_record.company_id,
                user_record.email,
                user_record.password_hash,
                CASE COALESCE(user_record.role, 'operator')
                    WHEN 'system_admin' THEN 5
                    WHEN 'primary_manager' THEN 4 
                    WHEN 'manager' THEN 2
                    WHEN 'operator' THEN 1
                    ELSE 1
                END,
                CASE WHEN COALESCE(user_record.role, 'operator') = 'system_admin' THEN true ELSE false END,
                'Asia/Saigon',
                'vi',
                COALESCE(user_record.created_at, now())
            ) RETURNING id INTO account_id;
            
            -- Update existing user to link with account if user exists in identity schema
            UPDATE dm3_identity.users 
            SET account_id = account_id,
                user_code = COALESCE(emp_number, 'USR-' || substring(account_id::text, 1, 8))
            WHERE email = user_record.email AND company_id = user_record.company_id;
            
        END LOOP;
        
        RAISE NOTICE 'Migrated % accounts from old users table', 
            (SELECT COUNT(*) FROM dm3_auth.users);
    END IF;
END $$;

-- ============================================================
-- STEP 7: Create views for easy access
-- ============================================================

-- Complete user view with account and department
CREATE OR REPLACE VIEW dm3_identity.user_details AS
SELECT
    u.id as user_id,
    u.company_id,
    u.user_code,
    u.emp_number,
    u.first_name,
    u.last_name,
    CONCAT(u.first_name, ' ', u.last_name) as full_name,
    u.email,
    u.position,
    u.status as user_status,
    u.avatar,
    u.phone,
    u.address,
    u.birth_day,
    u.effective_date,
    u.expired_date,
    COALESCE(u.is_master_card, false) as is_master_card,

    -- Account info
    a.id as account_id,
    a.username,
    a.type as account_type,
    a.root_flag,
    a.timezone,
    a.language,

    -- Company info
    c.name as company_name,
    c.code as company_code,
    c.status as company_status,

    -- Department info
    d.id as department_id,
    d.name as department_name,
    d.number as department_number,

    -- Access group info
    ag.id as access_group_id,
    ag.name as access_group_name,
    ag.type as access_group_type

FROM dm3_identity.users u
LEFT JOIN dm3_auth.accounts a ON u.account_id = a.id
LEFT JOIN dm3_auth.companies c ON u.company_id = c.id
LEFT JOIN dm3_identity.departments d ON u.department_id = d.id
LEFT JOIN dm3_access.access_groups ag ON u.access_group_id = ag.id
WHERE u.is_deleted = false OR u.is_deleted IS NULL;

-- Account details view
CREATE OR REPLACE VIEW dm3_auth.account_details AS
SELECT 
    a.id as account_id,
    a.company_id,
    a.username,
    a.type,
    a.root_flag,
    a.timezone,
    a.language,
    
    -- Company info
    c.name as company_name,
    c.code as company_code,
    c.status as company_status,
    
    -- User info (if linked)
    u.id as user_id,
    u.user_code,
    u.first_name,
    u.last_name,
    CONCAT(u.first_name, ' ', u.last_name) as full_name,
    u.email,
    u.position,
    u.avatar,
    
    -- Computed permissions based on type
    CASE a.type
        WHEN 5 THEN ARRAY['system:*'] -- system_admin
        WHEN 4 THEN ARRAY['company:*', 'users:*', 'devices:*', 'access:*'] -- primary_manager
        WHEN 2 THEN ARRAY['users:manage', 'devices:*', 'access:manage'] -- manager
        WHEN 1 THEN ARRAY['devices:view', 'access:view', 'persons:manage'] -- operator
        ELSE ARRAY[]::TEXT[]
    END as permissions
    
FROM dm3_auth.accounts a
LEFT JOIN dm3_auth.companies c ON a.company_id = c.id
LEFT JOIN dm3_identity.users u ON u.account_id = a.id
WHERE a.is_deleted = false OR a.is_deleted IS NULL;

-- ============================================================
-- STEP 8: Create helper functions
-- ============================================================

-- Get account for login (following dmpw pattern)
CREATE OR REPLACE FUNCTION dm3_auth.get_account_for_login(
    login_username TEXT,
    company_uuid UUID DEFAULT NULL
) RETURNS SETOF dm3_auth.account_details AS $$
BEGIN
    RETURN QUERY
    SELECT * FROM dm3_auth.account_details
    WHERE username = login_username
        AND (company_uuid IS NULL OR company_id = company_uuid)
        AND (company_status = 'active' OR company_status IS NULL);
END;
$$ LANGUAGE plpgsql;

-- Create account with user
CREATE OR REPLACE FUNCTION dm3_auth.create_account_with_user(
    p_company_id UUID,
    p_username TEXT,
    p_password_hash TEXT,
    p_type SMALLINT DEFAULT 1,
    p_first_name TEXT DEFAULT NULL,
    p_last_name TEXT DEFAULT NULL,
    p_email TEXT DEFAULT NULL,
    p_user_code TEXT DEFAULT NULL,
    p_emp_number TEXT DEFAULT NULL,
    p_position TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    new_account_id UUID;
    new_user_id UUID;
    default_dept_id UUID;
    default_access_group_id UUID;
BEGIN
    -- Get default department and access group
    SELECT id INTO default_dept_id 
    FROM dm3_identity.departments 
    WHERE company_id = p_company_id AND name = 'Default Department' 
    LIMIT 1;
    
    SELECT id INTO default_access_group_id
    FROM dm3_access.access_groups 
    WHERE company_id = p_company_id AND is_default = true 
    LIMIT 1;
    
    -- Create account
    INSERT INTO dm3_auth.accounts (
        company_id, username, password_hash, type
    ) VALUES (
        p_company_id, p_username, p_password_hash, p_type
    ) RETURNING id INTO new_account_id;
    
    -- Create user if personal info provided
    IF p_first_name IS NOT NULL THEN
        INSERT INTO dm3_identity.users (
            tenant_id, company_id, account_id, department_id, access_group_id,
            user_code, emp_number, first_name, last_name, email, position, status
        ) VALUES (
            p_company_id, p_company_id, new_account_id, default_dept_id, default_access_group_id,
            COALESCE(p_user_code, 'USR-' || substring(new_account_id::text, 1, 8)),
            p_emp_number, p_first_name, p_last_name, 
            COALESCE(p_email, p_username), p_position, 'active'
        ) RETURNING id INTO new_user_id;
    END IF;
    
    RETURN new_account_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- STEP 9: Insert seed data
-- ============================================================

-- System admin account (no company)
INSERT INTO dm3_auth.accounts (
    username, password_hash, type, root_flag, timezone, language
) VALUES (
    'sysadmin',
    '$2a$10$iS5Aj0mDX558xGR5eIOGyeCw9d0XNdKQYcRadgXlrfOE5gg9Cn6Ty',
    5, -- system_admin
    true,
    'Asia/Saigon',
    'vi'
) ON CONFLICT (username, company_id) DO NOTHING;

-- Demo company admin 
SELECT dm3_auth.create_account_with_user(
    '00000000-0000-0000-0000-000000000001'::UUID,
    'admin@duali.com',
    '$2a$10$iS5Aj0mDX558xGR5eIOGyeCw9d0XNdKQYcRadgXlrfOE5gg9Cn6Ty',
    4, -- primary_manager
    'Demo',
    'Administrator',
    'admin@duali.com',
    'ADMIN-001',
    'ADMIN-001',
    'System Administrator'
);

-- ============================================================
-- STEP 10: Add comments
-- ============================================================

COMMENT ON TABLE dm3_auth.accounts IS 'User accounts for authentication - following dmpw-api pattern';
COMMENT ON TABLE dm3_identity.users IS 'Business user entities with employment information - following dmpw-api pattern';
COMMENT ON TABLE dm3_identity.departments IS 'Organizational departments - following dmpw-api pattern';
COMMENT ON TABLE dm3_access.access_groups IS 'Access permission groups - following dmpw-api pattern';

COMMENT ON VIEW dm3_auth.account_details IS 'Complete account view with user and company details';
COMMENT ON VIEW dm3_identity.user_details IS 'Complete user view with account, department, and access group details';

COMMENT ON FUNCTION dm3_auth.get_account_for_login(TEXT, UUID) IS 'Get account for authentication - following dmpw-api pattern';
COMMENT ON FUNCTION dm3_auth.create_account_with_user(UUID, TEXT, TEXT, SMALLINT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) IS 'Create account with linked user - following dmpw-api pattern';