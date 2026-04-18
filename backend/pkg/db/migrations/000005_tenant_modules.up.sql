-- Add enabled_modules array to companies for feature toggles
ALTER TABLE dm3_auth.tenants
    ADD COLUMN IF NOT EXISTS enabled_modules VARCHAR(50)[] NOT NULL DEFAULT '{core}';

-- Seed: enable visitor module for all existing tenants
UPDATE dm3_auth.tenants SET enabled_modules = '{core,visitor}' WHERE enabled_modules = '{core}';

COMMENT ON COLUMN dm3_auth.tenants.enabled_modules IS
    'Optional modules enabled for this tenant. Core is always present. Options: core, visitor, parking, intercom, smart_building';
