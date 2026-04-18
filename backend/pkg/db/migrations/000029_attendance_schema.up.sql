-- Migration 000029: Attendance plugin schema (Sprint 1 scope)
--
-- Creates dm3_attendance schema + core tables used by Sprint 1 daily records:
--   attendance_records   -- one row per (user, date). Hypertable on date.
--   shifts               -- tenant-defined shift templates
--   shift_assignments    -- maps users → shifts (with effective window)
--   attendance_devices   -- which access devices count as clock-in/out terminals
--   holiday_calendar     -- tenant holidays (used by status calc + absence marker)
--
-- Cross-schema references (dm3_identity.users, dm3_auth.tenants, dm3_devices.*)
-- are kept as soft UUID references — the application layer enforces integrity.
-- All queries MUST filter by tenant_id; there is no magic scoping wrapper.

-- ─── Schema + helpers ──────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS dm3_attendance;

CREATE OR REPLACE FUNCTION dm3_attendance.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── shifts ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dm3_attendance.shifts (
    id                           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                    uuid NOT NULL,
    -- Sprint 1: DM3 core schema has no `sites` table; zones act as logical
    -- sites (root zones = site). Nullable to support tenant-wide shifts.
    site_id                      uuid,
    name                         varchar(100) NOT NULL,
    code                         varchar(20),
    start_time                   time NOT NULL,
    end_time                     time NOT NULL,
    grace_period_minutes         int  NOT NULL DEFAULT 15,
    early_leave_threshold        int  NOT NULL DEFAULT 15,
    break_start                  time,
    break_end                    time,
    break_deducted               boolean NOT NULL DEFAULT true,
    overtime_threshold_minutes   int  NOT NULL DEFAULT 30,
    max_overtime_hours           numeric(3,1) NOT NULL DEFAULT 4.0,
    working_days                 int[] NOT NULL DEFAULT ARRAY[1,2,3,4,5]::int[],
    color                        varchar(7) NOT NULL DEFAULT '#3B82F6',
    is_default                   boolean NOT NULL DEFAULT false,
    status                       varchar(20) NOT NULL DEFAULT 'active',
    created_at                   timestamptz NOT NULL DEFAULT now(),
    updated_at                   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT shifts_status_chk CHECK (status IN ('active','archived'))
);

CREATE INDEX IF NOT EXISTS idx_shifts_tenant        ON dm3_attendance.shifts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_shifts_tenant_site   ON dm3_attendance.shifts(tenant_id, site_id);
-- Only one default shift per tenant
CREATE UNIQUE INDEX IF NOT EXISTS uq_shifts_default_per_tenant
    ON dm3_attendance.shifts(tenant_id)
    WHERE is_default = true AND status = 'active';

DROP TRIGGER IF EXISTS trg_shifts_updated_at ON dm3_attendance.shifts;
CREATE TRIGGER trg_shifts_updated_at BEFORE UPDATE ON dm3_attendance.shifts
    FOR EACH ROW EXECUTE FUNCTION dm3_attendance.set_updated_at();

-- ─── shift_assignments ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dm3_attendance.shift_assignments (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        uuid NOT NULL,
    user_id          uuid NOT NULL,
    shift_id         uuid NOT NULL REFERENCES dm3_attendance.shifts(id) ON DELETE CASCADE,
    effective_from   date NOT NULL,
    effective_until  date,
    created_at       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT shift_assignments_window_chk
        CHECK (effective_until IS NULL OR effective_until >= effective_from)
);

CREATE INDEX IF NOT EXISTS idx_shift_assign_tenant_user
    ON dm3_attendance.shift_assignments(tenant_id, user_id, effective_from DESC);
CREATE INDEX IF NOT EXISTS idx_shift_assign_shift
    ON dm3_attendance.shift_assignments(shift_id);

-- ─── attendance_records (hypertable on date) ──────────────────────────────

