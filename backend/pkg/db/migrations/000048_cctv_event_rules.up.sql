-- ================================================================
-- 000048 — CCTV event rules, coalesced clips, snapshots, rolling
-- buffer knobs. Part of the per-event media capture rework.
-- ================================================================

-- ─── dm3_cctv.event_rules ──────────────────────────────────────────────────
-- Tenant-configurable rules that decide, for each access event, whether to
-- capture a snapshot and/or a video clip, and with what pre/post-roll.
--
-- Scope precedence (highest wins): camera → access_point → tenant. The
-- resolver picks the lowest priority number in the most specific scope that
-- matches the event's decision + event_type filters. A tenant-level row with
-- priority=1000 acts as the catch-all fallback; if no row matches, resolver
-- falls back to dm3_cctv.cctv_settings defaults.
--
-- decisions / event_types are TEXT[] — empty arrays mean "match any".

CREATE TABLE IF NOT EXISTS dm3_cctv.event_rules (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          UUID NOT NULL REFERENCES dm3_auth.tenants(id) ON DELETE CASCADE,
    scope_kind         VARCHAR(16) NOT NULL,
    access_point_id    UUID,
    camera_device_id   UUID,
    decisions          TEXT[] NOT NULL DEFAULT '{}',
    event_types        TEXT[] NOT NULL DEFAULT '{}',
    snapshot_enabled   BOOLEAN NOT NULL DEFAULT TRUE,
    record_enabled     BOOLEAN NOT NULL DEFAULT TRUE,
    pre_roll_sec       INT NOT NULL DEFAULT 10,
    post_roll_sec      INT NOT NULL DEFAULT 20,
    priority           INT NOT NULL DEFAULT 1000,
    enabled            BOOLEAN NOT NULL DEFAULT TRUE,
    notes              TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_event_rule_scope CHECK (scope_kind IN ('tenant','access_point','camera')),
    CONSTRAINT chk_event_rule_scope_fk CHECK (
        (scope_kind = 'tenant'       AND access_point_id IS NULL AND camera_device_id IS NULL) OR
        (scope_kind = 'access_point' AND access_point_id IS NOT NULL AND camera_device_id IS NULL) OR
        (scope_kind = 'camera'       AND camera_device_id IS NOT NULL)
    ),
    CONSTRAINT chk_event_rule_rolls CHECK (pre_roll_sec >= 0 AND pre_roll_sec <= 120 AND post_roll_sec >= 0 AND post_roll_sec <= 300)
);

CREATE INDEX IF NOT EXISTS idx_event_rules_tenant_priority
    ON dm3_cctv.event_rules(tenant_id, enabled, priority);
CREATE INDEX IF NOT EXISTS idx_event_rules_access_point
    ON dm3_cctv.event_rules(access_point_id) WHERE access_point_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_event_rules_camera
    ON dm3_cctv.event_rules(camera_device_id) WHERE camera_device_id IS NOT NULL;

CREATE TRIGGER trg_event_rules_updated_at
    BEFORE UPDATE ON dm3_cctv.event_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE dm3_cctv.event_rules IS
    'Per-tenant rules governing snapshot/record capture on access events.';
COMMENT ON COLUMN dm3_cctv.event_rules.decisions IS
    'Access event decisions this rule matches: granted|denied|unknown|duress. Empty = match all.';
COMMENT ON COLUMN dm3_cctv.event_rules.event_types IS
    'Device event types this rule matches: access.log|face.match|face.unknown|... Empty = match all.';
COMMENT ON COLUMN dm3_cctv.event_rules.priority IS
    'Lower = wins within the same scope. Useful when you want an exception row above a catch-all.';


