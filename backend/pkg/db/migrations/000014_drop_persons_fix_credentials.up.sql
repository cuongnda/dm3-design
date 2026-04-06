-- 000014: Drop old persons/auth.users tables, clean up credentials FK
-- persons → users rename and FK fix moved to migration 016 (after users table is created).

-- ============================================================
-- Rename persons → users if not done yet
-- (safe here before any DROP so data is preserved)
-- ============================================================
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'dm3_identity' AND table_name = 'persons'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'dm3_identity' AND table_name = 'users'
    ) THEN
        ALTER TABLE dm3_identity.persons RENAME TO users;
    END IF;
END $$;

-- Drop persons only if users already exists (rename already done above or by manual script)
DROP TABLE IF EXISTS dm3_identity.persons CASCADE;

-- ============================================================
-- Drop old dm3_auth.users (replaced by dm3_auth.accounts in migration 012)
-- ============================================================
DROP TABLE IF EXISTS dm3_auth.users CASCADE;

-- ============================================================
-- Clear stale credentials (person_id may ref old UUIDs that no longer exist)
-- FK will be re-added in migration 016 after dm3_identity.users is set up.
-- ============================================================
DELETE FROM dm3_identity.credentials;

ALTER TABLE dm3_identity.credentials
    DROP CONSTRAINT IF EXISTS credentials_person_id_fkey;

-- ============================================================
-- Trigger: when account status set to 'deleted', soft-delete linked identity user
-- ============================================================
CREATE OR REPLACE FUNCTION dm3_identity.on_account_deleted()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE dm3_identity.users
    SET is_deleted = true, status = 'deleted', updated_at = NOW()
    WHERE account_id = OLD.id AND (is_deleted = false OR is_deleted IS NULL);
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_account_deleted ON dm3_auth.accounts;
CREATE TRIGGER trg_account_deleted
    AFTER UPDATE ON dm3_auth.accounts
    FOR EACH ROW
    WHEN (NEW.status = 'deleted' AND OLD.status != 'deleted')
    EXECUTE FUNCTION dm3_identity.on_account_deleted();
