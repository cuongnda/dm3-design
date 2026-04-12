-- 000012_parking_enforce_access_rules.up.sql
-- Phase 5: Opt-in cross-module access policy check for parking entry.
-- When enabled, parking entry verifies the vehicle owner has access rights
-- to the linked access zone via access groups before granting entry.

ALTER TABLE dm3_parking.parking_settings
    ADD COLUMN IF NOT EXISTS enforce_access_rules BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN dm3_parking.parking_settings.enforce_access_rules IS
    'When true, parking entry checks access_group membership for the vehicle owner against the linked access zone before allowing entry.';
