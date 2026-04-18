-- Emergency quick-activate plans and incident history.
--
-- Plans define one-click emergency actions: what command to send, to which
-- targets (zones, access points, or individual devices).
-- Incidents record every activation with status tracking.

CREATE TABLE IF NOT EXISTS dm3_access.emergency_plans (
    id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id           UUID        NOT NULL REFERENCES dm3_auth.tenants(id),
    name                TEXT        NOT NULL,              -- e.g. "Fire Evacuation"
    description         TEXT        NOT NULL DEFAULT '',
    icon                TEXT        NOT NULL DEFAULT 'shield-alert', -- Lucide icon name
    color               TEXT        NOT NULL DEFAULT '#EF4444',      -- hex color for the button
    action              TEXT        NOT NULL DEFAULT 'unlock',       -- unlock | lock | hold_open | hold_close
    target_type         TEXT        NOT NULL DEFAULT 'all',          -- all | zone | access_point | device
    target_ids          TEXT[]      DEFAULT '{}',                    -- UUIDs of zones/access_points/devices (empty = all)
    countdown_seconds   INT         NOT NULL DEFAULT 5,
    enabled             BOOLEAN     NOT NULL DEFAULT true,
    sort_order          INT         NOT NULL DEFAULT 0,
    created_by          UUID,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_emergency_plans_tenant
    ON dm3_access.emergency_plans (tenant_id);

CREATE TABLE IF NOT EXISTS dm3_access.emergency_incidents (
    id                  UUID        DEFAULT gen_random_uuid(),
    tenant_id           UUID        NOT NULL REFERENCES dm3_auth.tenants(id),
    time                TIMESTAMPTZ NOT NULL DEFAULT now(),
    plan_id             UUID        NOT NULL REFERENCES dm3_access.emergency_plans(id),
    plan_name           TEXT        NOT NULL,              -- snapshot of plan name at activation time
    action              TEXT        NOT NULL,
    status              TEXT        NOT NULL DEFAULT 'active',  -- active | all_clear | cancelled
    triggered_by        UUID,                              -- user who activated
    triggered_by_email  TEXT,
    all_clear_by        UUID,
    all_clear_by_email  TEXT,
    activated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at         TIMESTAMPTZ,
    duration_seconds    INT,                               -- calculated on resolve
    target_summary      TEXT        NOT NULL DEFAULT '',    -- e.g. "3 access points, 5 devices"
    notes               TEXT        NOT NULL DEFAULT '',
    metadata            JSONB       DEFAULT '{}',
    PRIMARY KEY (tenant_id, time, id)
);

SELECT create_hypertable(
    'dm3_access.emergency_incidents', 'time',
    if_not_exists => TRUE,
    migrate_data  => TRUE
);

CREATE INDEX IF NOT EXISTS idx_emergency_incidents_tenant
    ON dm3_access.emergency_incidents (tenant_id, time DESC);

CREATE INDEX IF NOT EXISTS idx_emergency_incidents_status
    ON dm3_access.emergency_incidents (tenant_id, status)
    WHERE status = 'active';
