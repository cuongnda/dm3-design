-- 010_notification_service.sql — Notification Service Tables

-- Schema for notification service
CREATE SCHEMA IF NOT EXISTS dm3_notif;

-- ============================================================
-- Notifications table — stores all sent/pending notifications
-- ============================================================
CREATE TABLE IF NOT EXISTS dm3_notif.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    channels JSONB NOT NULL DEFAULT '[]', -- ["email", "push", "sms"]
    user_id UUID, -- specific user, nullable for broadcast notifications
    user_email VARCHAR(255), -- direct email, if not user-based
    metadata JSONB DEFAULT '{}', -- additional data (device_id, alarm_type, etc.)
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, sent, delivered, failed
    sent_at TIMESTAMPTZ, -- when sending was attempted
    error TEXT, -- error message if failed
    retry_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_tenant ON dm3_notif.notifications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON dm3_notif.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON dm3_notif.notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON dm3_notif.notifications(status);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON dm3_notif.notifications(created_at DESC);

-- ============================================================
-- Notification preferences — per-user notification settings
-- ============================================================
CREATE TABLE IF NOT EXISTS dm3_notif.notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    user_id UUID NOT NULL,
    email_enabled BOOLEAN DEFAULT true,
    push_enabled BOOLEAN DEFAULT true,
    sms_enabled BOOLEAN DEFAULT false,
    type_preferences JSONB DEFAULT '{}', -- {"access.denied": ["push"], "alarm.triggered": ["push", "email"]}
    quiet_hours JSONB, -- {"enabled": true, "start_time": "22:00", "end_time": "07:00", "timezone": "Asia/Ho_Chi_Minh"}
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_notification_preferences_tenant ON dm3_notif.notification_preferences(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notification_preferences_user ON dm3_notif.notification_preferences(user_id);

-- ============================================================
-- Notification templates — reusable message templates
-- ============================================================
CREATE TABLE IF NOT EXISTS dm3_notif.notification_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL, -- notification type this template applies to
    subject VARCHAR(255) NOT NULL, -- for email notifications
    body TEXT NOT NULL, -- template body with variables like {{person_name}}
    channels JSONB DEFAULT '["push"]', -- default channels for this template
    variables JSONB DEFAULT '{}', -- {"person_name": "Name of the person", "door_name": "Door location"}
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_notification_templates_tenant ON dm3_notif.notification_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notification_templates_type ON dm3_notif.notification_templates(type);

-- ============================================================
-- Device tokens — for push notifications
-- ============================================================
CREATE TABLE IF NOT EXISTS dm3_notif.device_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    user_id UUID NOT NULL,
    platform VARCHAR(10) NOT NULL, -- ios, android, web
    token TEXT NOT NULL, -- FCM/APNs token
    app_version VARCHAR(20),
    device_info JSONB, -- device model, OS version, etc.
    active BOOLEAN DEFAULT true,
    last_used TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(token) -- tokens must be unique across all tenants
);

