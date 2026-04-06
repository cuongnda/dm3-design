-- 000015: Drop legacy users/persons tables, migrate to accounts

-- 1. Make company_id nullable in accounts (system_admin has no company)
ALTER TABLE dm3_auth.accounts ALTER COLUMN company_id DROP NOT NULL;

-- 2. Migrate system_admin users from dm3_auth.users → dm3_auth.accounts
--    (company users should already be in accounts from migration 012)
--    Note: dm3_auth.users may already be dropped by migration 014 on some environments.
--    The INSERT is conditional on the table existing; if not, this is a no-op.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'dm3_auth' AND table_name = 'users') THEN
        INSERT INTO dm3_auth.accounts (id, company_id, email, password_hash, first_name, role, status, last_login, locale, timezone, created_at, updated_at)
        SELECT
            u.id,
            u.company_id,
            u.email,
            u.password_hash,
            u.name,
            COALESCE(u.role, 'viewer'),
            COALESCE(u.status, 'active'),
            u.last_login,
            COALESCE(u.preferred_language, 'vi'),
            COALESCE(u.timezone, 'Asia/Saigon'),
            u.created_at,
            COALESCE(u.updated_at, u.created_at)
        FROM dm3_auth.users u
        WHERE NOT EXISTS (
            SELECT 1 FROM dm3_auth.accounts a
            WHERE a.email = u.email
            AND (a.company_id = u.company_id OR (a.company_id IS NULL AND u.company_id IS NULL))
        )
        ON CONFLICT DO NOTHING;
    END IF;
END$$;

-- 3. Update refresh_tokens FK: user_id now references accounts
ALTER TABLE dm3_auth.refresh_tokens DROP CONSTRAINT IF EXISTS refresh_tokens_user_id_fkey;
ALTER TABLE dm3_auth.refresh_tokens ADD CONSTRAINT refresh_tokens_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES dm3_auth.accounts(id) ON DELETE CASCADE;

-- 4. Drop legacy auth tables (if still present)
DROP TABLE IF EXISTS dm3_auth.user_companies CASCADE;
DROP TABLE IF EXISTS dm3_auth.users CASCADE;

-- 5. Drop legacy identity tables (if still present)
DROP TABLE IF EXISTS dm3_identity.person_group_members CASCADE;
DROP TABLE IF EXISTS dm3_identity.person_groups CASCADE;
DROP TABLE IF EXISTS dm3_identity.persons CASCADE;
