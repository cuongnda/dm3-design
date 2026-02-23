-- 006_user_companies.sql — Junction table for multi-company user membership

CREATE TABLE IF NOT EXISTS dm3_auth.user_companies (
    user_id UUID NOT NULL REFERENCES dm3_auth.users(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES dm3_auth.companies(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL DEFAULT 'viewer',
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (user_id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_user_companies_user ON dm3_auth.user_companies(user_id);
CREATE INDEX IF NOT EXISTS idx_user_companies_company ON dm3_auth.user_companies(company_id);

-- Migrate existing user→company relationships into junction table
INSERT INTO dm3_auth.user_companies (user_id, company_id, role)
SELECT id, company_id, COALESCE(role, 'viewer')
FROM dm3_auth.users
WHERE company_id IS NOT NULL AND role != 'system_admin'
ON CONFLICT DO NOTHING;
