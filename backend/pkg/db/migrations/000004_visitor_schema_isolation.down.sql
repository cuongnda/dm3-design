-- Rollback migration 000004: Visitor Schema Isolation
-- Moves all visitor-related tables back from dm3_visitor to dm3_identity.
-- Triggers are restored to use dm3_identity.set_updated_at().

-- ─── Move tables back (reverse dependency order: dependents first) ────────────

-- 10. visitor_agreement_signatures (references visits, visitor_agreements, visitors)
ALTER TABLE dm3_visitor.visitor_agreement_signatures SET SCHEMA dm3_identity;

-- 9. visitor_access_log (references visits and visitors)
ALTER TABLE dm3_visitor.visitor_access_log SET SCHEMA dm3_identity;

-- 8. visitor_badges (references visits)
ALTER TABLE dm3_visitor.visitor_badges SET SCHEMA dm3_identity;

-- 7. recurring_visit_templates (references visitors)
ALTER TABLE dm3_visitor.recurring_visit_templates SET SCHEMA dm3_identity;

-- 6. visits (references visitors and visit_groups)
ALTER TABLE dm3_visitor.visits SET SCHEMA dm3_identity;

-- 5. watchlist (no intra-visitor FK dependencies)
ALTER TABLE dm3_visitor.watchlist SET SCHEMA dm3_identity;

-- 4. visitor_agreements (no intra-visitor FK dependencies)
ALTER TABLE dm3_visitor.visitor_agreements SET SCHEMA dm3_identity;

-- 3. visit_groups (no intra-visitor FK dependencies)
ALTER TABLE dm3_visitor.visit_groups SET SCHEMA dm3_identity;

-- 2. visitor_settings (no intra-visitor FK dependencies)
ALTER TABLE dm3_visitor.visitor_settings SET SCHEMA dm3_identity;

-- 1. visitors (no intra-visitor FK dependencies)
ALTER TABLE dm3_visitor.visitors SET SCHEMA dm3_identity;

-- ─── Restore triggers to use dm3_identity.set_updated_at() ───────────────────

-- visitors
DROP TRIGGER IF EXISTS trg_visitors_updated_at ON dm3_identity.visitors;
DO $$ BEGIN
    CREATE TRIGGER trg_visitors_updated_at BEFORE UPDATE ON dm3_identity.visitors
        FOR EACH ROW EXECUTE FUNCTION dm3_identity.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- visits
DROP TRIGGER IF EXISTS trg_visits_updated_at ON dm3_identity.visits;
DO $$ BEGIN
    CREATE TRIGGER trg_visits_updated_at BEFORE UPDATE ON dm3_identity.visits
        FOR EACH ROW EXECUTE FUNCTION dm3_identity.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- visitor_settings
DROP TRIGGER IF EXISTS trg_visitor_settings_updated_at ON dm3_identity.visitor_settings;
CREATE TRIGGER trg_visitor_settings_updated_at BEFORE UPDATE ON dm3_identity.visitor_settings
    FOR EACH ROW EXECUTE FUNCTION dm3_identity.set_updated_at();

-- visit_groups
DROP TRIGGER IF EXISTS trg_visit_groups_updated_at ON dm3_identity.visit_groups;
CREATE TRIGGER trg_visit_groups_updated_at BEFORE UPDATE ON dm3_identity.visit_groups
    FOR EACH ROW EXECUTE FUNCTION dm3_identity.set_updated_at();

-- recurring_visit_templates
DROP TRIGGER IF EXISTS trg_recurring_templates_updated_at ON dm3_identity.recurring_visit_templates;
CREATE TRIGGER trg_recurring_templates_updated_at BEFORE UPDATE ON dm3_identity.recurring_visit_templates
    FOR EACH ROW EXECUTE FUNCTION dm3_identity.set_updated_at();

-- visitor_agreements
DROP TRIGGER IF EXISTS trg_visitor_agreements_updated_at ON dm3_identity.visitor_agreements;
CREATE TRIGGER trg_visitor_agreements_updated_at BEFORE UPDATE ON dm3_identity.visitor_agreements
    FOR EACH ROW EXECUTE FUNCTION dm3_identity.set_updated_at();

-- ─── Drop dm3_visitor schema (now empty) ──────────────────────────────────────

DROP FUNCTION IF EXISTS dm3_visitor.set_updated_at();
DROP SCHEMA IF EXISTS dm3_visitor;
