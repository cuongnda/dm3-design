ALTER TABLE dm3_auth.users
    DROP COLUMN IF EXISTS timezone,
    DROP COLUMN IF EXISTS session_timeout_minutes;
