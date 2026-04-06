DROP TABLE IF EXISTS dm3_auth.refresh_tokens CASCADE;
ALTER TABLE dm3_auth.users DROP COLUMN IF EXISTS updated_at;
DELETE FROM dm3_auth.users WHERE email = 'admin@duali.com';
