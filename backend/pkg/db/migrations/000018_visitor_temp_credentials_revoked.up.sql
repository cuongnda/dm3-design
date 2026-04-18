-- Migration 000018: Add revoked_at and revoked_reason to visitor temp_credentials
-- The visitor-credential consumer in access-svc revokes temporary credentials
-- when a visit ends (checked_out / cancelled / expired). It needs dedicated
-- columns so the original status column keeps its lifecycle meaning and the
-- revoke reason/time are queryable.

ALTER TABLE dm3_visitor.temp_credentials
    ADD COLUMN IF NOT EXISTS revoked_at     TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS revoked_reason VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_temp_credentials_revoked_at
    ON dm3_visitor.temp_credentials(revoked_at)
    WHERE revoked_at IS NOT NULL;
