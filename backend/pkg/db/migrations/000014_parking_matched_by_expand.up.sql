-- 000014_parking_matched_by_expand.up.sql
-- Expand chk_parking_session_matched_by to match the triple-credential
-- resolution introduced in Phase 2/3 (see migrations 000010-000012 and
-- backend/internal/models/parking.go ParkingMatch* constants).
--
-- The original constraint (from 000001) only allowed values tied to the
-- ANPR-only flow: 'manual', 'anpr_auto', 'anpr_review', 'manual_override'.
-- Phase 2 added 'plate', 'rfid', 'nfc', 'rfid+plate', 'nfc+plate', which
-- the entry/exit handlers write but the constraint rejects — every NFC/RFID
-- matched session currently fails insert with:
--   new row for relation "parking_sessions" violates check constraint
--   "chk_parking_session_matched_by"

ALTER TABLE dm3_parking.parking_sessions
    DROP CONSTRAINT IF EXISTS chk_parking_session_matched_by;

ALTER TABLE dm3_parking.parking_sessions
    ADD CONSTRAINT chk_parking_session_matched_by CHECK (
        matched_by IN (
            'manual',
            'manual_override',
            'anpr_auto',
            'anpr_review',
            'plate',
            'rfid',
            'nfc',
            'rfid+plate',
            'nfc+plate'
        )
    );
