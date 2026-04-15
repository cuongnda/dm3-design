-- ============================================================
-- 000020: Account lockout — second half of P1.2 (security review C1).
--
-- IP-based rate limiting alone (added in 000019 era) does not stop an
-- attacker who rotates source IPs; it only slows distributed brute force
-- against a single endpoint. Per-account lockout closes the gap by
-- counting consecutive failures against an *account* and freezing it
-- after a threshold, regardless of where the attempts come from.
--
-- Policy enforced in code (internal/authsvc/handlers.go::Login):
--   - Each failed bcrypt compare → failed_attempts += 1
--   - On reaching 5 failures → locked_until := now() + 15 min
--   - Successful login → failed_attempts := 0, locked_until := NULL
--   - While locked_until > now() the login handler short-circuits with
--     a generic auth.invalid_credentials response (do NOT leak whether
--     the account is locked vs. the password is wrong — this would help
--     enumeration).
-- ============================================================

ALTER TABLE dm3_auth.accounts
    ADD COLUMN IF NOT EXISTS failed_attempts INT          NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS locked_until    TIMESTAMPTZ;

-- Partial index: most rows have locked_until IS NULL; we only need to
-- look at currently locked rows (e.g. for an admin "unlock" view).
CREATE INDEX IF NOT EXISTS idx_accounts_locked_until
    ON dm3_auth.accounts(locked_until)
    WHERE locked_until IS NOT NULL;
