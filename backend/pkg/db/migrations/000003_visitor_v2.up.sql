-- Migration 000003: Visitor Management V2
-- Adds per-tenant visitor settings, visit groups, visitor access log,
-- recurring visit templates, visitor agreements, and visits table alterations.

-- ─── Per-tenant visitor configuration ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dm3_identity.visitor_settings (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL UNIQUE,

    -- Approval workflow
    approval_required       BOOLEAN NOT NULL DEFAULT true,
    auto_approve_returning  BOOLEAN NOT NULL DEFAULT false,
    auto_approve_vip        BOOLEAN NOT NULL DEFAULT true,
    approver_user_ids       UUID[] DEFAULT '{}',
    approval_timeout_hours  INT NOT NULL DEFAULT 24,

    -- Visit duration
    default_duration_hours  INT NOT NULL DEFAULT 8,
    max_duration_hours      INT NOT NULL DEFAULT 24,
    auto_checkout_hour      INT NOT NULL DEFAULT 22,
    no_show_grace_minutes   INT NOT NULL DEFAULT 120,

    -- QR settings
    qr_validity_before_hours INT NOT NULL DEFAULT 1,
    qr_validity_after_hours  INT NOT NULL DEFAULT 4,

    -- Required fields
    require_email           BOOLEAN NOT NULL DEFAULT false,
    require_phone           BOOLEAN NOT NULL DEFAULT true,
    require_national_id     BOOLEAN NOT NULL DEFAULT false,
    require_company         BOOLEAN NOT NULL DEFAULT false,
    require_photo           BOOLEAN NOT NULL DEFAULT false,
    require_nda             BOOLEAN NOT NULL DEFAULT false,

    -- Badge settings
    badge_enabled           BOOLEAN NOT NULL DEFAULT true,
    badge_auto_assign       BOOLEAN NOT NULL DEFAULT false,
    badge_prefix            VARCHAR(10) NOT NULL DEFAULT 'V',
    badge_pool_size         INT NOT NULL DEFAULT 100,

    -- Notifications
    notify_host_on_arrival  BOOLEAN NOT NULL DEFAULT true,
    notify_host_on_register BOOLEAN NOT NULL DEFAULT false,
    notify_method           VARCHAR(20) NOT NULL DEFAULT 'in_app',

    -- Purposes allowed (NULL = all allowed)
    allowed_purposes        VARCHAR(30)[] DEFAULT NULL,

    -- Self-service / kiosk
    self_service_enabled    BOOLEAN NOT NULL DEFAULT false,
    self_service_requires_qr BOOLEAN NOT NULL DEFAULT true,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_notify_method CHECK (notify_method IN ('in_app', 'email', 'sms', 'email_and_sms')),
    CONSTRAINT chk_auto_checkout_hour CHECK (auto_checkout_hour BETWEEN 0 AND 23),
    CONSTRAINT chk_no_show_grace CHECK (no_show_grace_minutes > 0)
);

CREATE TRIGGER trg_visitor_settings_updated_at BEFORE UPDATE ON dm3_identity.visitor_settings
    FOR EACH ROW EXECUTE FUNCTION dm3_identity.set_updated_at();

-- ─── Visit groups (batch / conference visits) ────────────────────────────────

