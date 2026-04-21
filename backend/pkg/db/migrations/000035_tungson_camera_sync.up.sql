-- Track face sync state between cctv-svc and TungSon cameras
CREATE TABLE IF NOT EXISTS dm3_cctv.camera_face_sync_queue (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        UUID NOT NULL,
    camera_device_id UUID NOT NULL,
    user_id          UUID NOT NULL,
    action           VARCHAR(10) NOT NULL CHECK (action IN ('add', 'delete')),
    status           VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'confirmed', 'failed')),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at          TIMESTAMPTZ,
    confirmed_at     TIMESTAMPTZ,
    error_message    TEXT
);

CREATE INDEX IF NOT EXISTS idx_face_sync_queue_camera_status
    ON dm3_cctv.camera_face_sync_queue(camera_device_id, status);
CREATE INDEX IF NOT EXISTS idx_face_sync_queue_tenant
    ON dm3_cctv.camera_face_sync_queue(tenant_id);

-- Add TungSon-specific columns to cameras table
ALTER TABLE dm3_cctv.cameras
    ADD COLUMN IF NOT EXISTS camera_protocol VARCHAR(20) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS camera_ip INET;
