-- 000016: Ensure dm3_identity.users, departments, access_groups exist
-- Fully defensive: safe to run regardless of prior manual migrations.

-- ============================================================
-- dm3_identity.users: rename from persons if needed
-- ============================================================
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'dm3_identity' AND table_name = 'persons'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'dm3_identity' AND table_name = 'users'
    ) THEN
        ALTER TABLE dm3_identity.persons RENAME TO users;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS dm3_identity.users (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id     UUID,
    tenant_id      UUID,
    account_id     UUID,
    department_id  UUID,
    access_group_id UUID,
    first_name     VARCHAR(255) NOT NULL DEFAULT '',
    last_name      VARCHAR(255) NOT NULL DEFAULT '',
    email          VARCHAR(255),
    phone          VARCHAR(50),
    user_code      VARCHAR(100),
    emp_number     VARCHAR(100),
    position       VARCHAR(255),
    address        TEXT,
    sex            BOOLEAN,
    birth_day      DATE,
    effective_date DATE,
    expired_date   DATE,
    avatar         VARCHAR(500),
    status         VARCHAR(20) DEFAULT 'active',
    is_deleted     BOOLEAN DEFAULT false,
    is_master_card BOOLEAN DEFAULT false,
    created_at     TIMESTAMPTZ DEFAULT now(),
    updated_at     TIMESTAMPTZ DEFAULT now()
);

-- Add missing columns (idempotent)
ALTER TABLE dm3_identity.users ADD COLUMN IF NOT EXISTS company_id      UUID;
ALTER TABLE dm3_identity.users ADD COLUMN IF NOT EXISTS tenant_id       UUID;
ALTER TABLE dm3_identity.users ADD COLUMN IF NOT EXISTS account_id      UUID;
ALTER TABLE dm3_identity.users ADD COLUMN IF NOT EXISTS department_id   UUID;
ALTER TABLE dm3_identity.users ADD COLUMN IF NOT EXISTS access_group_id UUID;
ALTER TABLE dm3_identity.users ADD COLUMN IF NOT EXISTS user_code       VARCHAR(100);
ALTER TABLE dm3_identity.users ADD COLUMN IF NOT EXISTS emp_number      VARCHAR(100);
ALTER TABLE dm3_identity.users ADD COLUMN IF NOT EXISTS position        VARCHAR(255);
ALTER TABLE dm3_identity.users ADD COLUMN IF NOT EXISTS address         TEXT;
ALTER TABLE dm3_identity.users ADD COLUMN IF NOT EXISTS sex             BOOLEAN;
ALTER TABLE dm3_identity.users ADD COLUMN IF NOT EXISTS birth_day       DATE;
ALTER TABLE dm3_identity.users ADD COLUMN IF NOT EXISTS effective_date  DATE;
ALTER TABLE dm3_identity.users ADD COLUMN IF NOT EXISTS expired_date    DATE;
ALTER TABLE dm3_identity.users ADD COLUMN IF NOT EXISTS avatar          VARCHAR(500);
ALTER TABLE dm3_identity.users ADD COLUMN IF NOT EXISTS is_deleted      BOOLEAN DEFAULT false;
ALTER TABLE dm3_identity.users ADD COLUMN IF NOT EXISTS is_master_card  BOOLEAN DEFAULT false;
ALTER TABLE dm3_identity.users ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ DEFAULT now();

