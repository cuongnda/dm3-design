-- 002_access_enhanced.sql
-- Enhance access schema with full spec fields

-- Schedules table
CREATE TABLE IF NOT EXISTS dm3_access.schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
    name VARCHAR(100) NOT NULL,
    timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
    periods JSONB NOT NULL DEFAULT '[]',
    holidays_excluded BOOLEAN NOT NULL DEFAULT true,
    holiday_calendar_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enhance doors table
DO $$
BEGIN
    -- Add missing columns to doors
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='dm3_access' AND table_name='doors' AND column_name='site_id') THEN
        ALTER TABLE dm3_access.doors ADD COLUMN site_id UUID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='dm3_access' AND table_name='doors' AND column_name='zone_id') THEN
        ALTER TABLE dm3_access.doors ADD COLUMN zone_id UUID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='dm3_access' AND table_name='doors' AND column_name='description') THEN
        ALTER TABLE dm3_access.doors ADD COLUMN description VARCHAR(500);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='dm3_access' AND table_name='doors' AND column_name='type') THEN
        ALTER TABLE dm3_access.doors ADD COLUMN type VARCHAR(20) NOT NULL DEFAULT 'door';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='dm3_access' AND table_name='doors' AND column_name='floor') THEN
        ALTER TABLE dm3_access.doors ADD COLUMN floor VARCHAR(50);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='dm3_access' AND table_name='doors' AND column_name='building') THEN
        ALTER TABLE dm3_access.doors ADD COLUMN building VARCHAR(100);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='dm3_access' AND table_name='doors' AND column_name='state') THEN
        ALTER TABLE dm3_access.doors ADD COLUMN state VARCHAR(20) NOT NULL DEFAULT 'locked';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='dm3_access' AND table_name='doors' AND column_name='mode') THEN
        ALTER TABLE dm3_access.doors ADD COLUMN mode VARCHAR(20) NOT NULL DEFAULT 'normal';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='dm3_access' AND table_name='doors' AND column_name='controller_id') THEN
        ALTER TABLE dm3_access.doors ADD COLUMN controller_id UUID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='dm3_access' AND table_name='doors' AND column_name='unlock_duration_ms') THEN
        ALTER TABLE dm3_access.doors ADD COLUMN unlock_duration_ms INT NOT NULL DEFAULT 5000;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='dm3_access' AND table_name='doors' AND column_name='anti_passback') THEN
        ALTER TABLE dm3_access.doors ADD COLUMN anti_passback BOOLEAN NOT NULL DEFAULT false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='dm3_access' AND table_name='doors' AND column_name='emergency_unlock') THEN
        ALTER TABLE dm3_access.doors ADD COLUMN emergency_unlock BOOLEAN NOT NULL DEFAULT true;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='dm3_access' AND table_name='doors' AND column_name='camera_id') THEN
        ALTER TABLE dm3_access.doors ADD COLUMN camera_id UUID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='dm3_access' AND table_name='doors' AND column_name='firmware_version') THEN
        ALTER TABLE dm3_access.doors ADD COLUMN firmware_version VARCHAR(20);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='dm3_access' AND table_name='doors' AND column_name='ip_address') THEN
        ALTER TABLE dm3_access.doors ADD COLUMN ip_address INET;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='dm3_access' AND table_name='doors' AND column_name='last_event_at') THEN
        ALTER TABLE dm3_access.doors ADD COLUMN last_event_at TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='dm3_access' AND table_name='doors' AND column_name='last_heartbeat_at') THEN
        ALTER TABLE dm3_access.doors ADD COLUMN last_heartbeat_at TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='dm3_access' AND table_name='doors' AND column_name='config_version') THEN
        ALTER TABLE dm3_access.doors ADD COLUMN config_version INT NOT NULL DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='dm3_access' AND table_name='doors' AND column_name='person_db_version') THEN
        ALTER TABLE dm3_access.doors ADD COLUMN person_db_version INT NOT NULL DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='dm3_access' AND table_name='doors' AND column_name='rules_version') THEN
        ALTER TABLE dm3_access.doors ADD COLUMN rules_version INT NOT NULL DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='dm3_access' AND table_name='doors' AND column_name='metadata') THEN
        ALTER TABLE dm3_access.doors ADD COLUMN metadata JSONB DEFAULT '{}';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='dm3_access' AND table_name='doors' AND column_name='updated_at') THEN
        ALTER TABLE dm3_access.doors ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
    END IF;

    -- Enhance access_rules
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='dm3_access' AND table_name='access_rules' AND column_name='site_id') THEN
        ALTER TABLE dm3_access.access_rules ADD COLUMN site_id UUID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='dm3_access' AND table_name='access_rules' AND column_name='description') THEN
        ALTER TABLE dm3_access.access_rules ADD COLUMN description VARCHAR(500);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='dm3_access' AND table_name='access_rules' AND column_name='schedule_id') THEN
        ALTER TABLE dm3_access.access_rules ADD COLUMN schedule_id UUID REFERENCES dm3_access.schedules(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='dm3_access' AND table_name='access_rules' AND column_name='anti_passback') THEN
        ALTER TABLE dm3_access.access_rules ADD COLUMN anti_passback BOOLEAN NOT NULL DEFAULT false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='dm3_access' AND table_name='access_rules' AND column_name='multi_factor') THEN
        ALTER TABLE dm3_access.access_rules ADD COLUMN multi_factor BOOLEAN NOT NULL DEFAULT false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='dm3_access' AND table_name='access_rules' AND column_name='max_failed_attempts') THEN
        ALTER TABLE dm3_access.access_rules ADD COLUMN max_failed_attempts INT NOT NULL DEFAULT 5;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='dm3_access' AND table_name='access_rules' AND column_name='lockout_duration_ms') THEN
        ALTER TABLE dm3_access.access_rules ADD COLUMN lockout_duration_ms INT NOT NULL DEFAULT 300000;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='dm3_access' AND table_name='access_rules' AND column_name='valid_from') THEN
        ALTER TABLE dm3_access.access_rules ADD COLUMN valid_from TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='dm3_access' AND table_name='access_rules' AND column_name='valid_until') THEN
        ALTER TABLE dm3_access.access_rules ADD COLUMN valid_until TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='dm3_access' AND table_name='access_rules' AND column_name='created_by') THEN
        ALTER TABLE dm3_access.access_rules ADD COLUMN created_by UUID;
    END IF;

    -- Enhance access_events
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='dm3_access' AND table_name='access_events' AND column_name='confidence') THEN
        ALTER TABLE dm3_access.access_events ADD COLUMN confidence FLOAT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='dm3_access' AND table_name='access_events' AND column_name='photo_ref') THEN
        ALTER TABLE dm3_access.access_events ADD COLUMN photo_ref VARCHAR(200);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='dm3_access' AND table_name='access_events' AND column_name='temperature') THEN
        ALTER TABLE dm3_access.access_events ADD COLUMN temperature FLOAT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='dm3_access' AND table_name='access_events' AND column_name='decided_locally') THEN
        ALTER TABLE dm3_access.access_events ADD COLUMN decided_locally BOOLEAN NOT NULL DEFAULT true;
    END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_doors_site ON dm3_access.doors(site_id);
CREATE INDEX IF NOT EXISTS idx_doors_zone ON dm3_access.doors(zone_id);
CREATE INDEX IF NOT EXISTS idx_doors_status ON dm3_access.doors(status);
CREATE INDEX IF NOT EXISTS idx_doors_state ON dm3_access.doors(state);
CREATE INDEX IF NOT EXISTS idx_access_rules_site ON dm3_access.access_rules(site_id);
CREATE INDEX IF NOT EXISTS idx_schedules_tenant ON dm3_access.schedules(tenant_id);
