-- Migration 000042: Add error_message and updated_at to event_clips
--
-- The clip extractor pipeline (internal/cctv/clip_extractor.go) needs to:
--   - Record extraction errors in-row so operators can diagnose failures
--   - Track when a placeholder row was updated with real clip metadata

ALTER TABLE dm3_cctv.event_clips
    ADD COLUMN IF NOT EXISTS error_message TEXT,
    ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMPTZ NOT NULL DEFAULT now();

-- Make ended_at nullable so placeholder rows can have ended_at = NULL until
-- the extractor fills it in. Also allow duration_ms = 0 for placeholders.
ALTER TABLE dm3_cctv.event_clips
    ALTER COLUMN ended_at DROP NOT NULL;

COMMENT ON COLUMN dm3_cctv.event_clips.error_message IS
    'Non-NULL when clip extraction failed. Contains truncated error detail.';
COMMENT ON COLUMN dm3_cctv.event_clips.updated_at IS
    'Set when the clip extractor updates the row with real metadata or an error.';
