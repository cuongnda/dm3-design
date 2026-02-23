-- DM3 Initial Schema Migration
-- Creates all schemas and core tables

-- Schemas
CREATE SCHEMA IF NOT EXISTS dm3_devices;
CREATE SCHEMA IF NOT EXISTS dm3_access;
CREATE SCHEMA IF NOT EXISTS dm3_identity;
CREATE SCHEMA IF NOT EXISTS dm3_auth;
CREATE SCHEMA IF NOT EXISTS dm3_audit;

-- ============================================================
-- dm3_devices
-- ============================================================
CREATE TABLE IF NOT EXISTS dm3_devices.devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
    device_id VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(255),
    type VARCHAR(50) NOT NULL,
    status VARCHAR(20) DEFAULT 'offline',
    firmware_version VARCHAR(50),
    site_id VARCHAR(100),
    location VARCHAR(255),
    last_seen TIMESTAMPTZ,
    config JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_devices_tenant ON dm3_devices.devices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_devices_status ON dm3_devices.devices(status);

-- ============================================================
-- dm3_access
-- ============================================================
CREATE TABLE IF NOT EXISTS dm3_access.doors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
    name VARCHAR(255) NOT NULL,
    device_id UUID REFERENCES dm3_devices.devices(id),
    location VARCHAR(255),
    status VARCHAR(20) DEFAULT 'locked',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dm3_access.access_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
    name VARCHAR(255) NOT NULL,
    door_ids UUID[],
    person_group_ids UUID[],
    schedule JSONB,
    priority INT DEFAULT 0,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dm3_access.access_events (
    id UUID DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
    time TIMESTAMPTZ NOT NULL DEFAULT now(),
    door_id UUID,
    device_id UUID,
    person_id UUID,
    person_name VARCHAR(255),
    credential_type VARCHAR(50),
    direction VARCHAR(10),
    decision VARCHAR(20) NOT NULL,
    reason VARCHAR(255),
    metadata JSONB,
    PRIMARY KEY (tenant_id, time, id)
);

-- Convert to hypertable (idempotent check)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM timescaledb_information.hypertables
        WHERE hypertable_name = 'access_events'
    ) THEN
        PERFORM create_hypertable('dm3_access.access_events', 'time',
            partitioning_column => 'tenant_id', number_partitions => 2);
    END IF;
END $$;

-- ============================================================
-- dm3_identity
-- ============================================================
CREATE TABLE IF NOT EXISTS dm3_identity.persons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    department VARCHAR(100),
    role VARCHAR(100),
    employee_id VARCHAR(50),
    status VARCHAR(20) DEFAULT 'active',
    photo_url VARCHAR(500),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_persons_tenant ON dm3_identity.persons(tenant_id);

CREATE TABLE IF NOT EXISTS dm3_identity.credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
    person_id UUID NOT NULL REFERENCES dm3_identity.persons(id),
    type VARCHAR(50) NOT NULL,
    value TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'active',
    valid_from TIMESTAMPTZ,
    valid_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credentials_person ON dm3_identity.credentials(person_id);

-- ============================================================
-- dm3_auth
-- ============================================================
CREATE TABLE IF NOT EXISTS dm3_auth.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    roles TEXT[] DEFAULT '{"admin"}',
    status VARCHAR(20) DEFAULT 'active',
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);
