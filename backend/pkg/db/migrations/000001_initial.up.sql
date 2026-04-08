-- ============================================================
-- DM3 INIT MIGRATION — Full schema, single file
-- All schemas, tables, indexes, triggers, seed data
-- Naming: tenant_id (not company_id), users (not persons)
-- ============================================================

-- ============================================================
-- SCHEMAS
-- ============================================================
CREATE SCHEMA IF NOT EXISTS dm3_devices;
CREATE SCHEMA IF NOT EXISTS dm3_access;
CREATE SCHEMA IF NOT EXISTS dm3_identity;
CREATE SCHEMA IF NOT EXISTS dm3_auth;
CREATE SCHEMA IF NOT EXISTS dm3_audit;

-- ============================================================
-- SHARED TRIGGER: update_updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- dm3_auth.tenants
-- ============================================================
CREATE TABLE IF NOT EXISTS dm3_auth.tenants (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255) NOT NULL,
    code        VARCHAR(50)  NOT NULL UNIQUE,
    plan        VARCHAR(50)  DEFAULT 'starter',
    status      VARCHAR(20)  DEFAULT 'active',
    logo_url    VARCHAR(500),
    address     TEXT,
    phone       VARCHAR(50),
    email       VARCHAR(255),
    settings    JSONB DEFAULT '{}',
    max_devices INT  DEFAULT 50,
    max_users   INT  DEFAULT 20,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- dm3_auth.accounts
-- (tenant_id nullable for system_admin accounts)
-- ============================================================
CREATE TABLE IF NOT EXISTS dm3_auth.accounts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID REFERENCES dm3_auth.tenants(id),
    email               VARCHAR(255) NOT NULL,
    password_hash       VARCHAR(255) NOT NULL,
    first_name          VARCHAR(255),
    last_name           VARCHAR(255),
    full_name           VARCHAR(255),
    role                VARCHAR(50) NOT NULL DEFAULT 'operator'
                            CHECK (role IN ('system_admin','primary_manager','manager','operator','viewer')),
    permissions         TEXT[] DEFAULT '{}',
    status              VARCHAR(20) DEFAULT 'active'
                            CHECK (status IN ('active','inactive','suspended','deleted')),
    email_verified      BOOLEAN DEFAULT false,
    phone               VARCHAR(50),
    avatar_url          VARCHAR(500),
    locale              VARCHAR(10) DEFAULT 'vi',
    timezone            VARCHAR(50) DEFAULT 'Asia/Saigon',
    preferred_language  VARCHAR(5)  DEFAULT 'vi',
    session_timeout_min INT         DEFAULT 30,
    two_factor_enabled  BOOLEAN DEFAULT false,
    two_factor_secret   VARCHAR(32),
    last_login          TIMESTAMPTZ,
    login_count         INT DEFAULT 0,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now(),
    created_by          UUID,
    updated_by          UUID
);

