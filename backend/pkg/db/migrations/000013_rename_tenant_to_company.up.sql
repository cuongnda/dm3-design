-- 013: Rename tenant_id to company_id
-- Renames all tenant_id columns to company_id across all schemas,
-- and renames related indexes from "tenant" to "company".
-- This aligns the database naming with the application's "company" terminology.

BEGIN;

-- ============================================================
-- dm3_devices schema
-- ============================================================

ALTER TABLE IF EXISTS dm3_devices.devices
    RENAME COLUMN tenant_id TO company_id;

ALTER INDEX IF EXISTS dm3_devices.idx_devices_tenant
    RENAME TO idx_devices_company;

-- ============================================================
-- dm3_access schema
-- ============================================================

ALTER TABLE IF EXISTS dm3_access.doors
    RENAME COLUMN tenant_id TO company_id;

ALTER TABLE IF EXISTS dm3_access.access_rules
    RENAME COLUMN tenant_id TO company_id;

-- TimescaleDB hypertables support regular ALTER TABLE RENAME COLUMN;
-- partitioning metadata updates automatically.
ALTER TABLE IF EXISTS dm3_access.access_events
    RENAME COLUMN tenant_id TO company_id;

ALTER TABLE IF EXISTS dm3_access.schedules
    RENAME COLUMN tenant_id TO company_id;

ALTER INDEX IF EXISTS dm3_access.idx_schedules_tenant
    RENAME TO idx_schedules_company;

ALTER TABLE IF EXISTS dm3_access.access_time_templates
    RENAME COLUMN tenant_id TO company_id;

-- Rename any indexes on access_time_templates that reference "tenant"
DO $$
DECLARE
    idx RECORD;
BEGIN
    FOR idx IN
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'dm3_access'
          AND tablename  = 'access_time_templates'
          AND indexname LIKE '%tenant%'
    LOOP
        EXECUTE format(
            'ALTER INDEX dm3_access.%I RENAME TO %I',
            idx.indexname,
            replace(idx.indexname, 'tenant', 'company')
        );
    END LOOP;
END
$$;

ALTER TABLE IF EXISTS dm3_access.access_time_validations
    RENAME COLUMN tenant_id TO company_id;

ALTER TABLE IF EXISTS dm3_access.user_access_times
    RENAME COLUMN tenant_id TO company_id;

-- Rename any indexes on user_access_times that reference "tenant"
DO $$
DECLARE
    idx RECORD;
BEGIN
    FOR idx IN
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'dm3_access'
          AND tablename  = 'user_access_times'
          AND indexname LIKE '%tenant%'
    LOOP
        EXECUTE format(
            'ALTER INDEX dm3_access.%I RENAME TO %I',
            idx.indexname,
            replace(idx.indexname, 'tenant', 'company')
        );
    END LOOP;
END
$$;

-- ============================================================
-- dm3_identity schema
-- ============================================================

ALTER TABLE IF EXISTS dm3_identity.persons
    RENAME COLUMN tenant_id TO company_id;

ALTER INDEX IF EXISTS dm3_identity.idx_persons_tenant
    RENAME TO idx_persons_company;

ALTER TABLE IF EXISTS dm3_identity.credentials
    RENAME COLUMN tenant_id TO company_id;

ALTER TABLE IF EXISTS dm3_identity.person_groups
    RENAME COLUMN tenant_id TO company_id;

-- ============================================================
-- dm3_auth schema
-- ============================================================

-- users.company_id already exists (added in 005_companies),
-- so drop the legacy tenant_id column instead of renaming.
ALTER TABLE IF EXISTS dm3_auth.users
    DROP COLUMN IF EXISTS tenant_id;

ALTER TABLE IF EXISTS dm3_auth.refresh_tokens
    RENAME COLUMN tenant_id TO company_id;

COMMIT;
