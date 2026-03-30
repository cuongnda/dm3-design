-- Migration 015: Alert and Automation Service
-- Creates tables for alert rules, instances, automation, channels, and related functionality

-- Create alert schema
CREATE SCHEMA IF NOT EXISTS dm3_alert;

-- Set search path for this migration
SET search_path TO dm3_alert, dm3_auth, public;

-- ──────────────────────────────────────────────────────────────────────────
-- Alert Rules Table
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE alert_rules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES dm3_auth.companies(id) ON DELETE CASCADE,
    name varchar(255) NOT NULL,
    description text,
    category varchar(50) NOT NULL DEFAULT 'custom',
    severity varchar(20) NOT NULL DEFAULT 'medium',
    is_enabled boolean NOT NULL DEFAULT true,
    
    -- Rule conditions (JSON format for flexibility)
    conditions jsonb NOT NULL DEFAULT '{}',
    
    -- Actions to take when rule triggers
    actions text[] NOT NULL DEFAULT '{}',
    
    -- Alert channels to notify (UUIDs as text array)
    channels text[] NOT NULL DEFAULT '{}',
    
    -- Optional escalation policy
    escalation_policy uuid,
    
    -- Throttling settings (JSON)
    throttle jsonb,
    
    -- Schedule settings (JSON) 
    schedule jsonb,
    
    -- Tags for organization
    tags text[] NOT NULL DEFAULT '{}',
    
    -- Additional metadata (JSON)
    metadata jsonb,
    
    -- Rule execution stats
    last_triggered timestamptz,
    trigger_count bigint NOT NULL DEFAULT 0,
    
    -- Standard audit fields
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL REFERENCES dm3_auth.users(id),
    deleted_at timestamptz
);

-- Indexes for alert rules
CREATE INDEX idx_alert_rules_tenant_id ON alert_rules(tenant_id);
CREATE INDEX idx_alert_rules_category ON alert_rules(category);
CREATE INDEX idx_alert_rules_severity ON alert_rules(severity);
CREATE INDEX idx_alert_rules_enabled ON alert_rules(is_enabled);
CREATE INDEX idx_alert_rules_deleted ON alert_rules(deleted_at);
CREATE INDEX idx_alert_rules_last_triggered ON alert_rules(last_triggered);
CREATE INDEX idx_alert_rules_conditions ON alert_rules USING GIN (conditions);
CREATE INDEX idx_alert_rules_tags ON alert_rules USING GIN (tags);

-- ──────────────────────────────────────────────────────────────────────────
-- Alert Instances Table  
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE alert_instances (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES dm3_auth.companies(id) ON DELETE CASCADE,
    rule_id uuid REFERENCES alert_rules(id) ON DELETE SET NULL,
    rule_name varchar(255) NOT NULL,
    
    -- Alert details
    title varchar(500) NOT NULL,
    description text,
    severity varchar(20) NOT NULL DEFAULT 'medium',
    status varchar(20) NOT NULL DEFAULT 'open',
    category varchar(50) NOT NULL DEFAULT 'custom',
    source varchar(100),
    
    -- Event data that triggered the alert (JSON)
    event_data jsonb,
    
    -- Alert timing
    triggered_at timestamptz NOT NULL DEFAULT now(),
    
    -- Acknowledgment
    acknowledged_at timestamptz,
    acknowledged_by uuid REFERENCES dm3_auth.users(id),
    acknowledge_note text,
    
    -- Resolution
    resolved_at timestamptz,
    resolved_by uuid REFERENCES dm3_auth.users(id),
    resolution_note text,
    
    -- Snoozing
    snoozed_until timestamptz,
    
    -- Escalation tracking
    escalation_level int NOT NULL DEFAULT 0,
    notifications_sent int NOT NULL DEFAULT 0,
    
    -- Tags and metadata
    tags text[] NOT NULL DEFAULT '{}',
    metadata jsonb,
    
    -- Standard audit fields
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for alert instances
CREATE INDEX idx_alert_instances_tenant_id ON alert_instances(tenant_id);
CREATE INDEX idx_alert_instances_rule_id ON alert_instances(rule_id);
CREATE INDEX idx_alert_instances_status ON alert_instances(status);
CREATE INDEX idx_alert_instances_severity ON alert_instances(severity);
CREATE INDEX idx_alert_instances_category ON alert_instances(category);
CREATE INDEX idx_alert_instances_triggered_at ON alert_instances(triggered_at DESC);
CREATE INDEX idx_alert_instances_acknowledged ON alert_instances(acknowledged_at);
CREATE INDEX idx_alert_instances_resolved ON alert_instances(resolved_at);
CREATE INDEX idx_alert_instances_snoozed ON alert_instances(snoozed_until);
CREATE INDEX idx_alert_instances_event_data ON alert_instances USING GIN (event_data);
CREATE INDEX idx_alert_instances_tags ON alert_instances USING GIN (tags);

-- ──────────────────────────────────────────────────────────────────────────
-- Automation Rules Table
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE automation_rules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES dm3_auth.companies(id) ON DELETE CASCADE,
    name varchar(255) NOT NULL,
    description text,
    category varchar(50) NOT NULL DEFAULT 'custom',
    is_enabled boolean NOT NULL DEFAULT true,
    
    -- Trigger configuration (JSON)
    trigger_config jsonb NOT NULL DEFAULT '{}',
    
    -- Conditions that must be met (JSON array)
    conditions jsonb NOT NULL DEFAULT '[]',
    
    -- Actions to execute (JSON array)
    actions jsonb NOT NULL DEFAULT '[]',
    
    -- Schedule settings (JSON)
    schedule jsonb,
    
    -- Cooldown between executions (seconds)
    cooldown bigint,
    
    -- Tags for organization
    tags text[] NOT NULL DEFAULT '{}',
    
    -- Execution tracking
    last_executed timestamptz,
    execution_count bigint NOT NULL DEFAULT 0,
    
    -- Additional metadata
    metadata jsonb,
    
    -- Standard audit fields
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL REFERENCES dm3_auth.users(id),
    deleted_at timestamptz
);

