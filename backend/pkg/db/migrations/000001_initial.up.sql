-- ============================================================
-- DM3 Consolidated Migration — Full schema, single file
-- Merges migrations 000001–000017 into final state.
-- All schemas, tables, indexes, triggers, seed data.
-- ============================================================

-- ============================================================
-- SCHEMAS
-- ============================================================
CREATE SCHEMA IF NOT EXISTS dm3_devices;
CREATE SCHEMA IF NOT EXISTS dm3_access;
CREATE SCHEMA IF NOT EXISTS dm3_identity;
CREATE SCHEMA IF NOT EXISTS dm3_auth;
CREATE SCHEMA IF NOT EXISTS dm3_audit;
CREATE SCHEMA IF NOT EXISTS dm3_operate;

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
-- Flat structure (no parent_id). description added.
-- ============================================================
CREATE TABLE IF NOT EXISTS dm3_access.access_groups (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      UUID NOT NULL REFERENCES dm3_auth.tenants(id),
    name           VARCHAR(255) NOT NULL,
    description    VARCHAR(500),
    is_default     BOOLEAN DEFAULT false,
    type           SMALLINT DEFAULT 1,
    access_time_id UUID, -- FK added after dm3_access.access_times is created
    created_at     TIMESTAMPTZ DEFAULT now(),
    updated_at     TIMESTAMPTZ DEFAULT now(),
    is_deleted     BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_access_groups_tenant ON dm3_access.access_groups(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ag_access_time       ON dm3_access.access_groups(access_time_id);

-- ============================================================
-- dm3_identity.departments
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
-- dm3_access.access_group_users  (M:N user <-> access_group)
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
-- Includes model, network, verify config, CHECK constraints.
-- ============================================================
CREATE TABLE IF NOT EXISTS dm3_devices.devices (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            UUID NOT NULL REFERENCES dm3_auth.tenants(id),
    device_id            VARCHAR(20) NOT NULL UNIQUE,
    name                 VARCHAR(255),
    type                 VARCHAR(50) NOT NULL,
    status               VARCHAR(20) DEFAULT 'offline',
    firmware_version     VARCHAR(50),
    location             VARCHAR(255),
    model                VARCHAR(50),
    ip_address           INET,
    mac_address          MACADDR,
    timezone             VARCHAR(50) DEFAULT 'Asia/Ho_Chi_Minh',
    open_relay_ms        INT DEFAULT 3000,
    verify_methods       TEXT[] DEFAULT '{}',
    verify_logic         VARCHAR(5) DEFAULT 'or',
    last_seen            TIMESTAMPTZ,
    config               JSONB DEFAULT '{}',
    hardware_fingerprint JSONB,
    provisioned_at       TIMESTAMPTZ,
    provisioned_by       UUID,
    created_at           TIMESTAMPTZ DEFAULT now(),
    updated_at           TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT chk_device_type CHECK (type IN ('terminal', 'controller', 'camera', 'sensor')),
    CONSTRAINT chk_device_status CHECK (status IN ('online', 'offline', 'warning')),
    CONSTRAINT chk_verify_logic CHECK (verify_logic IN ('or', 'and')),
    CONSTRAINT chk_device_model CHECK (model IS NULL OR model IN (
        'ra08','ba8300','df970','dq200','dq8500','icu970',
        'icu300n','ipopx','itouch_pop_x','icu400',
        'camera_dc','cctv',
        'door_sensor','de960','de950',
        'dqmini_plus'
    ))
);

CREATE INDEX IF NOT EXISTS idx_devices_tenant ON dm3_devices.devices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_devices_status ON dm3_devices.devices(status);
CREATE INDEX IF NOT EXISTS idx_devices_model  ON dm3_devices.devices(model);
CREATE INDEX IF NOT EXISTS idx_devices_type   ON dm3_devices.devices(type);

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
        'ra08','ba8300','df970','dq200','dq8500','icu970',
        'icu300n','ipopx','itouch_pop_x','icu400',
        'camera_dc','cctv',
        'door_sensor','de960','de950',
        'dqmini_plus'
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
-- dm3_devices.used_nonces (replay protection)
-- ============================================================
CREATE TABLE IF NOT EXISTS dm3_devices.used_nonces (
    tenant_id  UUID NOT NULL REFERENCES dm3_auth.tenants(id) ON DELETE CASCADE,
    nonce      VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (tenant_id, nonce)
);

-- ============================================================
-- dm3_access.zones
-- Includes spatial / location fields and indoor map support.
-- ============================================================
CREATE TABLE IF NOT EXISTS dm3_access.zones (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      UUID NOT NULL REFERENCES dm3_auth.tenants(id),
    parent_id      UUID REFERENCES dm3_access.zones(id) ON DELETE SET NULL,
    name           VARCHAR(255) NOT NULL,
    description    VARCHAR(500),
    timezone       VARCHAR(50),
    latitude       DOUBLE PRECISION,
    longitude      DOUBLE PRECISION,
    address        TEXT,
    floor          VARCHAR(50),
    building       VARCHAR(100),
    map_image_url  VARCHAR(500),
    map_width      INT,
    map_height     INT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_zones_tenant ON dm3_access.zones(tenant_id);
CREATE INDEX IF NOT EXISTS idx_zones_parent ON dm3_access.zones(parent_id);

COMMENT ON COLUMN dm3_access.zones.timezone      IS 'IANA timezone (e.g. Asia/Ho_Chi_Minh). NULL = inherit from parent or site default';
COMMENT ON COLUMN dm3_access.zones.latitude       IS 'GPS latitude of zone centroid';
COMMENT ON COLUMN dm3_access.zones.longitude      IS 'GPS longitude of zone centroid';
COMMENT ON COLUMN dm3_access.zones.floor          IS 'Floor/level identifier (e.g. 1F, B1)';
COMMENT ON COLUMN dm3_access.zones.building       IS 'Building name';
COMMENT ON COLUMN dm3_access.zones.map_image_url  IS 'Path/URL to indoor map or floor plan image (MinIO)';
COMMENT ON COLUMN dm3_access.zones.map_width      IS 'Map image natural width in px';
COMMENT ON COLUMN dm3_access.zones.map_height     IS 'Map image natural height in px';

-- ============================================================
-- dm3_access.access_times
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
-- Includes map placement fields for zone floor plans.
-- ============================================================
CREATE TABLE IF NOT EXISTS dm3_access.access_points (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      UUID NOT NULL REFERENCES dm3_auth.tenants(id),
    zone_id        UUID REFERENCES dm3_access.zones(id) ON DELETE SET NULL,
    access_time_id UUID REFERENCES dm3_access.access_times(id) ON DELETE SET NULL,
    name           VARCHAR(255) NOT NULL,
    description    VARCHAR(500),
    map_x          DOUBLE PRECISION,
    map_y          DOUBLE PRECISION,
    map_rotation   DOUBLE PRECISION DEFAULT 0,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_access_points_tenant ON dm3_access.access_points(tenant_id);
CREATE INDEX IF NOT EXISTS idx_access_points_zone   ON dm3_access.access_points(zone_id);

COMMENT ON COLUMN dm3_access.access_points.map_x        IS 'X position on zone map (0.0-1.0 normalized)';
COMMENT ON COLUMN dm3_access.access_points.map_y        IS 'Y position on zone map (0.0-1.0 normalized)';
COMMENT ON COLUMN dm3_access.access_points.map_rotation IS 'Rotation angle in degrees (0-360) for map icon';

-- ============================================================
-- dm3_access.access_devices
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
-- Junction: 1 access point -> N physical devices (with role)
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
-- Simplified: no per-link access_time_id, unique on (group, point).
-- ============================================================
CREATE TABLE IF NOT EXISTS dm3_access.access_group_access_points (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        UUID NOT NULL REFERENCES dm3_auth.tenants(id),
    access_group_id  UUID NOT NULL REFERENCES dm3_access.access_groups(id) ON DELETE CASCADE,
    access_point_id  UUID NOT NULL REFERENCES dm3_access.access_points(id) ON DELETE CASCADE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_ag_ap UNIQUE (access_group_id, access_point_id)
);

CREATE INDEX IF NOT EXISTS idx_agap_group  ON dm3_access.access_group_access_points(access_group_id);
CREATE INDEX IF NOT EXISTS idx_agap_point  ON dm3_access.access_group_access_points(access_point_id);
CREATE INDEX IF NOT EXISTS idx_agap_tenant ON dm3_access.access_group_access_points(tenant_id);

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
    NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_access_events_ap   ON dm3_access.access_events(access_point_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_access_events_user ON dm3_access.access_events(user_id, time DESC);

-- ============================================================
-- dm3_access triggers
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
-- dm3_audit.audit_logs (TimescaleDB hypertable)
-- ============================================================
CREATE TABLE IF NOT EXISTS dm3_audit.audit_logs (
    id          UUID DEFAULT gen_random_uuid(),
    time        TIMESTAMPTZ NOT NULL DEFAULT now(),
    tenant_id   UUID,
    actor_id    UUID,
    actor_email VARCHAR(255),
    actor_ip    INET,
    user_agent  TEXT,
    service     VARCHAR(50) NOT NULL,
    action      VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id   VARCHAR(255),
    entity_name VARCHAR(255),
    status      VARCHAR(20) DEFAULT 'success',
    old_values  JSONB,
    new_values  JSONB,
    metadata    JSONB DEFAULT '{}',
    PRIMARY KEY (id, time)
);

SELECT create_hypertable('dm3_audit.audit_logs', 'time',
    chunk_time_interval => INTERVAL '7 days',
    if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS idx_audit_tenant_time ON dm3_audit.audit_logs(tenant_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor_time  ON dm3_audit.audit_logs(actor_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity      ON dm3_audit.audit_logs(entity_type, entity_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action      ON dm3_audit.audit_logs(action, time DESC);

SELECT add_retention_policy('dm3_audit.audit_logs',
    INTERVAL '2 years',
    if_not_exists => TRUE
);

ALTER TABLE dm3_audit.audit_logs SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'tenant_id, service',
    timescaledb.compress_orderby = 'time DESC'
);
SELECT add_compression_policy('dm3_audit.audit_logs',
    INTERVAL '30 days',
    if_not_exists => TRUE
);

REVOKE UPDATE, DELETE ON dm3_audit.audit_logs FROM dm3;

-- ============================================================
-- dm3_identity.vehicles
-- ============================================================
CREATE TABLE IF NOT EXISTS dm3_identity.vehicles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES dm3_auth.tenants(id),
    user_id         UUID REFERENCES dm3_identity.users(id) ON DELETE SET NULL,
    plate_number    VARCHAR(20) NOT NULL,
    vehicle_type    VARCHAR(20) NOT NULL DEFAULT 'car',
    brand           VARCHAR(100),
    model           VARCHAR(100),
    color           VARCHAR(50),
    description     TEXT,
    status          VARCHAR(20) NOT NULL DEFAULT 'active',
    is_deleted      BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_vehicle_type CHECK (vehicle_type IN ('car', 'motorbike', 'bicycle', 'truck', 'other')),
    CONSTRAINT chk_vehicle_status CHECK (status IN ('active', 'inactive', 'blacklisted')),
    CONSTRAINT uq_vehicle_plate_tenant UNIQUE (tenant_id, plate_number)
);

CREATE INDEX IF NOT EXISTS idx_vehicles_tenant ON dm3_identity.vehicles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_user   ON dm3_identity.vehicles(user_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_plate  ON dm3_identity.vehicles(plate_number);
CREATE INDEX IF NOT EXISTS idx_vehicles_status ON dm3_identity.vehicles(status);

-- ============================================================
-- dm3_identity.visitors (persistent visitor directory)
-- ============================================================
CREATE TABLE IF NOT EXISTS dm3_identity.visitors (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID NOT NULL,
    first_name        VARCHAR(100) NOT NULL,
    last_name         VARCHAR(100) NOT NULL,
    display_name      VARCHAR(200) GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED,
    email             VARCHAR(255),
    phone             VARCHAR(20),
    company           VARCHAR(200),
    national_id       VARCHAR(30),
    photo_ref         VARCHAR(500),
    watchlist_status  VARCHAR(20) DEFAULT 'none',
    watchlist_reason  TEXT,
    visit_count       INT DEFAULT 0,
    last_visit_at     TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_visitor_watchlist CHECK (watchlist_status IN ('none', 'vip', 'blacklisted'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_visitors_tenant_email
    ON dm3_identity.visitors(tenant_id, email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_visitors_tenant_phone
    ON dm3_identity.visitors(tenant_id, phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_visitors_tenant
    ON dm3_identity.visitors(tenant_id);
CREATE INDEX IF NOT EXISTS idx_visitors_national_id
    ON dm3_identity.visitors(tenant_id, national_id) WHERE national_id IS NOT NULL;

-- ============================================================
-- dm3_identity.visits (one row per visit)
-- ============================================================
CREATE TABLE IF NOT EXISTS dm3_identity.visits (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL,
    visitor_id          UUID NOT NULL REFERENCES dm3_identity.visitors(id),
    host_user_id        UUID NOT NULL,
    purpose             VARCHAR(30) NOT NULL,
    purpose_note        VARCHAR(500),
    status              VARCHAR(20) NOT NULL DEFAULT 'pre_registered',
    expected_arrival    TIMESTAMPTZ NOT NULL,
    expected_departure  TIMESTAMPTZ,
    actual_checkin      TIMESTAMPTZ,
    actual_checkout     TIMESTAMPTZ,
    checkin_method      VARCHAR(30),
    checkin_device_id   UUID,
    checkin_photo_ref   VARCHAR(500),
    checkout_by         UUID,
    qr_token            VARCHAR(64) NOT NULL,
    qr_expires_at       TIMESTAMPTZ NOT NULL,
    badge_number        VARCHAR(20),
    temp_credential_id  UUID,
    access_areas        UUID[],
    escort_required     BOOLEAN DEFAULT false,
    vehicle_plate       VARCHAR(20),
    items_carried       TEXT,
    nda_signed          BOOLEAN DEFAULT false,
    host_approved       BOOLEAN DEFAULT false,
    host_approved_at    TIMESTAMPTZ,
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_visit_purpose CHECK (purpose IN (
        'meeting', 'interview', 'delivery', 'maintenance', 'tour', 'contract_signing', 'other'
    )),
    CONSTRAINT chk_visit_status CHECK (status IN (
        'pre_registered', 'approved', 'waiting', 'checked_in', 'checked_out', 'cancelled', 'no_show', 'rejected'
    )),
    CONSTRAINT chk_visit_checkin_method CHECK (checkin_method IS NULL OR checkin_method IN (
        'terminal_qr', 'terminal_manual', 'reception', 'self_service', 'mobile_qr'
    ))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_visits_qr_token
    ON dm3_identity.visits(qr_token);
CREATE INDEX IF NOT EXISTS idx_visits_tenant_status
    ON dm3_identity.visits(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_visits_tenant_arrival
    ON dm3_identity.visits(tenant_id, expected_arrival);
CREATE INDEX IF NOT EXISTS idx_visits_host
    ON dm3_identity.visits(host_user_id);
CREATE INDEX IF NOT EXISTS idx_visits_visitor
    ON dm3_identity.visits(visitor_id);

-- ============================================================
-- dm3_identity.visitor_badges
-- ============================================================
CREATE TABLE IF NOT EXISTS dm3_identity.visitor_badges (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL,
    visit_id      UUID NOT NULL REFERENCES dm3_identity.visits(id),
    badge_number  VARCHAR(20) NOT NULL,
    badge_type    VARCHAR(20) NOT NULL DEFAULT 'standard',
    issued_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    returned_at   TIMESTAMPTZ,
    printed       BOOLEAN DEFAULT false,
    print_data    JSONB,

    CONSTRAINT chk_badge_type CHECK (badge_type IN ('standard', 'vip', 'contractor', 'temporary'))
);

CREATE INDEX IF NOT EXISTS idx_badges_tenant_available
    ON dm3_identity.visitor_badges(tenant_id, returned_at) WHERE returned_at IS NULL;

-- ============================================================
-- dm3_identity.watchlist (VIP / blacklist)
-- ============================================================
CREATE TABLE IF NOT EXISTS dm3_identity.watchlist (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID NOT NULL,
    entry_type        VARCHAR(20) NOT NULL,
    match_field       VARCHAR(50) NOT NULL,
    match_value       VARCHAR(500) NOT NULL,
    face_template_ref VARCHAR(500),
    reason            TEXT NOT NULL,
    added_by          UUID NOT NULL,
    expires_at        TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_watchlist_type CHECK (entry_type IN ('vip', 'blacklisted')),
    CONSTRAINT chk_watchlist_field CHECK (match_field IN ('name', 'national_id', 'email', 'phone', 'face'))
);

CREATE INDEX IF NOT EXISTS idx_watchlist_tenant
    ON dm3_identity.watchlist(tenant_id, entry_type);

-- dm3_identity triggers for visitor tables
CREATE OR REPLACE FUNCTION dm3_identity.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
    CREATE TRIGGER trg_visitors_updated_at BEFORE UPDATE ON dm3_identity.visitors
        FOR EACH ROW EXECUTE FUNCTION dm3_identity.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_visits_updated_at BEFORE UPDATE ON dm3_identity.visits
        FOR EACH ROW EXECUTE FUNCTION dm3_identity.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- dm3_operate: PARKING
-- ============================================================

CREATE TABLE IF NOT EXISTS dm3_operate.parking_lots (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES dm3_auth.tenants(id),
    site_id     UUID,
    name        VARCHAR(150) NOT NULL,
    code        VARCHAR(50) NOT NULL,
    description TEXT,
    status      VARCHAR(20) NOT NULL DEFAULT 'active',
    metadata    JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_parking_lots_code UNIQUE (tenant_id, code),
    CONSTRAINT chk_parking_lot_status CHECK (status IN ('active', 'maintenance', 'closed'))
);
CREATE INDEX IF NOT EXISTS idx_parking_lots_tenant ON dm3_operate.parking_lots(tenant_id);

CREATE TABLE IF NOT EXISTS dm3_operate.parking_zones (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES dm3_auth.tenants(id),
    lot_id                UUID NOT NULL REFERENCES dm3_operate.parking_lots(id) ON DELETE CASCADE,
    site_id               UUID,
    name                  VARCHAR(150) NOT NULL,
    code                  VARCHAR(50) NOT NULL,
    type                  VARCHAR(30) NOT NULL,
    level                 VARCHAR(30),
    total_spaces          INT NOT NULL DEFAULT 0,
    allowed_vehicle_types TEXT[] NOT NULL DEFAULT '{}',
    entry_devices         JSONB NOT NULL DEFAULT '[]',
    exit_devices          JSONB NOT NULL DEFAULT '[]',
    status                VARCHAR(20) NOT NULL DEFAULT 'active',
    metadata              JSONB NOT NULL DEFAULT '{}',
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_parking_zones_code UNIQUE (tenant_id, code),
    CONSTRAINT chk_parking_zone_type CHECK (type IN ('underground', 'surface', 'multi_story', 'rooftop')),
    CONSTRAINT chk_parking_zone_status CHECK (status IN ('active', 'maintenance', 'closed')),
    CONSTRAINT chk_parking_zone_spaces CHECK (total_spaces >= 0)
);
CREATE INDEX IF NOT EXISTS idx_parking_zones_tenant_lot ON dm3_operate.parking_zones(tenant_id, lot_id);

CREATE TABLE IF NOT EXISTS dm3_operate.parking_passes (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES dm3_auth.tenants(id),
    site_id       UUID,
    lot_id        UUID REFERENCES dm3_operate.parking_lots(id) ON DELETE SET NULL,
    zone_id       UUID NOT NULL REFERENCES dm3_operate.parking_zones(id) ON DELETE CASCADE,
    vehicle_id    UUID,  -- FK added after parking_vehicles is created
    user_id       UUID REFERENCES dm3_identity.users(id) ON DELETE SET NULL,
    pass_type     VARCHAR(30) NOT NULL DEFAULT 'standard',
    valid_from    DATE NOT NULL,
    valid_until   DATE NOT NULL,
    fee_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
    status        VARCHAR(20) NOT NULL DEFAULT 'active',
    auto_renew    BOOLEAN NOT NULL DEFAULT false,
    metadata      JSONB NOT NULL DEFAULT '{}',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_parking_pass_type CHECK (pass_type IN ('standard', 'vip', 'reserved_space', 'ev_included')),
    CONSTRAINT chk_parking_pass_status CHECK (status IN ('active', 'expired', 'suspended', 'cancelled')),
    CONSTRAINT chk_parking_pass_dates CHECK (valid_until >= valid_from)
);
CREATE INDEX IF NOT EXISTS idx_parking_passes_lookup ON dm3_operate.parking_passes(tenant_id, zone_id, status, valid_until DESC);

CREATE TABLE IF NOT EXISTS dm3_operate.parking_vehicles (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES dm3_auth.tenants(id),
    owner_user_id       UUID REFERENCES dm3_identity.users(id) ON DELETE SET NULL,
    plate_number        VARCHAR(30) NOT NULL,
    normalized_plate    VARCHAR(30) NOT NULL,
    plate_image_ref     VARCHAR(500),
    type                VARCHAR(20) NOT NULL,
    category            VARCHAR(20) NOT NULL DEFAULT 'visitor',
    brand               VARCHAR(80),
    color               VARCHAR(50),
    registration_status VARCHAR(20) NOT NULL DEFAULT 'registered',
    monthly_pass_id     UUID,
    active_pass_id      UUID REFERENCES dm3_operate.parking_passes(id) ON DELETE SET NULL,
    metadata            JSONB NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_parking_vehicle_plate UNIQUE (tenant_id, normalized_plate),
    CONSTRAINT chk_parking_vehicle_type CHECK (type IN ('car', 'motorbike', 'bicycle', 'truck')),
    CONSTRAINT chk_parking_vehicle_category CHECK (category IN ('resident', 'visitor', 'temporary')),
    CONSTRAINT chk_parking_vehicle_registration_status CHECK (registration_status IN ('registered', 'visitor', 'temporary', 'blacklisted'))
);
CREATE INDEX IF NOT EXISTS idx_parking_vehicles_tenant_owner ON dm3_operate.parking_vehicles(tenant_id, owner_user_id);

-- Now add FK from parking_passes.vehicle_id to parking_vehicles
ALTER TABLE dm3_operate.parking_passes
    ADD CONSTRAINT fk_parking_passes_vehicle
    FOREIGN KEY (vehicle_id) REFERENCES dm3_operate.parking_vehicles(id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS dm3_operate.parking_fee_rules (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID NOT NULL REFERENCES dm3_auth.tenants(id),
    site_id      UUID,
    lot_id       UUID REFERENCES dm3_operate.parking_lots(id) ON DELETE SET NULL,
    zone_id      UUID REFERENCES dm3_operate.parking_zones(id) ON DELETE SET NULL,
    name         VARCHAR(150) NOT NULL,
    vehicle_type VARCHAR(20) NOT NULL,
    rate_type    VARCHAR(20) NOT NULL,
    rates        JSONB NOT NULL,
    free_minutes INT NOT NULL DEFAULT 0,
    max_daily    NUMERIC(12,2),
    applies_to   VARCHAR(20) NOT NULL DEFAULT 'all',
    priority     INT NOT NULL DEFAULT 0,
    enabled      BOOLEAN NOT NULL DEFAULT true,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_parking_fee_vehicle_type CHECK (vehicle_type IN ('car', 'motorbike', 'bicycle', 'truck')),
    CONSTRAINT chk_parking_fee_rate_type CHECK (rate_type IN ('hourly', 'daily', 'flat', 'tiered')),
    CONSTRAINT chk_parking_fee_applies_to CHECK (applies_to IN ('all', 'visitor', 'registered', 'resident', 'temporary')),
    CONSTRAINT chk_parking_fee_free_minutes CHECK (free_minutes >= 0)
);
CREATE INDEX IF NOT EXISTS idx_parking_fee_rules_lookup ON dm3_operate.parking_fee_rules(tenant_id, vehicle_type, enabled, priority DESC);

CREATE TABLE IF NOT EXISTS dm3_operate.parking_sessions (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL REFERENCES dm3_auth.tenants(id),
    lot_id                  UUID NOT NULL REFERENCES dm3_operate.parking_lots(id),
    zone_id                 UUID NOT NULL REFERENCES dm3_operate.parking_zones(id),
    vehicle_id              UUID REFERENCES dm3_operate.parking_vehicles(id) ON DELETE SET NULL,
    plate_number            VARCHAR(30) NOT NULL,
    normalized_plate        VARCHAR(30) NOT NULL,
    vehicle_type            VARCHAR(20) NOT NULL,
    vehicle_category        VARCHAR(20),
    entry_time              TIMESTAMPTZ NOT NULL DEFAULT now(),
    exit_time               TIMESTAMPTZ,
    entry_device_id         UUID,
    exit_device_id          UUID,
    entry_plate_image       VARCHAR(500),
    exit_plate_image        VARCHAR(500),
    status                  VARCHAR(20) NOT NULL DEFAULT 'active',
    fee_amount              NUMERIC(12,2),
    fee_currency            VARCHAR(10) NOT NULL DEFAULT 'VND',
    fee_rule_id             UUID REFERENCES dm3_operate.parking_fee_rules(id) ON DELETE SET NULL,
    payment_status          VARCHAR(20),
    payment_method          VARCHAR(30),
    payment_ref             VARCHAR(120),
    payment_time            TIMESTAMPTZ,
    monthly_pass_id         UUID,
    matched_by              VARCHAR(30) NOT NULL DEFAULT 'manual',
    recognition_confidence  NUMERIC(5,4),
    decision_code           VARCHAR(50),
    decision_reason         TEXT,
    reviewed_at             TIMESTAMPTZ,
    reviewed_by             UUID,
    integration_state       JSONB NOT NULL DEFAULT '{}',
    metadata                JSONB NOT NULL DEFAULT '{}',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_parking_session_vehicle_type CHECK (vehicle_type IN ('car', 'motorbike', 'bicycle', 'truck')),
    CONSTRAINT chk_parking_session_category CHECK (vehicle_category IS NULL OR vehicle_category IN ('resident', 'visitor', 'temporary')),
    CONSTRAINT chk_parking_session_status CHECK (status IN ('active', 'completed', 'disputed', 'void')),
    CONSTRAINT chk_parking_session_payment_status CHECK (payment_status IS NULL OR payment_status IN ('pending', 'paid', 'waived', 'refunded')),
    CONSTRAINT chk_parking_session_times CHECK (exit_time IS NULL OR exit_time >= entry_time),
    CONSTRAINT chk_parking_session_matched_by CHECK (matched_by IN ('manual', 'anpr_auto', 'anpr_review', 'manual_override'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_parking_active_session_per_plate
    ON dm3_operate.parking_sessions(tenant_id, normalized_plate)
    WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_parking_sessions_tenant_zone_status
    ON dm3_operate.parking_sessions(tenant_id, zone_id, status, entry_time DESC);
CREATE INDEX IF NOT EXISTS idx_parking_sessions_vehicle ON dm3_operate.parking_sessions(vehicle_id);

-- Parking triggers
DO $$ BEGIN
    CREATE TRIGGER trg_parking_lots_updated_at BEFORE UPDATE ON dm3_operate.parking_lots
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_parking_zones_updated_at BEFORE UPDATE ON dm3_operate.parking_zones
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_parking_vehicles_updated_at BEFORE UPDATE ON dm3_operate.parking_vehicles
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_parking_fee_rules_updated_at BEFORE UPDATE ON dm3_operate.parking_fee_rules
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_parking_sessions_updated_at BEFORE UPDATE ON dm3_operate.parking_sessions
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_parking_passes_updated_at BEFORE UPDATE ON dm3_operate.parking_passes
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- SEED DATA
-- ============================================================

-- Default company
INSERT INTO dm3_auth.tenants (id, name, code, plan, status)
VALUES ('00000000-0000-0000-0000-000000000001', 'Duali Demo', 'duali-demo', 'enterprise', 'active')
ON CONFLICT DO NOTHING;

-- System admin (no tenant - global super admin)
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
