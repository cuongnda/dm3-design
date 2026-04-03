-- 011_access_time_management.sql
-- Access Time Management system for company time-based access control

-- Access Time Templates - Reusable time schedule templates
CREATE TABLE IF NOT EXISTS dm3_access.access_time_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
    name VARCHAR(100) NOT NULL,
    description TEXT,
    timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    -- Constraints
    UNIQUE(tenant_id, name)
);

-- Access Time Slots - Weekly time slots for each template
CREATE TABLE IF NOT EXISTS dm3_access.access_time_slots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES dm3_access.access_time_templates(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0=Sunday, 6=Saturday
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    slot_name VARCHAR(50), -- "Morning", "Afternoon", "Night Shift"
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    -- Constraints
    CONSTRAINT valid_time_range CHECK (start_time < end_time),
    UNIQUE(template_id, day_of_week, start_time, end_time)
);

-- User Access Time Assignments - Link users to access time templates
CREATE TABLE IF NOT EXISTS dm3_access.user_access_times (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
    user_id UUID NOT NULL, -- Reference to identity service user
    template_id UUID NOT NULL REFERENCES dm3_access.access_time_templates(id) ON DELETE CASCADE,
    effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_to DATE, -- NULL = indefinite
    assigned_by UUID, -- Who assigned this access time
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    -- Constraints
    CONSTRAINT valid_date_range CHECK (effective_from <= COALESCE(effective_to, effective_from)),
    UNIQUE(user_id, template_id, effective_from) -- Prevent duplicate assignments
);

-- Access Time Validation Log - Audit trail for access time checks
CREATE TABLE IF NOT EXISTS dm3_access.access_time_validations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
    user_id UUID NOT NULL,
    template_id UUID REFERENCES dm3_access.access_time_templates(id),
    door_id UUID, -- Reference to door if applicable
    validation_time TIMESTAMPTZ NOT NULL DEFAULT now(),
    requested_time TIMESTAMPTZ NOT NULL, -- The time being validated
    is_allowed BOOLEAN NOT NULL,
    reason VARCHAR(255), -- Why allowed/denied
    matched_slot_id UUID REFERENCES dm3_access.access_time_slots(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    -- Performance indexes
    INDEX idx_validation_user_time (user_id, validation_time),
    INDEX idx_validation_tenant_time (tenant_id, validation_time)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_access_templates_tenant_active ON dm3_access.access_time_templates(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_time_slots_template_day ON dm3_access.access_time_slots(template_id, day_of_week, is_active);
CREATE INDEX IF NOT EXISTS idx_user_access_active ON dm3_access.user_access_times(user_id, effective_from, effective_to) WHERE effective_to IS NULL OR effective_to >= CURRENT_DATE;
CREATE INDEX IF NOT EXISTS idx_user_access_tenant ON dm3_access.user_access_times(tenant_id, effective_from, effective_to);

-- Add update triggers for timestamps
CREATE OR REPLACE FUNCTION dm3_access.update_timestamp()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply update triggers
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_access_time_templates_timestamp') THEN
        CREATE TRIGGER update_access_time_templates_timestamp
            BEFORE UPDATE ON dm3_access.access_time_templates
            FOR EACH ROW EXECUTE FUNCTION dm3_access.update_timestamp();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_user_access_times_timestamp') THEN
        CREATE TRIGGER update_user_access_times_timestamp
            BEFORE UPDATE ON dm3_access.user_access_times
            FOR EACH ROW EXECUTE FUNCTION dm3_access.update_timestamp();
    END IF;
END $$;

-- Insert sample data
INSERT INTO dm3_access.access_time_templates (name, description, tenant_id) VALUES
    ('Standard Working Hours', 'Monday to Friday 8AM-5PM office hours', '00000000-0000-0000-0000-000000000001'),
    ('Night Shift', 'Evening and night access for security personnel', '00000000-0000-0000-0000-000000000001'),
    ('Weekend Access', 'Weekend maintenance and emergency access', '00000000-0000-0000-0000-000000000001'),
    ('24/7 Access', 'Full access for managers and IT staff', '00000000-0000-0000-0000-000000000001')
ON CONFLICT (tenant_id, name) DO NOTHING;

-- Insert sample time slots for Standard Working Hours
DO $$
DECLARE
    template_uuid UUID;
BEGIN
    SELECT id INTO template_uuid FROM dm3_access.access_time_templates 
    WHERE name = 'Standard Working Hours' AND tenant_id = '00000000-0000-0000-0000-000000000001';
    
    IF template_uuid IS NOT NULL THEN
        -- Monday to Friday: 8:00-12:00 (Morning), 13:00-17:00 (Afternoon)
        INSERT INTO dm3_access.access_time_slots (template_id, day_of_week, start_time, end_time, slot_name) VALUES
            (template_uuid, 1, '08:00', '12:00', 'Morning'), -- Monday
            (template_uuid, 1, '13:00', '17:00', 'Afternoon'),
            (template_uuid, 2, '08:00', '12:00', 'Morning'), -- Tuesday
            (template_uuid, 2, '13:00', '17:00', 'Afternoon'),
            (template_uuid, 3, '08:00', '12:00', 'Morning'), -- Wednesday
            (template_uuid, 3, '13:00', '17:00', 'Afternoon'),
            (template_uuid, 4, '08:00', '12:00', 'Morning'), -- Thursday
            (template_uuid, 4, '13:00', '17:00', 'Afternoon'),
            (template_uuid, 5, '08:00', '12:00', 'Morning'), -- Friday
            (template_uuid, 5, '13:00', '17:00', 'Afternoon')
        ON CONFLICT (template_id, day_of_week, start_time, end_time) DO NOTHING;
    END IF;
END $$;

-- Insert 24/7 access slots
DO $$
DECLARE
    template_uuid UUID;
    day INT;
BEGIN
    SELECT id INTO template_uuid FROM dm3_access.access_time_templates 
    WHERE name = '24/7 Access' AND tenant_id = '00000000-0000-0000-0000-000000000001';
    
    IF template_uuid IS NOT NULL THEN
        -- All days: 00:00-23:59
        FOR day IN 0..6 LOOP
            INSERT INTO dm3_access.access_time_slots (template_id, day_of_week, start_time, end_time, slot_name) VALUES
                (template_uuid, day, '00:00', '23:59', 'Full Access')
            ON CONFLICT (template_id, day_of_week, start_time, end_time) DO NOTHING;
        END LOOP;
    END IF;
END $$;

-- Comments for documentation
COMMENT ON TABLE dm3_access.access_time_templates IS 'Reusable access time schedule templates for companies';
COMMENT ON TABLE dm3_access.access_time_slots IS 'Weekly time slots defining when access is allowed';
COMMENT ON TABLE dm3_access.user_access_times IS 'User assignments to access time templates with effective dates';
COMMENT ON TABLE dm3_access.access_time_validations IS 'Audit trail for access time validation requests';

COMMENT ON COLUMN dm3_access.access_time_slots.day_of_week IS '0=Sunday, 1=Monday, ..., 6=Saturday';
COMMENT ON COLUMN dm3_access.user_access_times.effective_to IS 'NULL means indefinite assignment';