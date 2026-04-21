DROP INDEX IF EXISTS dm3_auth.uq_kiosk_tokens_device_active;
DROP INDEX IF EXISTS dm3_auth.idx_kiosk_tokens_device;

ALTER TABLE dm3_auth.kiosk_tokens
    DROP COLUMN IF EXISTS device_id;
