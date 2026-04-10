-- ============================================================
-- DM3 Consolidated Down Migration — drops everything
-- ============================================================

-- Parking (dm3_operate)
DROP TRIGGER IF EXISTS trg_parking_passes_updated_at ON dm3_operate.parking_passes;
DROP TRIGGER IF EXISTS trg_parking_sessions_updated_at ON dm3_operate.parking_sessions;
DROP TRIGGER IF EXISTS trg_parking_fee_rules_updated_at ON dm3_operate.parking_fee_rules;
DROP TRIGGER IF EXISTS trg_parking_vehicles_updated_at ON dm3_operate.parking_vehicles;
DROP TRIGGER IF EXISTS trg_parking_zones_updated_at ON dm3_operate.parking_zones;
DROP TRIGGER IF EXISTS trg_parking_lots_updated_at ON dm3_operate.parking_lots;
DROP TABLE IF EXISTS dm3_operate.parking_sessions CASCADE;
DROP TABLE IF EXISTS dm3_operate.parking_fee_rules CASCADE;
DROP TABLE IF EXISTS dm3_operate.parking_vehicles CASCADE;
DROP TABLE IF EXISTS dm3_operate.parking_passes CASCADE;
DROP TABLE IF EXISTS dm3_operate.parking_zones CASCADE;
DROP TABLE IF EXISTS dm3_operate.parking_lots CASCADE;

-- Visitors (dm3_identity)
DROP TRIGGER IF EXISTS trg_visits_updated_at ON dm3_identity.visits;
DROP TRIGGER IF EXISTS trg_visitors_updated_at ON dm3_identity.visitors;
DROP TABLE IF EXISTS dm3_identity.visitor_badges CASCADE;
DROP TABLE IF EXISTS dm3_identity.watchlist CASCADE;
DROP TABLE IF EXISTS dm3_identity.visits CASCADE;
DROP TABLE IF EXISTS dm3_identity.visitors CASCADE;
DROP FUNCTION IF EXISTS dm3_identity.set_updated_at();

-- Vehicles
DROP TABLE IF EXISTS dm3_identity.vehicles CASCADE;

-- Audit
GRANT UPDATE, DELETE ON dm3_audit.audit_logs TO dm3;
DROP TABLE IF EXISTS dm3_audit.audit_logs CASCADE;

-- Access (dm3_access)
DROP TRIGGER IF EXISTS trg_zones_updated_at ON dm3_access.zones;
DROP TRIGGER IF EXISTS trg_access_devices_updated_at ON dm3_access.access_devices;
DROP TRIGGER IF EXISTS trg_access_times_updated_at ON dm3_access.access_times;
DROP TRIGGER IF EXISTS trg_access_points_updated_at ON dm3_access.access_points;
DROP FUNCTION IF EXISTS dm3_access.update_timestamp();
DROP TABLE IF EXISTS dm3_access.access_events CASCADE;
DROP TABLE IF EXISTS dm3_access.access_group_access_points CASCADE;
DROP TABLE IF EXISTS dm3_access.access_point_devices CASCADE;
DROP TABLE IF EXISTS dm3_access.access_devices CASCADE;
DROP TABLE IF EXISTS dm3_access.access_points CASCADE;
DROP TABLE IF EXISTS dm3_access.access_time_slots CASCADE;
DROP TABLE IF EXISTS dm3_access.access_times CASCADE;
DROP TABLE IF EXISTS dm3_access.access_group_users CASCADE;
DROP TABLE IF EXISTS dm3_access.access_groups CASCADE;
DROP TABLE IF EXISTS dm3_access.zones CASCADE;

-- Devices (dm3_devices)
DROP TABLE IF EXISTS dm3_devices.used_nonces CASCADE;
DROP TABLE IF EXISTS dm3_devices.pending_registrations CASCADE;
DROP TABLE IF EXISTS dm3_devices.provisioning_tokens CASCADE;
DROP TABLE IF EXISTS dm3_devices.firmwares CASCADE;
DROP TABLE IF EXISTS dm3_devices.devices CASCADE;

-- Identity (dm3_identity)
DROP TRIGGER IF EXISTS trg_account_deleted ON dm3_auth.accounts;
DROP FUNCTION IF EXISTS dm3_identity.on_account_deleted();
DROP VIEW IF EXISTS dm3_identity.user_details;
DROP TABLE IF EXISTS dm3_identity.sync_meta CASCADE;
DROP TABLE IF EXISTS dm3_identity.user_group_members CASCADE;
DROP TABLE IF EXISTS dm3_identity.user_groups CASCADE;
DROP TABLE IF EXISTS dm3_identity.credentials CASCADE;
DROP TABLE IF EXISTS dm3_identity.users CASCADE;
DROP TABLE IF EXISTS dm3_identity.departments CASCADE;

-- Auth (dm3_auth)
DROP TRIGGER IF EXISTS update_accounts_updated_at ON dm3_auth.accounts;
DROP TABLE IF EXISTS dm3_auth.refresh_tokens CASCADE;
DROP TABLE IF EXISTS dm3_auth.accounts CASCADE;
DROP TABLE IF EXISTS dm3_auth.tenants CASCADE;

-- Shared
DROP FUNCTION IF EXISTS update_updated_at_column();

-- Schemas
DROP SCHEMA IF EXISTS dm3_operate CASCADE;
DROP SCHEMA IF EXISTS dm3_audit CASCADE;
DROP SCHEMA IF EXISTS dm3_identity CASCADE;
DROP SCHEMA IF EXISTS dm3_access CASCADE;
DROP SCHEMA IF EXISTS dm3_devices CASCADE;
DROP SCHEMA IF EXISTS dm3_auth CASCADE;
