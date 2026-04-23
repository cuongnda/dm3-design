-- Drop rtsp_username and rtsp_password_enc from cameras.
-- Operators embed credentials directly in rtsp_url
-- ("rtsp://user:pass@host/path") — different camera brands format the URL
-- differently, so the backend no longer normalises auth for them.
ALTER TABLE dm3_cctv.cameras
    DROP COLUMN IF EXISTS rtsp_username,
    DROP COLUMN IF EXISTS rtsp_password_enc;