-- ============================================================
-- Normalize dm3_auth.accounts: ensure email/role/status/full_name columns exist
-- Handles both schemas: 012 (email+role+status) and 013 (username+type+is_deleted)
-- ============================================================
DO $$
BEGIN
    -- Add email from username if missing
    IF NOT EXISTS(SELECT 1 FROM information_schema.columns
        WHERE table_schema='dm3_auth' AND table_name='accounts' AND column_name='email') THEN
        ALTER TABLE dm3_auth.accounts ADD COLUMN email VARCHAR(255);
        UPDATE dm3_auth.accounts SET email = username WHERE email IS NULL;
    END IF;

    -- Add status from is_deleted if missing
    IF NOT EXISTS(SELECT 1 FROM information_schema.columns
        WHERE table_schema='dm3_auth' AND table_name='accounts' AND column_name='status') THEN
        ALTER TABLE dm3_auth.accounts ADD COLUMN status VARCHAR(20) DEFAULT 'active';
        UPDATE dm3_auth.accounts SET status = CASE WHEN is_deleted = true THEN 'deleted' ELSE 'active' END
        WHERE status IS NULL;
    END IF;

    -- Add role from type if missing
    IF NOT EXISTS(SELECT 1 FROM information_schema.columns
        WHERE table_schema='dm3_auth' AND table_name='accounts' AND column_name='role') THEN
        ALTER TABLE dm3_auth.accounts ADD COLUMN role VARCHAR(50) DEFAULT 'viewer';
        UPDATE dm3_auth.accounts SET role = CASE type
            WHEN 5 THEN 'system_admin'
            WHEN 4 THEN 'primary_manager'
            WHEN 2 THEN 'manager'
            WHEN 1 THEN 'operator'
            ELSE 'viewer'
        END WHERE role IS NULL OR role = 'viewer';
    END IF;

    -- Add full_name if missing
    IF NOT EXISTS(SELECT 1 FROM information_schema.columns
        WHERE table_schema='dm3_auth' AND table_name='accounts' AND column_name='full_name') THEN
        ALTER TABLE dm3_auth.accounts ADD COLUMN full_name VARCHAR(255);
        BEGIN
            UPDATE dm3_auth.accounts SET full_name = COALESCE(
                NULLIF(TRIM(COALESCE(first_name,'') || ' ' || COALESCE(last_name,'')), ''),
                email, username
            ) WHERE full_name IS NULL;
        EXCEPTION WHEN OTHERS THEN
            -- first_name/last_name may not exist in 013 schema
            UPDATE dm3_auth.accounts SET full_name = COALESCE(email, username) WHERE full_name IS NULL;
        END;
    END IF;

    -- Add timestamp/session columns if missing
    ALTER TABLE dm3_auth.accounts ADD COLUMN IF NOT EXISTS created_at  TIMESTAMPTZ DEFAULT now();
    ALTER TABLE dm3_auth.accounts ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ DEFAULT now();
    ALTER TABLE dm3_auth.accounts ADD COLUMN IF NOT EXISTS last_login  TIMESTAMPTZ;
    ALTER TABLE dm3_auth.accounts ADD COLUMN IF NOT EXISTS login_count INT DEFAULT 0;
    ALTER TABLE dm3_auth.accounts ADD COLUMN IF NOT EXISTS locale      VARCHAR(10) DEFAULT 'vi';
    ALTER TABLE dm3_auth.accounts ADD COLUMN IF NOT EXISTS timezone    VARCHAR(50) DEFAULT 'Asia/Saigon';
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- Sync company_id from tenant_id
UPDATE dm3_identity.users
SET company_id = tenant_id
WHERE company_id IS NULL AND tenant_id IS NOT NULL;

-- Null out orphaned account_id values so FK won't fail on existing rows
UPDATE dm3_identity.users
SET account_id = NULL
WHERE account_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM dm3_auth.accounts WHERE id = account_id
  );

-- Add FK account_id → dm3_auth.accounts (NOT VALID = skip checking existing rows)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_schema = 'dm3_identity'
          AND table_name = 'users'
          AND constraint_name = 'fk_identity_users_account'
    ) THEN
        ALTER TABLE dm3_identity.users
            ADD CONSTRAINT fk_identity_users_account
            FOREIGN KEY (account_id) REFERENCES dm3_auth.accounts(id)
            ON DELETE SET NULL
            NOT VALID;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL; -- ignore if FK already exists under a different name
END $$;

