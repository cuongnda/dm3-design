-- 012_visitor_service.sql — Visitor Management Service Tables

-- Schema for visitor service
CREATE SCHEMA IF NOT EXISTS dm3_visitor;

-- ============================================================
-- Visitors table — main visitor records
-- ============================================================
CREATE TABLE IF NOT EXISTS dm3_visitor.visitors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    visitor_type VARCHAR(50) NOT NULL DEFAULT 'guest', -- guest, contractor, delivery, interview, etc.
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    company VARCHAR(255),
    id_number VARCHAR(100), -- Government ID (masked/hashed)
    vehicle_plate VARCHAR(20),
    purpose TEXT NOT NULL,
    host_id UUID, -- FK to visitor_hosts.id or dm3_identity.persons.id
    host_name VARCHAR(255),
    host_email VARCHAR(255),
    host_phone VARCHAR(50),
    status VARCHAR(50) NOT NULL DEFAULT 'waiting', -- pre_registered, waiting, approved, checked_in, checked_out, rejected, expired, no_show
    photo_url VARCHAR(500),
    badge_printed BOOLEAN DEFAULT false,
    badge_number VARCHAR(50),
    scheduled_at TIMESTAMPTZ, -- when visitor plans to arrive
    valid_from TIMESTAMPTZ, -- when authorization becomes valid
    valid_until TIMESTAMPTZ, -- when authorization expires
    checked_in_at TIMESTAMPTZ,
    checked_out_at TIMESTAMPTZ,
    checked_in_by UUID, -- user who checked in the visitor
    checked_out_by UUID, -- user who checked out the visitor
    access_zones JSONB DEFAULT '[]', -- ["lobby", "office", "meeting"] - zones visitor can access
    metadata JSONB DEFAULT '{}', -- additional visitor data, custom fields
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    created_by UUID, -- user who created the visitor record
    deleted_at TIMESTAMPTZ -- soft delete
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_visitors_tenant ON dm3_visitor.visitors(tenant_id);
CREATE INDEX IF NOT EXISTS idx_visitors_status ON dm3_visitor.visitors(status);
CREATE INDEX IF NOT EXISTS idx_visitors_host ON dm3_visitor.visitors(host_id);
CREATE INDEX IF NOT EXISTS idx_visitors_scheduled ON dm3_visitor.visitors(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_visitors_valid_until ON dm3_visitor.visitors(valid_until);
CREATE INDEX IF NOT EXISTS idx_visitors_checked_in ON dm3_visitor.visitors(checked_in_at);
CREATE INDEX IF NOT EXISTS idx_visitors_created_at ON dm3_visitor.visitors(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_visitors_deleted_at ON dm3_visitor.visitors(deleted_at) WHERE deleted_at IS NULL;

-- Full-text search index
CREATE INDEX IF NOT EXISTS idx_visitors_search ON dm3_visitor.visitors 
    USING gin((
        first_name || ' ' || last_name || ' ' || 
        COALESCE(email, '') || ' ' || 
        COALESCE(company, '') || ' ' || 
        purpose || ' ' || 
        COALESCE(host_name, '')
    ) gin_trgm_ops) WHERE deleted_at IS NULL;

-- Badge number uniqueness per tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_visitors_badge_number 
    ON dm3_visitor.visitors(tenant_id, badge_number) 
    WHERE badge_number IS NOT NULL AND deleted_at IS NULL;

-- ============================================================
-- Visitor hosts — people who can host visitors
-- ============================================================
CREATE TABLE IF NOT EXISTS dm3_visitor.visitor_hosts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    person_id UUID, -- Link to dm3_identity.persons (optional)
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    department VARCHAR(100),
    title VARCHAR(100),
    max_visitors INT DEFAULT 10, -- max concurrent visitors
    can_approve BOOLEAN DEFAULT true, -- can approve visitor requests
    auto_approve BOOLEAN DEFAULT false, -- automatically approve visitors
    access_zones JSONB DEFAULT '["lobby", "office"]', -- zones host can give access to
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_visitor_hosts_tenant ON dm3_visitor.visitor_hosts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_visitor_hosts_email ON dm3_visitor.visitor_hosts(tenant_id, email);
CREATE INDEX IF NOT EXISTS idx_visitor_hosts_person ON dm3_visitor.visitor_hosts(person_id) WHERE person_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_visitor_hosts_active ON dm3_visitor.visitor_hosts(active);

-- Unique email per tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_visitor_hosts_tenant_email 
    ON dm3_visitor.visitor_hosts(tenant_id, email) WHERE active = true;

-- ============================================================
-- Visitor settings — per-tenant configuration
-- ============================================================
CREATE TABLE IF NOT EXISTS dm3_visitor.visitor_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL UNIQUE,
    require_pre_registration BOOLEAN DEFAULT false,
    require_host_approval BOOLEAN DEFAULT true,
    require_photo BOOLEAN DEFAULT false,
    require_id_verification BOOLEAN DEFAULT false,
    max_visit_duration INT DEFAULT 8, -- hours
    default_valid_duration INT DEFAULT 24, -- hours
    auto_expire_visitors BOOLEAN DEFAULT true,
    badge_template TEXT, -- HTML/template for visitor badges
    welcome_message TEXT DEFAULT 'Welcome! Please check in at reception.',
    checkout_required BOOLEAN DEFAULT false,
    notify_host_on_arrival BOOLEAN DEFAULT true,
    notify_host_on_overstay BOOLEAN DEFAULT true,
    allow_walk_ins BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_visitor_settings_tenant ON dm3_visitor.visitor_settings(tenant_id);

-- ============================================================
-- Row Level Security for multi-tenancy
-- ============================================================
ALTER TABLE dm3_visitor.visitors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON dm3_visitor.visitors;
CREATE POLICY tenant_isolation ON dm3_visitor.visitors
    USING (
        tenant_id = COALESCE(
            NULLIF(current_setting('app.current_tenant', true), '')::uuid,
            tenant_id
        )
    );

ALTER TABLE dm3_visitor.visitor_hosts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON dm3_visitor.visitor_hosts;
CREATE POLICY tenant_isolation ON dm3_visitor.visitor_hosts
    USING (
        tenant_id = COALESCE(
            NULLIF(current_setting('app.current_tenant', true), '')::uuid,
            tenant_id
        )
    );

ALTER TABLE dm3_visitor.visitor_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON dm3_visitor.visitor_settings;
CREATE POLICY tenant_isolation ON dm3_visitor.visitor_settings
    USING (
        tenant_id = COALESCE(
            NULLIF(current_setting('app.current_tenant', true), '')::uuid,
            tenant_id
        )
    );

-- ============================================================
-- Triggers for updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_visitors_updated_at ON dm3_visitor.visitors;
CREATE TRIGGER update_visitors_updated_at 
    BEFORE UPDATE ON dm3_visitor.visitors 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_visitor_hosts_updated_at ON dm3_visitor.visitor_hosts;
CREATE TRIGGER update_visitor_hosts_updated_at 
    BEFORE UPDATE ON dm3_visitor.visitor_hosts 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_visitor_settings_updated_at ON dm3_visitor.visitor_settings;
CREATE TRIGGER update_visitor_settings_updated_at 
    BEFORE UPDATE ON dm3_visitor.visitor_settings 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Views for common queries
-- ============================================================

-- Active visitors view
CREATE OR REPLACE VIEW dm3_visitor.active_visitors AS
SELECT 
    id, tenant_id, visitor_type, first_name, last_name, email, phone, company,
    purpose, host_id, host_name, host_email, status, badge_number, scheduled_at,
    valid_from, valid_until, checked_in_at, checked_out_at, access_zones,
    created_at, updated_at
FROM dm3_visitor.visitors
WHERE status IN ('waiting', 'approved', 'checked_in') 
  AND deleted_at IS NULL
ORDER BY created_at DESC;

-- Today's visitors view
CREATE OR REPLACE VIEW dm3_visitor.todays_visitors AS
SELECT 
    id, tenant_id, visitor_type, first_name, last_name, email, company,
    purpose, host_name, status, badge_number, checked_in_at, checked_out_at,
    CASE 
        WHEN checked_in_at IS NOT NULL AND checked_out_at IS NOT NULL 
        THEN EXTRACT(EPOCH FROM (checked_out_at - checked_in_at)) / 60
    END as visit_duration_minutes
FROM dm3_visitor.visitors
WHERE DATE(created_at) = CURRENT_DATE 
  AND deleted_at IS NULL
ORDER BY created_at DESC;

-- Visitors awaiting approval
CREATE OR REPLACE VIEW dm3_visitor.pending_approvals AS
SELECT 
    v.id, v.tenant_id, v.visitor_type, v.first_name, v.last_name, v.email,
    v.company, v.purpose, v.host_id, v.host_name, v.host_email,
    v.scheduled_at, v.created_at,
    h.can_approve, h.auto_approve
FROM dm3_visitor.visitors v
LEFT JOIN dm3_visitor.visitor_hosts h ON v.host_id = h.id
WHERE v.status = 'waiting' 
  AND v.deleted_at IS NULL
ORDER BY v.created_at ASC;

-- Expired authorizations that need cleanup
CREATE OR REPLACE VIEW dm3_visitor.expired_visitors AS
SELECT 
    id, tenant_id, first_name, last_name, host_name, host_email,
    status, valid_until, created_at
FROM dm3_visitor.visitors
WHERE status IN ('approved', 'waiting')
  AND valid_until < now()
  AND deleted_at IS NULL;

-- Visitors currently on-site
CREATE OR REPLACE VIEW dm3_visitor.visitors_on_site AS
SELECT 
    v.id, v.tenant_id, v.first_name, v.last_name, v.company, v.badge_number,
    v.host_name, v.checked_in_at, v.access_zones,
    EXTRACT(EPOCH FROM (now() - v.checked_in_at)) / 3600 as hours_on_site,
    s.max_visit_duration
FROM dm3_visitor.visitors v
LEFT JOIN dm3_visitor.visitor_settings s ON v.tenant_id = s.tenant_id
WHERE v.status = 'checked_in' 
  AND v.deleted_at IS NULL
ORDER BY v.checked_in_at ASC;

-- ============================================================
-- Functions for visitor management
-- ============================================================

-- Function to check visitor authorization
CREATE OR REPLACE FUNCTION dm3_visitor.is_visitor_authorized(
    p_visitor_id UUID,
    p_access_zone VARCHAR(50)
) RETURNS BOOLEAN AS $$
DECLARE
    visitor_record RECORD;
    zone_allowed BOOLEAN := false;
BEGIN
    -- Get visitor details
    SELECT status, valid_until, access_zones
    INTO visitor_record
    FROM dm3_visitor.visitors
    WHERE id = p_visitor_id AND deleted_at IS NULL;
    
    -- Check if visitor exists
    IF NOT FOUND THEN
        RETURN false;
    END IF;
    
    -- Check if visitor is checked in
    IF visitor_record.status != 'checked_in' THEN
        RETURN false;
    END IF;
    
    -- Check if authorization is still valid
    IF visitor_record.valid_until IS NOT NULL AND visitor_record.valid_until < now() THEN
        RETURN false;
    END IF;
    
    -- Check if visitor has access to the requested zone
    IF p_access_zone IS NOT NULL THEN
        SELECT visitor_record.access_zones @> to_jsonb(p_access_zone) INTO zone_allowed;
        RETURN zone_allowed;
    END IF;
    
    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get visitor badge info by badge number
CREATE OR REPLACE FUNCTION dm3_visitor.get_visitor_by_badge(
    p_tenant_id UUID,
    p_badge_number VARCHAR(50)
) RETURNS TABLE(
    visitor_id UUID,
    visitor_name TEXT,
    company VARCHAR(255),
    host_name VARCHAR(255),
    status VARCHAR(50),
    checked_in_at TIMESTAMPTZ,
    access_zones JSONB,
    is_valid BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        v.id,
        v.first_name || ' ' || v.last_name,
        v.company,
        v.host_name,
        v.status,
        v.checked_in_at,
        v.access_zones,
        CASE 
            WHEN v.status = 'checked_in' 
            AND (v.valid_until IS NULL OR v.valid_until > now())
            THEN true
            ELSE false
        END
    FROM dm3_visitor.visitors v
    WHERE v.tenant_id = p_tenant_id 
      AND v.badge_number = p_badge_number 
      AND v.deleted_at IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Seed data for demo tenant
-- ============================================================

-- Default visitor settings
INSERT INTO dm3_visitor.visitor_settings (tenant_id, require_host_approval, max_visit_duration, default_valid_duration) VALUES
('00000000-0000-0000-0000-000000000001', true, 8, 24)
ON CONFLICT (tenant_id) DO NOTHING;

-- Sample visitor hosts
INSERT INTO dm3_visitor.visitor_hosts (tenant_id, name, email, department, title, can_approve, auto_approve) VALUES
('00000000-0000-0000-0000-000000000001', 'Lại Thế Hiệp', 'hiep@duali.com', 'Engineering', 'Senior Developer', true, false),
('00000000-0000-0000-0000-000000000001', 'Reception', 'reception@duali.com', 'Reception', 'Receptionist', true, true)
ON CONFLICT DO NOTHING;

-- Sample visitors
INSERT INTO dm3_visitor.visitors (tenant_id, visitor_type, first_name, last_name, email, company, purpose, host_name, host_email, status, valid_from, valid_until) VALUES
('00000000-0000-0000-0000-000000000001', 'client', 'John', 'Smith', 'john.smith@client.com', 'ABC Corp', 'Business meeting', 'Lại Thế Hiệp', 'hiep@duali.com', 'approved', now(), now() + interval '8 hours'),
('00000000-0000-0000-0000-000000000001', 'delivery', 'Mike', 'Johnson', 'mike@delivery.com', 'Express Delivery', 'Package delivery', 'Reception', 'reception@duali.com', 'waiting', now(), now() + interval '2 hours'),
('00000000-0000-0000-0000-000000000001', 'contractor', 'Alice', 'Brown', 'alice@maintenance.com', 'Facility Services', 'HVAC maintenance', 'Reception', 'reception@duali.com', 'pre_registered', now() + interval '1 day', now() + interval '1 day 4 hours')
ON CONFLICT DO NOTHING;

-- ============================================================
-- Comments for documentation
-- ============================================================
COMMENT ON SCHEMA dm3_visitor IS 'Visitor management service schema - pre-registration to check-out workflow';
COMMENT ON TABLE dm3_visitor.visitors IS 'Main visitor records with complete lifecycle tracking';
COMMENT ON TABLE dm3_visitor.visitor_hosts IS 'People who can host visitors with approval permissions';
COMMENT ON TABLE dm3_visitor.visitor_settings IS 'Per-tenant visitor management configuration';
COMMENT ON VIEW dm3_visitor.active_visitors IS 'Visitors currently in active states (waiting, approved, checked_in)';
COMMENT ON VIEW dm3_visitor.visitors_on_site IS 'Visitors currently checked in with overstay detection';
COMMENT ON FUNCTION dm3_visitor.is_visitor_authorized IS 'Check if visitor is authorized for specific zone access';
COMMENT ON FUNCTION dm3_visitor.get_visitor_by_badge IS 'Retrieve visitor information by badge number for access control';

-- Performance monitoring view
CREATE OR REPLACE VIEW dm3_visitor.visitor_performance AS
SELECT 
    COUNT(*) as total_visitors,
    COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) as visitors_today,
    COUNT(*) FILTER (WHERE status = 'checked_in') as currently_on_site,
    COUNT(*) FILTER (WHERE status = 'waiting') as awaiting_approval,
    COUNT(*) FILTER (WHERE valid_until < now() AND status IN ('approved', 'waiting')) as expired_authorizations,
    AVG(EXTRACT(EPOCH FROM (checked_out_at - checked_in_at)) / 60) FILTER (WHERE checked_out_at IS NOT NULL) as avg_visit_duration_minutes
FROM dm3_visitor.visitors
WHERE deleted_at IS NULL;