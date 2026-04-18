-- Migration 000004: Visitor Schema Isolation
-- Moves all visitor-related tables from dm3_identity to a new dm3_visitor schema.
-- Data, indexes, and constraints are preserved via ALTER TABLE ... SET SCHEMA.
-- Cross-schema references (to dm3_identity.users, dm3_access.zones, etc.) are
-- intentionally kept as implicit UUID references without FK constraints — the
-- application layer enforces referential integrity across schema boundaries.

-- ─── Create new schema ────────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS dm3_visitor;

-- ─── Recreate set_updated_at trigger function in dm3_visitor ─────────────────

CREATE OR REPLACE FUNCTION dm3_visitor.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── Move tables (dependency order: no intra-visitor FKs first) ──────────────

-- 1. visitors (no intra-visitor FK dependencies)
ALTER TABLE dm3_identity.visitors SET SCHEMA dm3_visitor;

-- 2. visitor_settings (no intra-visitor FK dependencies)
ALTER TABLE dm3_identity.visitor_settings SET SCHEMA dm3_visitor;

-- 3. visit_groups (no intra-visitor FK dependencies)
ALTER TABLE dm3_identity.visit_groups SET SCHEMA dm3_visitor;

-- 4. visitor_agreements (no intra-visitor FK dependencies)
ALTER TABLE dm3_identity.visitor_agreements SET SCHEMA dm3_visitor;

-- 5. watchlist (no intra-visitor FK dependencies)
ALTER TABLE dm3_identity.watchlist SET SCHEMA dm3_visitor;

-- 6. visits (references visitors and visit_groups)
ALTER TABLE dm3_identity.visits SET SCHEMA dm3_visitor;

-- 7. recurring_visit_templates (references visitors)
ALTER TABLE dm3_identity.recurring_visit_templates SET SCHEMA dm3_visitor;

-- 8. visitor_badges (references visits)
ALTER TABLE dm3_identity.visitor_badges SET SCHEMA dm3_visitor;

-- 9. visitor_access_log (references visits and visitors)
ALTER TABLE dm3_identity.visitor_access_log SET SCHEMA dm3_visitor;

-- 10. visitor_agreement_signatures (references visits, visitor_agreements, visitors)
ALTER TABLE dm3_identity.visitor_agreement_signatures SET SCHEMA dm3_visitor;

-- ─── Update triggers to use dm3_visitor.set_updated_at() ─────────────────────

-- visitors
DROP TRIGGER IF EXISTS trg_visitors_updated_at ON dm3_visitor.visitors;
CREATE TRIGGER trg_visitors_updated_at BEFORE UPDATE ON dm3_visitor.visitors
    FOR EACH ROW EXECUTE FUNCTION dm3_visitor.set_updated_at();

-- visits
DROP TRIGGER IF EXISTS trg_visits_updated_at ON dm3_visitor.visits;
CREATE TRIGGER trg_visits_updated_at BEFORE UPDATE ON dm3_visitor.visits
    FOR EACH ROW EXECUTE FUNCTION dm3_visitor.set_updated_at();

-- visitor_settings
DROP TRIGGER IF EXISTS trg_visitor_settings_updated_at ON dm3_visitor.visitor_settings;
CREATE TRIGGER trg_visitor_settings_updated_at BEFORE UPDATE ON dm3_visitor.visitor_settings
    FOR EACH ROW EXECUTE FUNCTION dm3_visitor.set_updated_at();

-- visit_groups
DROP TRIGGER IF EXISTS trg_visit_groups_updated_at ON dm3_visitor.visit_groups;
CREATE TRIGGER trg_visit_groups_updated_at BEFORE UPDATE ON dm3_visitor.visit_groups
    FOR EACH ROW EXECUTE FUNCTION dm3_visitor.set_updated_at();

-- recurring_visit_templates
DROP TRIGGER IF EXISTS trg_recurring_templates_updated_at ON dm3_visitor.recurring_visit_templates;
CREATE TRIGGER trg_recurring_templates_updated_at BEFORE UPDATE ON dm3_visitor.recurring_visit_templates
    FOR EACH ROW EXECUTE FUNCTION dm3_visitor.set_updated_at();

-- visitor_agreements
DROP TRIGGER IF EXISTS trg_visitor_agreements_updated_at ON dm3_visitor.visitor_agreements;
CREATE TRIGGER trg_visitor_agreements_updated_at BEFORE UPDATE ON dm3_visitor.visitor_agreements
    FOR EACH ROW EXECUTE FUNCTION dm3_visitor.set_updated_at();
