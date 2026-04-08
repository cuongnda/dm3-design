-- ============================================================
-- Migration: Add access_time_id to access_group_access_points
-- Purpose: Allow different access times for same access point
--          across different access groups
-- ============================================================

-- 1. Add access_time_id column to access_group_access_points
ALTER TABLE dm3_access.access_group_access_points
ADD COLUMN access_time_id UUID REFERENCES dm3_access.access_times(id) ON DELETE SET NULL;

-- 2. Add index for access_time lookups
CREATE INDEX IF NOT EXISTS idx_agap_access_time
ON dm3_access.access_group_access_points(access_time_id);

-- 3. Remove old unique constraint (was only on group+point)
-- and add new one that includes access_time_id
-- This allows same group+point with different access times
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_ag_ap') THEN
    ALTER TABLE dm3_access.access_group_access_points
      DROP CONSTRAINT uq_ag_ap;
  END IF;
END$$;

-- Add new unique constraint: group + point + access_time
ALTER TABLE dm3_access.access_group_access_points
ADD CONSTRAINT uq_ag_ap_tz UNIQUE (access_group_id, access_point_id, access_time_id);