-- ─── dm3_cctv.event_clips — extend for media_type + coalescing ─────────────
-- media_type 'clip' | 'snapshot' lets us store both video and still frames in
-- the same hypertable (same retention + indexing). 'snapshot' rows have
-- duration_ms = 0 and object_key ends in .jpg.
--
-- status drives the coalescer state machine:
--   'pending'   — placeholder just inserted
--   'recording' — ffmpeg kicked off (we do not strictly need this state but it
--                 keeps the finalizer's query clear)
--   'finalized' — media uploaded, object_key is stable, end_at reached
--   'degraded'  — partial capture (buffer missing, ffmpeg failed mid-burst)
--   'failed'    — capture failed outright (replaces the ad-hoc error_message
--                 scheme so dashboards can filter)
--
-- end_at is the wall-clock deadline used by coalescing: a new event on the
-- same camera arriving before end_at extends end_at = now() + post_roll; the
-- finalizer waits until now() > end_at to run ffmpeg exactly once.
--
-- rule_id is the event_rule that fired — null for legacy / manual rows.

ALTER TABLE dm3_cctv.event_clips
    ADD COLUMN IF NOT EXISTS media_type VARCHAR(10) NOT NULL DEFAULT 'clip',
    ADD COLUMN IF NOT EXISTS status     VARCHAR(16) NOT NULL DEFAULT 'finalized',
    ADD COLUMN IF NOT EXISTS end_at     TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS rule_id    UUID;

ALTER TABLE dm3_cctv.event_clips
    DROP CONSTRAINT IF EXISTS chk_event_clip_media_type;
ALTER TABLE dm3_cctv.event_clips
    ADD CONSTRAINT chk_event_clip_media_type CHECK (media_type IN ('clip','snapshot'));

ALTER TABLE dm3_cctv.event_clips
    DROP CONSTRAINT IF EXISTS chk_event_clip_status;
ALTER TABLE dm3_cctv.event_clips
    ADD CONSTRAINT chk_event_clip_status CHECK (status IN ('pending','recording','finalized','degraded','failed'));

-- Backfill existing rows: everything already written was a finalized clip.
UPDATE dm3_cctv.event_clips
   SET media_type = 'clip', status = 'finalized'
 WHERE media_type IS NULL OR status IS NULL;

-- Partial index used by the coalescer: "any open clip for this camera?"
CREATE INDEX IF NOT EXISTS idx_cctv_event_clips_pending_camera
    ON dm3_cctv.event_clips(device_id, end_at)
    WHERE status IN ('pending','recording');

COMMENT ON COLUMN dm3_cctv.event_clips.media_type IS
    'clip = video (MP4), snapshot = still frame (JPG).';
COMMENT ON COLUMN dm3_cctv.event_clips.status IS
    'State machine for coalesced captures — see migration 000048 for semantics.';
COMMENT ON COLUMN dm3_cctv.event_clips.end_at IS
    'Wall-clock deadline for coalescing. Finalizer extracts media after now() > end_at.';


-- ─── dm3_cctv.event_clip_events — junction (clip has N events) ─────────────
-- One capture can cover a burst of access events (coalescing). Primary key
-- enforces idempotency: replaying an event on the same clip is a no-op.

CREATE TABLE IF NOT EXISTS dm3_cctv.event_clip_events (
    clip_id         UUID NOT NULL,
    clip_started_at TIMESTAMPTZ NOT NULL,
    access_event_id UUID NOT NULL,
    tenant_id       UUID NOT NULL REFERENCES dm3_auth.tenants(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_event_clip_events PRIMARY KEY (clip_id, access_event_id)
);

CREATE INDEX IF NOT EXISTS idx_event_clip_events_event
    ON dm3_cctv.event_clip_events(access_event_id);
CREATE INDEX IF NOT EXISTS idx_event_clip_events_tenant_clip
    ON dm3_cctv.event_clip_events(tenant_id, clip_id);

COMMENT ON TABLE dm3_cctv.event_clip_events IS
    'Many-to-many junction: a coalesced clip links to every access event it covers. clip_started_at copied from event_clips.started_at to let FK travel with hypertable PK if we later add one.';


-- ─── dm3_cctv.cctv_settings — new knobs ────────────────────────────────────
-- rolling_buffer_sec: how many seconds of live footage MediaMTX should keep
--   on disk per camera (powers real pre-roll). 0 = disabled; extractor falls
--   back to live-pull.
-- max_clip_duration_sec: safety cap — coalesced clip stops growing past this
--   even if events keep arriving. Forces a new clip to start.
-- max_concurrent_extractions: worker-pool size for ffmpeg concat jobs.
-- default_snapshot_enabled / default_record_enabled: the final fallback used
--   when no rule matches. Defaults preserve old behaviour (record on, snapshot off).

ALTER TABLE dm3_cctv.cctv_settings
    ADD COLUMN IF NOT EXISTS rolling_buffer_sec          INT     NOT NULL DEFAULT 30,
    ADD COLUMN IF NOT EXISTS max_clip_duration_sec       INT     NOT NULL DEFAULT 600,
    ADD COLUMN IF NOT EXISTS max_concurrent_extractions  INT     NOT NULL DEFAULT 8,
    ADD COLUMN IF NOT EXISTS default_snapshot_enabled    BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS default_record_enabled      BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN dm3_cctv.cctv_settings.rolling_buffer_sec IS
    'Seconds of rolling record retained by MediaMTX for every camera; 0 = buffer disabled (live-pull fallback).';
COMMENT ON COLUMN dm3_cctv.cctv_settings.max_clip_duration_sec IS
    'Hard cap on a coalesced clip. When exceeded the coalescer finalizes the current clip and opens a new one.';
COMMENT ON COLUMN dm3_cctv.cctv_settings.max_concurrent_extractions IS
    'Semaphore size for the extractor worker pool. Keeps ffmpeg concurrency bounded under event bursts.';
