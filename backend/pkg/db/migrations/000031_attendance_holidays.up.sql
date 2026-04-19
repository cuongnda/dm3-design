-- Holiday calendar for dm3_attendance. Public holidays + company-specific
-- closures; used by the absence cron (BR-004) and the rule engine to avoid
-- flagging employees as absent on a non-working day.

BEGIN;

CREATE TABLE IF NOT EXISTS dm3_attendance.holidays (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    uuid NOT NULL,
    date         date NOT NULL,
    name         varchar(120) NOT NULL,
    description  text,
    is_paid      boolean NOT NULL DEFAULT true,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT holidays_date_uniq UNIQUE (tenant_id, date)
);

CREATE INDEX IF NOT EXISTS idx_holidays_tenant_date
    ON dm3_attendance.holidays(tenant_id, date);

DROP TRIGGER IF EXISTS trg_holidays_updated_at ON dm3_attendance.holidays;
CREATE TRIGGER trg_holidays_updated_at BEFORE UPDATE ON dm3_attendance.holidays
    FOR EACH ROW EXECUTE FUNCTION dm3_attendance.set_updated_at();

COMMIT;
