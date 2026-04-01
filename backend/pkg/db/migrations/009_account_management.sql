-- 009_account_management.sql
-- Account management tables for system admin

-- ─── Accounts Table ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dm3_auth.accounts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL UNIQUE REFERENCES dm3_auth.companies(id) ON DELETE CASCADE,
    owner_user_id   UUID REFERENCES dm3_auth.users(id) ON DELETE SET NULL,
    plan            VARCHAR(50) NOT NULL DEFAULT 'starter',
    status          VARCHAR(20) NOT NULL DEFAULT 'active',
    max_devices     INT NOT NULL DEFAULT 50,
    max_users       INT NOT NULL DEFAULT 20,
    max_doors       INT NOT NULL DEFAULT 10,
    subscription_start TIMESTAMPTZ,
    subscription_end   TIMESTAMPTZ,
    billing_email   VARCHAR(255),
    billing_info    JSONB NOT NULL DEFAULT '{}',
    settings        JSONB NOT NULL DEFAULT '{}',
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Account Audit Log ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dm3_auth.account_audit_log (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id  UUID NOT NULL REFERENCES dm3_auth.accounts(id) ON DELETE CASCADE,
    actor_id    UUID REFERENCES dm3_auth.users(id) ON DELETE SET NULL,
    action      VARCHAR(50) NOT NULL,
    changes     JSONB NOT NULL DEFAULT '{}',
    ip_address  VARCHAR(45),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_account_audit_account_id ON dm3_auth.account_audit_log(account_id);
CREATE INDEX IF NOT EXISTS idx_account_audit_actor_id ON dm3_auth.account_audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_account_audit_created_at ON dm3_auth.account_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_accounts_status ON dm3_auth.accounts(status);
CREATE INDEX IF NOT EXISTS idx_accounts_plan ON dm3_auth.accounts(plan);

-- ─── Seed: Create accounts for existing companies ───────────────────────────

INSERT INTO dm3_auth.accounts (company_id, owner_user_id, plan, status, max_devices, max_users, billing_email)
SELECT
    c.id,
    (SELECT u.id FROM dm3_auth.users u WHERE u.company_id = c.id AND u.role = 'primary_manager' LIMIT 1),
    c.plan,
    c.status,
    c.max_devices,
    c.max_users,
    c.email
FROM dm3_auth.companies c
ON CONFLICT (company_id) DO NOTHING;
