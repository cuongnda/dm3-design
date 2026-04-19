-- Migration 000032: attendance_summary rollup table.
--
-- Stores one row per (tenant, user, year, month) with pre-aggregated
-- counters for the month. Populated by attend-svc's monthly cron job
-- (runs daily; recomputes the current month + previous month for late
-- arrivals). Downstream reports (CSV/XLSX export, dashboards) read
-- from here instead of re-scanning attendance_records.
--
-- Idempotent via UPSERT on (tenant_id, user_id, year, month).

CREATE TABLE IF NOT EXISTS dm3_attendance.attendance_summary (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                 uuid NOT NULL,
    user_id                   uuid NOT NULL,
    year                      int  NOT NULL,
    month                     int  NOT NULL, -- 1..12
    workdays                  int  NOT NULL DEFAULT 0,
    on_time_count             int  NOT NULL DEFAULT 0,
    late_count                int  NOT NULL DEFAULT 0,
    absent_count              int  NOT NULL DEFAULT 0,
    on_leave_count            int  NOT NULL DEFAULT 0,
    half_day_count            int  NOT NULL DEFAULT 0,
    holiday_count             int  NOT NULL DEFAULT 0,
    pending_count             int  NOT NULL DEFAULT 0,
    total_hours               numeric(10,2) NOT NULL DEFAULT 0,
    regular_hours             numeric(10,2) NOT NULL DEFAULT 0,
    overtime_hours            numeric(10,2) NOT NULL DEFAULT 0,
    approved_overtime_hours   numeric(10,2) NOT NULL DEFAULT 0,
    late_minutes              int  NOT NULL DEFAULT 0,
    early_leave_minutes       int  NOT NULL DEFAULT 0,
    generated_at              timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT attendance_summary_month_chk CHECK (month BETWEEN 1 AND 12),
    CONSTRAINT attendance_summary_year_chk  CHECK (year  BETWEEN 2000 AND 2100)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_summary_tenant_user_period
    ON dm3_attendance.attendance_summary(tenant_id, user_id, year, month);

CREATE INDEX IF NOT EXISTS idx_attendance_summary_period
    ON dm3_attendance.attendance_summary(tenant_id, year, month);
