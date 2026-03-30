-- 013_attendance_service.sql — Time & Attendance Service

-- Schema for attendance service
CREATE SCHEMA IF NOT EXISTS dm3_attend;

-- ============================================================
-- Attendance records — main table for employee attendance
-- ============================================================
CREATE TABLE IF NOT EXISTS dm3_attend.attendance_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    person_id UUID NOT NULL,
    person_name VARCHAR(255) NOT NULL,
    date DATE NOT NULL,
    shift_id UUID,
    clock_in_time TIMESTAMPTZ,
    clock_out_time TIMESTAMPTZ,
    clock_in_method VARCHAR(50), -- door, mobile, manual, web, auto
    clock_out_method VARCHAR(50),
    clock_in_location VARCHAR(255),
    clock_out_location VARCHAR(255),
    break_minutes INT DEFAULT 0,
    worked_minutes INT DEFAULT 0, -- calculated total work time
    regular_minutes INT DEFAULT 0, -- within normal hours
    overtime_minutes INT DEFAULT 0, -- beyond normal hours
    status VARCHAR(50) NOT NULL DEFAULT 'present', -- present, absent, late, early_leave, partial
    approval_status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, approved, rejected
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    approved_by UUID,
    approved_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ
);

-- Indexes for attendance records
CREATE INDEX IF NOT EXISTS idx_attendance_tenant ON dm3_attend.attendance_records(tenant_id);
CREATE INDEX IF NOT EXISTS idx_attendance_person ON dm3_attend.attendance_records(person_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON dm3_attend.attendance_records(date DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_status ON dm3_attend.attendance_records(status);
CREATE INDEX IF NOT EXISTS idx_attendance_approval_status ON dm3_attend.attendance_records(approval_status);
CREATE INDEX IF NOT EXISTS idx_attendance_shift ON dm3_attend.attendance_records(shift_id) WHERE shift_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_attendance_clock_times ON dm3_attend.attendance_records(clock_in_time, clock_out_time);
CREATE INDEX IF NOT EXISTS idx_attendance_deleted ON dm3_attend.attendance_records(deleted_at) WHERE deleted_at IS NULL;

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_attendance_person_date ON dm3_attend.attendance_records(person_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_tenant_date ON dm3_attend.attendance_records(tenant_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_working_today ON dm3_attend.attendance_records(person_id) 
    WHERE clock_in_time IS NOT NULL AND clock_out_time IS NULL AND DATE(date) = CURRENT_DATE;

-- Unique constraint to prevent duplicate attendance per person per day
CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_person_date_unique 
    ON dm3_attend.attendance_records(tenant_id, person_id, date) 
    WHERE deleted_at IS NULL;

-- ============================================================
-- Break records — track breaks during work
-- ============================================================
CREATE TABLE IF NOT EXISTS dm3_attend.break_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    attendance_id UUID NOT NULL REFERENCES dm3_attend.attendance_records(id),
    person_id UUID NOT NULL,
    break_type VARCHAR(50) NOT NULL DEFAULT 'rest', -- lunch, coffee, rest, personal, etc.
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ,
    minutes INT DEFAULT 0, -- calculated duration
    is_paid BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_breaks_tenant ON dm3_attend.break_records(tenant_id);
CREATE INDEX IF NOT EXISTS idx_breaks_attendance ON dm3_attend.break_records(attendance_id);
CREATE INDEX IF NOT EXISTS idx_breaks_person ON dm3_attend.break_records(person_id);
CREATE INDEX IF NOT EXISTS idx_breaks_active ON dm3_attend.break_records(person_id, end_time) WHERE end_time IS NULL;
CREATE INDEX IF NOT EXISTS idx_breaks_start_time ON dm3_attend.break_records(start_time DESC);

-- ============================================================
-- Shifts — work shift definitions
-- ============================================================
CREATE TABLE IF NOT EXISTS dm3_attend.shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    start_time VARCHAR(5) NOT NULL, -- HH:MM format (e.g., "09:00")
    end_time VARCHAR(5) NOT NULL,   -- HH:MM format (e.g., "17:00")
    work_days INT[] DEFAULT '{1,2,3,4,5}', -- Array of weekdays: 1=Monday, 7=Sunday
    break_minutes INT DEFAULT 60, -- default break allowance
    grace_period_minutes INT DEFAULT 15, -- late arrival tolerance
    color VARCHAR(7) DEFAULT '#2196F3', -- UI color code
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shifts_tenant ON dm3_attend.shifts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_shifts_active ON dm3_attend.shifts(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_shifts_name ON dm3_attend.shifts(tenant_id, name);

-- ============================================================
-- Shift assignments — assign people to shifts
-- ============================================================
CREATE TABLE IF NOT EXISTS dm3_attend.shift_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    person_id UUID NOT NULL,
    person_name VARCHAR(255) NOT NULL, -- denormalized for performance
    shift_id UUID NOT NULL REFERENCES dm3_attend.shifts(id),
    shift_name VARCHAR(255) NOT NULL, -- denormalized for performance
    start_date DATE NOT NULL,
    end_date DATE, -- NULL = ongoing assignment
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shift_assignments_tenant ON dm3_attend.shift_assignments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_shift_assignments_person ON dm3_attend.shift_assignments(person_id);
CREATE INDEX IF NOT EXISTS idx_shift_assignments_shift ON dm3_attend.shift_assignments(shift_id);
CREATE INDEX IF NOT EXISTS idx_shift_assignments_active ON dm3_attend.shift_assignments(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_shift_assignments_dates ON dm3_attend.shift_assignments(start_date, end_date);

-- ============================================================
-- Leave requests — vacation, sick leave, etc.
-- ============================================================
CREATE TABLE IF NOT EXISTS dm3_attend.leave_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    person_id UUID NOT NULL,
    person_name VARCHAR(255) NOT NULL,
    leave_type VARCHAR(50) NOT NULL, -- annual, sick, personal, emergency, maternity, etc.
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    total_days DECIMAL(4,2) NOT NULL, -- can be partial days (e.g., 0.5 for half day)
    reason TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, approved, rejected, cancelled
    approved_by UUID,
    approved_at TIMESTAMPTZ,
    rejected_by UUID,
    rejected_at TIMESTAMPTZ,
    rejection_reason TEXT,
    metadata JSONB DEFAULT '{}', -- additional leave data
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_leave_requests_tenant ON dm3_attend.leave_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_person ON dm3_attend.leave_requests(person_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_dates ON dm3_attend.leave_requests(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON dm3_attend.leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_leave_requests_type ON dm3_attend.leave_requests(leave_type);
CREATE INDEX IF NOT EXISTS idx_leave_requests_pending ON dm3_attend.leave_requests(status) WHERE status = 'pending';

-- ============================================================
-- Overtime requests — pre-approval for overtime work
-- ============================================================
CREATE TABLE IF NOT EXISTS dm3_attend.overtime_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    person_id UUID NOT NULL,
    person_name VARCHAR(255) NOT NULL,
    date DATE NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    minutes INT NOT NULL, -- requested overtime duration
    reason TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, approved, rejected
    approved_by UUID,
    approved_at TIMESTAMPTZ,
    actual_minutes INT, -- actual overtime worked (vs requested)
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_overtime_requests_tenant ON dm3_attend.overtime_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_overtime_requests_person ON dm3_attend.overtime_requests(person_id);
CREATE INDEX IF NOT EXISTS idx_overtime_requests_date ON dm3_attend.overtime_requests(date DESC);
CREATE INDEX IF NOT EXISTS idx_overtime_requests_status ON dm3_attend.overtime_requests(status);
CREATE INDEX IF NOT EXISTS idx_overtime_requests_pending ON dm3_attend.overtime_requests(status) WHERE status = 'pending';

-- ============================================================
-- Attendance settings — per-tenant configuration
-- ============================================================
CREATE TABLE IF NOT EXISTS dm3_attend.attendance_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL UNIQUE,
    working_days_per_week INT DEFAULT 5,
    working_hours_per_day DECIMAL(4,2) DEFAULT 8.0,
    overtime_rate DECIMAL(4,2) DEFAULT 1.5, -- overtime pay multiplier
    late_threshold_minutes INT DEFAULT 15, -- how many minutes late before marked late
    early_leave_threshold_minutes INT DEFAULT 15,
    require_approval BOOLEAN DEFAULT false, -- require manager approval for attendance
    auto_clock_out BOOLEAN DEFAULT false, -- automatically clock out at shift end
    auto_clock_out_time VARCHAR(5), -- HH:MM when to auto clock out
    track_breaks BOOLEAN DEFAULT true,
    max_break_minutes INT DEFAULT 60, -- maximum break time per day
    rounding_minutes INT DEFAULT 1, -- round clock times to nearest X minutes (1=no rounding)
    week_start_day INT DEFAULT 1, -- 1=Monday, 0=Sunday
    timezone_offset VARCHAR(6) DEFAULT '+07:00', -- e.g., "+07:00" for Bangkok
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_attendance_settings_tenant ON dm3_attend.attendance_settings(tenant_id);

-- ============================================================
-- Row Level Security for multi-tenancy
-- ============================================================
ALTER TABLE dm3_attend.attendance_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON dm3_attend.attendance_records;
CREATE POLICY tenant_isolation ON dm3_attend.attendance_records
    USING (
        tenant_id = COALESCE(
            NULLIF(current_setting('app.current_tenant', true), '')::uuid,
            tenant_id
        )
    );

ALTER TABLE dm3_attend.break_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON dm3_attend.break_records;
CREATE POLICY tenant_isolation ON dm3_attend.break_records
    USING (
        tenant_id = COALESCE(
            NULLIF(current_setting('app.current_tenant', true), '')::uuid,
            tenant_id
        )
    );

ALTER TABLE dm3_attend.shifts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON dm3_attend.shifts;
CREATE POLICY tenant_isolation ON dm3_attend.shifts
    USING (
        tenant_id = COALESCE(
            NULLIF(current_setting('app.current_tenant', true), '')::uuid,
            tenant_id
        )
    );

ALTER TABLE dm3_attend.shift_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON dm3_attend.shift_assignments;
CREATE POLICY tenant_isolation ON dm3_attend.shift_assignments
    USING (
        tenant_id = COALESCE(
            NULLIF(current_setting('app.current_tenant', true), '')::uuid,
            tenant_id
        )
    );

ALTER TABLE dm3_attend.leave_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON dm3_attend.leave_requests;
CREATE POLICY tenant_isolation ON dm3_attend.leave_requests
    USING (
        tenant_id = COALESCE(
            NULLIF(current_setting('app.current_tenant', true), '')::uuid,
            tenant_id
        )
    );

ALTER TABLE dm3_attend.overtime_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON dm3_attend.overtime_requests;
CREATE POLICY tenant_isolation ON dm3_attend.overtime_requests
    USING (
        tenant_id = COALESCE(
            NULLIF(current_setting('app.current_tenant', true), '')::uuid,
            tenant_id
        )
    );

ALTER TABLE dm3_attend.attendance_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON dm3_attend.attendance_settings;
CREATE POLICY tenant_isolation ON dm3_attend.attendance_settings
    USING (
        tenant_id = COALESCE(
            NULLIF(current_setting('app.current_tenant', true), '')::uuid,
            tenant_id
        )
    );

-- ============================================================
-- Triggers for updated_at
-- ============================================================
DROP TRIGGER IF EXISTS update_attendance_records_updated_at ON dm3_attend.attendance_records;
CREATE TRIGGER update_attendance_records_updated_at 
    BEFORE UPDATE ON dm3_attend.attendance_records 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_shifts_updated_at ON dm3_attend.shifts;
CREATE TRIGGER update_shifts_updated_at 
    BEFORE UPDATE ON dm3_attend.shifts 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_shift_assignments_updated_at ON dm3_attend.shift_assignments;
CREATE TRIGGER update_shift_assignments_updated_at 
    BEFORE UPDATE ON dm3_attend.shift_assignments 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_leave_requests_updated_at ON dm3_attend.leave_requests;
CREATE TRIGGER update_leave_requests_updated_at 
    BEFORE UPDATE ON dm3_attend.leave_requests 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_overtime_requests_updated_at ON dm3_attend.overtime_requests;
CREATE TRIGGER update_overtime_requests_updated_at 
    BEFORE UPDATE ON dm3_attend.overtime_requests 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_attendance_settings_updated_at ON dm3_attend.attendance_settings;
CREATE TRIGGER update_attendance_settings_updated_at 
    BEFORE UPDATE ON dm3_attend.attendance_settings 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Views for common queries
-- ============================================================

-- Today's attendance overview
CREATE OR REPLACE VIEW dm3_attend.todays_attendance AS
SELECT 
    a.id, a.tenant_id, a.person_id, a.person_name,
    s.name as shift_name, a.status, a.clock_in_time, a.clock_out_time,
    a.worked_minutes, a.break_minutes, a.overtime_minutes,
    CASE WHEN a.clock_in_time IS NOT NULL AND a.clock_out_time IS NULL THEN true ELSE false END as currently_working,
    CASE WHEN br.person_id IS NOT NULL THEN true ELSE false END as on_break
FROM dm3_attend.attendance_records a
LEFT JOIN dm3_attend.shifts s ON a.shift_id = s.id
LEFT JOIN dm3_attend.break_records br ON a.person_id = br.person_id 
    AND br.end_time IS NULL AND DATE(br.start_time) = CURRENT_DATE
WHERE DATE(a.date) = CURRENT_DATE AND a.deleted_at IS NULL
ORDER BY a.person_name;

-- Pending approvals
CREATE OR REPLACE VIEW dm3_attend.pending_attendance_approvals AS
SELECT 
    a.id, a.tenant_id, a.person_id, a.person_name, a.date,
    a.status, a.clock_in_time, a.clock_out_time, a.worked_minutes,
    a.notes, a.created_at
FROM dm3_attend.attendance_records a
WHERE a.approval_status = 'pending' AND a.deleted_at IS NULL
ORDER BY a.created_at ASC;

-- Active shift assignments
CREATE OR REPLACE VIEW dm3_attend.current_shift_assignments AS
SELECT 
    sa.id, sa.tenant_id, sa.person_id, sa.person_name,
    sa.shift_id, sa.shift_name, s.start_time, s.end_time, s.work_days,
    sa.start_date, sa.end_date
FROM dm3_attend.shift_assignments sa
JOIN dm3_attend.shifts s ON sa.shift_id = s.id
WHERE sa.is_active = true 
  AND sa.start_date <= CURRENT_DATE 
  AND (sa.end_date IS NULL OR sa.end_date >= CURRENT_DATE)
  AND s.is_active = true
ORDER BY sa.person_name;

-- Overtime summary
CREATE OR REPLACE VIEW dm3_attend.overtime_summary AS
SELECT 
    person_id, person_name, 
    DATE_TRUNC('month', date) as month,
    SUM(overtime_minutes) / 60.0 as total_overtime_hours,
    COUNT(*) as days_with_overtime,
    AVG(overtime_minutes) / 60.0 as avg_overtime_per_day
FROM dm3_attend.attendance_records
WHERE overtime_minutes > 0 AND deleted_at IS NULL
GROUP BY person_id, person_name, DATE_TRUNC('month', date)
ORDER BY month DESC, total_overtime_hours DESC;

-- Attendance rate by person (current month)
CREATE OR REPLACE VIEW dm3_attend.monthly_attendance_rates AS
SELECT 
    a.person_id, a.person_name,
    COUNT(*) as total_days,
    COUNT(*) FILTER (WHERE a.status != 'absent') as present_days,
    COUNT(*) FILTER (WHERE a.status = 'absent') as absent_days,
    COUNT(*) FILTER (WHERE a.status = 'late') as late_days,
    ROUND(
        COUNT(*) FILTER (WHERE a.status != 'absent')::numeric / 
        NULLIF(COUNT(*), 0) * 100, 2
    ) as attendance_rate,
    ROUND(
        COUNT(*) FILTER (WHERE a.status NOT IN ('absent', 'late'))::numeric / 
        NULLIF(COUNT(*) FILTER (WHERE a.status != 'absent'), 0) * 100, 2
    ) as punctuality_rate
FROM dm3_attend.attendance_records a
WHERE DATE_TRUNC('month', a.date) = DATE_TRUNC('month', CURRENT_DATE)
  AND a.deleted_at IS NULL
GROUP BY a.person_id, a.person_name
HAVING COUNT(*) > 0
ORDER BY attendance_rate DESC, punctuality_rate DESC;

-- ============================================================
-- Functions for business logic
-- ============================================================

-- Calculate working minutes between clock in/out considering breaks
CREATE OR REPLACE FUNCTION dm3_attend.calculate_working_minutes(
    p_clock_in TIMESTAMPTZ,
    p_clock_out TIMESTAMPTZ,
    p_break_minutes INT DEFAULT 0
) RETURNS INT AS $$
DECLARE
    total_minutes INT;
BEGIN
    IF p_clock_in IS NULL THEN
        RETURN 0;
    END IF;
    
    IF p_clock_out IS NULL THEN
        -- Currently working
        total_minutes := EXTRACT(EPOCH FROM (now() - p_clock_in)) / 60;
    ELSE
        total_minutes := EXTRACT(EPOCH FROM (p_clock_out - p_clock_in)) / 60;
    END IF;
    
    -- Subtract break time
    total_minutes := total_minutes - COALESCE(p_break_minutes, 0);
    
    RETURN GREATEST(0, total_minutes);
END;
$$ LANGUAGE plpgsql;

-- Check if person is currently on break
CREATE OR REPLACE FUNCTION dm3_attend.is_person_on_break(
    p_tenant_id UUID,
    p_person_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
    active_break_count INT;
BEGIN
    SELECT COUNT(*) INTO active_break_count
    FROM dm3_attend.break_records
    WHERE tenant_id = p_tenant_id 
      AND person_id = p_person_id 
      AND end_time IS NULL;
    
    RETURN active_break_count > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get today's attendance status for person
CREATE OR REPLACE FUNCTION dm3_attend.get_attendance_status(
    p_tenant_id UUID,
    p_person_id UUID
) RETURNS TABLE(
    status TEXT,
    clock_in_time TIMESTAMPTZ,
    clock_out_time TIMESTAMPTZ,
    working_minutes INT,
    on_break BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        CASE 
            WHEN a.clock_out_time IS NOT NULL THEN 'clocked_out'
            WHEN a.clock_in_time IS NOT NULL AND dm3_attend.is_person_on_break(p_tenant_id, p_person_id) THEN 'on_break'
            WHEN a.clock_in_time IS NOT NULL THEN 'clocked_in'
            ELSE 'not_clocked_in'
        END::TEXT,
        a.clock_in_time,
        a.clock_out_time,
        dm3_attend.calculate_working_minutes(a.clock_in_time, a.clock_out_time, a.break_minutes),
        dm3_attend.is_person_on_break(p_tenant_id, p_person_id)
    FROM dm3_attend.attendance_records a
    WHERE a.tenant_id = p_tenant_id 
      AND a.person_id = p_person_id 
      AND DATE(a.date) = CURRENT_DATE
      AND a.deleted_at IS NULL
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Seed data for demo tenant
-- ============================================================

-- Default attendance settings
INSERT INTO dm3_attend.attendance_settings (tenant_id) VALUES
('00000000-0000-0000-0000-000000000001')
ON CONFLICT (tenant_id) DO NOTHING;

-- Sample shifts
INSERT INTO dm3_attend.shifts (tenant_id, name, start_time, end_time, work_days, break_minutes, grace_period_minutes, color) VALUES
('00000000-0000-0000-0000-000000000001', 'Morning Shift', '09:00', '17:00', '{1,2,3,4,5}', 60, 15, '#4CAF50'),
('00000000-0000-0000-0000-000000000001', 'Afternoon Shift', '13:00', '21:00', '{1,2,3,4,5}', 60, 15, '#FF9800'),
('00000000-0000-0000-0000-000000000001', 'Night Shift', '22:00', '06:00', '{1,2,3,4,5}', 30, 10, '#3F51B5'),
('00000000-0000-0000-0000-000000000001', 'Weekend Shift', '10:00', '18:00', '{6,7}', 60, 15, '#9C27B0')
ON CONFLICT DO NOTHING;

-- ============================================================
-- Comments for documentation
-- ============================================================
COMMENT ON SCHEMA dm3_attend IS 'Time & attendance management service schema';
COMMENT ON TABLE dm3_attend.attendance_records IS 'Daily attendance records with clock in/out times and status';
COMMENT ON TABLE dm3_attend.break_records IS 'Break periods taken during work (lunch, coffee, etc.)';
COMMENT ON TABLE dm3_attend.shifts IS 'Work shift definitions with times and schedules';
COMMENT ON TABLE dm3_attend.shift_assignments IS 'Assignment of people to specific shifts';
COMMENT ON TABLE dm3_attend.leave_requests IS 'Leave/vacation requests and approvals';
COMMENT ON TABLE dm3_attend.overtime_requests IS 'Overtime work requests and pre-approvals';
COMMENT ON TABLE dm3_attend.attendance_settings IS 'Per-tenant attendance policy configuration';

COMMENT ON VIEW dm3_attend.todays_attendance IS 'Real-time view of today''s attendance with working status';
COMMENT ON VIEW dm3_attend.pending_attendance_approvals IS 'Attendance records requiring manager approval';
COMMENT ON VIEW dm3_attend.current_shift_assignments IS 'Currently active shift assignments';
COMMENT ON VIEW dm3_attend.overtime_summary IS 'Monthly overtime summary by person';
COMMENT ON VIEW dm3_attend.monthly_attendance_rates IS 'Attendance and punctuality rates for current month';

COMMENT ON FUNCTION dm3_attend.calculate_working_minutes IS 'Calculate net working time excluding breaks';
COMMENT ON FUNCTION dm3_attend.is_person_on_break IS 'Check if person has active break record';
COMMENT ON FUNCTION dm3_attend.get_attendance_status IS 'Get current attendance status for person today';