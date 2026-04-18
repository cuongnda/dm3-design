DROP INDEX IF EXISTS dm3_auth.idx_accounts_locked_until;

ALTER TABLE dm3_auth.accounts
    DROP COLUMN IF EXISTS locked_until,
    DROP COLUMN IF EXISTS failed_attempts;
