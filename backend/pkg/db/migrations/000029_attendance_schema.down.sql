-- Migration 000029 rollback
-- Drop everything in dm3_attendance created in Sprint 1.

DROP TABLE IF EXISTS dm3_attendance.holiday_calendar;
DROP TABLE IF EXISTS dm3_attendance.attendance_devices;
DROP TABLE IF EXISTS dm3_attendance.attendance_records;
DROP TABLE IF EXISTS dm3_attendance.shift_assignments;
DROP TABLE IF EXISTS dm3_attendance.shifts;

DROP FUNCTION IF EXISTS dm3_attendance.set_updated_at();

DROP SCHEMA IF EXISTS dm3_attendance CASCADE;
