-- 007: Device provisioning tables
-- Add provisioning fields to devices table
ALTER TABLE dm3_devices.devices ADD COLUMN IF NOT EXISTS status_detail VARCHAR(50);
ALTER TABLE dm3_devices.devices ADD COLUMN IF NOT EXISTS hardware_fingerprint JSONB;
ALTER TABLE dm3_devices.devices ADD COLUMN IF NOT EXISTS provisioned_at TIMESTAMPTZ;
ALTER TABLE dm3_devices.devices ADD COLUMN IF NOT EXISTS provisioned_by UUID;

-- Provisioning tokens (QR codes)
CREATE TABLE IF NOT EXISTS dm3_devices.provisioning_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID NOT NULL REFERENCES dm3_devices.devices(id),
    token_hash VARCHAR(64) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Bootstrap registrations (pending approval)
CREATE TABLE IF NOT EXISTS dm3_devices.pending_registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rid VARCHAR(20) NOT NULL,
    device_type VARCHAR(50) NOT NULL,
    firmware_version VARCHAR(50),
    hardware_fingerprint JSONB,
    hmac_verified BOOLEAN DEFAULT false,
    signature_verified BOOLEAN DEFAULT false,
    status VARCHAR(20) DEFAULT 'pending',
    assigned_company_id UUID,
    assigned_by UUID,
    reviewed_at TIMESTAMPTZ,
    nonce VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pending_status ON dm3_devices.pending_registrations(status);

-- Used nonces for replay protection
CREATE TABLE IF NOT EXISTS dm3_devices.used_nonces (
    nonce VARCHAR(100) PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT now()
);
