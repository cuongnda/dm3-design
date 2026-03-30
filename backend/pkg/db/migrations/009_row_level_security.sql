-- 009_row_level_security.sql — Multi-tenant Row Level Security
--
-- Enforces tenant isolation at the database level.
-- Each connection must SET LOCAL app.current_tenant = '<uuid>' before queries.
-- System-level queries (no tenant context) use the dm3 superuser which bypasses RLS.
--
-- IMPORTANT: RLS is a defense-in-depth layer. Application code should ALWAYS
-- filter by tenant_id in WHERE clauses. RLS catches bugs, not replaces app logic.

-- ============================================================
-- Helper: set tenant context per connection
-- ============================================================
-- Services call this at the start of each request:
--   SET LOCAL app.current_tenant = '<tenant_uuid>';
--
-- For system_admin operations (cross-tenant), don't set the variable
-- and use the superuser role which bypasses RLS.

-- ============================================================
-- dm3_devices schema
-- ============================================================
ALTER TABLE dm3_devices.devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON dm3_devices.devices;
CREATE POLICY tenant_isolation ON dm3_devices.devices
    USING (
        tenant_id = COALESCE(
            NULLIF(current_setting('app.current_tenant', true), '')::uuid,
            tenant_id  -- no tenant set = superuser bypass (sees all)
        )
    );

-- ============================================================
-- dm3_access schema
-- ============================================================
ALTER TABLE dm3_access.doors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON dm3_access.doors;
CREATE POLICY tenant_isolation ON dm3_access.doors
    USING (
        tenant_id = COALESCE(
            NULLIF(current_setting('app.current_tenant', true), '')::uuid,
            tenant_id
        )
    );

ALTER TABLE dm3_access.access_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON dm3_access.access_rules;
CREATE POLICY tenant_isolation ON dm3_access.access_rules
    USING (
        tenant_id = COALESCE(
            NULLIF(current_setting('app.current_tenant', true), '')::uuid,
            tenant_id
        )
    );

ALTER TABLE dm3_access.access_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON dm3_access.access_events;
CREATE POLICY tenant_isolation ON dm3_access.access_events
    USING (
        tenant_id = COALESCE(
            NULLIF(current_setting('app.current_tenant', true), '')::uuid,
            tenant_id
        )
    );

-- ============================================================
-- dm3_identity schema
-- ============================================================
ALTER TABLE dm3_identity.persons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON dm3_identity.persons;
CREATE POLICY tenant_isolation ON dm3_identity.persons
    USING (
        tenant_id = COALESCE(
            NULLIF(current_setting('app.current_tenant', true), '')::uuid,
            tenant_id
        )
    );

ALTER TABLE dm3_identity.credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON dm3_identity.credentials;
CREATE POLICY tenant_isolation ON dm3_identity.credentials
    USING (
        tenant_id = COALESCE(
            NULLIF(current_setting('app.current_tenant', true), '')::uuid,
            tenant_id
        )
    );

-- ============================================================
-- dm3_auth schema
-- ============================================================
-- Note: dm3_auth.users has company_id (not tenant_id).
-- RLS for users is handled differently — users can belong to
-- multiple companies via user_companies junction table.
-- Auth queries are always by email (unique) or user_id, so
-- RLS by company_id would break the two-step login flow.

-- dm3_auth.companies — no RLS (system_admin manages all companies)

-- ============================================================
-- dm3_audit schema (if exists)
-- ============================================================
-- Audit tables are append-only. RLS applied for read queries.
-- Write access is INSERT-only via dedicated audit DB user.

-- ============================================================
-- Schedules table (from migration 002)
-- ============================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'dm3_access' AND table_name = 'schedules') THEN
        ALTER TABLE dm3_access.schedules ENABLE ROW LEVEL SECURITY;

        DROP POLICY IF EXISTS tenant_isolation ON dm3_access.schedules;
        EXECUTE 'CREATE POLICY tenant_isolation ON dm3_access.schedules
            USING (
                tenant_id = COALESCE(
                    NULLIF(current_setting(''app.current_tenant'', true), '''')::uuid,
                    tenant_id
                )
            )';
    END IF;
END $$;

-- ============================================================
-- Person groups table (from migration 003)
-- ============================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'dm3_identity' AND table_name = 'person_groups') THEN
        ALTER TABLE dm3_identity.person_groups ENABLE ROW LEVEL SECURITY;

        DROP POLICY IF EXISTS tenant_isolation ON dm3_identity.person_groups;
        EXECUTE 'CREATE POLICY tenant_isolation ON dm3_identity.person_groups
            USING (
                tenant_id = COALESCE(
                    NULLIF(current_setting(''app.current_tenant'', true), '''')::uuid,
                    tenant_id
                )
            )';
    END IF;
END $$;

-- ============================================================
-- Provisioned devices table (from migration 007)
-- ============================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'dm3_devices' AND table_name = 'provisioned_devices') THEN
        ALTER TABLE dm3_devices.provisioned_devices ENABLE ROW LEVEL SECURITY;

        DROP POLICY IF EXISTS tenant_isolation ON dm3_devices.provisioned_devices;
        EXECUTE 'CREATE POLICY tenant_isolation ON dm3_devices.provisioned_devices
            USING (
                tenant_id = COALESCE(
                    NULLIF(current_setting(''app.current_tenant'', true), '''')::uuid,
                    tenant_id
                )
            )';
    END IF;
END $$;

-- ============================================================
-- NOTES for Go service integration:
-- ============================================================
-- In each request handler, after extracting company_id from JWT:
--
--   tx.Exec("SET LOCAL app.current_tenant = $1", companyID)
--
-- This must be done inside a transaction (SET LOCAL is transaction-scoped).
-- The superuser (dm3) bypasses RLS — used for migrations and system_admin.
-- Service-specific DB users (future) will be FORCE'd through RLS.
--
-- Example middleware pattern:
--
--   func withTenant(ctx context.Context, db *sql.DB, tenantID uuid.UUID, fn func(tx *sql.Tx) error) error {
--       tx, _ := db.BeginTx(ctx, nil)
--       tx.ExecContext(ctx, "SET LOCAL app.current_tenant = $1", tenantID)
--       err := fn(tx)
--       if err != nil { tx.Rollback(); return err }
--       return tx.Commit()
--   }