-- Auto-link identity users to auth accounts by email+company (where not linked yet)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'dm3_auth' AND table_name = 'accounts' AND column_name = 'email'
    ) THEN
        UPDATE dm3_identity.users u
        SET account_id = a.id
        FROM dm3_auth.accounts a
        WHERE u.email = a.email
          AND u.company_id = a.company_id
          AND u.account_id IS NULL
          AND a.status != 'deleted';
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- ============================================================
-- dm3_identity.departments
-- ============================================================
CREATE TABLE IF NOT EXISTS dm3_identity.departments (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id            UUID NOT NULL,
    parent_id             UUID REFERENCES dm3_identity.departments(id),
    department_manager_id UUID,
    name                  VARCHAR(255) NOT NULL,
    number                VARCHAR(100) DEFAULT '',
    access_group_id       UUID,
    created_on            TIMESTAMPTZ DEFAULT now(),
    updated_on            TIMESTAMPTZ DEFAULT now(),
    is_deleted            BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_departments_company ON dm3_identity.departments(company_id);

-- ============================================================
-- dm3_access.access_groups
-- ============================================================
CREATE TABLE IF NOT EXISTS dm3_access.access_groups (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    parent_id  UUID REFERENCES dm3_access.access_groups(id),
    name       VARCHAR(255) NOT NULL,
    is_default BOOLEAN DEFAULT false,
    type       SMALLINT DEFAULT 1,
    created_on TIMESTAMPTZ DEFAULT now(),
    updated_on TIMESTAMPTZ DEFAULT now(),
    is_deleted BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_access_groups_company ON dm3_access.access_groups(company_id);

-- ============================================================
-- user_details view (dynamic: handles role VARCHAR or type SMALLINT)
-- ============================================================
DO $$
DECLARE
    has_role boolean;
    has_type boolean;
BEGIN
    SELECT EXISTS(SELECT 1 FROM information_schema.columns
        WHERE table_schema='dm3_auth' AND table_name='accounts' AND column_name='role')
    INTO has_role;

    SELECT EXISTS(SELECT 1 FROM information_schema.columns
        WHERE table_schema='dm3_auth' AND table_name='accounts' AND column_name='type')
    INTO has_type;

    IF has_role THEN
        EXECUTE $view$
        CREATE OR REPLACE VIEW dm3_identity.user_details AS
        SELECT
            u.id AS user_id, u.company_id, u.tenant_id,
            u.user_code, u.emp_number, u.first_name, u.last_name,
            CONCAT(u.first_name, ' ', u.last_name) AS full_name,
            u.email, u.position,
            u.status AS user_status,
            u.avatar, u.phone, u.address, u.birth_day,
            u.effective_date, u.expired_date,
            COALESCE(u.is_master_card, false) AS is_master_card,
            CASE a.role
                WHEN 'system_admin'    THEN 5
                WHEN 'primary_manager' THEN 4
                WHEN 'manager'         THEN 2
                WHEN 'operator'        THEN 1
                ELSE 1
            END AS account_type,
            d.name AS department_name,
            ag.name AS access_group_name
        FROM dm3_identity.users u
        LEFT JOIN dm3_auth.accounts a ON u.account_id = a.id
        LEFT JOIN dm3_identity.departments d ON u.department_id = d.id
        LEFT JOIN dm3_access.access_groups ag ON u.access_group_id = ag.id
        WHERE u.is_deleted = false OR u.is_deleted IS NULL
        $view$;
    ELSIF has_type THEN
        EXECUTE $view$
        CREATE OR REPLACE VIEW dm3_identity.user_details AS
        SELECT
            u.id AS user_id, u.company_id, u.tenant_id,
            u.user_code, u.emp_number, u.first_name, u.last_name,
            CONCAT(u.first_name, ' ', u.last_name) AS full_name,
            u.email, u.position,
            u.status AS user_status,
            u.avatar, u.phone, u.address, u.birth_day,
            u.effective_date, u.expired_date,
            COALESCE(u.is_master_card, false) AS is_master_card,
            a.type AS account_type,
            d.name AS department_name,
            ag.name AS access_group_name
        FROM dm3_identity.users u
        LEFT JOIN dm3_auth.accounts a ON u.account_id = a.id
        LEFT JOIN dm3_identity.departments d ON u.department_id = d.id
        LEFT JOIN dm3_access.access_groups ag ON u.access_group_id = ag.id
        WHERE u.is_deleted = false OR u.is_deleted IS NULL
        $view$;
    ELSE
        EXECUTE $view$
        CREATE OR REPLACE VIEW dm3_identity.user_details AS
        SELECT
            u.id AS user_id, u.company_id, u.tenant_id,
            u.user_code, u.emp_number, u.first_name, u.last_name,
            CONCAT(u.first_name, ' ', u.last_name) AS full_name,
            u.email, u.position,
            u.status AS user_status,
            u.avatar, u.phone, u.address, u.birth_day,
            u.effective_date, u.expired_date,
            COALESCE(u.is_master_card, false) AS is_master_card,
            NULL::int AS account_type,
            d.name AS department_name,
            ag.name AS access_group_name
        FROM dm3_identity.users u
        LEFT JOIN dm3_auth.accounts a ON u.account_id = a.id
        LEFT JOIN dm3_identity.departments d ON u.department_id = d.id
        LEFT JOIN dm3_access.access_groups ag ON u.access_group_id = ag.id
        WHERE u.is_deleted = false OR u.is_deleted IS NULL
        $view$;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- ============================================================
-- credentials FK → dm3_identity.users (NOT VALID = no row scan)
-- ============================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_schema = 'dm3_identity'
          AND table_name = 'credentials'
          AND constraint_name = 'credentials_person_id_fkey'
    ) THEN
        ALTER TABLE dm3_identity.credentials
            ADD CONSTRAINT credentials_person_id_fkey
            FOREIGN KEY (person_id) REFERENCES dm3_identity.users(id)
            ON DELETE CASCADE
            NOT VALID;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- ============================================================
-- Ensure sysadmin account exists and is active
-- Password: admin123  hash: $2b$12$npOZArrFi4NNiuhqOCthxusfTqXHaKXbbXhWDv1Df2mF6svcqg1.S
-- ============================================================
DO $$
DECLARE
    col_email   boolean;
    col_status  boolean;
    col_role    boolean;
BEGIN
    SELECT EXISTS(
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'dm3_auth' AND table_name = 'accounts' AND column_name = 'email'
    ) INTO col_email;

    SELECT EXISTS(
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'dm3_auth' AND table_name = 'accounts' AND column_name = 'status'
    ) INTO col_status;

    SELECT EXISTS(
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'dm3_auth' AND table_name = 'accounts' AND column_name = 'role'
    ) INTO col_role;

    IF col_email AND col_status THEN
        -- Ensure role is correct (fix accounts that were wrongly mapped during normalization)
        IF col_role THEN
            UPDATE dm3_auth.accounts
            SET role = 'system_admin', updated_at = NOW()
            WHERE email = 'sysadmin@duali.com'
              AND company_id IS NULL
              AND role != 'system_admin';
        END IF;

        -- Restore if deleted
        UPDATE dm3_auth.accounts
        SET status = 'active', updated_at = NOW()
        WHERE email = 'sysadmin@duali.com'
          AND company_id IS NULL
          AND status = 'deleted';

        -- Create if missing
        IF NOT EXISTS (
            SELECT 1 FROM dm3_auth.accounts
            WHERE email = 'sysadmin@duali.com' AND company_id IS NULL
        ) THEN
            IF col_role THEN
                INSERT INTO dm3_auth.accounts
                    (email, company_id, password_hash, role, status, created_at, updated_at)
                VALUES (
                    'sysadmin@duali.com', NULL,
                    '$2b$12$npOZArrFi4NNiuhqOCthxusfTqXHaKXbbXhWDv1Df2mF6svcqg1.S',
                    'system_admin', 'active', NOW(), NOW()
                );
            END IF;
        END IF;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