CREATE INDEX IF NOT EXISTS idx_device_tokens_tenant_user ON dm3_notif.device_tokens(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_device_tokens_platform ON dm3_notif.device_tokens(platform);
CREATE INDEX IF NOT EXISTS idx_device_tokens_active ON dm3_notif.device_tokens(active);

-- ============================================================
-- Notification delivery tracking — for analytics
-- ============================================================
CREATE TABLE IF NOT EXISTS dm3_notif.notification_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id UUID NOT NULL REFERENCES dm3_notif.notifications(id),
    channel VARCHAR(20) NOT NULL, -- email, push, sms
    recipient VARCHAR(255), -- email address, phone number, or device token
    status VARCHAR(20) NOT NULL, -- sent, delivered, opened, clicked, bounced, failed
    provider_id VARCHAR(100), -- external provider's message ID
    delivered_at TIMESTAMPTZ,
    opened_at TIMESTAMPTZ, -- for email/push tracking
    clicked_at TIMESTAMPTZ, -- for email tracking
    error_code VARCHAR(50),
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_notification ON dm3_notif.notification_deliveries(notification_id);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_channel ON dm3_notif.notification_deliveries(channel);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_status ON dm3_notif.notification_deliveries(status);

-- ============================================================
-- Row Level Security for multi-tenancy
-- ============================================================
ALTER TABLE dm3_notif.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON dm3_notif.notifications;
CREATE POLICY tenant_isolation ON dm3_notif.notifications
    USING (
        tenant_id = COALESCE(
            NULLIF(current_setting('app.current_tenant', true), '')::uuid,
            tenant_id
        )
    );

ALTER TABLE dm3_notif.notification_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON dm3_notif.notification_preferences;
CREATE POLICY tenant_isolation ON dm3_notif.notification_preferences
    USING (
        tenant_id = COALESCE(
            NULLIF(current_setting('app.current_tenant', true), '')::uuid,
            tenant_id
        )
    );

ALTER TABLE dm3_notif.notification_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON dm3_notif.notification_templates;
CREATE POLICY tenant_isolation ON dm3_notif.notification_templates
    USING (
        tenant_id = COALESCE(
            NULLIF(current_setting('app.current_tenant', true), '')::uuid,
            tenant_id
        )
    );

ALTER TABLE dm3_notif.device_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON dm3_notif.device_tokens;
CREATE POLICY tenant_isolation ON dm3_notif.device_tokens
    USING (
        tenant_id = COALESCE(
            NULLIF(current_setting('app.current_tenant', true), '')::uuid,
            tenant_id
        )
    );

-- ============================================================
-- Default notification templates
-- ============================================================
INSERT INTO dm3_notif.notification_templates (tenant_id, name, type, subject, body, channels, variables) VALUES
('00000000-0000-0000-0000-000000000001', 'Access Denied Alert', 'access.denied', 'Access Denied', 
 'Access was denied to {{person_name}} at {{door_name}} - {{reason}}', 
 '["push"]', 
 '{"person_name": "Name of the person", "door_name": "Door location", "reason": "Denial reason"}'),

('00000000-0000-0000-0000-000000000001', 'Alarm Triggered', 'alarm.triggered', '🚨 {{alarm_type}} Alarm Triggered', 
 'A {{alarm_type}} alarm has been triggered at {{location}}. Immediate attention required.', 
 '["push", "email"]', 
 '{"alarm_type": "Type of alarm", "location": "Alarm location"}'),

('00000000-0000-0000-0000-000000000001', 'Device Offline', 'device.offline', 'Device Offline Alert', 
 'Device {{device_name}} ({{device_id}}) has gone offline.', 
 '["push"]', 
 '{"device_name": "Device name", "device_id": "Device identifier"}'),

('00000000-0000-0000-0000-000000000001', 'Visitor Arrival', 'visitor.arrival', 'Visitor Arrived', 
 '{{visitor_name}} has arrived and is waiting for you at reception.', 
 '["push"]', 
 '{"visitor_name": "Visitor name"}'),

('00000000-0000-0000-0000-000000000001', 'Emergency Alert', 'emergency', '🚨 EMERGENCY: {{emergency_type}}', 
 'Emergency situation: {{emergency_type}}. {{message}}. Take immediate action.', 
 '["push", "email", "sms"]', 
 '{"emergency_type": "Type of emergency", "message": "Emergency details"}')

ON CONFLICT (tenant_id, name) DO NOTHING;

-- ============================================================
-- Create updated_at triggers
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply to tables with updated_at columns
DROP TRIGGER IF EXISTS update_notifications_updated_at ON dm3_notif.notifications;
CREATE TRIGGER update_notifications_updated_at 
    BEFORE UPDATE ON dm3_notif.notifications 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_notification_preferences_updated_at ON dm3_notif.notification_preferences;
CREATE TRIGGER update_notification_preferences_updated_at 
    BEFORE UPDATE ON dm3_notif.notification_preferences 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_notification_templates_updated_at ON dm3_notif.notification_templates;
CREATE TRIGGER update_notification_templates_updated_at 
    BEFORE UPDATE ON dm3_notif.notification_templates 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Statistics view for dashboard
-- ============================================================
CREATE OR REPLACE VIEW dm3_notif.notification_stats AS
SELECT 
    tenant_id,
    type,
    status,
    DATE(created_at) as date,
    COUNT(*) as count,
    COUNT(*) FILTER (WHERE status = 'delivered') as delivered_count,
    COUNT(*) FILTER (WHERE status = 'failed') as failed_count
FROM dm3_notif.notifications 
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY tenant_id, type, status, DATE(created_at);