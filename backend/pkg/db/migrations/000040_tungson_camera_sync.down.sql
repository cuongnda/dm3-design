ALTER TABLE dm3_cctv.cameras DROP COLUMN IF EXISTS camera_ip;
ALTER TABLE dm3_cctv.cameras DROP COLUMN IF EXISTS last_heartbeat_at;
ALTER TABLE dm3_cctv.cameras DROP COLUMN IF EXISTS camera_protocol;
DROP TABLE IF EXISTS dm3_cctv.camera_face_sync_queue;
