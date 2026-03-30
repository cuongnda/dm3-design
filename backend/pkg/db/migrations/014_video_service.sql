-- 014_video_service.sql — Video Management Service

-- Schema for video service
CREATE SCHEMA IF NOT EXISTS dm3_video;

-- ============================================================
-- Cameras table — IP camera and video source management
-- ============================================================
CREATE TABLE IF NOT EXISTS dm3_video.cameras (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT DEFAULT '',
    location VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL DEFAULT 'ip_camera', -- ip_camera, usb_camera, rtsp_stream, onvif_camera
    brand VARCHAR(100) DEFAULT '',
    model VARCHAR(100) DEFAULT '',
    rtsp_url TEXT NOT NULL,
    rtsp_username VARCHAR(255),
    rtsp_password VARCHAR(255),
    resolution VARCHAR(20) DEFAULT '1920x1080', -- 1920x1080, 1280x720, 640x480
    fps INT DEFAULT 25,
    quality VARCHAR(20) DEFAULT 'medium', -- low, medium, high, ultra
    status VARCHAR(50) DEFAULT 'offline', -- online, offline, error, connecting, maintenance
    is_active BOOLEAN DEFAULT true,
    is_recording BOOLEAN DEFAULT false,
    is_streaming_live BOOLEAN DEFAULT false,
    has_motion_detection BOOLEAN DEFAULT false,
    has_ptz_support BOOLEAN DEFAULT false,
    storage_quota BIGINT DEFAULT 10240, -- MB
    retention_days INT DEFAULT 7,
    position JSONB DEFAULT '{}', -- {lat, lng, floor, zone}
    config JSONB DEFAULT '{}', -- camera-specific settings
    metadata JSONB DEFAULT '{}',
    last_seen TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    created_by UUID NOT NULL,
    deleted_at TIMESTAMPTZ
);

