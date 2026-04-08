-- ============================================================
-- Rollback: Remove access_time_id from access_group_access_points
-- ============================================================

-- 1. Remove unique constraint with access_time_id
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_ag_ap_tz') THEN
    ALTER TABLE dm3_access.access_group_access_points
      DROP CONSTRAINT uq_ag_ap_tz;
  END IF;
END$$;

-- 2. Add back original unique constraint (group + point only)
ALTER TABLE dm3_access.access_group_access_points
ADD CONSTRAINT uq_ag_ap UNIQUE (access_group_id, access_point_id);

-- 3. Remove index
DROP INDEX IF EXISTS dm3_access.idx_agap_access_time;

-- 4. Remove column
ALTER TABLE dm3_access.access_group_access_points
DROP COLUMN IF EXISTS access_time_id;
