-- Migration 000008: Simplify access group architecture
-- Remove parent_id (flat groups), remove per-link access time override,
-- add description field, fix UNIQUE constraint on junction table.
--
-- Design doc: docs/architecture/access-model-design.md

BEGIN;

-- 1. Drop parent_id from access_groups (flat structure, no hierarchy)
ALTER TABLE dm3_access.access_groups
    DROP COLUMN IF EXISTS parent_id;

-- 2. Add description to access_groups
ALTER TABLE dm3_access.access_groups
    ADD COLUMN IF NOT EXISTS description VARCHAR(500);

-- 3. Remove per-link access_time_id from junction table
--    Time schedule belongs to the Access Group, not individual AP assignments.
--    First drop the old UNIQUE constraint that included access_time_id
ALTER TABLE dm3_access.access_group_access_points
    DROP CONSTRAINT IF EXISTS uq_ag_ap_tz;

--    Drop the index on access_time_id
DROP INDEX IF EXISTS dm3_access.idx_agap_access_time;

--    Remove duplicate rows before adding the new UNIQUE constraint.
--    Keep only the earliest row for each (access_group_id, access_point_id) pair.
DELETE FROM dm3_access.access_group_access_points a
    USING dm3_access.access_group_access_points b
    WHERE a.access_group_id = b.access_group_id
      AND a.access_point_id = b.access_point_id
      AND a.created_at > b.created_at;

--    Drop the column
ALTER TABLE dm3_access.access_group_access_points
    DROP COLUMN IF EXISTS access_time_id;

--    Add correct UNIQUE constraint: one link per (group, point)
ALTER TABLE dm3_access.access_group_access_points
    ADD CONSTRAINT uq_ag_ap UNIQUE (access_group_id, access_point_id);

COMMIT;