-- Indexes for cameras
CREATE INDEX IF NOT EXISTS idx_cameras_tenant ON dm3_video.cameras(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cameras_status ON dm3_video.cameras(status);
CREATE INDEX IF NOT EXISTS idx_cameras_location ON dm3_video.cameras(location);
CREATE INDEX IF NOT EXISTS idx_cameras_type ON dm3_video.cameras(type);
CREATE INDEX IF NOT EXISTS idx_cameras_active ON dm3_video.cameras(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_cameras_recording ON dm3_video.cameras(is_recording) WHERE is_recording = true;
CREATE INDEX IF NOT EXISTS idx_cameras_streaming ON dm3_video.cameras(is_streaming_live) WHERE is_streaming_live = true;
CREATE INDEX IF NOT EXISTS idx_cameras_motion ON dm3_video.cameras(has_motion_detection) WHERE has_motion_detection = true;
CREATE INDEX IF NOT EXISTS idx_cameras_last_seen ON dm3_video.cameras(last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_cameras_deleted ON dm3_video.cameras(deleted_at) WHERE deleted_at IS NULL;

-- Full-text search index for cameras
CREATE INDEX IF NOT EXISTS idx_cameras_search ON dm3_video.cameras 
    USING gin((
        name || ' ' || description || ' ' || location || ' ' || 
        COALESCE(brand, '') || ' ' || COALESCE(model, '')
    ) gin_trgm_ops) WHERE deleted_at IS NULL;

-- ============================================================
-- Recordings table — video recording sessions
-- ============================================================
CREATE TABLE IF NOT EXISTS dm3_video.recordings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    camera_id UUID NOT NULL,
    camera_name VARCHAR(255) NOT NULL, -- denormalized for performance
    title VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(50) NOT NULL DEFAULT 'manual', -- manual, scheduled, motion, event, alarm
    status VARCHAR(50) NOT NULL DEFAULT 'recording', -- recording, stopped, processing, completed, failed
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ,
    duration BIGINT DEFAULT 0, -- seconds
    file_path TEXT,
    file_size BIGINT DEFAULT 0, -- bytes
    format VARCHAR(10) DEFAULT 'mp4', -- mp4, avi, mkv
    resolution VARCHAR(20) NOT NULL,
    fps INT NOT NULL,
    quality VARCHAR(20) NOT NULL,
    trigger_type VARCHAR(50), -- motion, alarm, schedule, manual
    trigger_data JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    created_by UUID,
    deleted_at TIMESTAMPTZ
);

-- Indexes for recordings
CREATE INDEX IF NOT EXISTS idx_recordings_tenant ON dm3_video.recordings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_recordings_camera ON dm3_video.recordings(camera_id);
CREATE INDEX IF NOT EXISTS idx_recordings_type ON dm3_video.recordings(type);
CREATE INDEX IF NOT EXISTS idx_recordings_status ON dm3_video.recordings(status);
CREATE INDEX IF NOT EXISTS idx_recordings_start_time ON dm3_video.recordings(start_time DESC);
CREATE INDEX IF NOT EXISTS idx_recordings_duration ON dm3_video.recordings(duration DESC);
CREATE INDEX IF NOT EXISTS idx_recordings_file_size ON dm3_video.recordings(file_size DESC);
CREATE INDEX IF NOT EXISTS idx_recordings_trigger_type ON dm3_video.recordings(trigger_type);
CREATE INDEX IF NOT EXISTS idx_recordings_deleted ON dm3_video.recordings(deleted_at) WHERE deleted_at IS NULL;

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_recordings_camera_date ON dm3_video.recordings(camera_id, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_recordings_active ON dm3_video.recordings(status) WHERE status = 'recording';

-- ============================================================
-- Motion zones table — motion detection areas within camera view
-- ============================================================
CREATE TABLE IF NOT EXISTS dm3_video.motion_zones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    camera_id UUID NOT NULL REFERENCES dm3_video.cameras(id),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    polygon JSONB NOT NULL, -- [{x:0.1, y:0.2}, {x:0.5, y:0.8}, ...] normalized coordinates
    sensitivity INT DEFAULT 50, -- 1-100
    is_active BOOLEAN DEFAULT true,
    is_armed BOOLEAN DEFAULT true,
    schedule JSONB DEFAULT '{}', -- when to activate
    actions TEXT[] DEFAULT '{record,alert}', -- actions to take on motion
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Indexes for motion zones
CREATE INDEX IF NOT EXISTS idx_motion_zones_tenant ON dm3_video.motion_zones(tenant_id);
CREATE INDEX IF NOT EXISTS idx_motion_zones_camera ON dm3_video.motion_zones(camera_id);
CREATE INDEX IF NOT EXISTS idx_motion_zones_active ON dm3_video.motion_zones(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_motion_zones_armed ON dm3_video.motion_zones(is_armed) WHERE is_armed = true;

-- ============================================================
-- Video events table — motion, alarms, and other video events
-- ============================================================
CREATE TABLE IF NOT EXISTS dm3_video.video_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    camera_id UUID NOT NULL,
    camera_name VARCHAR(255) NOT NULL,
    motion_zone_id UUID,
    motion_zone_name VARCHAR(255),
    type VARCHAR(50) NOT NULL, -- motion, alarm, offline, online, error, tamper, storage
    severity VARCHAR(20) NOT NULL DEFAULT 'low', -- low, medium, high, critical
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    snapshot_path TEXT,
    video_path TEXT,
    is_acknowledged BOOLEAN DEFAULT false,
    acknowledged_by UUID,
    acknowledged_at TIMESTAMPTZ,
    event_data JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Indexes for video events
CREATE INDEX IF NOT EXISTS idx_video_events_tenant ON dm3_video.video_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_video_events_camera ON dm3_video.video_events(camera_id);
CREATE INDEX IF NOT EXISTS idx_video_events_type ON dm3_video.video_events(type);
CREATE INDEX IF NOT EXISTS idx_video_events_severity ON dm3_video.video_events(severity);
CREATE INDEX IF NOT EXISTS idx_video_events_start_time ON dm3_video.video_events(start_time DESC);
CREATE INDEX IF NOT EXISTS idx_video_events_acknowledged ON dm3_video.video_events(is_acknowledged);
CREATE INDEX IF NOT EXISTS idx_video_events_zone ON dm3_video.video_events(motion_zone_id) WHERE motion_zone_id IS NOT NULL;

-- Composite indexes for dashboard queries
CREATE INDEX IF NOT EXISTS idx_video_events_unacknowledged ON dm3_video.video_events(tenant_id, start_time DESC) 
    WHERE is_acknowledged = false;
CREATE INDEX IF NOT EXISTS idx_video_events_recent ON dm3_video.video_events(tenant_id, type, start_time DESC);

-- ============================================================
-- Live streams table — active streaming sessions
-- ============================================================
CREATE TABLE IF NOT EXISTS dm3_video.live_streams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    camera_id UUID NOT NULL REFERENCES dm3_video.cameras(id),
    type VARCHAR(20) NOT NULL, -- webrtc, hls, mjpeg, rtsp
    quality VARCHAR(20) NOT NULL DEFAULT 'medium',
    viewer_count INT DEFAULT 0,
    start_time TIMESTAMPTZ DEFAULT now() NOT NULL,
    last_viewed TIMESTAMPTZ,
    stream_url TEXT,
    session_data JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Indexes for live streams
CREATE INDEX IF NOT EXISTS idx_live_streams_tenant ON dm3_video.live_streams(tenant_id);
CREATE INDEX IF NOT EXISTS idx_live_streams_camera ON dm3_video.live_streams(camera_id);
CREATE INDEX IF NOT EXISTS idx_live_streams_type ON dm3_video.live_streams(type);
CREATE INDEX IF NOT EXISTS idx_live_streams_active ON dm3_video.live_streams(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_live_streams_last_viewed ON dm3_video.live_streams(last_viewed DESC);

-- ============================================================
-- Video settings table — per-tenant video configuration
-- ============================================================
CREATE TABLE IF NOT EXISTS dm3_video.video_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL UNIQUE,
    default_retention_days INT DEFAULT 7,
    max_storage_gb BIGINT DEFAULT 1000,
    default_recording_quality VARCHAR(20) DEFAULT 'medium',
    default_streaming_quality VARCHAR(20) DEFAULT 'medium',
    motion_detection_enabled BOOLEAN DEFAULT true,
    auto_record_motion BOOLEAN DEFAULT false,
    motion_recording_duration INT DEFAULT 60, -- seconds
    storage_path TEXT DEFAULT '/var/lib/dm3/video',
    thumbnail_interval INT DEFAULT 10, -- seconds
    enable_cleanup_job BOOLEAN DEFAULT true,
    notification_settings JSONB DEFAULT '{}',
    advanced_settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Indexes for video settings
CREATE INDEX IF NOT EXISTS idx_video_settings_tenant ON dm3_video.video_settings(tenant_id);

-- ============================================================
-- Row Level Security for multi-tenancy
-- ============================================================
ALTER TABLE dm3_video.cameras ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON dm3_video.cameras;
CREATE POLICY tenant_isolation ON dm3_video.cameras
    USING (
        tenant_id = COALESCE(
            NULLIF(current_setting('app.current_tenant', true), '')::uuid,
            tenant_id
        )
    );

ALTER TABLE dm3_video.recordings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON dm3_video.recordings;
CREATE POLICY tenant_isolation ON dm3_video.recordings
    USING (
        tenant_id = COALESCE(
            NULLIF(current_setting('app.current_tenant', true), '')::uuid,
            tenant_id
        )
    );

ALTER TABLE dm3_video.motion_zones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON dm3_video.motion_zones;
CREATE POLICY tenant_isolation ON dm3_video.motion_zones
    USING (
        tenant_id = COALESCE(
            NULLIF(current_setting('app.current_tenant', true), '')::uuid,
            tenant_id
        )
    );

ALTER TABLE dm3_video.video_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON dm3_video.video_events;
CREATE POLICY tenant_isolation ON dm3_video.video_events
    USING (
        tenant_id = COALESCE(
            NULLIF(current_setting('app.current_tenant', true), '')::uuid,
            tenant_id
        )
    );

ALTER TABLE dm3_video.live_streams ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON dm3_video.live_streams;
CREATE POLICY tenant_isolation ON dm3_video.live_streams
    USING (
        tenant_id = COALESCE(
            NULLIF(current_setting('app.current_tenant', true), '')::uuid,
            tenant_id
        )
    );

ALTER TABLE dm3_video.video_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON dm3_video.video_settings;
CREATE POLICY tenant_isolation ON dm3_video.video_settings
    USING (
        tenant_id = COALESCE(
            NULLIF(current_setting('app.current_tenant', true), '')::uuid,
            tenant_id
        )
    );

-- ============================================================
-- Triggers for updated_at
-- ============================================================
DROP TRIGGER IF EXISTS update_cameras_updated_at ON dm3_video.cameras;
CREATE TRIGGER update_cameras_updated_at 
    BEFORE UPDATE ON dm3_video.cameras 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_recordings_updated_at ON dm3_video.recordings;
CREATE TRIGGER update_recordings_updated_at 
    BEFORE UPDATE ON dm3_video.recordings 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_motion_zones_updated_at ON dm3_video.motion_zones;
CREATE TRIGGER update_motion_zones_updated_at 
    BEFORE UPDATE ON dm3_video.motion_zones 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_video_events_updated_at ON dm3_video.video_events;
CREATE TRIGGER update_video_events_updated_at 
    BEFORE UPDATE ON dm3_video.video_events 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_live_streams_updated_at ON dm3_video.live_streams;
CREATE TRIGGER update_live_streams_updated_at 
    BEFORE UPDATE ON dm3_video.live_streams 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_video_settings_updated_at ON dm3_video.video_settings;
CREATE TRIGGER update_video_settings_updated_at 
    BEFORE UPDATE ON dm3_video.video_settings 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Views for common queries
-- ============================================================

-- Active cameras with status
CREATE OR REPLACE VIEW dm3_video.active_cameras AS
SELECT 
    c.id, c.tenant_id, c.name, c.location, c.type, c.brand, c.model,
    c.status, c.is_recording, c.is_streaming_live, c.has_motion_detection,
    c.resolution, c.fps, c.quality, c.last_seen,
    COUNT(r.id) FILTER (WHERE r.status = 'recording') as active_recordings,
    COUNT(ls.id) FILTER (WHERE ls.is_active = true) as active_streams,
    COUNT(ve.id) FILTER (WHERE ve.start_time >= CURRENT_DATE AND ve.is_acknowledged = false) as unacknowledged_events_today
FROM dm3_video.cameras c
LEFT JOIN dm3_video.recordings r ON c.id = r.camera_id AND r.deleted_at IS NULL
LEFT JOIN dm3_video.live_streams ls ON c.id = ls.camera_id
LEFT JOIN dm3_video.video_events ve ON c.id = ve.camera_id
WHERE c.is_active = true AND c.deleted_at IS NULL
GROUP BY c.id
ORDER BY c.name;

-- Recent video events
CREATE OR REPLACE VIEW dm3_video.recent_events AS
SELECT 
    ve.id, ve.tenant_id, ve.camera_id, ve.camera_name, ve.type, ve.severity,
    ve.title, ve.description, ve.snapshot_path, ve.start_time,
    ve.is_acknowledged, ve.acknowledged_by, ve.acknowledged_at,
    c.location as camera_location
FROM dm3_video.video_events ve
JOIN dm3_video.cameras c ON ve.camera_id = c.id
WHERE ve.start_time >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY ve.start_time DESC;

-- Motion detection summary
CREATE OR REPLACE VIEW dm3_video.motion_summary AS
SELECT 
    c.id as camera_id, c.name as camera_name, c.location,
    COUNT(mz.id) as motion_zones_count,
    COUNT(mz.id) FILTER (WHERE mz.is_active = true) as active_zones_count,
    COUNT(mz.id) FILTER (WHERE mz.is_armed = true) as armed_zones_count,
    COUNT(ve.id) FILTER (WHERE ve.type = 'motion' AND ve.start_time >= CURRENT_DATE) as motion_events_today
FROM dm3_video.cameras c
LEFT JOIN dm3_video.motion_zones mz ON c.id = mz.camera_id
LEFT JOIN dm3_video.video_events ve ON c.id = ve.camera_id
WHERE c.has_motion_detection = true AND c.deleted_at IS NULL
GROUP BY c.id, c.name, c.location
ORDER BY motion_events_today DESC, c.name;

-- Recording statistics
CREATE OR REPLACE VIEW dm3_video.recording_stats AS
SELECT 
    r.camera_id, c.name as camera_name,
    COUNT(*) as total_recordings,
    COUNT(*) FILTER (WHERE r.status = 'completed') as completed_recordings,
    COUNT(*) FILTER (WHERE r.type = 'motion') as motion_recordings,
    COUNT(*) FILTER (WHERE r.type = 'manual') as manual_recordings,
    COUNT(*) FILTER (WHERE r.start_time >= CURRENT_DATE - INTERVAL '7 days') as recordings_last_7_days,
    SUM(r.file_size) / 1024 / 1024 as total_size_mb,
    AVG(r.duration) as avg_duration_seconds,
    MAX(r.start_time) as last_recording_time
FROM dm3_video.recordings r
JOIN dm3_video.cameras c ON r.camera_id = c.id
WHERE r.deleted_at IS NULL
GROUP BY r.camera_id, c.name
ORDER BY total_recordings DESC;

-- Storage usage by camera
CREATE OR REPLACE VIEW dm3_video.storage_usage AS
SELECT 
    c.id as camera_id, c.name as camera_name, c.storage_quota,
    COUNT(r.id) as recording_count,
    COALESCE(SUM(r.file_size), 0) / 1024 / 1024 as used_mb,
    ROUND(
        COALESCE(SUM(r.file_size), 0) / 1024.0 / 1024.0 / 
        NULLIF(c.storage_quota, 0) * 100, 2
    ) as usage_percent,
    (c.storage_quota - COALESCE(SUM(r.file_size), 0) / 1024 / 1024) as available_mb
FROM dm3_video.cameras c
LEFT JOIN dm3_video.recordings r ON c.id = r.camera_id AND r.deleted_at IS NULL
WHERE c.deleted_at IS NULL
GROUP BY c.id, c.name, c.storage_quota
ORDER BY usage_percent DESC;

-- ============================================================
-- Functions for business logic
-- ============================================================

-- Check if camera is online and available
CREATE OR REPLACE FUNCTION dm3_video.is_camera_available(
    p_camera_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
    camera_status VARCHAR(50);
    last_seen_time TIMESTAMPTZ;
BEGIN
    SELECT status, last_seen INTO camera_status, last_seen_time
    FROM dm3_video.cameras
    WHERE id = p_camera_id AND is_active = true AND deleted_at IS NULL;
    
    IF NOT FOUND THEN
        RETURN false;
    END IF;
    
    -- Check if camera is online
    IF camera_status != 'online' THEN
        RETURN false;
    END IF;
    
    -- Check if last seen within 5 minutes (camera might be offline)
    IF last_seen_time IS NOT NULL AND last_seen_time < now() - INTERVAL '5 minutes' THEN
        RETURN false;
    END IF;
    
    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get camera storage usage
CREATE OR REPLACE FUNCTION dm3_video.get_camera_storage_usage(
    p_camera_id UUID
) RETURNS TABLE(
    used_mb BIGINT,
    quota_mb BIGINT,
    usage_percent NUMERIC,
    recording_count BIGINT,
    oldest_recording TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(SUM(r.file_size), 0) / 1024 / 1024,
        c.storage_quota,
        ROUND(
            COALESCE(SUM(r.file_size), 0) / 1024.0 / 1024.0 / 
            NULLIF(c.storage_quota, 0) * 100, 2
        ),
        COUNT(r.id),
        MIN(r.start_time)
    FROM dm3_video.cameras c
    LEFT JOIN dm3_video.recordings r ON c.id = r.camera_id AND r.deleted_at IS NULL
    WHERE c.id = p_camera_id AND c.deleted_at IS NULL
    GROUP BY c.storage_quota;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cleanup old recordings based on retention policy
CREATE OR REPLACE FUNCTION dm3_video.cleanup_old_recordings(
    p_tenant_id UUID DEFAULT NULL
) RETURNS TABLE(
    deleted_count BIGINT,
    freed_space_mb BIGINT
) AS $$
DECLARE
    total_deleted BIGINT := 0;
    total_freed BIGINT := 0;
    rec RECORD;
BEGIN
    -- Delete recordings older than retention_days for each camera
    FOR rec IN
        SELECT c.id as camera_id, c.retention_days
        FROM dm3_video.cameras c
        WHERE (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id)
          AND c.deleted_at IS NULL
          AND c.retention_days > 0
    LOOP
        WITH deleted_recordings AS (
            DELETE FROM dm3_video.recordings
            WHERE camera_id = rec.camera_id
              AND start_time < now() - (rec.retention_days || ' days')::INTERVAL
              AND deleted_at IS NULL
            RETURNING file_size
        )
        SELECT COUNT(*), COALESCE(SUM(file_size), 0) / 1024 / 1024
        INTO total_deleted, total_freed
        FROM deleted_recordings;
        
    END LOOP;
    
    RETURN QUERY VALUES (total_deleted, total_freed);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get motion detection zones for point coordinates
CREATE OR REPLACE FUNCTION dm3_video.get_zones_for_point(
    p_camera_id UUID,
    p_x NUMERIC,
    p_y NUMERIC
) RETURNS TABLE(
    zone_id UUID,
    zone_name VARCHAR(255),
    sensitivity INT
) AS $$
BEGIN
    RETURN QUERY
    SELECT mz.id, mz.name, mz.sensitivity
    FROM dm3_video.motion_zones mz
    WHERE mz.camera_id = p_camera_id
      AND mz.is_active = true
      AND mz.is_armed = true
      -- Simple point-in-polygon check (simplified for demo)
      -- In production, use proper geometric functions
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(mz.polygon) AS point
        WHERE (point->>'x')::NUMERIC <= p_x AND (point->>'y')::NUMERIC <= p_y
      );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Seed data for demo tenant
-- ============================================================

-- Default video settings
INSERT INTO dm3_video.video_settings (tenant_id) VALUES
('00000000-0000-0000-0000-000000000001')
ON CONFLICT (tenant_id) DO NOTHING;

-- Sample cameras
INSERT INTO dm3_video.cameras (tenant_id, name, description, location, type, brand, model, rtsp_url, resolution, fps, quality, status, created_by) VALUES
('00000000-0000-0000-0000-000000000001', 'Front Door Camera', 'Main entrance security camera', 'Front Door', 'ip_camera', 'Hikvision', 'DS-2CD2085FWD-I', 'rtsp://admin:admin123@192.168.1.100:554/stream1', '1920x1080', 25, 'high', 'offline', '00000000-0000-0000-0000-000000000001'),
('00000000-0000-0000-0000-000000000001', 'Lobby Camera', 'Reception area surveillance', 'Lobby', 'ip_camera', 'Axis', 'M3027-PVE', 'rtsp://root:pass@192.168.1.101:554/axis-media/media.amp', '1280x720', 30, 'medium', 'offline', '00000000-0000-0000-0000-000000000001'),
('00000000-0000-0000-0000-000000000001', 'Parking Lot Camera', 'Outdoor parking surveillance', 'Parking Lot', 'ip_camera', 'Dahua', 'IPC-HFW2831S-S-S2', 'rtsp://admin:admin@192.168.1.102:554/cam/realmonitor?channel=1&subtype=0', '1920x1080', 20, 'high', 'offline', '00000000-0000-0000-0000-000000000001'),
('00000000-0000-0000-0000-000000000001', 'Conference Room Cam', 'Meeting room recording', 'Conference Room A', 'ip_camera', 'Logitech', 'Rally Camera', 'rtsp://admin:password@192.168.1.103:554/stream', '1920x1080', 30, 'high', 'offline', '00000000-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;

-- Sample motion zones
INSERT INTO dm3_video.motion_zones (tenant_id, camera_id, name, description, polygon, sensitivity, actions) VALUES
('00000000-0000-0000-0000-000000000001', 
    (SELECT id FROM dm3_video.cameras WHERE name = 'Front Door Camera' AND tenant_id = '00000000-0000-0000-0000-000000000001'),
    'Door Entry Zone', 'Motion detection for door entry', 
    '[{"x":0.3,"y":0.3},{"x":0.7,"y":0.3},{"x":0.7,"y":0.8},{"x":0.3,"y":0.8}]'::jsonb, 
    70, ARRAY['record','alert']),
('00000000-0000-0000-0000-000000000001',
    (SELECT id FROM dm3_video.cameras WHERE name = 'Lobby Camera' AND tenant_id = '00000000-0000-0000-0000-000000000001'),
    'Reception Area', 'Main lobby motion detection',
    '[{"x":0.1,"y":0.2},{"x":0.9,"y":0.2},{"x":0.9,"y":0.9},{"x":0.1,"y":0.9}]'::jsonb,
    60, ARRAY['record','alert']),
('00000000-0000-0000-0000-000000000001',
    (SELECT id FROM dm3_video.cameras WHERE name = 'Parking Lot Camera' AND tenant_id = '00000000-0000-0000-0000-000000000001'),
    'Vehicle Zone', 'Parking area motion detection',
    '[{"x":0.0,"y":0.4},{"x":1.0,"y":0.4},{"x":1.0,"y":1.0},{"x":0.0,"y":1.0}]'::jsonb,
    50, ARRAY['record'])
ON CONFLICT DO NOTHING;

-- Sample video events
INSERT INTO dm3_video.video_events (tenant_id, camera_id, camera_name, type, severity, title, description, start_time) VALUES
('00000000-0000-0000-0000-000000000001',
    (SELECT id FROM dm3_video.cameras WHERE name = 'Front Door Camera' AND tenant_id = '00000000-0000-0000-0000-000000000001'),
    'Front Door Camera', 'motion', 'medium', 'Motion Detected', 'Motion detected at front entrance', now() - INTERVAL '2 hours'),
('00000000-0000-0000-0000-000000000001',
    (SELECT id FROM dm3_video.cameras WHERE name = 'Lobby Camera' AND tenant_id = '00000000-0000-0000-0000-000000000001'),
    'Lobby Camera', 'online', 'low', 'Camera Online', 'Camera came back online', now() - INTERVAL '1 hour'),
('00000000-0000-0000-0000-000000000001',
    (SELECT id FROM dm3_video.cameras WHERE name = 'Parking Lot Camera' AND tenant_id = '00000000-0000-0000-0000-000000000001'),
    'Parking Lot Camera', 'motion', 'low', 'Vehicle Motion', 'Vehicle detected in parking area', now() - INTERVAL '30 minutes')
ON CONFLICT DO NOTHING;

-- ============================================================
-- Comments for documentation
-- ============================================================
COMMENT ON SCHEMA dm3_video IS 'Video management service schema - cameras, recordings, motion detection';
COMMENT ON TABLE dm3_video.cameras IS 'IP cameras and video sources with connection details';
COMMENT ON TABLE dm3_video.recordings IS 'Video recording sessions with metadata and file information';
COMMENT ON TABLE dm3_video.motion_zones IS 'Motion detection zones within camera views';
COMMENT ON TABLE dm3_video.video_events IS 'Video-related events: motion, alarms, status changes';
COMMENT ON TABLE dm3_video.live_streams IS 'Active live streaming sessions';
COMMENT ON TABLE dm3_video.video_settings IS 'Per-tenant video service configuration';

COMMENT ON VIEW dm3_video.active_cameras IS 'Active cameras with real-time status and statistics';
COMMENT ON VIEW dm3_video.recent_events IS 'Recent video events across all cameras';
COMMENT ON VIEW dm3_video.motion_summary IS 'Motion detection summary by camera';
COMMENT ON VIEW dm3_video.recording_stats IS 'Recording statistics and metrics by camera';
COMMENT ON VIEW dm3_video.storage_usage IS 'Storage usage and quota tracking by camera';

COMMENT ON FUNCTION dm3_video.is_camera_available IS 'Check if camera is online and available for operations';
COMMENT ON FUNCTION dm3_video.get_camera_storage_usage IS 'Get storage usage statistics for specific camera';
COMMENT ON FUNCTION dm3_video.cleanup_old_recordings IS 'Clean up recordings older than retention policy';
COMMENT ON FUNCTION dm3_video.get_zones_for_point IS 'Find motion zones containing given coordinates';

-- Performance monitoring view for video service
CREATE OR REPLACE VIEW dm3_video.service_performance AS
SELECT 
    COUNT(*) as total_cameras,
    COUNT(*) FILTER (WHERE status = 'online') as online_cameras,
    COUNT(*) FILTER (WHERE is_recording = true) as recording_cameras,
    COUNT(*) FILTER (WHERE is_streaming_live = true) as streaming_cameras,
    (SELECT COUNT(*) FROM dm3_video.recordings WHERE status = 'recording') as active_recordings,
    (SELECT COUNT(*) FROM dm3_video.live_streams WHERE is_active = true) as active_streams,
    (SELECT COUNT(*) FROM dm3_video.video_events WHERE start_time >= CURRENT_DATE AND is_acknowledged = false) as unacknowledged_events_today,
    (SELECT SUM(file_size) / 1024 / 1024 / 1024 FROM dm3_video.recordings WHERE deleted_at IS NULL) as total_storage_gb
FROM dm3_video.cameras
WHERE deleted_at IS NULL;