-- Reverse 000045_credential_external_ref.up.sql.

DROP INDEX IF EXISTS dm3_identity.idx_credentials_face_h_card;

ALTER TABLE dm3_identity.credentials
    DROP COLUMN IF EXISTS external_ref;
