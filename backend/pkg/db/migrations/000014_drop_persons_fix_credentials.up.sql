-- 000014: Drop old persons/auth.users tables, fix credentials FK
-- dm3_identity.persons was renamed to dm3_identity.users in migration 013
-- dm3_auth.users was replaced by dm3_auth.accounts in migration 013

-- ============================================================
-- Drop old dm3_auth.users (replaced by dm3_auth.accounts)
-- ============================================================
DROP TABLE IF EXISTS dm3_auth.users CASCADE;

-- ============================================================
-- Drop persons if somehow still exists (edge case: 013 not run)
-- ============================================================
DROP TABLE IF EXISTS dm3_identity.persons CASCADE;

-- ============================================================
-- Fix credentials FK: person_id → dm3_identity.users(id)
-- ============================================================
ALTER TABLE dm3_identity.credentials
    DROP CONSTRAINT IF EXISTS credentials_person_id_fkey;

ALTER TABLE dm3_identity.credentials
    ADD CONSTRAINT credentials_person_id_fkey
    FOREIGN KEY (person_id) REFERENCES dm3_identity.users(id) ON DELETE CASCADE;

-- ============================================================
-- Add cascade: when account deleted, soft-delete linked identity user
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
    WHEN (NEW.is_deleted = true AND OLD.is_deleted = false)
    EXECUTE FUNCTION dm3_identity.on_account_deleted();
