-- 011_tenant_isolation_enhanced.sql - Enhanced Tenant Isolation System

-- Add NOT NULL constraints to tenant_id where missing (with proper checks)
DO $$
BEGIN
    -- Devices table
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints 
        WHERE constraint_name = 'devices_tenant_id_not_null' 
        AND table_name = 'devices'
    ) THEN
        ALTER TABLE dm3_devices.devices ADD CONSTRAINT devices_tenant_id_not_null CHECK (tenant_id IS NOT NULL);
    END IF;

    -- Persons table  
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints
        WHERE constraint_name = 'persons_tenant_id_not_null'
        AND table_name = 'persons'  
    ) THEN
        ALTER TABLE dm3_identity.persons ADD CONSTRAINT persons_tenant_id_not_null CHECK (tenant_id IS NOT NULL);
    END IF;

    -- Credentials table
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints
        WHERE constraint_name = 'credentials_tenant_id_not_null'
        AND table_name = 'credentials'
    ) THEN  
        ALTER TABLE dm3_identity.credentials ADD CONSTRAINT credentials_tenant_id_not_null CHECK (tenant_id IS NOT NULL);
    END IF;

    -- Access rules table
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints
        WHERE constraint_name = 'access_rules_tenant_id_not_null' 
        AND table_name = 'access_rules'
    ) THEN
        ALTER TABLE dm3_access.access_rules ADD CONSTRAINT access_rules_tenant_id_not_null CHECK (tenant_id IS NOT NULL);
    END IF;

    -- Doors table
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints
        WHERE constraint_name = 'doors_tenant_id_not_null'
        AND table_name = 'doors'
    ) THEN
        ALTER TABLE dm3_access.doors ADD CONSTRAINT doors_tenant_id_not_null CHECK (tenant_id IS NOT NULL);
    END IF;

    -- Access events table  
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints
        WHERE constraint_name = 'access_events_tenant_id_not_null'
        AND table_name = 'access_events' 
    ) THEN
        ALTER TABLE dm3_access.access_events ADD CONSTRAINT access_events_tenant_id_not_null CHECK (tenant_id IS NOT NULL);
    END IF;
END $$;

-- Add foreign key constraints to ensure tenant_id references valid companies
DO $$
BEGIN
    -- Devices -> Companies FK
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_devices_tenant_company'
        AND table_name = 'devices'
    ) THEN
        ALTER TABLE dm3_devices.devices 
        ADD CONSTRAINT fk_devices_tenant_company 
        FOREIGN KEY (tenant_id) REFERENCES dm3_auth.companies(id);
    END IF;

    -- Persons -> Companies FK  
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_persons_tenant_company'
        AND table_name = 'persons'
    ) THEN
        ALTER TABLE dm3_identity.persons
        ADD CONSTRAINT fk_persons_tenant_company
        FOREIGN KEY (tenant_id) REFERENCES dm3_auth.companies(id);
    END IF;

    -- Credentials -> Companies FK
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_credentials_tenant_company' 
        AND table_name = 'credentials'
    ) THEN
        ALTER TABLE dm3_identity.credentials
        ADD CONSTRAINT fk_credentials_tenant_company
        FOREIGN KEY (tenant_id) REFERENCES dm3_auth.companies(id);
    END IF;

    -- Access rules -> Companies FK
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_access_rules_tenant_company'
        AND table_name = 'access_rules'
    ) THEN
        ALTER TABLE dm3_access.access_rules
        ADD CONSTRAINT fk_access_rules_tenant_company  
        FOREIGN KEY (tenant_id) REFERENCES dm3_auth.companies(id);
    END IF;

    -- Doors -> Companies FK
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_doors_tenant_company'
        AND table_name = 'doors'
    ) THEN
        ALTER TABLE dm3_access.doors
        ADD CONSTRAINT fk_doors_tenant_company
        FOREIGN KEY (tenant_id) REFERENCES dm3_auth.companies(id);
    END IF;

    -- Access events -> Companies FK
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_access_events_tenant_company'
        AND table_name = 'access_events'
    ) THEN
        ALTER TABLE dm3_access.access_events
        ADD CONSTRAINT fk_access_events_tenant_company
        FOREIGN KEY (tenant_id) REFERENCES dm3_auth.companies(id);
    END IF;
END $$;

