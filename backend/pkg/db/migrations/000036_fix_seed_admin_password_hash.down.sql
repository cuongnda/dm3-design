-- Irreversible: we cannot restore the broken hash without re-breaking login
-- for anyone currently authenticating with it. Down is a no-op.
SELECT 1;
