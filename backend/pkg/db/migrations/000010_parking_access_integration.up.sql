-- 000010_parking_access_integration.up.sql
-- Phase 1: Unify vehicle model in dm3_parking, add credential fields,
-- link parking zones to access zones, drop identity.vehicles.

-- ============================================================
-- 1. Enhance parking_vehicles: visitor link + RFID + NFC credentials
-- ============================================================
ALTER TABLE dm3_parking.parking_vehicles
    ADD COLUMN IF NOT EXISTS visitor_id UUID,
    ADD COLUMN IF NOT EXISTS rfid_tag VARCHAR(100),
    ADD COLUMN IF NOT EXISTS nfc_card_id VARCHAR(100);

-- Vehicle belongs to user OR visitor, not both (neither is OK)
ALTER TABLE dm3_parking.parking_vehicles
    ADD CONSTRAINT chk_vehicle_single_owner
        CHECK (NOT (owner_user_id IS NOT NULL AND visitor_id IS NOT NULL));

-- Unique credential indexes (per tenant, nulls excluded)
CREATE UNIQUE INDEX IF NOT EXISTS uq_parking_vehicle_rfid
    ON dm3_parking.parking_vehicles(tenant_id, rfid_tag)
    WHERE rfid_tag IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_parking_vehicle_nfc
    ON dm3_parking.parking_vehicles(tenant_id, nfc_card_id)
    WHERE nfc_card_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_parking_vehicles_visitor
    ON dm3_parking.parking_vehicles(visitor_id)
    WHERE visitor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_parking_vehicles_rfid
    ON dm3_parking.parking_vehicles(tenant_id, rfid_tag)
    WHERE rfid_tag IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_parking_vehicles_nfc
    ON dm3_parking.parking_vehicles(tenant_id, nfc_card_id)
    WHERE nfc_card_id IS NOT NULL;

-- ============================================================
-- 2. Link parking zones to access zones (soft FK, cross-plugin)
-- ============================================================
ALTER TABLE dm3_parking.parking_zones
    ADD COLUMN IF NOT EXISTS access_zone_id UUID;

COMMENT ON COLUMN dm3_parking.parking_zones.access_zone_id IS
    'Soft FK to dm3_access.zones(id). Links parking zone into the unified access zone hierarchy.';

-- ============================================================
-- 3. Drop dm3_identity.vehicles (replaced by dm3_parking.parking_vehicles)
-- ============================================================
DROP TABLE IF EXISTS dm3_identity.vehicles CASCADE;