CREATE TABLE IF NOT EXISTS dm3_identity.visit_groups (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL,
    name                VARCHAR(200) NOT NULL,
    description         TEXT,
    host_user_id        UUID NOT NULL,
    purpose             VARCHAR(30) NOT NULL,
    expected_arrival    TIMESTAMPTZ NOT NULL,
    expected_departure  TIMESTAMPTZ,
    access_areas        UUID[],
    escort_required     BOOLEAN NOT NULL DEFAULT false,
    created_by          UUID NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_visit_groups_tenant
    ON dm3_identity.visit_groups(tenant_id, created_at DESC);

CREATE TRIGGER trg_visit_groups_updated_at BEFORE UPDATE ON dm3_identity.visit_groups
    FOR EACH ROW EXECUTE FUNCTION dm3_identity.set_updated_at();

-- ─── Visitor access log (correlates access events with visits) ───────────────

CREATE TABLE IF NOT EXISTS dm3_identity.visitor_access_log (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID NOT NULL,
    visit_id          UUID NOT NULL REFERENCES dm3_identity.visits(id),
    visitor_id        UUID NOT NULL REFERENCES dm3_identity.visitors(id),
    access_event_id   UUID,
    access_point_id   UUID,
    access_point_name VARCHAR(255),
    zone_id           UUID,
    zone_name         VARCHAR(255),
    direction         VARCHAR(10),
    decision          VARCHAR(20) NOT NULL,
    event_time        TIMESTAMPTZ NOT NULL DEFAULT now(),
    credential_type   VARCHAR(50),
    metadata          JSONB,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_visitor_access_log_visit
    ON dm3_identity.visitor_access_log(visit_id, event_time DESC);
CREATE INDEX IF NOT EXISTS idx_visitor_access_log_tenant_time
    ON dm3_identity.visitor_access_log(tenant_id, event_time DESC);
CREATE INDEX IF NOT EXISTS idx_visitor_access_log_visitor
    ON dm3_identity.visitor_access_log(visitor_id, event_time DESC);

-- ─── Recurring visit templates ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dm3_identity.recurring_visit_templates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    visitor_id      UUID NOT NULL REFERENCES dm3_identity.visitors(id),
    host_user_id    UUID NOT NULL,
    purpose         VARCHAR(30) NOT NULL,
    access_areas    UUID[],
    escort_required BOOLEAN NOT NULL DEFAULT false,
    recurrence_rule VARCHAR(200) NOT NULL,
    start_date      DATE NOT NULL,
    end_date        DATE,
    active          BOOLEAN NOT NULL DEFAULT true,
    last_generated  DATE,
    created_by      UUID NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recurring_templates_tenant_active
    ON dm3_identity.recurring_visit_templates(tenant_id, active) WHERE active = true;

CREATE TRIGGER trg_recurring_templates_updated_at BEFORE UPDATE ON dm3_identity.recurring_visit_templates
    FOR EACH ROW EXECUTE FUNCTION dm3_identity.set_updated_at();

-- ─── Visitor agreements / NDA ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dm3_identity.visitor_agreements (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL,
    name          VARCHAR(200) NOT NULL,
    content       TEXT NOT NULL,
    version       INT NOT NULL DEFAULT 1,
    active        BOOLEAN NOT NULL DEFAULT true,
    required_for  VARCHAR(30)[] DEFAULT '{}',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_visitor_agreements_tenant
    ON dm3_identity.visitor_agreements(tenant_id, active) WHERE active = true;

CREATE TRIGGER trg_visitor_agreements_updated_at BEFORE UPDATE ON dm3_identity.visitor_agreements
    FOR EACH ROW EXECUTE FUNCTION dm3_identity.set_updated_at();

CREATE TABLE IF NOT EXISTS dm3_identity.visitor_agreement_signatures (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL,
    visit_id      UUID NOT NULL REFERENCES dm3_identity.visits(id),
    agreement_id  UUID NOT NULL REFERENCES dm3_identity.visitor_agreements(id),
    visitor_id    UUID NOT NULL REFERENCES dm3_identity.visitors(id),
    signature_ref VARCHAR(500),
    signed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agreement_sigs_visit
    ON dm3_identity.visitor_agreement_signatures(visit_id);

-- ─── Alterations to existing visits table ────────────────────────────────────

ALTER TABLE dm3_identity.visits
    ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES dm3_identity.visit_groups(id),
    ADD COLUMN IF NOT EXISTS recurring_template_id UUID REFERENCES dm3_identity.recurring_visit_templates(id),
    ADD COLUMN IF NOT EXISTS cancelled_reason VARCHAR(200),
    ADD COLUMN IF NOT EXISTS rejection_reason VARCHAR(200),
    ADD COLUMN IF NOT EXISTS approved_by UUID,
    ADD COLUMN IF NOT EXISTS checkout_reason VARCHAR(30) DEFAULT 'manual',
    ADD COLUMN IF NOT EXISTS reinvite_count INT NOT NULL DEFAULT 0;

-- Index for group-based queries
CREATE INDEX IF NOT EXISTS idx_visits_group_id
    ON dm3_identity.visits(group_id) WHERE group_id IS NOT NULL;