-- Indexes for automation rules
CREATE INDEX idx_automation_rules_tenant_id ON automation_rules(tenant_id);
CREATE INDEX idx_automation_rules_category ON automation_rules(category);
CREATE INDEX idx_automation_rules_enabled ON automation_rules(is_enabled);
CREATE INDEX idx_automation_rules_deleted ON automation_rules(deleted_at);
CREATE INDEX idx_automation_rules_trigger ON automation_rules USING GIN (trigger_config);
CREATE INDEX idx_automation_rules_last_executed ON automation_rules(last_executed);

-- ──────────────────────────────────────────────────────────────────────────
-- Alert Channels Table
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE alert_channels (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES dm3_auth.companies(id) ON DELETE CASCADE,
    name varchar(255) NOT NULL,
    description text,
    type varchar(50) NOT NULL, -- email, slack, sms, webhook, teams, discord, push
    is_enabled boolean NOT NULL DEFAULT true,
    
    -- Channel-specific configuration (JSON)
    configuration jsonb NOT NULL DEFAULT '{}',
    
    -- Message templates for different alert types
    templates jsonb,
    
    -- Standard audit fields
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL REFERENCES dm3_auth.users(id)
);

-- Indexes for alert channels
CREATE INDEX idx_alert_channels_tenant_id ON alert_channels(tenant_id);
CREATE INDEX idx_alert_channels_type ON alert_channels(type);
CREATE INDEX idx_alert_channels_enabled ON alert_channels(is_enabled);

-- ──────────────────────────────────────────────────────────────────────────
-- Escalation Policies Table
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE escalation_policies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES dm3_auth.companies(id) ON DELETE CASCADE,
    name varchar(255) NOT NULL,
    description text,
    is_enabled boolean NOT NULL DEFAULT true,
    
    -- Escalation steps (JSON array)
    steps jsonb NOT NULL DEFAULT '[]',
    
    -- How many times to repeat the entire policy
    repeat_count int NOT NULL DEFAULT 1,
    
    -- Standard audit fields
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL REFERENCES dm3_auth.users(id)
);

-- Indexes for escalation policies
CREATE INDEX idx_escalation_policies_tenant_id ON escalation_policies(tenant_id);
CREATE INDEX idx_escalation_policies_enabled ON escalation_policies(is_enabled);

-- Add foreign key constraint for escalation policy in alert rules
ALTER TABLE alert_rules ADD CONSTRAINT fk_alert_rules_escalation_policy 
    FOREIGN KEY (escalation_policy) REFERENCES escalation_policies(id);

