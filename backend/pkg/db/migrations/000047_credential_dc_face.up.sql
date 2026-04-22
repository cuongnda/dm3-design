-- Unique index for DC_<user_code> face credentials from TungSon cameras.
-- Mirrors the existing M_<user_code> and H_<user_code> idempotency guards so
-- concurrent confirm callbacks can't double-register a user.

CREATE UNIQUE INDEX IF NOT EXISTS idx_credentials_face_dc_card
    ON dm3_identity.credentials (tenant_id, user_id)
    WHERE type = 'face' AND value LIKE 'DC\_%' ESCAPE '\';
