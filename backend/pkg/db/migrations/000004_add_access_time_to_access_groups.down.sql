-- ============================================================
-- Rollback: Remove access_time_id from access_groups
-- ============================================================

-- Remove index
DROP INDEX IF EXISTS dm3_access.idx_ag_access_time;

-- Remove column
ALTER TABLE dm3_access.access_groups
DROP COLUMN IF EXISTS access_time_id;
