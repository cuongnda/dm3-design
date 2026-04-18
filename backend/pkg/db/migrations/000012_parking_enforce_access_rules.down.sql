-- 000012_parking_enforce_access_rules.down.sql

ALTER TABLE dm3_parking.parking_settings
    DROP COLUMN IF EXISTS enforce_access_rules;
