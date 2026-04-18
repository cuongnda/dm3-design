ALTER TABLE dm3_auth.tenants RENAME COLUMN enabled_plugins TO enabled_modules;

COMMENT ON COLUMN dm3_auth.tenants.enabled_modules IS
    'Optional modules enabled for this tenant. Core is always present. Options: core, visitor, parking, intercom, smart_building';
