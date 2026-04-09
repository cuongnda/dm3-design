-- 000013: Parking operations phase 2
-- Adds monthly passes plus richer audit / decision fields for ANPR, barrier, and payment workflows.

CREATE TABLE IF NOT EXISTS dm3_operate.parking_passes (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES dm3_auth.tenants(id),
    site_id       UUID,
    lot_id        UUID REFERENCES dm3_operate.parking_lots(id) ON DELETE SET NULL,
    zone_id       UUID NOT NULL REFERENCES dm3_operate.parking_zones(id) ON DELETE CASCADE,
    vehicle_id    UUID NOT NULL REFERENCES dm3_operate.parking_vehicles(id) ON DELETE CASCADE,
    user_id       UUID REFERENCES dm3_identity.users(id) ON DELETE SET NULL,
    pass_type     VARCHAR(30) NOT NULL DEFAULT 'standard',
    valid_from    DATE NOT NULL,
    valid_until   DATE NOT NULL,
    fee_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
    status        VARCHAR(20) NOT NULL DEFAULT 'active',
    auto_renew    BOOLEAN NOT NULL DEFAULT false,
    metadata      JSONB NOT NULL DEFAULT '{}',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_parking_pass_type CHECK (pass_type IN ('standard', 'vip', 'reserved_space', 'ev_included')),
    CONSTRAINT chk_parking_pass_status CHECK (status IN ('active', 'expired', 'suspended', 'cancelled')),
    CONSTRAINT chk_parking_pass_dates CHECK (valid_until >= valid_from)
);

CREATE INDEX IF NOT EXISTS idx_parking_passes_lookup ON dm3_operate.parking_passes(tenant_id, zone_id, vehicle_id, status, valid_until DESC);

ALTER TABLE dm3_operate.parking_vehicles
    ADD COLUMN IF NOT EXISTS active_pass_id UUID REFERENCES dm3_operate.parking_passes(id) ON DELETE SET NULL;

ALTER TABLE dm3_operate.parking_sessions
    ADD COLUMN IF NOT EXISTS matched_by VARCHAR(30) NOT NULL DEFAULT 'manual';
ALTER TABLE dm3_operate.parking_sessions
    ADD COLUMN IF NOT EXISTS recognition_confidence NUMERIC(5,4);
ALTER TABLE dm3_operate.parking_sessions
    ADD COLUMN IF NOT EXISTS decision_code VARCHAR(50);
ALTER TABLE dm3_operate.parking_sessions
    ADD COLUMN IF NOT EXISTS decision_reason TEXT;
ALTER TABLE dm3_operate.parking_sessions
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE dm3_operate.parking_sessions
    ADD COLUMN IF NOT EXISTS reviewed_by UUID;
ALTER TABLE dm3_operate.parking_sessions
    ADD COLUMN IF NOT EXISTS payment_time TIMESTAMPTZ;

DO $$ BEGIN
    ALTER TABLE dm3_operate.parking_sessions
        ADD CONSTRAINT chk_parking_session_matched_by CHECK (matched_by IN ('manual', 'anpr_auto', 'anpr_review', 'manual_override'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_parking_passes_updated_at BEFORE UPDATE ON dm3_operate.parking_passes
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
