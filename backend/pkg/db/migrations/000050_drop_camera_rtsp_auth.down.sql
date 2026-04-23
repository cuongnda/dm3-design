-- Restore rtsp_username / rtsp_password_enc columns. Data from the dropped
-- columns is not preserved — operators re-enter credentials (now embedded in
-- rtsp_url by default; these columns exist only for legacy compatibility).
ALTER TABLE dm3_cctv.cameras
    ADD COLUMN IF NOT EXISTS rtsp_username     TEXT,
    ADD COLUMN IF NOT EXISTS rtsp_password_enc BYTEA;
