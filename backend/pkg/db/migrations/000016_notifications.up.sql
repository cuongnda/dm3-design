-- ============================================================
-- Notifications table
-- ============================================================

CREATE TABLE IF NOT EXISTS dm3_audit.notifications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES dm3_auth.tenants(id) ON DELETE CASCADE,
    user_id         UUID REFERENCES dm3_auth.accounts(id) ON DELETE SET NULL,
    title           VARCHAR(255) NOT NULL,
    message         TEXT NOT NULL DEFAULT '',
    type            VARCHAR(50) NOT NULL DEFAULT 'info',
    severity        VARCHAR(20) NOT NULL DEFAULT 'info',
    status          VARCHAR(20) NOT NULL DEFAULT 'unread',
    source          VARCHAR(100) NOT NULL DEFAULT '',
    reference_type  VARCHAR(50),
    reference_id    VARCHAR(255),
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    read_at         TIMESTAMPTZ,
    acknowledged_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_notifications_tenant_time
    ON dm3_audit.notifications(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_tenant_user_status
    ON dm3_audit.notifications(tenant_id, user_id, status);

CREATE INDEX IF NOT EXISTS idx_notifications_status
    ON dm3_audit.notifications(status, created_at DESC);

CREATE TRIGGER set_notifications_updated_at
    BEFORE UPDATE ON dm3_audit.notifications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
