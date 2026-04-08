-- ============================================================
-- Migration 000002: Access group M:N users + per-group schedule
--
-- WHAT: Convert 1:1 users.access_group_id to M:N junction table.
--       Add per-group-per-access-point schedule override.
--
-- WHY:  1:1 prevents a user from belonging to multiple access groups.
--       Schedule on access_point applies to ALL groups equally.
-- ============================================================

-- 1. Junction table: users ↔ access_groups (M:N with temporal validity)
CREATE TABLE IF NOT EXISTS dm3_access.access_group_users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES dm3_auth.companies(id),
    access_group_id UUID NOT NULL REFERENCES dm3_access.access_groups(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES dm3_identity.users(id) ON DELETE CASCADE,
    effective_from  TIMESTAMPTZ DEFAULT now(),
    effective_to    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_access_group_user UNIQUE (access_group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_agu_group     ON dm3_access.access_group_users(access_group_id);
CREATE INDEX IF NOT EXISTS idx_agu_user      ON dm3_access.access_group_users(user_id);
CREATE INDEX IF NOT EXISTS idx_agu_tenant    ON dm3_access.access_group_users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_agu_effective ON dm3_access.access_group_users(effective_to)
    WHERE effective_to IS NOT NULL;

-- 2. Per-group schedule override on the group↔access_point junction
--    COALESCE(agap.access_time_id, ap.access_time_id) gives group-specific
--    schedule with fallback to the access point default.
ALTER TABLE dm3_access.access_group_access_points
    ADD COLUMN IF NOT EXISTS access_time_id UUID REFERENCES dm3_access.access_times(id) ON DELETE SET NULL;

-- 3. Migrate existing data: users.access_group_id → access_group_users
INSERT INTO dm3_access.access_group_users (tenant_id, access_group_id, user_id, effective_from)
SELECT u.tenant_id, u.access_group_id, u.id, COALESCE(u.created_at, now())
FROM dm3_identity.users u
WHERE u.access_group_id IS NOT NULL
  AND (u.is_deleted = false OR u.is_deleted IS NULL)
ON CONFLICT (access_group_id, user_id) DO NOTHING;

-- 4. Update user_details VIEW to use junction table
CREATE OR REPLACE VIEW dm3_identity.user_details AS
SELECT
    u.id AS user_id,
    u.tenant_id,
    u.user_code,
    u.emp_number,
    u.first_name,
    u.last_name,
    CONCAT(u.first_name, ' ', u.last_name) AS full_name,
    u.email,
    u.position,
    u.status AS user_status,
    u.avatar,
    u.phone,
    u.address,
    u.birth_day,
    u.effective_date,
    u.expired_date,
    COALESCE(u.is_master_card, false) AS is_master_card,
    CASE a.role
        WHEN 'system_admin'    THEN 5
        WHEN 'primary_manager' THEN 4
        WHEN 'manager'         THEN 2
        WHEN 'operator'        THEN 1
        ELSE 1
    END AS account_type,
    d.name  AS department_name,
    ag_agg.access_group_name
FROM dm3_identity.users u
LEFT JOIN dm3_auth.accounts a        ON u.account_id   = a.id
LEFT JOIN dm3_identity.departments d ON u.department_id = d.id
LEFT JOIN LATERAL (
    SELECT string_agg(ag.name, ', ' ORDER BY ag.name) AS access_group_name
    FROM dm3_access.access_group_users agu
    JOIN dm3_access.access_groups ag ON ag.id = agu.access_group_id
        AND (ag.is_deleted = false OR ag.is_deleted IS NULL)
    WHERE agu.user_id = u.id
      AND (agu.effective_to IS NULL OR agu.effective_to > now())
) ag_agg ON true
WHERE u.is_deleted = false OR u.is_deleted IS NULL;

-- 5. Drop the old 1:1 column (data already migrated above)
ALTER TABLE dm3_identity.users DROP COLUMN IF EXISTS access_group_id;

-- 6. Drop unused access_group_id from departments
ALTER TABLE dm3_identity.departments DROP COLUMN IF EXISTS access_group_id;
