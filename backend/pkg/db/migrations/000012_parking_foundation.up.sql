-- 000012: Parking foundation
-- Phase 1 parking backend hosted in access-svc, data stored in dm3_operate.

CREATE SCHEMA IF NOT EXISTS dm3_operate;

CREATE TABLE IF NOT EXISTS dm3_operate.parking_lots (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES dm3_auth.tenants(id),
    site_id     UUID,
    name        VARCHAR(150) NOT NULL,
    code        VARCHAR(50) NOT NULL,
    description TEXT,
    status      VARCHAR(20) NOT NULL DEFAULT 'active',
    metadata    JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_parking_lots_code UNIQUE (tenant_id, code),
    CONSTRAINT chk_parking_lot_status CHECK (status IN ('active', 'maintenance', 'closed'))
);
CREATE INDEX IF NOT EXISTS idx_parking_lots_tenant ON dm3_operate.parking_lots(tenant_id);

CREATE TABLE IF NOT EXISTS dm3_operate.parking_zones (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES dm3_auth.tenants(id),
    lot_id                UUID NOT NULL REFERENCES dm3_operate.parking_lots(id) ON DELETE CASCADE,
    site_id               UUID,
    name                  VARCHAR(150) NOT NULL,
    code                  VARCHAR(50) NOT NULL,
    type                  VARCHAR(30) NOT NULL,
    level                 VARCHAR(30),
    total_spaces          INT NOT NULL DEFAULT 0,
    allowed_vehicle_types TEXT[] NOT NULL DEFAULT '{}',
    entry_devices         JSONB NOT NULL DEFAULT '[]',
    exit_devices          JSONB NOT NULL DEFAULT '[]',
    status                VARCHAR(20) NOT NULL DEFAULT 'active',
    metadata              JSONB NOT NULL DEFAULT '{}',
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_parking_zones_code UNIQUE (tenant_id, code),
    CONSTRAINT chk_parking_zone_type CHECK (type IN ('underground', 'surface', 'multi_story', 'rooftop')),
    CONSTRAINT chk_parking_zone_status CHECK (status IN ('active', 'maintenance', 'closed')),
    CONSTRAINT chk_parking_zone_spaces CHECK (total_spaces >= 0)
);
CREATE INDEX IF NOT EXISTS idx_parking_zones_tenant_lot ON dm3_operate.parking_zones(tenant_id, lot_id);

CREATE TABLE IF NOT EXISTS dm3_operate.parking_vehicles (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES dm3_auth.tenants(id),
    owner_user_id       UUID REFERENCES dm3_identity.users(id) ON DELETE SET NULL,
    plate_number        VARCHAR(30) NOT NULL,
    normalized_plate    VARCHAR(30) NOT NULL,
    plate_image_ref     VARCHAR(500),
    type                VARCHAR(20) NOT NULL,
    category            VARCHAR(20) NOT NULL DEFAULT 'visitor',
    brand               VARCHAR(80),
    color               VARCHAR(50),
    registration_status VARCHAR(20) NOT NULL DEFAULT 'registered',
    monthly_pass_id     UUID,
    metadata            JSONB NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_parking_vehicle_plate UNIQUE (tenant_id, normalized_plate),
    CONSTRAINT chk_parking_vehicle_type CHECK (type IN ('car', 'motorbike', 'bicycle', 'truck')),
    CONSTRAINT chk_parking_vehicle_category CHECK (category IN ('resident', 'visitor', 'temporary')),
    CONSTRAINT chk_parking_vehicle_registration_status CHECK (registration_status IN ('registered', 'visitor', 'temporary', 'blacklisted'))
);
CREATE INDEX IF NOT EXISTS idx_parking_vehicles_tenant_owner ON dm3_operate.parking_vehicles(tenant_id, owner_user_id);