-- ──────────────────────────────────────────────────────────────────────────
-- Alert Templates Table
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE alert_templates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES dm3_auth.companies(id) ON DELETE CASCADE,
    name varchar(255) NOT NULL,
    description text,
    category varchar(50) NOT NULL DEFAULT 'custom',
    severity varchar(20) NOT NULL DEFAULT 'medium',
    
    -- Template content
    subject varchar(500) NOT NULL,
    body text NOT NULL,
    format varchar(20) NOT NULL DEFAULT 'text', -- text, html, markdown
    
    -- Available template variables
    variables text[] NOT NULL DEFAULT '{}',
    
    -- Standard audit fields
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL REFERENCES dm3_auth.users(id)
);

-- Indexes for alert templates
CREATE INDEX idx_alert_templates_tenant_id ON alert_templates(tenant_id);
CREATE INDEX idx_alert_templates_category ON alert_templates(category);
CREATE INDEX idx_alert_templates_severity ON alert_templates(severity);

-- ──────────────────────────────────────────────────────────────────────────
-- Schedules Table (for on-call scheduling)
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE schedules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES dm3_auth.companies(id) ON DELETE CASCADE,
    name varchar(255) NOT NULL,
    description text,
    timezone varchar(100) NOT NULL DEFAULT 'UTC',
    
    -- Schedule configuration (JSON array of layers)
    layers jsonb NOT NULL DEFAULT '[]',
    
    -- Schedule overrides (JSON array)
    overrides jsonb NOT NULL DEFAULT '[]',
    
    is_enabled boolean NOT NULL DEFAULT true,
    
    -- Standard audit fields
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL REFERENCES dm3_auth.users(id)
);

-- Indexes for schedules
CREATE INDEX idx_schedules_tenant_id ON schedules(tenant_id);
CREATE INDEX idx_schedules_enabled ON schedules(is_enabled);

-- ──────────────────────────────────────────────────────────────────────────
-- Maintenance Windows Table
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE maintenance_windows (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES dm3_auth.companies(id) ON DELETE CASCADE,
    name varchar(255) NOT NULL,
    description text,
    
    -- Time window
    start_time timestamptz NOT NULL,
    end_time timestamptz NOT NULL,
    
    -- Recurrence
    is_recurring boolean NOT NULL DEFAULT false,
    recurrence_rule text, -- RRULE format for recurring maintenance
    
    -- Scope of maintenance (JSON)
    scope jsonb NOT NULL DEFAULT '{}',
    
    is_active boolean NOT NULL DEFAULT true,
    
    -- Standard audit fields
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL REFERENCES dm3_auth.users(id)
);

-- Indexes for maintenance windows
CREATE INDEX idx_maintenance_windows_tenant_id ON maintenance_windows(tenant_id);
CREATE INDEX idx_maintenance_windows_time_range ON maintenance_windows(start_time, end_time);
CREATE INDEX idx_maintenance_windows_active ON maintenance_windows(is_active);

-- ──────────────────────────────────────────────────────────────────────────
-- Alert Settings Table (tenant-specific configuration)
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE alert_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL UNIQUE REFERENCES dm3_auth.companies(id) ON DELETE CASCADE,
    
    -- Default alert configuration
    default_severity varchar(20) NOT NULL DEFAULT 'medium',
    auto_resolution_enabled boolean NOT NULL DEFAULT true,
    auto_resolution_timeout int NOT NULL DEFAULT 1440, -- minutes
    
    -- Global throttling settings
    global_throttle jsonb,
    
    -- Default channels for alerts
    default_channels text[] NOT NULL DEFAULT '{}',
    
    -- Data retention
    alert_retention_days int NOT NULL DEFAULT 90,
    
    -- Maintenance mode
    enable_maintenance_mode boolean NOT NULL DEFAULT true,
    
    -- Additional settings
    notification_settings jsonb,
    integration_settings jsonb,
    
    -- Standard audit fields
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index for alert settings
CREATE INDEX idx_alert_settings_tenant_id ON alert_settings(tenant_id);

-- ──────────────────────────────────────────────────────────────────────────
-- Alert History Table (for audit trail of alert state changes)
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE alert_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES dm3_auth.companies(id) ON DELETE CASCADE,
    alert_instance_id uuid NOT NULL REFERENCES alert_instances(id) ON DELETE CASCADE,
    
    -- Change details
    action varchar(50) NOT NULL, -- created, acknowledged, resolved, escalated, snoozed
    old_status varchar(20),
    new_status varchar(20),
    
    -- Who made the change
    changed_by uuid REFERENCES dm3_auth.users(id),
    change_note text,
    
    -- When the change occurred
    changed_at timestamptz NOT NULL DEFAULT now(),
    
    -- Additional context
    metadata jsonb
);

