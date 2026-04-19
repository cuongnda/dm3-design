BEGIN;

DROP INDEX IF EXISTS dm3_attendance.idx_leave_requests_external_id;
ALTER TABLE dm3_attendance.leave_requests DROP COLUMN IF EXISTS external_id;

COMMIT;
