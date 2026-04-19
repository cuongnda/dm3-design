-- Add overtime_review_note column to persist reviewer notes on approval/rejection
ALTER TABLE dm3_attendance.attendance_records
    ADD COLUMN IF NOT EXISTS overtime_review_note TEXT;
