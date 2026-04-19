-- Phase A extension of dm3_attendance:
--   * leave_policies   — tenant-scoped leave type catalog (annual, sick, unpaid, …)
--   * leave_balances   — per-user per-policy accrual/usage snapshot
--   * leave_requests   — request lifecycle (pending → approved/rejected/cancelled)
--   * attendance_settings — singleton per tenant with shared defaults

BEGIN;

-- ─── leave_policies ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dm3_attendance.leave_policies (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             uuid NOT NULL,
    code                  varchar(40) NOT NULL,   -- 'annual', 'sick', 'unpaid', …
    name                  varchar(100) NOT NULL,
    color                 varchar(7) NOT NULL DEFAULT '#3B82F6',
    annual_quota_days     numeric(5,2) NOT NULL DEFAULT 0,   -- 0 = unlimited / unpaid
    requires_approval     boolean NOT NULL DEFAULT true,
    deducts_attendance    boolean NOT NULL DEFAULT true,
    paid                  boolean NOT NULL DEFAULT true,
    is_active             boolean NOT NULL DEFAULT true,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT leave_policies_code_uniq UNIQUE (tenant_id, code)
);
CREATE INDEX IF NOT EXISTS idx_leave_policies_tenant ON dm3_attendance.leave_policies(tenant_id);

DROP TRIGGER IF EXISTS trg_leave_policies_updated_at ON dm3_attendance.leave_policies;
CREATE TRIGGER trg_leave_policies_updated_at BEFORE UPDATE ON dm3_attendance.leave_policies
    FOR EACH ROW EXECUTE FUNCTION dm3_attendance.set_updated_at();

-- ─── leave_balances ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dm3_attendance.leave_balances (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid NOT NULL,
    user_id       uuid NOT NULL,
    policy_id     uuid NOT NULL REFERENCES dm3_attendance.leave_policies(id) ON DELETE CASCADE,
    year          int  NOT NULL,
    entitled_days numeric(5,2) NOT NULL DEFAULT 0,
    used_days     numeric(5,2) NOT NULL DEFAULT 0,
    pending_days  numeric(5,2) NOT NULL DEFAULT 0,
    carried_over  numeric(5,2) NOT NULL DEFAULT 0,
    updated_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT leave_balances_unique UNIQUE (tenant_id, user_id, policy_id, year)
);
CREATE INDEX IF NOT EXISTS idx_leave_balances_tenant_user
    ON dm3_attendance.leave_balances(tenant_id, user_id, year);

DROP TRIGGER IF EXISTS trg_leave_balances_updated_at ON dm3_attendance.leave_balances;
CREATE TRIGGER trg_leave_balances_updated_at BEFORE UPDATE ON dm3_attendance.leave_balances
    FOR EACH ROW EXECUTE FUNCTION dm3_attendance.set_updated_at();

-- ─── leave_requests ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dm3_attendance.leave_requests (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid NOT NULL,
    user_id       uuid NOT NULL,
    policy_id     uuid NOT NULL REFERENCES dm3_attendance.leave_policies(id) ON DELETE RESTRICT,
    start_date    date NOT NULL,
    end_date      date NOT NULL,
    days          numeric(5,2) NOT NULL,
    half_day      boolean NOT NULL DEFAULT false,
    reason        text,
    attachment_ref varchar(255),
    status        varchar(20) NOT NULL DEFAULT 'pending',
    reviewed_by   uuid,
    reviewed_at   timestamptz,
    review_note   text,
    cancelled_at  timestamptz,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT leave_requests_status_chk
        CHECK (status IN ('pending','approved','rejected','cancelled')),
    CONSTRAINT leave_requests_window_chk
        CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS idx_leave_requests_tenant_status
    ON dm3_attendance.leave_requests(tenant_id, status, start_date DESC);
CREATE INDEX IF NOT EXISTS idx_leave_requests_user
    ON dm3_attendance.leave_requests(tenant_id, user_id, start_date DESC);

DROP TRIGGER IF EXISTS trg_leave_requests_updated_at ON dm3_attendance.leave_requests;
CREATE TRIGGER trg_leave_requests_updated_at BEFORE UPDATE ON dm3_attendance.leave_requests
    FOR EACH ROW EXECUTE FUNCTION dm3_attendance.set_updated_at();

-- ─── attendance_settings (one row per tenant) ─────────────────────────────

CREATE TABLE IF NOT EXISTS dm3_attendance.attendance_settings (
    tenant_id                     uuid PRIMARY KEY,
    default_grace_minutes         int  NOT NULL DEFAULT 15,
    default_early_leave_threshold int  NOT NULL DEFAULT 15,
    overtime_threshold_minutes    int  NOT NULL DEFAULT 30,
    overtime_requires_approval    boolean NOT NULL DEFAULT true,
    auto_clockout_hours           int  NOT NULL DEFAULT 12,   -- auto-close open records after N hours
    workweek_start                int  NOT NULL DEFAULT 1,    -- ISO day: 1=Mon … 7=Sun
    timezone                      varchar(64) NOT NULL DEFAULT 'UTC',
    carryover_enabled             boolean NOT NULL DEFAULT true,
    carryover_max_days            numeric(5,2) NOT NULL DEFAULT 5,
    created_at                    timestamptz NOT NULL DEFAULT now(),
    updated_at                    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT attendance_settings_workweek_chk CHECK (workweek_start BETWEEN 1 AND 7)
);

DROP TRIGGER IF EXISTS trg_attendance_settings_updated_at ON dm3_attendance.attendance_settings;
CREATE TRIGGER trg_attendance_settings_updated_at BEFORE UPDATE ON dm3_attendance.attendance_settings
    FOR EACH ROW EXECUTE FUNCTION dm3_attendance.set_updated_at();

COMMIT;
