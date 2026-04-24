-- ================================================================
-- 000053 — Make host_user_id nullable for visit_groups and
-- recurring_visit_templates (siblings of dm3_visitor.visits).
--
-- Mirror of migration 000052 for the Pre-register visit form. When
-- a tenant disables "Require host approval before visit", the host
-- is optional across ALL visitor entry points — single visits,
-- batch group registrations (e.g. open-house events), and recurring
-- templates. Otherwise the setting is half-applied and only the
-- single-visit form honors it, which is what users have been
-- reporting as a bug.
--
-- Existing rows are unaffected: they all have a host_user_id today.
-- Future rows MAY have NULL when approval_required is false.
-- ================================================================

ALTER TABLE dm3_visitor.visit_groups
    ALTER COLUMN host_user_id DROP NOT NULL;

ALTER TABLE dm3_visitor.recurring_visit_templates
    ALTER COLUMN host_user_id DROP NOT NULL;
