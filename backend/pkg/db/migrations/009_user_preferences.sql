-- 009_user_preferences.sql — user-level preferences (language)

-- Store UI language preference for auth flows and translated error messages.
ALTER TABLE dm3_auth.users ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(5) DEFAULT 'en';

-- Ensure existing rows have a value.
UPDATE dm3_auth.users
SET preferred_language = 'en'
WHERE preferred_language IS NULL;

