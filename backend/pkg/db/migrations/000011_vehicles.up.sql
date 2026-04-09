-- 000011: Vehicle registry — plate numbers linked to users
-- Stores personal/company vehicles with plate number for LPR and parking integration.

CREATE TABLE IF NOT EXISTS dm3_identity.vehicles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES dm3_auth.tenants(id),
    user_id         UUID REFERENCES dm3_identity.users(id) ON DELETE SET NULL,
    plate_number    VARCHAR(20) NOT NULL,
    vehicle_type    VARCHAR(20) NOT NULL DEFAULT 'car',
    brand           VARCHAR(100),
    model           VARCHAR(100),
    color           VARCHAR(50),
    description     TEXT,
    status          VARCHAR(20) NOT NULL DEFAULT 'active',
    is_deleted      BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_vehicle_type CHECK (vehicle_type IN ('car', 'motorbike', 'bicycle', 'truck', 'other')),
    CONSTRAINT chk_vehicle_status CHECK (status IN ('active', 'inactive', 'blacklisted')),
    CONSTRAINT uq_vehicle_plate_tenant UNIQUE (tenant_id, plate_number)
);

COMMENT ON TABLE dm3_identity.vehicles IS 'Vehicle registry — links plate numbers to users for LPR & parking';
COMMENT ON COLUMN dm3_identity.vehicles.plate_number IS 'License plate (e.g. 51A-123.45)';
COMMENT ON COLUMN dm3_identity.vehicles.vehicle_type IS 'car, motorbike, bicycle, truck, other';
COMMENT ON COLUMN dm3_identity.vehicles.status IS 'active, inactive, blacklisted';

CREATE INDEX IF NOT EXISTS idx_vehicles_tenant   ON dm3_identity.vehicles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_user     ON dm3_identity.vehicles(user_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_plate    ON dm3_identity.vehicles(plate_number);
CREATE INDEX IF NOT EXISTS idx_vehicles_status   ON dm3_identity.vehicles(status);
