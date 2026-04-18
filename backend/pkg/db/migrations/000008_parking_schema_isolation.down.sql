-- Rollback migration 000008: Parking Schema Isolation
-- Moves all parking-related tables back from dm3_parking to dm3_operate.
-- Triggers are restored to use the global update_updated_at_column().

-- ─── Move tables back (reverse dependency order) ────────────────────────────

-- 6. parking_sessions
ALTER TABLE dm3_parking.parking_sessions SET SCHEMA dm3_operate;

-- 5. parking_passes
ALTER TABLE dm3_parking.parking_passes SET SCHEMA dm3_operate;

-- 4. parking_vehicles
ALTER TABLE dm3_parking.parking_vehicles SET SCHEMA dm3_operate;

-- 3. parking_fee_rules
ALTER TABLE dm3_parking.parking_fee_rules SET SCHEMA dm3_operate;

-- 2. parking_zones
ALTER TABLE dm3_parking.parking_zones SET SCHEMA dm3_operate;

-- 1. parking_lots
ALTER TABLE dm3_parking.parking_lots SET SCHEMA dm3_operate;

-- ─── Restore triggers to use global update_updated_at_column() ──────────────

DROP TRIGGER IF EXISTS trg_parking_lots_updated_at ON dm3_operate.parking_lots;
DO $$ BEGIN
    CREATE TRIGGER trg_parking_lots_updated_at BEFORE UPDATE ON dm3_operate.parking_lots
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_parking_zones_updated_at ON dm3_operate.parking_zones;
DO $$ BEGIN
    CREATE TRIGGER trg_parking_zones_updated_at BEFORE UPDATE ON dm3_operate.parking_zones
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_parking_vehicles_updated_at ON dm3_operate.parking_vehicles;
DO $$ BEGIN
    CREATE TRIGGER trg_parking_vehicles_updated_at BEFORE UPDATE ON dm3_operate.parking_vehicles
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_parking_fee_rules_updated_at ON dm3_operate.parking_fee_rules;
DO $$ BEGIN
    CREATE TRIGGER trg_parking_fee_rules_updated_at BEFORE UPDATE ON dm3_operate.parking_fee_rules
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_parking_sessions_updated_at ON dm3_operate.parking_sessions;
DO $$ BEGIN
    CREATE TRIGGER trg_parking_sessions_updated_at BEFORE UPDATE ON dm3_operate.parking_sessions
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_parking_passes_updated_at ON dm3_operate.parking_passes;
DO $$ BEGIN
    CREATE TRIGGER trg_parking_passes_updated_at BEFORE UPDATE ON dm3_operate.parking_passes
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── Drop dm3_parking schema (now empty) ────────────────────────────────────

DROP FUNCTION IF EXISTS dm3_parking.set_updated_at();
DROP SCHEMA IF EXISTS dm3_parking;
