DROP TRIGGER IF EXISTS trg_parking_passes_updated_at ON dm3_operate.parking_passes;

ALTER TABLE dm3_operate.parking_sessions DROP COLUMN IF EXISTS payment_time;
ALTER TABLE dm3_operate.parking_sessions DROP COLUMN IF EXISTS reviewed_by;
ALTER TABLE dm3_operate.parking_sessions DROP COLUMN IF EXISTS reviewed_at;
ALTER TABLE dm3_operate.parking_sessions DROP COLUMN IF EXISTS decision_reason;
ALTER TABLE dm3_operate.parking_sessions DROP COLUMN IF EXISTS decision_code;
ALTER TABLE dm3_operate.parking_sessions DROP COLUMN IF EXISTS recognition_confidence;
ALTER TABLE dm3_operate.parking_sessions DROP COLUMN IF EXISTS matched_by;

ALTER TABLE dm3_operate.parking_vehicles DROP COLUMN IF EXISTS active_pass_id;

DROP TABLE IF EXISTS dm3_operate.parking_passes CASCADE;
