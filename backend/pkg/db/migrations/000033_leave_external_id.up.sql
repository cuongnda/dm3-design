-- Adds external_id to dm3_attendance.leave_requests so the HR-sync webhook
-- (POST /api/v1/attendance/leave/sync) can upsert idempotently against an
-- authoritative upstream payroll/HR system without duplicating requests.
--
-- Uniqueness is per-tenant: two tenants may reuse the same external id from
-- the same HR vendor. Nullable so existing and internally-created rows are
-- unaffected.

BEGIN;

ALTER TABLE dm3_attendance.leave_requests
    ADD COLUMN IF NOT EXISTS external_id varchar(128);

CREATE UNIQUE INDEX IF NOT EXISTS idx_leave_requests_external_id
    ON dm3_attendance.leave_requests(tenant_id, external_id)
    WHERE external_id IS NOT NULL;

COMMIT;