-- Unique indexes handle NULL tenant_id correctly (NULL != NULL in PostgreSQL)
CREATE UNIQUE INDEX IF NOT EXISTS accounts_email_tenant_uq
    ON dm3_auth.accounts(email, tenant_id) WHERE tenant_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS accounts_email_no_tenant_uq
    ON dm3_auth.accounts(email) WHERE tenant_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_accounts_tenant_status ON dm3_auth.accounts(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_accounts_role          ON dm3_auth.accounts(role);
CREATE INDEX IF NOT EXISTS idx_accounts_last_login    ON dm3_auth.accounts(last_login);

CREATE TRIGGER update_accounts_updated_at
    BEFORE UPDATE ON dm3_auth.accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- dm3_auth.refresh_tokens
-- ============================================================
CREATE TABLE IF NOT EXISTS dm3_auth.refresh_tokens (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES dm3_auth.accounts(id) ON DELETE CASCADE,
    tenant_id  UUID REFERENCES dm3_auth.tenants(id),
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked    BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON dm3_auth.refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON dm3_auth.refresh_tokens(token_hash);

-- ============================================================
-- dm3_access.access_groups
-- (created before identity.users to allow FK)
-- ============================================================
CREATE TABLE IF NOT EXISTS dm3_access.access_groups (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      UUID NOT NULL REFERENCES dm3_auth.tenants(id),
    parent_id      UUID REFERENCES dm3_access.access_groups(id),
    name           VARCHAR(255) NOT NULL,
    is_default     BOOLEAN DEFAULT false,
    type           SMALLINT DEFAULT 1,
    access_time_id UUID, -- FK added after dm3_access.access_times is created
    created_on     TIMESTAMPTZ DEFAULT now(),
    updated_on     TIMESTAMPTZ DEFAULT now(),
    is_deleted     BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_access_groups_tenant ON dm3_access.access_groups(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ag_access_time       ON dm3_access.access_groups(access_time_id);

-- ============================================================
-- dm3_identity.departments
-- (created before identity.users to allow FK)
-- ============================================================
CREATE TABLE IF NOT EXISTS dm3_identity.departments (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES dm3_auth.tenants(id),
    parent_id             UUID REFERENCES dm3_identity.departments(id),
    department_manager_id UUID,
    name                  VARCHAR(255) NOT NULL,
    number                VARCHAR(100) DEFAULT '',
    created_at            TIMESTAMPTZ DEFAULT now(),
    updated_at            TIMESTAMPTZ DEFAULT now(),
    is_deleted            BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_departments_tenant ON dm3_identity.departments(tenant_id);

-- ============================================================
-- dm3_identity.users
-- ============================================================
CREATE TABLE IF NOT EXISTS dm3_identity.users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES dm3_auth.tenants(id),
    account_id      UUID REFERENCES dm3_auth.accounts(id) ON DELETE SET NULL,
    department_id   UUID REFERENCES dm3_identity.departments(id),
    first_name      VARCHAR(255) NOT NULL DEFAULT '',
    last_name       VARCHAR(255) NOT NULL DEFAULT '',
    email           VARCHAR(255),
    phone           VARCHAR(50),
    user_code       VARCHAR(100),
    emp_number      VARCHAR(100),
    position        VARCHAR(255),
    address         TEXT,
    sex             BOOLEAN,
    birth_day       DATE,
    effective_date  DATE,
    expired_date    DATE,
    avatar          VARCHAR(500),
    status          VARCHAR(20) DEFAULT 'active',
    is_deleted      BOOLEAN DEFAULT false,
    is_master_card  BOOLEAN DEFAULT false,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_identity_users_tenant     ON dm3_identity.users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_identity_users_email      ON dm3_identity.users(email);
CREATE INDEX IF NOT EXISTS idx_identity_users_name       ON dm3_identity.users(first_name, last_name);
CREATE INDEX IF NOT EXISTS idx_identity_users_department ON dm3_identity.users(department_id);
CREATE INDEX IF NOT EXISTS idx_identity_users_status     ON dm3_identity.users(status);
CREATE INDEX IF NOT EXISTS idx_identity_users_updated    ON dm3_identity.users(updated_at);

-- department_manager_id can now reference identity.users
ALTER TABLE dm3_identity.departments
    ADD COLUMN IF NOT EXISTS department_manager_id_fk UUID REFERENCES dm3_identity.users(id);

-- ============================================================
-- dm3_identity.credentials
-- ============================================================
CREATE TABLE IF NOT EXISTS dm3_identity.credentials (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES dm3_auth.tenants(id),
    user_id     UUID NOT NULL REFERENCES dm3_identity.users(id) ON DELETE CASCADE,
    type        VARCHAR(50) NOT NULL,
    value       TEXT NOT NULL,
    status      VARCHAR(20) DEFAULT 'active',
    valid_from  TIMESTAMPTZ,
    valid_until TIMESTAMPTZ,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credentials_user   ON dm3_identity.credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_credentials_tenant ON dm3_identity.credentials(tenant_id);
CREATE INDEX IF NOT EXISTS idx_credentials_type   ON dm3_identity.credentials(type);
CREATE INDEX IF NOT EXISTS idx_credentials_status ON dm3_identity.credentials(status);

-- ============================================================
-- dm3_identity.user_groups
-- ============================================================
CREATE TABLE IF NOT EXISTS dm3_identity.user_groups (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES dm3_auth.tenants(id),
    name        VARCHAR(255) NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_groups_tenant ON dm3_identity.user_groups(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_groups_name   ON dm3_identity.user_groups(name);

-- ============================================================
-- dm3_identity.user_group_members
-- ============================================================
CREATE TABLE IF NOT EXISTS dm3_identity.user_group_members (
    group_id  UUID NOT NULL REFERENCES dm3_identity.user_groups(id) ON DELETE CASCADE,
    user_id   UUID NOT NULL REFERENCES dm3_identity.users(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES dm3_auth.tenants(id),
    added_at  TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_group_members_tenant ON dm3_identity.user_group_members(tenant_id);

-- ============================================================
-- dm3_access.access_group_users  (M:N user ↔ access_group)
-- ============================================================
CREATE TABLE IF NOT EXISTS dm3_access.access_group_users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES dm3_auth.tenants(id),
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

-- ============================================================
-- dm3_identity.sync_meta
-- ============================================================
CREATE TABLE IF NOT EXISTS dm3_identity.sync_meta (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- dm3_identity.user_details VIEW
-- ============================================================
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

-- Trigger: soft-delete identity user when account status set to 'deleted'
CREATE OR REPLACE FUNCTION dm3_identity.on_account_deleted()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE dm3_identity.users
    SET is_deleted = true, status = 'deleted', updated_at = NOW()
    WHERE account_id = OLD.id AND (is_deleted = false OR is_deleted IS NULL);
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_account_deleted ON dm3_auth.accounts;
CREATE TRIGGER trg_account_deleted
    AFTER UPDATE ON dm3_auth.accounts
    FOR EACH ROW
    WHEN (NEW.status = 'deleted' AND OLD.status != 'deleted')
    EXECUTE FUNCTION dm3_identity.on_account_deleted();

-- ============================================================
-- dm3_devices.devices
-- ============================================================
CREATE TABLE IF NOT EXISTS dm3_devices.devices (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            UUID NOT NULL REFERENCES dm3_auth.tenants(id),
    device_id            VARCHAR(20) NOT NULL UNIQUE,
    name                 VARCHAR(255),
    type                 VARCHAR(50) NOT NULL,
    status               VARCHAR(20) DEFAULT 'offline',
    status_detail        VARCHAR(50),
    firmware_version     VARCHAR(50),
    site_id              VARCHAR(100),
    location             VARCHAR(255),
    last_seen            TIMESTAMPTZ,
    config               JSONB DEFAULT '{}',
    hardware_fingerprint JSONB,
    provisioned_at       TIMESTAMPTZ,
    provisioned_by       UUID,
    created_at           TIMESTAMPTZ DEFAULT now(),
    updated_at           TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_devices_tenant ON dm3_devices.devices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_devices_status ON dm3_devices.devices(status);

-- ============================================================
-- dm3_devices.firmwares
-- ============================================================
CREATE TABLE IF NOT EXISTS dm3_devices.firmwares (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version     VARCHAR(50)  NOT NULL,
    device_type VARCHAR(50)  NOT NULL,
    description TEXT,
    file_path   VARCHAR(500) NOT NULL,
    file_size   BIGINT       NOT NULL,
    checksum    VARCHAR(64),
    is_active   BOOLEAN DEFAULT true,
    uploaded_by UUID,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now(),
    UNIQUE (version, device_type),
    CONSTRAINT chk_firmware_device_type CHECK (device_type IN (
        'icu300n','itouch_pop','desktop_app','itouch_pop_x','dq_mini_plus','it100',
        'nexpa_lpr','xstation2','fv6000','pm85','itouch_30a','dp636x','df970',
        'biostation2','icu300nx','biostation3','ebkn_reader','ba8300','icu400',
        'ra08','dq8500','dq200','camera_dc','tb_vision','icu970'
    ))
);

CREATE INDEX IF NOT EXISTS idx_firmwares_device_type ON dm3_devices.firmwares(device_type);
CREATE INDEX IF NOT EXISTS idx_firmwares_is_active   ON dm3_devices.firmwares(is_active);
CREATE INDEX IF NOT EXISTS idx_firmwares_created_at  ON dm3_devices.firmwares(created_at DESC);

-- ============================================================
-- dm3_devices.provisioning_tokens
-- ============================================================
CREATE TABLE IF NOT EXISTS dm3_devices.provisioning_tokens (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  UUID NOT NULL REFERENCES dm3_auth.tenants(id) ON DELETE CASCADE,
    device_id  UUID NOT NULL REFERENCES dm3_devices.devices(id),
    token_hash VARCHAR(64) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_provisioning_tokens_tenant ON dm3_devices.provisioning_tokens(tenant_id);

-- ============================================================
-- dm3_devices.pending_registrations
-- ============================================================
CREATE TABLE IF NOT EXISTS dm3_devices.pending_registrations (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            UUID REFERENCES dm3_auth.tenants(id),
    rid                  VARCHAR(20) NOT NULL,
    device_type          VARCHAR(50) NOT NULL,
    firmware_version     VARCHAR(50),
    hardware_fingerprint JSONB,
    hmac_verified        BOOLEAN DEFAULT false,
    signature_verified   BOOLEAN DEFAULT false,
    status               VARCHAR(20) DEFAULT 'pending',
    assigned_by          UUID,
    reviewed_at          TIMESTAMPTZ,
    nonce                VARCHAR(100),
    created_at           TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pending_status ON dm3_devices.pending_registrations(status);
CREATE INDEX IF NOT EXISTS idx_pending_tenant ON dm3_devices.pending_registrations(tenant_id);

-- ============================================================
-- dm3_devices.used_nonces (replay protection, composite PK)
-- ============================================================
CREATE TABLE IF NOT EXISTS dm3_devices.used_nonces (
    tenant_id  UUID NOT NULL REFERENCES dm3_auth.tenants(id) ON DELETE CASCADE,
    nonce      VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (tenant_id, nonce)
);

-- ============================================================
-- dm3_access.zones
-- ============================================================
CREATE TABLE IF NOT EXISTS dm3_access.zones (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES dm3_auth.tenants(id),
    parent_id   UUID REFERENCES dm3_access.zones(id) ON DELETE SET NULL,
    name        VARCHAR(255) NOT NULL,
    description VARCHAR(500),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_zones_tenant ON dm3_access.zones(tenant_id);
CREATE INDEX IF NOT EXISTS idx_zones_parent ON dm3_access.zones(parent_id);

-- ============================================================
-- dm3_access.access_times  (access time templates)
-- ============================================================
CREATE TABLE IF NOT EXISTS dm3_access.access_times (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES dm3_auth.tenants(id),
    name        VARCHAR(100) NOT NULL,
    description TEXT,
    timezone    VARCHAR(50) NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_by  UUID,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_access_times_tenant ON dm3_access.access_times(tenant_id, is_active);

-- Now that access_times exists, add FK for access_groups.access_time_id
ALTER TABLE dm3_access.access_groups
    ADD CONSTRAINT fk_access_groups_access_time
    FOREIGN KEY (access_time_id) REFERENCES dm3_access.access_times(id) ON DELETE SET NULL;

-- ============================================================
-- dm3_access.access_time_slots
-- ============================================================
CREATE TABLE IF NOT EXISTS dm3_access.access_time_slots (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      UUID NOT NULL REFERENCES dm3_auth.tenants(id) ON DELETE CASCADE,
    access_time_id UUID NOT NULL REFERENCES dm3_access.access_times(id) ON DELETE CASCADE,
    day_of_week    INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
    start_time     TIME NOT NULL,
    end_time       TIME NOT NULL,
    slot_name      VARCHAR(50),
    is_active      BOOLEAN NOT NULL DEFAULT true,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT valid_time_range CHECK (start_time < end_time),
    UNIQUE(access_time_id, day_of_week, start_time, end_time)
);

CREATE INDEX IF NOT EXISTS idx_access_time_slots_tenant ON dm3_access.access_time_slots(tenant_id);
CREATE INDEX IF NOT EXISTS idx_access_time_slots_day    ON dm3_access.access_time_slots(access_time_id, day_of_week, is_active);

-- ============================================================
-- dm3_access.access_points
-- Logical access point: groups multiple physical devices under one zone.
-- access_time_id = NULL means 24/7 unrestricted access.
-- ============================================================
CREATE TABLE IF NOT EXISTS dm3_access.access_points (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      UUID NOT NULL REFERENCES dm3_auth.tenants(id),
    zone_id        UUID REFERENCES dm3_access.zones(id) ON DELETE SET NULL,
    access_time_id UUID REFERENCES dm3_access.access_times(id) ON DELETE SET NULL,
    name           VARCHAR(255) NOT NULL,
    description    VARCHAR(500),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_access_points_tenant ON dm3_access.access_points(tenant_id);
CREATE INDEX IF NOT EXISTS idx_access_points_zone   ON dm3_access.access_points(zone_id);

-- ============================================================
-- dm3_access.access_devices
-- Physical access device in access context.
-- Maps 1:1 to dm3_devices.devices via device_id.
-- ============================================================
CREATE TABLE IF NOT EXISTS dm3_access.access_devices (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID NOT NULL REFERENCES dm3_auth.tenants(id),
    device_id         UUID REFERENCES dm3_devices.devices(id),
    name              VARCHAR(255) NOT NULL,
    type              VARCHAR(20) NOT NULL DEFAULT 'door',
    status            VARCHAR(20) DEFAULT 'offline',
    state             VARCHAR(20) NOT NULL DEFAULT 'locked',
    mode              VARCHAR(20) NOT NULL DEFAULT 'normal',
    unlock_duration_ms INT NOT NULL DEFAULT 5000,
    anti_passback     BOOLEAN NOT NULL DEFAULT false,
    emergency_unlock  BOOLEAN NOT NULL DEFAULT true,
    firmware_version  VARCHAR(20),
    ip_address        INET,
    last_event_at     TIMESTAMPTZ,
    last_heartbeat_at TIMESTAMPTZ,
    config_version    INT NOT NULL DEFAULT 0,
    user_db_version   INT NOT NULL DEFAULT 0,
    rules_version     INT NOT NULL DEFAULT 0,
    metadata          JSONB DEFAULT '{}',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_access_devices_tenant ON dm3_access.access_devices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_access_devices_device ON dm3_access.access_devices(device_id);
CREATE INDEX IF NOT EXISTS idx_access_devices_status ON dm3_access.access_devices(status);
CREATE INDEX IF NOT EXISTS idx_access_devices_state  ON dm3_access.access_devices(state);

-- ============================================================
-- dm3_access.access_point_devices
-- Junction: 1 access point → N physical devices (with role)
-- role values: reader_in | reader_out | controller | camera
-- NOTE: access_device_id is stored as plain text (no FK) because
--       devices are owned by device-gateway service, not access service.
-- ============================================================
CREATE TABLE IF NOT EXISTS dm3_access.access_point_devices (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        UUID NOT NULL REFERENCES dm3_auth.tenants(id),
    access_point_id  UUID NOT NULL REFERENCES dm3_access.access_points(id) ON DELETE CASCADE,
    access_device_id TEXT NOT NULL,
    role             VARCHAR(20) NOT NULL DEFAULT 'reader_in',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_ap_access_device UNIQUE (access_point_id, access_device_id)
);

CREATE INDEX IF NOT EXISTS idx_ap_devices_ap     ON dm3_access.access_point_devices(access_point_id);
CREATE INDEX IF NOT EXISTS idx_ap_devices_device ON dm3_access.access_point_devices(access_device_id);
CREATE INDEX IF NOT EXISTS idx_ap_devices_tenant ON dm3_access.access_point_devices(tenant_id);

-- ============================================================
-- dm3_access.access_group_access_points
-- Junction: access group → access points (defines who can go where)
-- access_time_id allows per-group-point time override
-- ============================================================
CREATE TABLE IF NOT EXISTS dm3_access.access_group_access_points (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        UUID NOT NULL REFERENCES dm3_auth.tenants(id),
    access_group_id  UUID NOT NULL REFERENCES dm3_access.access_groups(id) ON DELETE CASCADE,
    access_point_id  UUID NOT NULL REFERENCES dm3_access.access_points(id) ON DELETE CASCADE,
    access_time_id   UUID REFERENCES dm3_access.access_times(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_ag_ap_tz UNIQUE (access_group_id, access_point_id, access_time_id)
);

CREATE INDEX IF NOT EXISTS idx_agap_group       ON dm3_access.access_group_access_points(access_group_id);
CREATE INDEX IF NOT EXISTS idx_agap_point       ON dm3_access.access_group_access_points(access_point_id);
CREATE INDEX IF NOT EXISTS idx_agap_tenant      ON dm3_access.access_group_access_points(tenant_id);
CREATE INDEX IF NOT EXISTS idx_agap_access_time ON dm3_access.access_group_access_points(access_time_id);

-- ============================================================
-- dm3_access.access_events (TimescaleDB hypertable)
-- ============================================================
CREATE TABLE IF NOT EXISTS dm3_access.access_events (
    id               UUID DEFAULT gen_random_uuid(),
    tenant_id        UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
    time             TIMESTAMPTZ NOT NULL DEFAULT now(),
    access_point_id  UUID,
    door_id          UUID,
    user_id          UUID,
    user_name        VARCHAR(255),
    credential_type  VARCHAR(50),
    direction        VARCHAR(10),
    decision         VARCHAR(20) NOT NULL,
    reason           VARCHAR(255),
    confidence       FLOAT,
    photo_ref        VARCHAR(200),
    temperature      FLOAT,
    decided_locally  BOOLEAN NOT NULL DEFAULT true,
    metadata         JSONB,
    PRIMARY KEY (tenant_id, time, id)
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM timescaledb_information.hypertables
        WHERE hypertable_name = 'access_events'
    ) THEN
        PERFORM create_hypertable('dm3_access.access_events', 'time',
            partitioning_column => 'tenant_id', number_partitions => 2);
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL; -- timescaledb may not be installed
END $$;

CREATE INDEX IF NOT EXISTS idx_access_events_ap   ON dm3_access.access_events(access_point_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_access_events_user ON dm3_access.access_events(user_id, time DESC);

-- ============================================================
-- Triggers: updated_at for dm3_access tables
-- ============================================================
CREATE OR REPLACE FUNCTION dm3_access.update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_access_points_updated_at') THEN
        CREATE TRIGGER trg_access_points_updated_at
            BEFORE UPDATE ON dm3_access.access_points
            FOR EACH ROW EXECUTE FUNCTION dm3_access.update_timestamp();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_access_times_updated_at') THEN
        CREATE TRIGGER trg_access_times_updated_at
            BEFORE UPDATE ON dm3_access.access_times
            FOR EACH ROW EXECUTE FUNCTION dm3_access.update_timestamp();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_access_devices_updated_at') THEN
        CREATE TRIGGER trg_access_devices_updated_at
            BEFORE UPDATE ON dm3_access.access_devices
            FOR EACH ROW EXECUTE FUNCTION dm3_access.update_timestamp();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_zones_updated_at') THEN
        CREATE TRIGGER trg_zones_updated_at
            BEFORE UPDATE ON dm3_access.zones
            FOR EACH ROW EXECUTE FUNCTION dm3_access.update_timestamp();
    END IF;
END $$;

-- ============================================================
-- SEED DATA
-- ============================================================

-- Default company
INSERT INTO dm3_auth.tenants (id, name, code, plan, status)
VALUES ('00000000-0000-0000-0000-000000000001', 'Duali Demo', 'duali-demo', 'enterprise', 'active')
ON CONFLICT DO NOTHING;

-- System admin (no tenant — global super admin)
-- Password: admin123
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM dm3_auth.accounts WHERE email = 'sysadmin@duali.com' AND tenant_id IS NULL
    ) THEN
        INSERT INTO dm3_auth.accounts
            (email, tenant_id, password_hash, full_name, role, status, email_verified, created_at, updated_at)
        VALUES (
            'sysadmin@duali.com', NULL,
            '$2b$12$npOZArrFi4NNiuhqOCthxusfTqXHaKXbbXhWDv1Df2mF6svcqg1.S',
            'System Administrator',
            'system_admin', 'active', true, NOW(), NOW()
        );
    END IF;
END $$;

-- Company admin for Duali Demo
-- Password: admin123
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM dm3_auth.accounts
        WHERE email = 'admin@duali.com'
          AND tenant_id = '00000000-0000-0000-0000-000000000001'
    ) THEN
        INSERT INTO dm3_auth.accounts
            (email, tenant_id, password_hash, first_name, full_name, role, status, email_verified, created_at, updated_at)
        VALUES (
            'admin@duali.com',
            '00000000-0000-0000-0000-000000000001',
            '$2b$12$npOZArrFi4NNiuhqOCthxusfTqXHaKXbbXhWDv1Df2mF6svcqg1.S',
            'Admin', 'Admin',
            'primary_manager', 'active', true, NOW(), NOW()
        );
    END IF;
END $$;
