CREATE TABLE IF NOT EXISTS dm3_parking.parking_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL UNIQUE REFERENCES dm3_auth.tenants(id) ON DELETE CASCADE,
    auto_open_barrier_on_pass BOOLEAN NOT NULL DEFAULT true,
    confidence_threshold DOUBLE PRECISION NOT NULL DEFAULT 0.85,
    require_payment_before_exit BOOLEAN NOT NULL DEFAULT true,
    free_minutes_global INT NOT NULL DEFAULT 0,
    max_session_hours INT NOT NULL DEFAULT 24,
    allow_unregistered_entry BOOLEAN NOT NULL DEFAULT true,
    plate_recognition_enabled BOOLEAN NOT NULL DEFAULT true,
    default_fee_currency TEXT NOT NULL DEFAULT 'VND',
    notify_on_disputed BOOLEAN NOT NULL DEFAULT true,
    capacity_alert_threshold INT NOT NULL DEFAULT 80,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
