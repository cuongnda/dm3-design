-- Reverse 000044_cctv_hanet_settings.up.sql.

ALTER TABLE dm3_cctv.cctv_settings
    DROP COLUMN IF EXISTS hanet_place_id,
    DROP COLUMN IF EXISTS hanet_server_url,
    DROP COLUMN IF EXISTS hanet_refresh_token_enc,
    DROP COLUMN IF EXISTS hanet_access_token_enc,
    DROP COLUMN IF EXISTS hanet_client_secret_enc,
    DROP COLUMN IF EXISTS hanet_client_id;
