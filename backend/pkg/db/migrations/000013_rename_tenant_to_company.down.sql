-- Reverse: rename company_id back to tenant_id
BEGIN;

-- dm3_devices
ALTER TABLE IF EXISTS dm3_devices.devices RENAME COLUMN company_id TO tenant_id;

-- dm3_access
ALTER TABLE IF EXISTS dm3_access.doors RENAME COLUMN company_id TO tenant_id;
ALTER TABLE IF EXISTS dm3_access.access_rules RENAME COLUMN company_id TO tenant_id;
ALTER TABLE IF EXISTS dm3_access.access_events RENAME COLUMN company_id TO tenant_id;
ALTER TABLE IF EXISTS dm3_access.schedules RENAME COLUMN company_id TO tenant_id;
ALTER TABLE IF EXISTS dm3_access.access_time_templates RENAME COLUMN company_id TO tenant_id;
ALTER TABLE IF EXISTS dm3_access.access_time_validations RENAME COLUMN company_id TO tenant_id;
ALTER TABLE IF EXISTS dm3_access.user_access_times RENAME COLUMN company_id TO tenant_id;

-- dm3_identity
ALTER TABLE IF EXISTS dm3_identity.persons RENAME COLUMN company_id TO tenant_id;
ALTER TABLE IF EXISTS dm3_identity.credentials RENAME COLUMN company_id TO tenant_id;
ALTER TABLE IF EXISTS dm3_identity.person_groups RENAME COLUMN company_id TO tenant_id;

-- dm3_auth
-- Restore tenant_id column on users (was dropped in up, not renamed)
ALTER TABLE IF EXISTS dm3_auth.users
    ADD COLUMN IF NOT EXISTS tenant_id UUID DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE IF EXISTS dm3_auth.refresh_tokens RENAME COLUMN company_id TO tenant_id;

-- Rename indexes back
ALTER INDEX IF EXISTS idx_devices_company RENAME TO idx_devices_tenant;
ALTER INDEX IF EXISTS idx_persons_company RENAME TO idx_persons_tenant;
ALTER INDEX IF EXISTS idx_schedules_company RENAME TO idx_schedules_tenant;

COMMIT;
