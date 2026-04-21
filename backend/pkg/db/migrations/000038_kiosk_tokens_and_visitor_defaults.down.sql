ALTER TABLE dm3_visitor.visitor_settings
    DROP COLUMN IF EXISTS default_access_areas,
    DROP COLUMN IF EXISTS default_host_user_id;

DROP TABLE IF EXISTS dm3_auth.kiosk_tokens;
