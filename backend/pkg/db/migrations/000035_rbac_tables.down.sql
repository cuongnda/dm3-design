-- ============================================================
-- Migration 000035 (down): Revert RBAC foundation
-- ============================================================

DROP TABLE IF EXISTS dm3_auth.user_role_assignments;
DROP TABLE IF EXISTS dm3_auth.company_role_permissions;
DROP TABLE IF EXISTS dm3_auth.company_roles;

ALTER TABLE dm3_auth.accounts DROP CONSTRAINT IF EXISTS accounts_role_check;
ALTER TABLE dm3_auth.accounts
    ADD CONSTRAINT accounts_role_check
    CHECK (role IN ('system_admin','primary_manager','manager','operator','viewer'));
