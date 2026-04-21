-- Migration 000039: Device-scoped kiosk tokens
-- Adds an optional device_id to kiosk_tokens so the device-gateway can mint
-- a per-device bearer token when it pushes cfg.kiosk_config. A NULL
-- device_id keeps the v1 behaviour of tenant-shared tokens pasted by an
-- admin — both shapes coexist in the same table.

ALTER TABLE dm3_auth.kiosk_tokens
    ADD COLUMN IF NOT EXISTS device_id UUID;

-- At most one non-revoked per-device token. If an admin rotates via the
-- REST API the old row is revoked first (revoked_at IS NOT NULL), and the
-- partial-unique index lets the replacement insert succeed.
CREATE UNIQUE INDEX IF NOT EXISTS uq_kiosk_tokens_device_active
    ON dm3_auth.kiosk_tokens(device_id)
    WHERE device_id IS NOT NULL AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_kiosk_tokens_device
    ON dm3_auth.kiosk_tokens(device_id)
    WHERE device_id IS NOT NULL;
