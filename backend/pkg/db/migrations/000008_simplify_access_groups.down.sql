-- Rollback migration 000008: restore parent_id, per-link access_time_id, old UNIQUE constraint

BEGIN;

-- 1. Re-add parent_id to access_groups
ALTER TABLE dm3_access.access_groups
    ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES dm3_access.access_groups(id);

-- 2. Drop description from access_groups
ALTER TABLE dm3_access.access_groups
    DROP COLUMN IF EXISTS description;

-- 3. Re-add access_time_id to junction table
ALTER TABLE dm3_access.access_group_access_points
    DROP CONSTRAINT IF EXISTS uq_ag_ap;

ALTER TABLE dm3_access.access_group_access_points
    ADD COLUMN IF NOT EXISTS access_time_id UUID REFERENCES dm3_access.access_times(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_agap_access_time
    ON dm3_access.access_group_access_points(access_time_id);

ALTER TABLE dm3_access.access_group_access_points
    ADD CONSTRAINT uq_ag_ap_tz UNIQUE (access_group_id, access_point_id, access_time_id);

COMMIT;
