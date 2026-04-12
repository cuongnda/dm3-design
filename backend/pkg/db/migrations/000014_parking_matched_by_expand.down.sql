-- 000014_parking_matched_by_expand.down.sql
-- Restore the original (000001) narrow constraint. Note: if rows written
-- under the expanded set exist ('plate', 'rfid', 'nfc', 'rfid+plate',
-- 'nfc+plate'), the ADD CONSTRAINT below will fail — the operator must
-- reconcile data before running this down migration.

ALTER TABLE dm3_parking.parking_sessions
    DROP CONSTRAINT IF EXISTS chk_parking_session_matched_by;

ALTER TABLE dm3_parking.parking_sessions
    ADD CONSTRAINT chk_parking_session_matched_by CHECK (
        matched_by IN ('manual', 'anpr_auto', 'anpr_review', 'manual_override')
    );
