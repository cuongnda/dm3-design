DELETE FROM dm3_auth.users WHERE email = 'sysadmin@duali.com';
ALTER TABLE dm3_auth.users DROP COLUMN IF EXISTS role;
ALTER TABLE dm3_auth.users DROP COLUMN IF EXISTS company_id;
DROP TABLE IF EXISTS dm3_auth.companies CASCADE;
