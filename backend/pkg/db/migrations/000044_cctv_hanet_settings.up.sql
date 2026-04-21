-- Hanet integration config for CCTV. Tokens are encrypted at rest with the
-- existing AES-256-GCM cipher used for RTSP passwords (internal/cctv/crypto.go),
-- so the key material never lives in plaintext on disk or in audit logs.
--
-- `hanet_server_url` defaults to the public Hanet partner host. Tenants on a
-- private Hanet deployment override it. Place_id is stored as TEXT because
-- Hanet returns it as a string in the /place/getPlaces payload — parsing to
-- int would force an unnecessary conversion on every save.

ALTER TABLE dm3_cctv.cctv_settings
    ADD COLUMN IF NOT EXISTS hanet_client_id          VARCHAR(200),
    ADD COLUMN IF NOT EXISTS hanet_client_secret_enc  BYTEA,
    ADD COLUMN IF NOT EXISTS hanet_access_token_enc   BYTEA,
    ADD COLUMN IF NOT EXISTS hanet_refresh_token_enc  BYTEA,
    ADD COLUMN IF NOT EXISTS hanet_server_url         VARCHAR(500) NOT NULL DEFAULT 'https://partner.hanet.ai',
    ADD COLUMN IF NOT EXISTS hanet_place_id           VARCHAR(100);

COMMENT ON COLUMN dm3_cctv.cctv_settings.hanet_client_secret_enc IS
    'AES-GCM ciphertext produced by internal/cctv/crypto.go. Never logged in plaintext.';
COMMENT ON COLUMN dm3_cctv.cctv_settings.hanet_access_token_enc IS
    'AES-GCM ciphertext. Rotated via refresh flow when Hanet returns 401.';
COMMENT ON COLUMN dm3_cctv.cctv_settings.hanet_refresh_token_enc IS
    'AES-GCM ciphertext. Used to mint a fresh access_token via Hanet OAuth token endpoint.';
COMMENT ON COLUMN dm3_cctv.cctv_settings.hanet_server_url IS
    'Hanet partner API base URL. Defaults to https://partner.hanet.ai.';
COMMENT ON COLUMN dm3_cctv.cctv_settings.hanet_place_id IS
    'Active Hanet place_id (string as Hanet returns it).';