-- Indexes for alert history
CREATE INDEX idx_alert_history_tenant_id ON alert_history(tenant_id);
CREATE INDEX idx_alert_history_alert_instance ON alert_history(alert_instance_id);
CREATE INDEX idx_alert_history_changed_at ON alert_history(changed_at DESC);
CREATE INDEX idx_alert_history_action ON alert_history(action);

-- ──────────────────────────────────────────────────────────────────────────
-- Event Log Table (for storing processed events that might trigger alerts)
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES dm3_auth.companies(id) ON DELETE CASCADE,
    
    -- Event classification
    event_type varchar(50) NOT NULL,
    event_subtype varchar(50),
    source varchar(100),
    subject varchar(255),
    
    -- Event data (JSON)
    event_data jsonb NOT NULL DEFAULT '{}',
    
    -- When the event was received/processed
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for events (optimized for time-series queries)
CREATE INDEX idx_events_tenant_id ON events(tenant_id);
CREATE INDEX idx_events_type ON events(event_type);
CREATE INDEX idx_events_created_at ON events(created_at DESC);
CREATE INDEX idx_events_source ON events(source);
CREATE INDEX idx_events_data ON events USING GIN (event_data);

-- ──────────────────────────────────────────────────────────────────────────
-- Row Level Security (RLS) for multi-tenancy
-- ──────────────────────────────────────────────────────────────────────────

-- Enable RLS on all tables
ALTER TABLE alert_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE escalation_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for tenant isolation
CREATE POLICY alert_rules_tenant_policy ON alert_rules
    USING (tenant_id::text = current_setting('app.current_tenant', true));

CREATE POLICY alert_instances_tenant_policy ON alert_instances  
    USING (tenant_id::text = current_setting('app.current_tenant', true));

CREATE POLICY automation_rules_tenant_policy ON automation_rules
    USING (tenant_id::text = current_setting('app.current_tenant', true));

CREATE POLICY alert_channels_tenant_policy ON alert_channels
    USING (tenant_id::text = current_setting('app.current_tenant', true));

CREATE POLICY escalation_policies_tenant_policy ON escalation_policies
    USING (tenant_id::text = current_setting('app.current_tenant', true));

CREATE POLICY alert_templates_tenant_policy ON alert_templates
    USING (tenant_id::text = current_setting('app.current_tenant', true));

CREATE POLICY schedules_tenant_policy ON schedules
    USING (tenant_id::text = current_setting('app.current_tenant', true));

CREATE POLICY maintenance_windows_tenant_policy ON maintenance_windows
    USING (tenant_id::text = current_setting('app.current_tenant', true));

CREATE POLICY alert_settings_tenant_policy ON alert_settings
    USING (tenant_id::text = current_setting('app.current_tenant', true));

CREATE POLICY alert_history_tenant_policy ON alert_history
    USING (tenant_id::text = current_setting('app.current_tenant', true));

CREATE POLICY events_tenant_policy ON events
    USING (tenant_id::text = current_setting('app.current_tenant', true));

-- ──────────────────────────────────────────────────────────────────────────
-- Functions and Triggers
-- ──────────────────────────────────────────────────────────────────────────

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION dm3_alert.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply update triggers to relevant tables
CREATE TRIGGER update_alert_rules_updated_at 
    BEFORE UPDATE ON alert_rules 
    FOR EACH ROW EXECUTE FUNCTION dm3_alert.update_updated_at_column();

CREATE TRIGGER update_alert_instances_updated_at 
    BEFORE UPDATE ON alert_instances 
    FOR EACH ROW EXECUTE FUNCTION dm3_alert.update_updated_at_column();

CREATE TRIGGER update_automation_rules_updated_at 
    BEFORE UPDATE ON automation_rules 
    FOR EACH ROW EXECUTE FUNCTION dm3_alert.update_updated_at_column();

CREATE TRIGGER update_alert_channels_updated_at 
    BEFORE UPDATE ON alert_channels 
    FOR EACH ROW EXECUTE FUNCTION dm3_alert.update_updated_at_column();