CREATE TABLE IF NOT EXISTS dm3_operate.parking_fee_rules (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID NOT NULL REFERENCES dm3_auth.tenants(id),
    site_id      UUID,
    lot_id       UUID REFERENCES dm3_operate.parking_lots(id) ON DELETE SET NULL,
    zone_id      UUID REFERENCES dm3_operate.parking_zones(id) ON DELETE SET NULL,
    name         VARCHAR(150) NOT NULL,
    vehicle_type VARCHAR(20) NOT NULL,
    rate_type    VARCHAR(20) NOT NULL,
    rates        JSONB NOT NULL,
    free_minutes INT NOT NULL DEFAULT 0,
    max_daily    NUMERIC(12,2),
    applies_to   VARCHAR(20) NOT NULL DEFAULT 'all',
    priority     INT NOT NULL DEFAULT 0,
    enabled      BOOLEAN NOT NULL DEFAULT true,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_parking_fee_vehicle_type CHECK (vehicle_type IN ('car', 'motorbike', 'bicycle', 'truck')),
    CONSTRAINT chk_parking_fee_rate_type CHECK (rate_type IN ('hourly', 'daily', 'flat', 'tiered')),
    CONSTRAINT chk_parking_fee_applies_to CHECK (applies_to IN ('all', 'visitor', 'registered', 'resident', 'temporary')),
    CONSTRAINT chk_parking_fee_free_minutes CHECK (free_minutes >= 0)
);
CREATE INDEX IF NOT EXISTS idx_parking_fee_rules_lookup ON dm3_operate.parking_fee_rules(tenant_id, vehicle_type, enabled, priority DESC);

CREATE TABLE IF NOT EXISTS dm3_operate.parking_sessions (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          UUID NOT NULL REFERENCES dm3_auth.tenants(id),
    lot_id             UUID NOT NULL REFERENCES dm3_operate.parking_lots(id),
    zone_id            UUID NOT NULL REFERENCES dm3_operate.parking_zones(id),
    vehicle_id         UUID REFERENCES dm3_operate.parking_vehicles(id) ON DELETE SET NULL,
    plate_number       VARCHAR(30) NOT NULL,
    normalized_plate   VARCHAR(30) NOT NULL,
    vehicle_type       VARCHAR(20) NOT NULL,
    vehicle_category   VARCHAR(20),
    entry_time         TIMESTAMPTZ NOT NULL DEFAULT now(),
    exit_time          TIMESTAMPTZ,
    entry_device_id    UUID,
    exit_device_id     UUID,
    entry_plate_image  VARCHAR(500),
    exit_plate_image   VARCHAR(500),
    status             VARCHAR(20) NOT NULL DEFAULT 'active',
    fee_amount         NUMERIC(12,2),
    fee_currency       VARCHAR(10) NOT NULL DEFAULT 'VND',
    fee_rule_id        UUID REFERENCES dm3_operate.parking_fee_rules(id) ON DELETE SET NULL,
    payment_status     VARCHAR(20),
    payment_method     VARCHAR(30),
    payment_ref        VARCHAR(120),
    monthly_pass_id    UUID,
    integration_state  JSONB NOT NULL DEFAULT '{}',
    metadata           JSONB NOT NULL DEFAULT '{}',
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_parking_session_vehicle_type CHECK (vehicle_type IN ('car', 'motorbike', 'bicycle', 'truck')),
    CONSTRAINT chk_parking_session_category CHECK (vehicle_category IS NULL OR vehicle_category IN ('resident', 'visitor', 'temporary')),
    CONSTRAINT chk_parking_session_status CHECK (status IN ('active', 'completed', 'disputed', 'void')),
    CONSTRAINT chk_parking_session_payment_status CHECK (payment_status IS NULL OR payment_status IN ('pending', 'paid', 'waived', 'refunded')),
    CONSTRAINT chk_parking_session_times CHECK (exit_time IS NULL OR exit_time >= entry_time)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_parking_active_session_per_plate
    ON dm3_operate.parking_sessions(tenant_id, normalized_plate)
    WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_parking_sessions_tenant_zone_status
    ON dm3_operate.parking_sessions(tenant_id, zone_id, status, entry_time DESC);
CREATE INDEX IF NOT EXISTS idx_parking_sessions_vehicle ON dm3_operate.parking_sessions(vehicle_id);

DO $$ BEGIN
    CREATE TRIGGER trg_parking_lots_updated_at BEFORE UPDATE ON dm3_operate.parking_lots
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_parking_zones_updated_at BEFORE UPDATE ON dm3_operate.parking_zones
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_parking_vehicles_updated_at BEFORE UPDATE ON dm3_operate.parking_vehicles
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_parking_fee_rules_updated_at BEFORE UPDATE ON dm3_operate.parking_fee_rules
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_parking_sessions_updated_at BEFORE UPDATE ON dm3_operate.parking_sessions
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
