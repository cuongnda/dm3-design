-- ================================================================
-- 000049 — event_clips.thumbnail_ref
-- Part of the 1-row-per-(camera,event) rework: when both snapshot and
-- record rules fire, the snapshot is stored as a thumbnail on the same
-- clip row instead of producing a second event_clips row. Standalone
-- snapshot rules (record=off, snapshot=on) still produce a media_type
-- = 'snapshot' row with its JPG in object_key.
-- ================================================================

ALTER TABLE dm3_cctv.event_clips
    ADD COLUMN IF NOT EXISTS thumbnail_ref TEXT;

COMMENT ON COLUMN dm3_cctv.event_clips.thumbnail_ref IS
    'MinIO object key for the preview JPG captured at event time. Populated for media_type=clip rows when the matching rule enables snapshot. NULL for snapshot-only rows (the JPG lives in object_key there).';