-- Create indexes for better tenant isolation performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_devices_tenant_status ON dm3_devices.devices(tenant_id, status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_persons_tenant_status ON dm3_identity.persons(tenant_id, status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_credentials_tenant_person ON dm3_identity.credentials(tenant_id, person_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_access_rules_tenant_enabled ON dm3_access.access_rules(tenant_id, enabled);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_doors_tenant_status ON dm3_access.doors(tenant_id, status);

-- Create a view for tenant usage statistics
CREATE OR REPLACE VIEW dm3_auth.tenant_usage_stats AS
SELECT 
    c.id as tenant_id,
    c.name as tenant_name,
    c.code as tenant_code,
    c.plan,
    c.status,
    c.max_devices,
    c.max_users,
    COALESCE(device_stats.device_count, 0) as current_devices,
    COALESCE(user_stats.user_count, 0) as current_users,
    COALESCE(person_stats.person_count, 0) as current_persons,
    COALESCE(rule_stats.rule_count, 0) as current_rules,
    -- Usage percentages
    CASE 
        WHEN c.max_devices > 0 THEN ROUND((COALESCE(device_stats.device_count, 0)::float / c.max_devices) * 100, 1)
        ELSE 0
    END as device_usage_pct,
    CASE
        WHEN c.max_users > 0 THEN ROUND((COALESCE(user_stats.user_count, 0)::float / c.max_users) * 100, 1)
        ELSE 0
    END as user_usage_pct
FROM dm3_auth.companies c
LEFT JOIN (
    SELECT tenant_id, COUNT(*) as device_count
    FROM dm3_devices.devices
    WHERE status != 'deleted'
    GROUP BY tenant_id
) device_stats ON c.id = device_stats.tenant_id
LEFT JOIN (
    SELECT company_id, COUNT(*) as user_count  
    FROM dm3_auth.users
    WHERE status = 'active'
    GROUP BY company_id
) user_stats ON c.id = user_stats.company_id
LEFT JOIN (
    SELECT tenant_id, COUNT(*) as person_count
    FROM dm3_identity.persons
    WHERE status = 'active'
    GROUP BY tenant_id
) person_stats ON c.id = person_stats.tenant_id
LEFT JOIN (
    SELECT tenant_id, COUNT(*) as rule_count
    FROM dm3_access.access_rules
    WHERE enabled = true
    GROUP BY tenant_id
) rule_stats ON c.id = rule_stats.tenant_id
WHERE c.status != 'deleted';

-- Create a function to validate cross-tenant references
CREATE OR REPLACE FUNCTION validate_tenant_isolation()
RETURNS TABLE(
    issue_type TEXT,
    table_name TEXT, 
    issue_count BIGINT,
    description TEXT
) LANGUAGE plpgsql AS $$
BEGIN
    -- Check for records without tenant_id
    RETURN QUERY
    SELECT 
        'missing_tenant_id'::TEXT,
        'dm3_devices.devices'::TEXT,
        COUNT(*)::BIGINT,
        'Devices without tenant_id'::TEXT
    FROM dm3_devices.devices 
    WHERE tenant_id IS NULL
    HAVING COUNT(*) > 0;

    RETURN QUERY
    SELECT
        'missing_tenant_id'::TEXT,
        'dm3_identity.persons'::TEXT, 
        COUNT(*)::BIGINT,
        'Persons without tenant_id'::TEXT
    FROM dm3_identity.persons
    WHERE tenant_id IS NULL
    HAVING COUNT(*) > 0;

    -- Check for cross-tenant references  
    RETURN QUERY
    SELECT
        'cross_tenant_reference'::TEXT,
        'dm3_identity.credentials'::TEXT,
        COUNT(*)::BIGINT, 
        'Credentials referencing persons from different tenants'::TEXT
    FROM dm3_identity.credentials c
    JOIN dm3_identity.persons p ON c.person_id = p.id
    WHERE c.tenant_id != p.tenant_id
    HAVING COUNT(*) > 0;

    -- Check for orphaned tenant references
    RETURN QUERY
    SELECT
        'orphaned_tenant_reference'::TEXT,
        'dm3_devices.devices'::TEXT,
        COUNT(*)::BIGINT,
        'Devices referencing non-existent companies'::TEXT  
    FROM dm3_devices.devices d
    LEFT JOIN dm3_auth.companies c ON d.tenant_id = c.id
    WHERE c.id IS NULL
    HAVING COUNT(*) > 0;

    RETURN;
END $$;

-- Create a function to generate tenant isolation audit report
CREATE OR REPLACE FUNCTION tenant_isolation_audit()
RETURNS TABLE(
    tenant_name TEXT,
    tenant_code TEXT,
    devices_count BIGINT,
    persons_count BIGINT,
    users_count BIGINT,
    rules_count BIGINT,
    potential_issues TEXT[]
) LANGUAGE plpgsql AS $$
DECLARE
    tenant_record RECORD;
    issues TEXT[];
BEGIN
    FOR tenant_record IN 
        SELECT id, name, code FROM dm3_auth.companies WHERE status = 'active'
    LOOP
        issues := ARRAY[]::TEXT[];
        
        -- Check for missing tenant_id in related records
        IF EXISTS (SELECT 1 FROM dm3_devices.devices WHERE tenant_id != tenant_record.id AND device_id LIKE '%' || tenant_record.code || '%') THEN
            issues := array_append(issues, 'Devices with mismatched tenant_id');
        END IF;
        
        RETURN QUERY
        SELECT
            tenant_record.name,
            tenant_record.code,
            (SELECT COUNT(*) FROM dm3_devices.devices WHERE tenant_id = tenant_record.id),
            (SELECT COUNT(*) FROM dm3_identity.persons WHERE tenant_id = tenant_record.id),
            (SELECT COUNT(*) FROM dm3_auth.users WHERE company_id = tenant_record.id),
            (SELECT COUNT(*) FROM dm3_access.access_rules WHERE tenant_id = tenant_record.id),
            issues;
    END LOOP;
    
    RETURN;
END $$;

-- Add comments for documentation
COMMENT ON VIEW dm3_auth.tenant_usage_stats IS 'Real-time usage statistics for all tenants including device/user counts and usage percentages';
COMMENT ON FUNCTION validate_tenant_isolation() IS 'Validates data integrity for tenant isolation - identifies missing tenant_ids and cross-tenant references';
COMMENT ON FUNCTION tenant_isolation_audit() IS 'Generates a comprehensive tenant isolation audit report showing resource counts and potential issues';