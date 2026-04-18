-- Migration 000008: Parking Schema Isolation
-- Moves all parking-related tables from dm3_operate to a new dm3_parking schema.
-- Data, indexes, and constraints are preserved via ALTER TABLE ... SET SCHEMA.
-- Cross-schema references (to dm3_identity.users, dm3_auth.tenants, etc.) are
-- intentionally kept as implicit UUID references — the application layer
-- enforces referential integrity across schema boundaries.

-- ─── Create new schema ────────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS dm3_parking;

-- ─── Recreate set_updated_at trigger function in dm3_parking ────────────────

CREATE OR REPLACE FUNCTION dm3_parking.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── Move tables (dependency order) ─────────────────────────────────────────

-- 1. parking_lots (no intra-parking FK dependencies)
ALTER TABLE dm3_operate.parking_lots SET SCHEMA dm3_parking;

-- 2. parking_zones (references parking_lots)
ALTER TABLE dm3_operate.parking_zones SET SCHEMA dm3_parking;

-- 3. parking_fee_rules (references parking_lots, parking_zones — both SET NULL)
ALTER TABLE dm3_operate.parking_fee_rules SET SCHEMA dm3_parking;

-- 4. parking_vehicles (references parking_passes via active_pass_id — circular)
ALTER TABLE dm3_operate.parking_vehicles SET SCHEMA dm3_parking;

-- 5. parking_passes (references parking_lots, parking_zones, parking_vehicles)
ALTER TABLE dm3_operate.parking_passes SET SCHEMA dm3_parking;

-- 6. parking_sessions (references parking_lots, parking_zones, parking_vehicles, parking_fee_rules)
ALTER TABLE dm3_operate.parking_sessions SET SCHEMA dm3_parking;

-- ─── Update triggers to use dm3_parking.set_updated_at() ────────────────────

-- parking_lots
DROP TRIGGER IF EXISTS trg_parking_lots_updated_at ON dm3_parking.parking_lots;
CREATE TRIGGER trg_parking_lots_updated_at BEFORE UPDATE ON dm3_parking.parking_lots
    FOR EACH ROW EXECUTE FUNCTION dm3_parking.set_updated_at();

-- parking_zones
DROP TRIGGER IF EXISTS trg_parking_zones_updated_at ON dm3_parking.parking_zones;
CREATE TRIGGER trg_parking_zones_updated_at BEFORE UPDATE ON dm3_parking.parking_zones
    FOR EACH ROW EXECUTE FUNCTION dm3_parking.set_updated_at();

-- parking_vehicles
DROP TRIGGER IF EXISTS trg_parking_vehicles_updated_at ON dm3_parking.parking_vehicles;
CREATE TRIGGER trg_parking_vehicles_updated_at BEFORE UPDATE ON dm3_parking.parking_vehicles
    FOR EACH ROW EXECUTE FUNCTION dm3_parking.set_updated_at();

-- parking_fee_rules
DROP TRIGGER IF EXISTS trg_parking_fee_rules_updated_at ON dm3_parking.parking_fee_rules;
CREATE TRIGGER trg_parking_fee_rules_updated_at BEFORE UPDATE ON dm3_parking.parking_fee_rules
    FOR EACH ROW EXECUTE FUNCTION dm3_parking.set_updated_at();

-- parking_sessions
DROP TRIGGER IF EXISTS trg_parking_sessions_updated_at ON dm3_parking.parking_sessions;
CREATE TRIGGER trg_parking_sessions_updated_at BEFORE UPDATE ON dm3_parking.parking_sessions
    FOR EACH ROW EXECUTE FUNCTION dm3_parking.set_updated_at();

-- parking_passes
DROP TRIGGER IF EXISTS trg_parking_passes_updated_at ON dm3_parking.parking_passes;
CREATE TRIGGER trg_parking_passes_updated_at BEFORE UPDATE ON dm3_parking.parking_passes
    FOR EACH ROW EXECUTE FUNCTION dm3_parking.set_updated_at();
