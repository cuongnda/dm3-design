-- ================================================================
-- 000052 — Make dm3_visitor.visits.host_user_id nullable.
--
-- The "Require host approval before visit" tenant setting controls
-- whether visits enter the pre_registered (awaiting approval) status
-- or are auto-approved on creation. When approval is OFF, a tenant
-- should be able to register a visit without naming a specific host
-- (e.g. open-house events, lobby kiosks where the visitor doesn't
-- know who they're meeting). The previous NOT NULL constraint forced
-- callers to invent a placeholder host even when the setting was off,
-- which made the setting effectively meaningless on the create-visit
-- form.
--
-- Existing rows are unaffected: they all have a host_user_id today.
-- Future rows MAY now have NULL when the tenant disables approval.
-- ================================================================

ALTER TABLE dm3_visitor.visits
    ALTER COLUMN host_user_id DROP NOT NULL;