CREATE TRIGGER update_escalation_policies_updated_at 
    BEFORE UPDATE ON escalation_policies 
    FOR EACH ROW EXECUTE FUNCTION dm3_alert.update_updated_at_column();

CREATE TRIGGER update_alert_templates_updated_at 
    BEFORE UPDATE ON alert_templates 
    FOR EACH ROW EXECUTE FUNCTION dm3_alert.update_updated_at_column();

CREATE TRIGGER update_schedules_updated_at 
    BEFORE UPDATE ON schedules 
    FOR EACH ROW EXECUTE FUNCTION dm3_alert.update_updated_at_column();

CREATE TRIGGER update_maintenance_windows_updated_at 
    BEFORE UPDATE ON maintenance_windows 
    FOR EACH ROW EXECUTE FUNCTION dm3_alert.update_updated_at_column();

CREATE TRIGGER update_alert_settings_updated_at 
    BEFORE UPDATE ON alert_settings 
    FOR EACH ROW EXECUTE FUNCTION dm3_alert.update_updated_at_column();

-- Function to automatically create alert history entries
CREATE OR REPLACE FUNCTION dm3_alert.create_alert_history()
RETURNS TRIGGER AS $$
BEGIN
    -- Only create history for status changes
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO dm3_alert.alert_history (
            tenant_id, alert_instance_id, action, 
            old_status, new_status, changed_at
        ) VALUES (
            NEW.tenant_id, NEW.id, 'status_changed',
            OLD.status, NEW.status, now()
        );
    END IF;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically track alert status changes
CREATE TRIGGER create_alert_history_trigger
    AFTER UPDATE ON alert_instances
    FOR EACH ROW EXECUTE FUNCTION dm3_alert.create_alert_history();

-- ──────────────────────────────────────────────────────────────────────────
-- Views for analytics and reporting
-- ──────────────────────────────────────────────────────────────────────────

-- View for alert analytics per tenant
CREATE VIEW alert_analytics AS
SELECT 
    tenant_id,
    COUNT(*) as total_alerts,
    COUNT(*) FILTER (WHERE status = 'open') as open_alerts,
    COUNT(*) FILTER (WHERE status = 'acknowledged') as acknowledged_alerts, 
    COUNT(*) FILTER (WHERE status = 'resolved') as resolved_alerts,
    COUNT(*) FILTER (WHERE severity = 'critical') as critical_alerts,
    COUNT(*) FILTER (WHERE severity = 'high') as high_alerts,
    COUNT(*) FILTER (WHERE severity = 'medium') as medium_alerts,
    COUNT(*) FILTER (WHERE severity = 'low') as low_alerts,
    AVG(EXTRACT(EPOCH FROM (COALESCE(acknowledged_at, now()) - triggered_at))/60) as avg_time_to_acknowledge_minutes,
    AVG(EXTRACT(EPOCH FROM (COALESCE(resolved_at, now()) - triggered_at))/60) as avg_time_to_resolve_minutes
FROM alert_instances
GROUP BY tenant_id;

-- ──────────────────────────────────────────────────────────────────────────
-- Sample Data (for testing)
-- ──────────────────────────────────────────────────────────────────────────

-- Insert default alert settings for existing tenants
INSERT INTO dm3_alert.alert_settings (tenant_id)
SELECT id FROM dm3_auth.companies
ON CONFLICT (tenant_id) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────
-- Comments for documentation
-- ──────────────────────────────────────────────────────────────────────────

COMMENT ON SCHEMA dm3_alert IS 'Alert and automation service schema';
COMMENT ON TABLE alert_rules IS 'Alert rules define conditions that trigger alerts';
COMMENT ON TABLE alert_instances IS 'Individual alert occurrences with status tracking';
COMMENT ON TABLE automation_rules IS 'Automation rules for event-driven actions';
COMMENT ON TABLE alert_channels IS 'Notification channels for alert delivery';
COMMENT ON TABLE escalation_policies IS 'Escalation policies for alert handling';
COMMENT ON TABLE alert_templates IS 'Message templates for different alert types';
COMMENT ON TABLE schedules IS 'On-call schedules for alert routing';
COMMENT ON TABLE maintenance_windows IS 'Maintenance windows for alert suppression';
COMMENT ON TABLE alert_settings IS 'Tenant-specific alert configuration';
COMMENT ON TABLE alert_history IS 'Audit trail of alert state changes';
COMMENT ON TABLE events IS 'System events that may trigger alerts';

-- Reset search path
SET search_path TO public;