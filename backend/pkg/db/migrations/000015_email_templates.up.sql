-- Email templates: customizable per-tenant email templates
CREATE TABLE IF NOT EXISTS dm3_identity.email_templates (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES dm3_auth.tenants(id) ON DELETE CASCADE,
    type        TEXT NOT NULL,           -- e.g. account_created, password_reset, visitor_invitation
    name        TEXT NOT NULL,           -- display name
    subject     TEXT NOT NULL DEFAULT '',
    body_html   TEXT NOT NULL DEFAULT '',
    variables   JSONB NOT NULL DEFAULT '[]', -- available placeholder variables
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, type)
);

CREATE INDEX IF NOT EXISTS idx_email_templates_tenant ON dm3_identity.email_templates(tenant_id);