CREATE TABLE IF NOT EXISTS dm3_attendance.attendance_records (
    id                      uuid NOT NULL DEFAULT gen_random_uuid(),
    tenant_id               uuid NOT NULL,
    site_id                 uuid,
    user_id                 uuid NOT NULL,
    date                    date NOT NULL,
    shift_id                uuid REFERENCES dm3_attendance.shifts(id) ON DELETE SET NULL,
    clock_in                timestamptz,
    clock_in_device_id      uuid,
    clock_in_method         varchar(30),
    clock_in_photo_ref      varchar(500),
    clock_out               timestamptz,
    clock_out_device_id     uuid,
    clock_out_method        varchar(30),
    clock_out_photo_ref     varchar(500),
    status                  varchar(20) NOT NULL DEFAULT 'pending',
    total_hours             numeric(5,2),
    regular_hours           numeric(5,2),
    overtime_hours          numeric(5,2),
    late_minutes            int NOT NULL DEFAULT 0,
    early_leave_minutes     int NOT NULL DEFAULT 0,
    break_minutes           int,
    overtime_approved       boolean NOT NULL DEFAULT false,
    overtime_approved_by    uuid,
    manual_adjustment       boolean NOT NULL DEFAULT false,
    adjusted_by             uuid,
    adjustment_reason       text,
    leave_type              varchar(30),
    leave_reference_id      varchar(50),
    notes                   text,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT attendance_records_pk PRIMARY KEY (tenant_id, date, user_id, id),
    CONSTRAINT attendance_records_status_chk CHECK (
        status IN ('pending','on_time','late','absent','on_leave','half_day','holiday')
    )
);

-- hypertable partitions on date for monthly queries
SELECT create_hypertable(
    'dm3_attendance.attendance_records',
    'date',
    chunk_time_interval => INTERVAL '1 month',
    if_not_exists => TRUE
);

-- One record per (tenant, user, date) — dedup guard against double-creation.
CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_records_user_date
    ON dm3_attendance.attendance_records(tenant_id, user_id, date);

CREATE INDEX IF NOT EXISTS idx_attendance_records_tenant_date
    ON dm3_attendance.attendance_records(tenant_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_records_site_date
    ON dm3_attendance.attendance_records(tenant_id, site_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_records_status
    ON dm3_attendance.attendance_records(tenant_id, status, date DESC);

DROP TRIGGER IF EXISTS trg_attendance_records_updated_at ON dm3_attendance.attendance_records;
CREATE TRIGGER trg_attendance_records_updated_at BEFORE UPDATE ON dm3_attendance.attendance_records
    FOR EACH ROW EXECUTE FUNCTION dm3_attendance.set_updated_at();

-- ─── attendance_devices ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dm3_attendance.attendance_devices (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL,
    site_id         uuid,
    device_id       uuid NOT NULL,
    function        varchar(20) NOT NULL,
    location_name   varchar(200),
    is_primary      boolean NOT NULL DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT attendance_devices_function_chk
        CHECK (function IN ('clock_in','clock_out','both'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_devices_tenant_device
    ON dm3_attendance.attendance_devices(tenant_id, device_id);
CREATE INDEX IF NOT EXISTS idx_attendance_devices_site
    ON dm3_attendance.attendance_devices(tenant_id, site_id);

DROP TRIGGER IF EXISTS trg_attendance_devices_updated_at ON dm3_attendance.attendance_devices;
CREATE TRIGGER trg_attendance_devices_updated_at BEFORE UPDATE ON dm3_attendance.attendance_devices
    FOR EACH ROW EXECUTE FUNCTION dm3_attendance.set_updated_at();

-- ─── holiday_calendar ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dm3_attendance.holiday_calendar (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    uuid NOT NULL,
    site_id      uuid,               -- nullable = applies to whole tenant
    date         date NOT NULL,
    name         varchar(200) NOT NULL,
    is_paid      boolean NOT NULL DEFAULT true,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_holiday_tenant_site_date
    ON dm3_attendance.holiday_calendar(tenant_id, COALESCE(site_id, '00000000-0000-0000-0000-000000000000'::uuid), date);
CREATE INDEX IF NOT EXISTS idx_holiday_tenant_date
    ON dm3_attendance.holiday_calendar(tenant_id, date);
