-- 000011: Visitor Management tables
-- Adds visitor directory, visit lifecycle, badge pool, and watchlist.

-- ─── Visitor directory (persistent across visits) ────────────────────────────

CREATE TABLE IF NOT EXISTS dm3_identity.visitors (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID NOT NULL,
    first_name        VARCHAR(100) NOT NULL,
    last_name         VARCHAR(100) NOT NULL,
    display_name      VARCHAR(200) GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED,
    email             VARCHAR(255),
    phone             VARCHAR(20),
    company           VARCHAR(200),
    national_id       VARCHAR(30),
    photo_ref         VARCHAR(500),
    watchlist_status  VARCHAR(20) DEFAULT 'none',
    watchlist_reason  TEXT,
    visit_count       INT DEFAULT 0,
    last_visit_at     TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_visitor_watchlist CHECK (watchlist_status IN ('none', 'vip', 'blacklisted'))
);

-- Dedup: unique email per tenant (where email is not null)
CREATE UNIQUE INDEX IF NOT EXISTS idx_visitors_tenant_email
    ON dm3_identity.visitors(tenant_id, email) WHERE email IS NOT NULL;

-- Dedup: unique phone per tenant (where phone is not null)
CREATE UNIQUE INDEX IF NOT EXISTS idx_visitors_tenant_phone
    ON dm3_identity.visitors(tenant_id, phone) WHERE phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_visitors_tenant
    ON dm3_identity.visitors(tenant_id);

CREATE INDEX IF NOT EXISTS idx_visitors_national_id
    ON dm3_identity.visitors(tenant_id, national_id) WHERE national_id IS NOT NULL;

-- ─── Visit lifecycle (one row per visit) ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS dm3_identity.visits (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL,
    visitor_id          UUID NOT NULL REFERENCES dm3_identity.visitors(id),
    host_user_id        UUID NOT NULL,
    purpose             VARCHAR(30) NOT NULL,
    purpose_note        VARCHAR(500),
    status              VARCHAR(20) NOT NULL DEFAULT 'pre_registered',
    expected_arrival    TIMESTAMPTZ NOT NULL,
    expected_departure  TIMESTAMPTZ,
    actual_checkin      TIMESTAMPTZ,
    actual_checkout     TIMESTAMPTZ,
    checkin_method      VARCHAR(30),
    checkin_device_id   UUID,
    checkin_photo_ref   VARCHAR(500),
    checkout_by         UUID,
    qr_token            VARCHAR(64) NOT NULL,
    qr_expires_at       TIMESTAMPTZ NOT NULL,
    badge_number        VARCHAR(20),
    temp_credential_id  UUID,
    access_areas        UUID[],
    escort_required     BOOLEAN DEFAULT false,
    vehicle_plate       VARCHAR(20),
    items_carried       TEXT,
    nda_signed          BOOLEAN DEFAULT false,
    host_approved       BOOLEAN DEFAULT false,
    host_approved_at    TIMESTAMPTZ,
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_visit_purpose CHECK (purpose IN (
        'meeting', 'interview', 'delivery', 'maintenance', 'tour', 'contract_signing', 'other'
    )),
    CONSTRAINT chk_visit_status CHECK (status IN (
        'pre_registered', 'approved', 'waiting', 'checked_in', 'checked_out', 'cancelled', 'no_show', 'rejected'
    )),
    CONSTRAINT chk_visit_checkin_method CHECK (checkin_method IS NULL OR checkin_method IN (
        'terminal_qr', 'terminal_manual', 'reception', 'self_service', 'mobile_qr'
    ))
);

-- Fast QR token lookup (public endpoint)
CREATE UNIQUE INDEX IF NOT EXISTS idx_visits_qr_token
    ON dm3_identity.visits(qr_token);

CREATE INDEX IF NOT EXISTS idx_visits_tenant_status
    ON dm3_identity.visits(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_visits_tenant_arrival
    ON dm3_identity.visits(tenant_id, expected_arrival);

CREATE INDEX IF NOT EXISTS idx_visits_host
    ON dm3_identity.visits(host_user_id);

CREATE INDEX IF NOT EXISTS idx_visits_visitor
    ON dm3_identity.visits(visitor_id);

-- ─── Visitor badge pool ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dm3_identity.visitor_badges (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL,
    visit_id      UUID NOT NULL REFERENCES dm3_identity.visits(id),
    badge_number  VARCHAR(20) NOT NULL,
    badge_type    VARCHAR(20) NOT NULL DEFAULT 'standard',
    issued_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    returned_at   TIMESTAMPTZ,
    printed       BOOLEAN DEFAULT false,
    print_data    JSONB,

    CONSTRAINT chk_badge_type CHECK (badge_type IN ('standard', 'vip', 'contractor', 'temporary'))
);

CREATE INDEX IF NOT EXISTS idx_badges_tenant_available
    ON dm3_identity.visitor_badges(tenant_id, returned_at) WHERE returned_at IS NULL;

-- ─── Watchlist (VIP / blacklist) ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dm3_identity.watchlist (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID NOT NULL,
    entry_type        VARCHAR(20) NOT NULL,
    match_field       VARCHAR(50) NOT NULL,
    match_value       VARCHAR(500) NOT NULL,
    face_template_ref VARCHAR(500),
    reason            TEXT NOT NULL,
    added_by          UUID NOT NULL,
    expires_at        TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_watchlist_type CHECK (entry_type IN ('vip', 'blacklisted')),
    CONSTRAINT chk_watchlist_field CHECK (match_field IN ('name', 'national_id', 'email', 'phone', 'face'))
);

CREATE INDEX IF NOT EXISTS idx_watchlist_tenant
    ON dm3_identity.watchlist(tenant_id, entry_type);

-- ─── Updated_at trigger ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION dm3_identity.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
    CREATE TRIGGER trg_visitors_updated_at BEFORE UPDATE ON dm3_identity.visitors
        FOR EACH ROW EXECUTE FUNCTION dm3_identity.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_visits_updated_at BEFORE UPDATE ON dm3_identity.visits
        FOR EACH ROW EXECUTE FUNCTION dm3_identity.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
