-- External reference column on credentials. Stores the opaque identifier
-- assigned by a third-party face / access system (Hanet personID today,
-- others later) so we can call those systems back to update or delete the
-- remote person row. For Hanet the user-facing credential `value` is
-- `H_<personID>` (the same personID as external_ref) so downstream
-- consumers can match the value directly against Hanet webhook payloads
-- without an extra join; on-device enrolment still uses M_<user_code>.
--
-- Partial unique index on (tenant_id, user_id) WHERE type='face' AND value
-- LIKE 'H\_%' mirrors the existing M_<user_code> idempotency guard so
-- concurrent create/edit can't double-register a user with Hanet.

ALTER TABLE dm3_identity.credentials
    ADD COLUMN IF NOT EXISTS external_ref VARCHAR(200);

CREATE UNIQUE INDEX IF NOT EXISTS idx_credentials_face_h_card
    ON dm3_identity.credentials (tenant_id, user_id)
    WHERE type = 'face' AND value LIKE 'H\_%' ESCAPE '\';

COMMENT ON COLUMN dm3_identity.credentials.external_ref IS
    'Opaque identifier from an external system (e.g. Hanet personID). NULL when the credential is purely DM3-local.';
