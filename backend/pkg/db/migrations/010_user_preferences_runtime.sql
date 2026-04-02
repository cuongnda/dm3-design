-- 010_user_preferences_runtime.sql — user UI runtime prefs (timezone, session timeout)

ALTER TABLE dm3_auth.users
  ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'Asia/Ho_Chi_Minh';

ALTER TABLE dm3_auth.users
  ADD COLUMN IF NOT EXISTS session_timeout_minutes INT DEFAULT 30;

-- Backfill existing rows
UPDATE dm3_auth.users
SET timezone = 'Asia/Ho_Chi_Minh'
WHERE timezone IS NULL;

UPDATE dm3_auth.users
SET session_timeout_minutes = 30
WHERE session_timeout_minutes IS NULL;

