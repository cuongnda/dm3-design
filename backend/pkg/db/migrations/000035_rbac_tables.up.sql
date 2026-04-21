-- ============================================================
-- Migration 000035: Company-level RBAC foundation
-- ------------------------------------------------------------
-- Introduces:
--   - `member` fixed role (baseline self-service user)
--   - company_roles / company_role_permissions / user_role_assignments
--
-- Scope: schema foundation only.
-- Legacy role values (manager/operator/viewer) remain accepted in
-- dm3_auth.accounts.role until per-service migrations complete.
-- See docs/specs/platform/company-rbac.md for canonical model.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Extend accounts.role enum with 'member'
-- ------------------------------------------------------------
ALTER TABLE dm3_auth.accounts DROP CONSTRAINT IF EXISTS accounts_role_check;
ALTER TABLE dm3_auth.accounts
    ADD CONSTRAINT accounts_role_check
    CHECK (role IN (
        'system_admin',
        'primary_manager',
        'member',
        -- legacy values, removed once service migrations land
        'manager',
        'operator',
        'viewer'
    ));

-- ------------------------------------------------------------
-- 2. company_roles — tenant-defined role bundles
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dm3_auth.company_roles (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL REFERENCES dm3_auth.tenants(id) ON DELETE CASCADE,
    name                    VARCHAR(150) NOT NULL,
    description             TEXT,
    template_key            VARCHAR(100),
    is_system_template_copy BOOLEAN NOT NULL DEFAULT false,
    status                  VARCHAR(20) NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active', 'archived')),
    created_by              UUID,
    updated_by              UUID,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_company_roles_tenant
    ON dm3_auth.company_roles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_company_roles_status
    ON dm3_auth.company_roles(status);

COMMENT ON TABLE dm3_auth.company_roles IS
    'Tenant-defined role bundles. Fixed roles (system_admin/primary_manager/member) are NOT stored here; they are resolved via dm3_auth.accounts.role.';

-- ------------------------------------------------------------
-- 3. company_role_permissions — role ↔ permission_key
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dm3_auth.company_role_permissions (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id        UUID NOT NULL REFERENCES dm3_auth.company_roles(id) ON DELETE CASCADE,
    permission_key VARCHAR(150) NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (role_id, permission_key)
);

CREATE INDEX IF NOT EXISTS idx_company_role_permissions_role
    ON dm3_auth.company_role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_company_role_permissions_key
    ON dm3_auth.company_role_permissions(permission_key);

COMMENT ON TABLE dm3_auth.company_role_permissions IS
    'Maps company roles to canonical permission keys. Keys must exist in backend permission catalog (internal/rbac/catalog.go).';

-- ------------------------------------------------------------
-- 4. user_role_assignments — account ↔ role + scope
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dm3_auth.user_role_assignments (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      UUID NOT NULL REFERENCES dm3_auth.tenants(id) ON DELETE CASCADE,
    account_id     UUID NOT NULL REFERENCES dm3_auth.accounts(id) ON DELETE CASCADE,
    role_id        UUID NOT NULL REFERENCES dm3_auth.company_roles(id) ON DELETE CASCADE,
    scope_type     VARCHAR(20) NOT NULL
                        CHECK (scope_type IN ('company', 'site', 'department', 'zone', 'self')),
    scope_id       UUID,
    effective_from TIMESTAMPTZ,
    effective_to   TIMESTAMPTZ,
    created_by     UUID,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (
        (scope_type IN ('company', 'self') AND scope_id IS NULL)
        OR (scope_type IN ('site', 'department', 'zone') AND scope_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_user_role_assignments_account
    ON dm3_auth.user_role_assignments(account_id);
CREATE INDEX IF NOT EXISTS idx_user_role_assignments_tenant
    ON dm3_auth.user_role_assignments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_role_assignments_role
    ON dm3_auth.user_role_assignments(role_id);
CREATE INDEX IF NOT EXISTS idx_user_role_assignments_scope
    ON dm3_auth.user_role_assignments(scope_type, scope_id);

COMMENT ON TABLE dm3_auth.user_role_assignments IS
    'Binds accounts to company roles at a specific scope. Multiple assignments per account are expected and additive.';
COMMENT ON COLUMN dm3_auth.user_role_assignments.scope_type IS
    'company | site | department | zone | self. company/self require scope_id NULL; site/department/zone require scope_id.';
