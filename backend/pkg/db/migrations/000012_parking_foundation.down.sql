-- 000012: Revert parking foundation

DROP TRIGGER IF EXISTS trg_parking_sessions_updated_at ON dm3_operate.parking_sessions;
DROP TRIGGER IF EXISTS trg_parking_fee_rules_updated_at ON dm3_operate.parking_fee_rules;
DROP TRIGGER IF EXISTS trg_parking_vehicles_updated_at ON dm3_operate.parking_vehicles;
DROP TRIGGER IF EXISTS trg_parking_zones_updated_at ON dm3_operate.parking_zones;
DROP TRIGGER IF EXISTS trg_parking_lots_updated_at ON dm3_operate.parking_lots;

DROP TABLE IF EXISTS dm3_operate.parking_sessions CASCADE;
DROP TABLE IF EXISTS dm3_operate.parking_fee_rules CASCADE;
DROP TABLE IF EXISTS dm3_operate.parking_vehicles CASCADE;
DROP TABLE IF EXISTS dm3_operate.parking_zones CASCADE;
DROP TABLE IF EXISTS dm3_operate.parking_lots CASCADE;
