-- ============================================================
-- Migration 000037 (down): drop OAuth2 + API token plane
-- ============================================================

DROP TABLE IF EXISTS dm3_auth.oauth_device_codes;
DROP TABLE IF EXISTS dm3_auth.oauth_api_tokens;
DROP TABLE IF EXISTS dm3_auth.oauth_clients;
