-- Rename enabled_modules to enabled_plugins (terminology: "Plugin" not "Module")
ALTER TABLE dm3_auth.tenants RENAME COLUMN enabled_modules TO enabled_plugins;

COMMENT ON COLUMN dm3_auth.tenants.enabled_plugins IS
    'Plugins enabled for this tenant. Core is always present. Options: core, visitor, parking, intercom, smart_building';
