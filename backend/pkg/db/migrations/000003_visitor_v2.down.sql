-- Rollback migration 000003: Visitor Management V2

ALTER TABLE dm3_identity.visits
    DROP COLUMN IF EXISTS group_id,
    DROP COLUMN IF EXISTS recurring_template_id,
    DROP COLUMN IF EXISTS cancelled_reason,
    DROP COLUMN IF EXISTS rejection_reason,
    DROP COLUMN IF EXISTS approved_by,
    DROP COLUMN IF EXISTS checkout_reason,
    DROP COLUMN IF EXISTS reinvite_count;

DROP TABLE IF EXISTS dm3_identity.visitor_agreement_signatures;
DROP TABLE IF EXISTS dm3_identity.visitor_agreements;
DROP TABLE IF EXISTS dm3_identity.recurring_visit_templates;
DROP TABLE IF EXISTS dm3_identity.visitor_access_log;
DROP TABLE IF EXISTS dm3_identity.visit_groups;
DROP TABLE IF EXISTS dm3_identity.visitor_settings;
