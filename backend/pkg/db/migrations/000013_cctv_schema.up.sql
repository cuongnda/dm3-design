-- Migration 000013: CCTV plugin schema
--
-- Creates dm3_cctv schema with:
--   - cameras:       1-1 extension of dm3_devices.devices for camera-specific
--                    fields (RTSP URL, encrypted credentials, stream profile,
--                    per-camera roll config). Camera is a device (type='camera');
--                    this table holds only what doesn't fit in devices.
--   - event_clips:   TimescaleDB hypertable for short recordings linked to
--                    access events (or manual/api triggers). Retention is
--                    handled via MinIO lifecycle + application cron.
--   - cctv_settings: per-tenant tuning for roll durations, retention,
--                    and storage quota.
--
-- Cameras integrate with access_points via the existing
-- dm3_access.access_devices junction table — no new link table is needed.
-- Other modules (controllers, intercom, parking) locate a camera by
-- querying access_devices for the relevant access_point_id; this keeps
-- cross-module coupling at the access_point hub instead of device-to-device.
--
-- RTSP credentials are encrypted by the application layer (AES-GCM,
-- key from env) and stored as BYTEA. We intentionally do not enable
-- pgcrypto so the encryption surface lives entirely in Go code where it
-- can be audited, rotated, and unit-tested.

CREATE SCHEMA IF NOT EXISTS dm3_cctv;

-- ─── Shared trigger function for set_updated_at ────────────────────────────

CREATE OR REPLACE FUNCTION dm3_cctv.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── dm3_cctv.cameras ──────────────────────────────────────────────────────
-- 1-1 extension of dm3_devices.devices. device_id is both PK and FK; the
-- devices row (type='camera') is the source of truth for name, tenant,
-- status, and online state. Camera-specific fields live here.

CREATE TABLE IF NOT EXISTS dm3_cctv.cameras (
    device_id           UUID PRIMARY KEY REFERENCES dm3_devices.devices(id) ON DELETE CASCADE,
    tenant_id           UUID NOT NULL REFERENCES dm3_auth.tenants(id),
    rtsp_url            TEXT NOT NULL,
    rtsp_username       TEXT,
    rtsp_password_enc   BYTEA,
    brand               VARCHAR(100),
    recording_mode      VARCHAR(20) NOT NULL DEFAULT 'event_only',
    pre_roll_sec        INT NOT NULL DEFAULT 10,
    post_roll_sec       INT NOT NULL DEFAULT 20,
    stream_profile      JSONB,
    last_checked_at     TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_cctv_recording_mode CHECK (recording_mode IN ('event_only', 'disabled')),
    CONSTRAINT chk_cctv_pre_roll       CHECK (pre_roll_sec  BETWEEN 0 AND 60),
    CONSTRAINT chk_cctv_post_roll      CHECK (post_roll_sec BETWEEN 0 AND 120)
);

CREATE INDEX IF NOT EXISTS idx_cctv_cameras_tenant ON dm3_cctv.cameras(tenant_id);

DROP TRIGGER IF EXISTS trg_cctv_cameras_updated_at ON dm3_cctv.cameras;
CREATE TRIGGER trg_cctv_cameras_updated_at
    BEFORE UPDATE ON dm3_cctv.cameras
    FOR EACH ROW EXECUTE FUNCTION dm3_cctv.set_updated_at();

COMMENT ON TABLE dm3_cctv.cameras IS
    'Camera-specific fields. Base device (name, status, tenant, last_seen) lives in dm3_devices.devices.';
COMMENT ON COLUMN dm3_cctv.cameras.rtsp_password_enc IS
    'AES-GCM ciphertext produced by internal/cctv/crypto.go. Never logged.';
COMMENT ON COLUMN dm3_cctv.cameras.recording_mode IS
    'event_only = record clips around access events; disabled = no recording (live-view only). Continuous recording is intentionally not a Phase 1 option.';

-- ─── dm3_cctv.event_clips ──────────────────────────────────────────────────
-- Short recordings (typically 10s pre-roll + 20s post-roll) linked to an
-- access event. Hypertable keyed by started_at for efficient retention
-- pruning. access_event_id is nullable so manual uploads are also supported.

CREATE TABLE IF NOT EXISTS dm3_cctv.event_clips (
    id               UUID NOT NULL DEFAULT gen_random_uuid(),
    tenant_id        UUID NOT NULL REFERENCES dm3_auth.tenants(id),
    device_id        UUID NOT NULL,
    access_event_id  UUID,
    started_at       TIMESTAMPTZ NOT NULL,
    ended_at         TIMESTAMPTZ NOT NULL,
    duration_ms      INT NOT NULL,
    object_key       TEXT NOT NULL,
    trigger          VARCHAR(20) NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_event_clips        PRIMARY KEY (id, started_at),
    CONSTRAINT chk_event_clip_trigger CHECK (trigger IN ('access_event', 'manual', 'api')),
    CONSTRAINT chk_event_clip_range   CHECK (ended_at >= started_at)
);

-- Hypertable on started_at (chunk per 7 days). TimescaleDB is enabled
-- in the base image per docker-compose.
SELECT create_hypertable(
    'dm3_cctv.event_clips',
    'started_at',
    chunk_time_interval => INTERVAL '7 days',
    if_not_exists       => TRUE
);

CREATE INDEX IF NOT EXISTS idx_cctv_event_clips_tenant_started
    ON dm3_cctv.event_clips(tenant_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_cctv_event_clips_device_started
    ON dm3_cctv.event_clips(device_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_cctv_event_clips_access_event
    ON dm3_cctv.event_clips(access_event_id)
    WHERE access_event_id IS NOT NULL;

COMMENT ON COLUMN dm3_cctv.event_clips.device_id IS
    'Camera device.id (dm3_devices.devices). Soft reference — hard FK to devices table would prevent clip retention after camera deletion.';
COMMENT ON COLUMN dm3_cctv.event_clips.object_key IS
    'MinIO object key, e.g. cctv-<tenant>/<yyyy>/<mm>/<dd>/<camera>/<clip_id>.mp4';

-- ─── dm3_cctv.cctv_settings ────────────────────────────────────────────────
-- Per-tenant CCTV configuration. Sensible defaults cover the 100-camera /
-- event-only scenario agreed for Phase 1.

CREATE TABLE IF NOT EXISTS dm3_cctv.cctv_settings (
    tenant_id               UUID PRIMARY KEY REFERENCES dm3_auth.tenants(id) ON DELETE CASCADE,
    retention_days          INT NOT NULL DEFAULT 14,
    retention_days_max      INT NOT NULL DEFAULT 90,
    pre_roll_sec_default    INT NOT NULL DEFAULT 10,
    post_roll_sec_default   INT NOT NULL DEFAULT 20,
    storage_quota_gb        INT NOT NULL DEFAULT 100,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_cctv_retention_days    CHECK (retention_days BETWEEN 1 AND retention_days_max),
    CONSTRAINT chk_cctv_retention_max     CHECK (retention_days_max BETWEEN 1 AND 365),
    CONSTRAINT chk_cctv_storage_quota     CHECK (storage_quota_gb >= 1)
);

DROP TRIGGER IF EXISTS trg_cctv_settings_updated_at ON dm3_cctv.cctv_settings;
CREATE TRIGGER trg_cctv_settings_updated_at
    BEFORE UPDATE ON dm3_cctv.cctv_settings
    FOR EACH ROW EXECUTE FUNCTION dm3_cctv.set_updated_at();

COMMENT ON TABLE dm3_cctv.cctv_settings IS
    'Per-tenant CCTV tuning. Created lazily on first plugin enable.';
