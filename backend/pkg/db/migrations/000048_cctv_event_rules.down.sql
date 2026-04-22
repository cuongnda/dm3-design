ALTER TABLE dm3_cctv.cctv_settings
    DROP COLUMN IF EXISTS default_record_enabled,
    DROP COLUMN IF EXISTS default_snapshot_enabled,
    DROP COLUMN IF EXISTS max_concurrent_extractions,
    DROP COLUMN IF EXISTS max_clip_duration_sec,
    DROP COLUMN IF EXISTS rolling_buffer_sec;

DROP TABLE IF EXISTS dm3_cctv.event_clip_events;

DROP INDEX IF EXISTS dm3_cctv.idx_cctv_event_clips_pending_camera;

ALTER TABLE dm3_cctv.event_clips
    DROP CONSTRAINT IF EXISTS chk_event_clip_status,
    DROP CONSTRAINT IF EXISTS chk_event_clip_media_type,
    DROP COLUMN IF EXISTS rule_id,
    DROP COLUMN IF EXISTS end_at,
    DROP COLUMN IF EXISTS status,
    DROP COLUMN IF EXISTS media_type;

DROP TRIGGER IF EXISTS trg_event_rules_updated_at ON dm3_cctv.event_rules;
DROP TABLE IF EXISTS dm3_cctv.event_rules;
