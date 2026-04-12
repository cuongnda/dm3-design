-- 000010_parking_access_integration.down.sql
-- Reverse Phase 1: restore identity.vehicles, remove new parking columns.

-- ============================================================
-- 1. Recreate dm3_identity.vehicles
-- ============================================================
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

CREATE INDEX IF NOT EXISTS idx_vehicles_tenant ON dm3_identity.vehicles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_user   ON dm3_identity.vehicles(user_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_plate  ON dm3_identity.vehicles(plate_number);
CREATE INDEX IF NOT EXISTS idx_vehicles_status ON dm3_identity.vehicles(status);

-- ============================================================
-- 2. Remove access_zone_id from parking_zones
-- ============================================================
ALTER TABLE dm3_parking.parking_zones
    DROP COLUMN IF EXISTS access_zone_id;

-- ============================================================
-- 3. Remove new columns and constraints from parking_vehicles
-- ============================================================
DROP INDEX IF EXISTS dm3_parking.idx_parking_vehicles_nfc;
DROP INDEX IF EXISTS dm3_parking.idx_parking_vehicles_rfid;
DROP INDEX IF EXISTS dm3_parking.idx_parking_vehicles_visitor;
DROP INDEX IF EXISTS dm3_parking.uq_parking_vehicle_nfc;
DROP INDEX IF EXISTS dm3_parking.uq_parking_vehicle_rfid;

ALTER TABLE dm3_parking.parking_vehicles
    DROP CONSTRAINT IF EXISTS chk_vehicle_single_owner;

ALTER TABLE dm3_parking.parking_vehicles
    DROP COLUMN IF EXISTS nfc_card_id,
    DROP COLUMN IF EXISTS rfid_tag,
    DROP COLUMN IF EXISTS visitor_id;
