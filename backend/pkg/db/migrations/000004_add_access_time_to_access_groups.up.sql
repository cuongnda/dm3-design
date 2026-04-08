-- ============================================================
-- Migration: Add access_time_id to access_groups
-- Purpose: Allow setting a default access time for entire group
--          All access points in group will use this access time
-- ============================================================

-- Add access_time_id column to access_groups
ALTER TABLE dm3_access.access_groups
ADD COLUMN access_time_id UUID REFERENCES dm3_access.access_times(id) ON DELETE SET NULL;

-- Add index for access_time lookups
CREATE INDEX IF NOT EXISTS idx_ag_access_time
ON dm3_access.access_groups(access_time_id);
