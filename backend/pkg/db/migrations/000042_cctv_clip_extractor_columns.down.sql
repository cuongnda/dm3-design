-- Rollback migration 000042

ALTER TABLE dm3_cctv.event_clips
    DROP COLUMN IF EXISTS error_message,
    DROP COLUMN IF EXISTS updated_at;

-- Restore NOT NULL on ended_at (will fail if any rows have NULL ended_at)
ALTER TABLE dm3_cctv.event_clips
    ALTER COLUMN ended_at SET NOT NULL;
