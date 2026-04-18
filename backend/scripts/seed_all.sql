-- ============================================================
-- DM3 Comprehensive Seed Data — All Modules
-- Run: docker exec -i dm3-local-timescaledb psql -U dm3 -d dm3 < scripts/seed_all.sql
-- Destructive: wipes existing data and re-seeds with deterministic UUIDs
-- ============================================================

BEGIN;

-- ============================================================
-- 0. CLEANUP (reverse FK order)
-- ============================================================
DELETE FROM dm3_visitor.visitor_agreement_signatures;
DELETE FROM dm3_visitor.visitor_access_log;
DELETE FROM dm3_visitor.visitor_badges;
DELETE FROM dm3_visitor.visits;
DELETE FROM dm3_visitor.recurring_visit_templates;
DELETE FROM dm3_visitor.visit_groups;
DELETE FROM dm3_visitor.visitor_agreements;
DELETE FROM dm3_visitor.watchlist;
DELETE FROM dm3_visitor.visitors;
DELETE FROM dm3_visitor.visitor_settings;
DELETE FROM dm3_parking.parking_sessions;
DELETE FROM dm3_parking.parking_passes;
UPDATE dm3_parking.parking_vehicles SET active_pass_id = null;
DELETE FROM dm3_parking.parking_vehicles;
DELETE FROM dm3_parking.parking_fee_rules;
DELETE FROM dm3_parking.parking_zones;
DELETE FROM dm3_parking.parking_lots;
DELETE FROM dm3_parking.parking_settings;
DELETE FROM dm3_access.access_group_access_points;
DELETE FROM dm3_access.access_group_users;
DELETE FROM dm3_access.access_point_devices;
DELETE FROM dm3_access.access_points;
DELETE FROM dm3_access.access_time_slots;
DELETE FROM dm3_access.access_times;
DELETE FROM dm3_access.access_groups;
DELETE FROM dm3_access.zones;
DELETE FROM dm3_identity.user_group_members;
DELETE FROM dm3_identity.user_groups;
DELETE FROM dm3_identity.credentials;
DELETE FROM dm3_identity.users;
DELETE FROM dm3_identity.departments;
DELETE FROM dm3_devices.provisioning_tokens;
DELETE FROM dm3_devices.pending_registrations;
DELETE FROM dm3_devices.devices;
DELETE FROM dm3_auth.refresh_tokens;
DELETE FROM dm3_auth.accounts;
-- Keep tenants but reset plugins
UPDATE dm3_auth.tenants SET enabled_plugins = '{core,visitor,parking}' WHERE id = '00000000-0000-0000-0000-000000000001';

-- ============================================================
-- 1. TENANT + PLUGINS
-- ============================================================
INSERT INTO dm3_auth.tenants (id, name, code, plan, status, enabled_plugins, max_devices, max_users)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Duali Vietnam Demo', 'DUALI', 'enterprise', 'active',
  '{core,visitor,parking}', 100, 50
) ON CONFLICT (id) DO UPDATE SET enabled_plugins = '{core,visitor,parking}';

-- ============================================================
-- 2. AUTH — Accounts (password: admin123 for all)
-- bcrypt hash of "admin123"
-- ============================================================
INSERT INTO dm3_auth.accounts (id, tenant_id, email, password_hash, first_name, last_name, full_name, role, status, locale, preferred_language) VALUES
  -- System admin (no tenant)
  ('aa000000-0000-0000-0000-000000000001', null,
   'sysadmin@duali.com', '$2b$12$npOZArrFi4NNiLyXGMNase95Ij0Wm6o1d3xE7gR91jLMgzAb8yVCG',
   'System', 'Admin', 'System Admin', 'system_admin', 'active', 'en', 'en'),
  -- Tenant admin
  ('aa000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
   'admin@duali.com', '$2b$12$npOZArrFi4NNiLyXGMNase95Ij0Wm6o1d3xE7gR91jLMgzAb8yVCG',
   'Nguyen', 'Admin', 'Nguyen Admin', 'primary_manager', 'active', 'vi', 'vi'),
  -- Manager
  ('aa000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
   'manager@duali.com', '$2b$12$npOZArrFi4NNiLyXGMNase95Ij0Wm6o1d3xE7gR91jLMgzAb8yVCG',
   'Tran', 'Manager', 'Tran Manager', 'manager', 'active', 'vi', 'vi'),
  -- Operator
  ('aa000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001',
   'operator@duali.com', '$2b$12$npOZArrFi4NNiLyXGMNase95Ij0Wm6o1d3xE7gR91jLMgzAb8yVCG',
   'Le', 'Operator', 'Le Operator', 'operator', 'active', 'vi', 'vi'),
  -- Viewer
  ('aa000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001',
   'viewer@duali.com', '$2b$12$npOZArrFi4NNiLyXGMNase95Ij0Wm6o1d3xE7gR91jLMgzAb8yVCG',
   'Pham', 'Viewer', 'Pham Viewer', 'viewer', 'active', 'en', 'en')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 3. IDENTITY — Departments
-- ============================================================
INSERT INTO dm3_identity.departments (id, tenant_id, name, number) VALUES
  ('dd000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Engineering', 'DEPT-ENG'),
  ('dd000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Human Resources', 'DEPT-HR'),
  ('dd000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Operations', 'DEPT-OPS'),
  ('dd000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'Security', 'DEPT-SEC'),
  ('dd000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'Finance', 'DEPT-FIN'),
  ('dd000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', 'Sales & Marketing', 'DEPT-SM')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 4. IDENTITY — Users (employees linked to accounts + extras)
-- ============================================================
INSERT INTO dm3_identity.users (id, tenant_id, account_id, department_id, first_name, last_name, email, phone, user_code, emp_number, position, status) VALUES
  -- Linked to accounts
  ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
   'aa000000-0000-0000-0000-000000000002', 'dd000000-0000-0000-0000-000000000001',
   'Nguyen', 'Van An', 'admin@duali.com', '+84901234001', 'USR001', 'EMP001', 'CTO', 'active'),
  ('a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
   'aa000000-0000-0000-0000-000000000003', 'dd000000-0000-0000-0000-000000000002',
   'Tran', 'Thi Binh', 'manager@duali.com', '+84901234002', 'USR002', 'EMP002', 'HR Manager', 'active'),
  ('a0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
   'aa000000-0000-0000-0000-000000000004', 'dd000000-0000-0000-0000-000000000004',
   'Le', 'Duc Cuong', 'operator@duali.com', '+84901234003', 'USR003', 'EMP003', 'Security Lead', 'active'),
  -- Extra employees (no login account)
  ('a0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001',
   null, 'dd000000-0000-0000-0000-000000000001',
   'Pham', 'Minh Duc', 'duc.pham@duali.com', '+84901234004', 'USR004', 'EMP004', 'Senior Engineer', 'active'),
  ('a0000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001',
   null, 'dd000000-0000-0000-0000-000000000003',
   'Hoang', 'Thi Em', 'em.hoang@duali.com', '+84901234005', 'USR005', 'EMP005', 'Receptionist', 'active'),
  ('a0000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001',
   null, 'dd000000-0000-0000-0000-000000000001',
   'Vo', 'Van Phuc', 'phuc.vo@duali.com', '+84901234006', 'USR006', 'EMP006', 'Junior Engineer', 'active'),
  ('a0000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001',
   null, 'dd000000-0000-0000-0000-000000000004',
   'Dang', 'Quang Gia', 'gia.dang@duali.com', '+84901234007', 'USR007', 'EMP007', 'Security Guard', 'active'),
  ('a0000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000001',
   null, 'dd000000-0000-0000-0000-000000000005',
   'Bui', 'Thi Huong', 'huong.bui@duali.com', '+84901234008', 'USR008', 'EMP008', 'Accountant', 'active'),
  ('a0000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000001',
   null, 'dd000000-0000-0000-0000-000000000006',
   'Do', 'Minh Ich', 'ich.do@duali.com', '+84901234009', 'USR009', 'EMP009', 'Sales Executive', 'active'),
  ('a0000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001',
   null, 'dd000000-0000-0000-0000-000000000003',
   'Ngo', 'Van Khanh', 'khanh.ngo@duali.com', '+84901234010', 'USR010', 'EMP010', 'IT Admin', 'active')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 5. IDENTITY — Credentials (card + pin for each user)
-- ============================================================
INSERT INTO dm3_identity.credentials (id, tenant_id, user_id, type, value, status) VALUES
  -- Cards
  ('cc000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'card', 'CARD000001', 'active'),
  ('cc000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'card', 'CARD000002', 'active'),
  ('cc000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'card', 'CARD000003', 'active'),
  ('cc000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', 'card', 'CARD000004', 'active'),
  ('cc000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000005', 'card', 'CARD000005', 'active'),
  ('cc000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000006', 'card', 'CARD000006', 'active'),
  ('cc000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000007', 'card', 'CARD000007', 'active'),
  ('cc000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000008', 'card', 'CARD000008', 'active'),
  ('cc000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000009', 'card', 'CARD000009', 'active'),
  ('cc000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000010', 'card', 'CARD000010', 'active'),
  -- PINs
  ('cc000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'pin', '1001', 'active'),
  ('cc000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'pin', '1002', 'active'),
  ('cc000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'pin', '1003', 'active'),
  ('cc000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', 'pin', '1004', 'active'),
  ('cc000000-0000-0000-0000-000000000015', '00000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000005', 'pin', '1005', 'active')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 6. IDENTITY — User Groups
-- ============================================================
INSERT INTO dm3_identity.user_groups (id, tenant_id, name, description) VALUES
  ('01000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Engineering Team', 'All engineering department members'),
  ('01000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Management', 'Department managers and above'),
  ('01000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Security Staff', 'Security team members')
ON CONFLICT DO NOTHING;

INSERT INTO dm3_identity.user_group_members (group_id, user_id, tenant_id) VALUES
  ('01000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001'),
  ('01000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001'),
  ('01000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001'),
  ('01000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001'),
  ('01000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001'),
  ('01000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001'),
  ('01000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;

-- 7. IDENTITY — Vehicles: REMOVED — vehicles now live in dm3_parking.parking_vehicles

-- ============================================================
-- 8. DEVICES
-- ============================================================
INSERT INTO dm3_devices.devices (id, tenant_id, device_id, name, type, status, model, firmware_version, location) VALUES
  ('de000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
   '100001', 'Main Entrance Terminal', 'terminal', 'online', 'df970', '2.1.0', 'Building A - Main Lobby'),
  ('de000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
   '100002', 'Side Door Controller', 'controller', 'online', 'icu300n', '2.1.0', 'Building A - Side Entrance'),
  ('de000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
   '100003', 'Parking Gate B1 Entry', 'sensor', 'online', 'door_sensor', '1.5.3', 'Parking Level B1 Entry'),
  ('de000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001',
   '100004', 'Server Room Camera', 'camera', 'offline', 'camera_dc', '3.0.1', 'Building A - Floor 3'),
  ('de000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001',
   '100005', 'Warehouse Terminal', 'terminal', 'online', 'ba8300', '2.1.0', 'Warehouse Main'),
  ('de000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001',
   '100006', 'Parking Gate B1 Exit', 'sensor', 'online', 'door_sensor', '1.5.3', 'Parking Level B1 Exit'),
  ('de000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001',
   '100007', 'Visitor Kiosk', 'terminal', 'online', 'df970', '2.1.0', 'Building A - Reception'),
  ('de000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000001',
   '100008', 'Annex Gate Entry', 'sensor', 'online', 'door_sensor', '1.5.3', 'Annex Parking Entry')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 9. ACCESS — Zones (physical areas)
-- ============================================================
INSERT INTO dm3_access.zones (id, tenant_id, name, description, building, floor) VALUES
  ('03000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
   'Main Building', 'Primary office building', 'Building A', null),
  ('03000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
   'Main Lobby', 'Ground floor lobby and reception', 'Building A', '1F'),
  ('03000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
   'Engineering Floor', 'Engineering department workspace', 'Building A', '2F'),
  ('03000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001',
   'Server Room', 'Restricted server room', 'Building A', '3F'),
  ('03000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001',
   'Warehouse', 'Storage and logistics area', 'Warehouse', '1F'),
  ('03000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001',
   'Parking B1', 'Underground parking level B1', 'Building A', 'B1')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 10. ACCESS — Access Times (schedules)
-- ============================================================
INSERT INTO dm3_access.access_times (id, tenant_id, name, description, is_active) VALUES
  ('04000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
   'Business Hours', 'Monday to Friday 08:00-18:00', true),
  ('04000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
   '24/7 Access', 'Unrestricted all-day access', true),
  ('04000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
   'Extended Hours', 'Monday to Saturday 06:00-22:00', true)
ON CONFLICT DO NOTHING;

-- Time slots for Business Hours (Mon-Fri)
INSERT INTO dm3_access.access_time_slots (id, tenant_id, access_time_id, day_of_week, start_time, end_time, slot_name, is_active) VALUES
  ('05000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '04000000-0000-0000-0000-000000000001', 1, '08:00', '18:00', 'Mon', true),
  ('05000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '04000000-0000-0000-0000-000000000001', 2, '08:00', '18:00', 'Tue', true),
  ('05000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', '04000000-0000-0000-0000-000000000001', 3, '08:00', '18:00', 'Wed', true),
  ('05000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', '04000000-0000-0000-0000-000000000001', 4, '08:00', '18:00', 'Thu', true),
  ('05000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', '04000000-0000-0000-0000-000000000001', 5, '08:00', '18:00', 'Fri', true),
  -- 24/7 (all days)
  ('05000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', '04000000-0000-0000-0000-000000000002', 0, '00:00', '23:59', 'Sun', true),
  ('05000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001', '04000000-0000-0000-0000-000000000002', 1, '00:00', '23:59', 'Mon', true),
  ('05000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000001', '04000000-0000-0000-0000-000000000002', 2, '00:00', '23:59', 'Tue', true),
  ('05000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000001', '04000000-0000-0000-0000-000000000002', 3, '00:00', '23:59', 'Wed', true),
  ('05000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', '04000000-0000-0000-0000-000000000002', 4, '00:00', '23:59', 'Thu', true),
  ('05000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', '04000000-0000-0000-0000-000000000002', 5, '00:00', '23:59', 'Fri', true),
  ('05000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001', '04000000-0000-0000-0000-000000000002', 6, '00:00', '23:59', 'Sat', true)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 11. ACCESS — Access Groups
-- ============================================================
INSERT INTO dm3_access.access_groups (id, tenant_id, name, description, is_default, access_time_id) VALUES
  ('06000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
   'General Staff', 'Default access for all employees', true, '04000000-0000-0000-0000-000000000001'),
  ('06000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
   'Security Team', '24/7 full building access', false, '04000000-0000-0000-0000-000000000002'),
  ('06000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
   'Server Room Access', 'Restricted access to server room', false, '04000000-0000-0000-0000-000000000001'),
  ('06000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001',
   'Visitor Access', 'Limited access for approved visitors', false, '04000000-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;

-- Assign users to access groups
INSERT INTO dm3_access.access_group_users (id, tenant_id, access_group_id, user_id) VALUES
  ('07000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '06000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001'),
  ('07000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '06000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002'),
  ('07000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', '06000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004'),
  ('07000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', '06000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000005'),
  ('07000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', '06000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003'),
  ('07000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', '06000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000007'),
  ('07000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001', '06000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001'),
  ('07000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000001', '06000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000010')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 12. ACCESS — Access Points
-- ============================================================
INSERT INTO dm3_access.access_points (id, tenant_id, zone_id, access_time_id, name, description) VALUES
  ('08000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
   '03000000-0000-0000-0000-000000000002', '04000000-0000-0000-0000-000000000001',
   'Main Entrance', 'Primary building entrance with terminal'),
  ('08000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
   '03000000-0000-0000-0000-000000000002', '04000000-0000-0000-0000-000000000001',
   'Side Door', 'Staff side entrance with card reader'),
  ('08000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
   '03000000-0000-0000-0000-000000000006', '04000000-0000-0000-0000-000000000002',
   'Parking Gate B1', 'Underground parking entrance/exit'),
  ('08000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001',
   '03000000-0000-0000-0000-000000000004', '04000000-0000-0000-0000-000000000001',
   'Server Room Door', 'Restricted access to server room'),
  ('08000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001',
   '03000000-0000-0000-0000-000000000005', '04000000-0000-0000-0000-000000000003',
   'Warehouse Entry', 'Warehouse main door')
ON CONFLICT DO NOTHING;

-- Link access points to access groups
INSERT INTO dm3_access.access_group_access_points (id, tenant_id, access_group_id, access_point_id) VALUES
  ('09000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '06000000-0000-0000-0000-000000000001', '08000000-0000-0000-0000-000000000001'),
  ('09000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '06000000-0000-0000-0000-000000000001', '08000000-0000-0000-0000-000000000002'),
  ('09000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', '06000000-0000-0000-0000-000000000002', '08000000-0000-0000-0000-000000000001'),
  ('09000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', '06000000-0000-0000-0000-000000000002', '08000000-0000-0000-0000-000000000002'),
  ('09000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', '06000000-0000-0000-0000-000000000002', '08000000-0000-0000-0000-000000000003'),
  ('09000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', '06000000-0000-0000-0000-000000000002', '08000000-0000-0000-0000-000000000004'),
  ('09000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001', '06000000-0000-0000-0000-000000000003', '08000000-0000-0000-0000-000000000004'),
  ('09000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000001', '06000000-0000-0000-0000-000000000004', '08000000-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 13. ACCESS — Access Events (recent history)
-- ============================================================
INSERT INTO dm3_access.access_events (tenant_id, time, access_point_id, user_id, user_name, credential_type, direction, decision, reason) VALUES
  ('00000000-0000-0000-0000-000000000001', now() - interval '4 hours',
   '08000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Nguyen Van An', 'card', 'in', 'granted', 'Valid credential'),
  ('00000000-0000-0000-0000-000000000001', now() - interval '3 hours 50 minutes',
   '08000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'Tran Thi Binh', 'card', 'in', 'granted', 'Valid credential'),
  ('00000000-0000-0000-0000-000000000001', now() - interval '3 hours 45 minutes',
   '08000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000004', 'Pham Minh Duc', 'card', 'in', 'granted', 'Valid credential'),
  ('00000000-0000-0000-0000-000000000001', now() - interval '3 hours',
   '08000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'Nguyen Van An', 'card', 'in', 'granted', 'Server room access'),
  ('00000000-0000-0000-0000-000000000001', now() - interval '2 hours',
   '08000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Nguyen Van An', 'card', 'in', 'granted', 'Parking B1 entry'),
  ('00000000-0000-0000-0000-000000000001', now() - interval '1 hour',
   '08000000-0000-0000-0000-000000000001', null, 'Unknown', 'card', 'in', 'denied', 'Invalid credential'),
  ('00000000-0000-0000-0000-000000000001', now() - interval '30 minutes',
   '08000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000005', 'Hoang Thi Em', 'pin', 'in', 'granted', 'Valid credential'),
  ('00000000-0000-0000-0000-000000000001', now() - interval '15 minutes',
   '08000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000009', 'Do Minh Ich', 'card', 'in', 'granted', 'Valid credential');

-- ============================================================
-- 14. VISITOR — Settings
-- ============================================================
INSERT INTO dm3_visitor.visitor_settings (id, tenant_id, approval_required, auto_approve_returning, auto_approve_vip,
  default_duration_hours, max_duration_hours, auto_checkout_hour, require_phone, badge_enabled, notify_host_on_arrival)
VALUES (
  'f0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
  true, false, true, 8, 24, 22, true, true, true
) ON CONFLICT DO NOTHING;

-- ============================================================
-- 15. VISITOR — Visitors (persistent directory)
-- ============================================================
INSERT INTO dm3_visitor.visitors (id, tenant_id, first_name, last_name, email, phone, company, national_id, watchlist_status, visit_count, last_visit_at) VALUES
  ('b0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
   'John', 'Smith', 'john.smith@acme.com', '+1555000001', 'ACME Corp', '123456789', 'none', 3, now() - interval '2 days'),
  ('b0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
   'Maria', 'Garcia', 'maria.garcia@techco.com', '+1555000002', 'TechCo', '234567890', 'none', 1, now() - interval '5 days'),
  ('b0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
   'Tanaka', 'Yuki', 'yuki.tanaka@jppartner.co.jp', '+81901234567', 'JP Partners', '345678901', 'none', 5, now()),
  ('b0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001',
   'Kim', 'Soo-jin', 'soojin@krtech.kr', '+82101234567', 'KR Tech', '456789012', 'none', 2, now() - interval '1 day'),
  ('b0000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001',
   'Robert', 'Johnson', 'rjohnson@globalinc.com', '+1555000005', 'Global Inc', '567890123', 'none', 0, null),
  ('b0000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001',
   'David', 'Blackwell', 'dblackwell@unknown.com', '+1555000006', null, '999888777', 'blacklisted', 1, now() - interval '30 days'),
  ('b0000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001',
   'Sarah', 'Williams', 'sarah.w@partnerfirm.com', '+1555000007', 'Partner Firm LLC', '678901234', 'vip', 8, now() - interval '3 days'),
  ('b0000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000001',
   'Chen', 'Wei', 'chen.wei@shenzhentech.cn', '+8613800138001', 'Shenzhen Tech', '789012345', 'none', 2, now() - interval '7 days')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 16. VISITOR — Agreements (NDA templates)
-- ============================================================
INSERT INTO dm3_visitor.visitor_agreements (id, tenant_id, name, content, version, active, required_for) VALUES
  ('f1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
   'Standard NDA', 'By signing this agreement, the visitor agrees to maintain confidentiality of all proprietary information observed during the visit. This includes but is not limited to: trade secrets, business processes, employee information, and technical documentation.', 1, true, '{meeting,interview,tour}'),
  ('f1000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
   'Safety Waiver', 'The visitor acknowledges they have been informed of safety protocols and agrees to follow all posted safety guidelines while on premises. The visitor assumes responsibility for adhering to emergency procedures.', 1, true, '{maintenance,delivery}')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 17. VISITOR — Visit Groups (batch visits)
-- ============================================================
INSERT INTO dm3_visitor.visit_groups (id, tenant_id, name, description, host_user_id, purpose, expected_arrival, expected_departure, escort_required, created_by) VALUES
  ('f2000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
   'Q2 Partner Meeting', 'Quarterly partner review with JP Partners and KR Tech', 'a0000000-0000-0000-0000-000000000001',
   'meeting', now() + interval '2 hours', now() + interval '6 hours', false, 'a0000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 18. VISITOR — Visits (various statuses)
-- ============================================================
INSERT INTO dm3_visitor.visits (id, tenant_id, visitor_id, host_user_id, purpose, purpose_note, status,
  expected_arrival, expected_departure, qr_token, qr_expires_at, escort_required, nda_signed, host_approved) VALUES
  -- Pre-registered for today
  ('c0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
   'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
   'meeting', 'Q2 project review with engineering', 'pre_registered',
   now() + interval '2 hours', now() + interval '5 hours',
   'qr_seed_001_' || replace(gen_random_uuid()::text, '-', ''), now() + interval '24 hours',
   false, false, false),
  -- Approved and waiting
  ('c0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
   'b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002',
   'interview', 'Software Engineer position', 'approved',
   now() + interval '1 hour', now() + interval '3 hours',
   'qr_seed_002_' || replace(gen_random_uuid()::text, '-', ''), now() + interval '24 hours',
   true, true, true)
ON CONFLICT (id) DO NOTHING;

-- Checked in (with badge)
INSERT INTO dm3_visitor.visits (id, tenant_id, visitor_id, host_user_id, purpose, purpose_note, status,
  expected_arrival, expected_departure, actual_checkin, checkin_method,
  qr_token, qr_expires_at, badge_number, escort_required, nda_signed, host_approved, host_approved_at) VALUES
  ('c0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
   'b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001',
   'meeting', 'Partnership contract signing', 'checked_in',
   now() - interval '1 hour', now() + interval '3 hours', now() - interval '45 minutes', 'terminal_qr',
   'qr_seed_003_' || replace(gen_random_uuid()::text, '-', ''), now() + interval '24 hours',
   'V-001', false, true, true, now() - interval '2 hours')
ON CONFLICT (id) DO NOTHING;

-- Checked out (completed)
INSERT INTO dm3_visitor.visits (id, tenant_id, visitor_id, host_user_id, purpose, purpose_note, status,
  expected_arrival, expected_departure, actual_checkin, actual_checkout, checkin_method,
  checkout_by, qr_token, qr_expires_at, badge_number, escort_required, nda_signed, host_approved, host_approved_at) VALUES
  ('c0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001',
   'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003',
   'delivery', 'Server rack delivery', 'checked_out',
   now() - interval '5 hours', now() - interval '2 hours', now() - interval '4 hours', now() - interval '3 hours', 'reception',
   'a0000000-0000-0000-0000-000000000003',
   'qr_seed_004_' || replace(gen_random_uuid()::text, '-', ''), now() - interval '1 hour',
   'V-002', false, false, true, now() - interval '6 hours')
ON CONFLICT (id) DO NOTHING;

-- No-show
INSERT INTO dm3_visitor.visits (id, tenant_id, visitor_id, host_user_id, purpose, status,
  expected_arrival, expected_departure, qr_token, qr_expires_at, escort_required, nda_signed, host_approved, host_approved_at) VALUES
  ('c0000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001',
   'b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000002',
   'meeting', 'no_show',
   now() - interval '1 day', now() - interval '20 hours',
   'qr_seed_005_' || replace(gen_random_uuid()::text, '-', ''), now() - interval '12 hours',
   false, false, true, now() - interval '25 hours')
ON CONFLICT (id) DO NOTHING;

-- Waiting (walk-in)
INSERT INTO dm3_visitor.visits (id, tenant_id, visitor_id, host_user_id, purpose, purpose_note, status,
  expected_arrival, expected_departure, qr_token, qr_expires_at, vehicle_plate, escort_required, nda_signed, host_approved) VALUES
  ('c0000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001',
   'b0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001',
   'maintenance', 'AC unit maintenance in server room', 'waiting',
   now(), now() + interval '4 hours',
   'qr_seed_006_' || replace(gen_random_uuid()::text, '-', ''), now() + interval '4 hours',
   '51A-12345', true, false, false)
ON CONFLICT (id) DO NOTHING;

-- Pre-registered for tomorrow
INSERT INTO dm3_visitor.visits (id, tenant_id, visitor_id, host_user_id, purpose, purpose_note, status,
  expected_arrival, expected_departure, qr_token, qr_expires_at, escort_required, nda_signed, host_approved, group_id) VALUES
  ('c0000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001',
   'b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001',
   'meeting', 'Follow-up technical discussion', 'pre_registered',
   now() + interval '1 day', now() + interval '1 day 3 hours',
   'qr_seed_007_' || replace(gen_random_uuid()::text, '-', ''), now() + interval '2 days',
   false, false, false, 'f2000000-0000-0000-0000-000000000001'),
  -- VIP visit (auto-approved)
  ('c0000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000001',
   'b0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001',
   'meeting', 'VIP partner quarterly review', 'approved',
   now() + interval '3 hours', now() + interval '7 hours',
   'qr_seed_008_' || replace(gen_random_uuid()::text, '-', ''), now() + interval '24 hours',
   false, true, true, 'f2000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 19. VISITOR — Watchlist
-- ============================================================
INSERT INTO dm3_visitor.watchlist (id, tenant_id, entry_type, match_field, match_value, reason, added_by) VALUES
  ('d0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
   'blacklisted', 'name', 'David Blackwell', 'Previous security incident — unauthorized area access', 'a0000000-0000-0000-0000-000000000001'),
  ('d0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
   'blacklisted', 'email', 'banned@suspicious.com', 'Fraudulent identity documents', 'a0000000-0000-0000-0000-000000000001'),
  ('d0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
   'blacklisted', 'national_id', '999888777', 'Linked to David Blackwell watchlist entry', 'a0000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 20. VISITOR — Badges
-- ============================================================
INSERT INTO dm3_visitor.visitor_badges (tenant_id, visit_id, badge_number)
VALUES ('00000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003', 'V-001')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 21. VISITOR — Recurring Templates
-- ============================================================
INSERT INTO dm3_visitor.recurring_visit_templates (id, tenant_id, visitor_id, host_user_id, purpose, recurrence_rule, start_date, end_date, active, created_by) VALUES
  ('f3000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
   'b0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001',
   'meeting', 'FREQ=WEEKLY;BYDAY=TU,TH', CURRENT_DATE, CURRENT_DATE + interval '90 days', true, 'a0000000-0000-0000-0000-000000000001'),
  ('f3000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
   'b0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000002',
   'meeting', 'FREQ=MONTHLY;BYMONTHDAY=15', CURRENT_DATE, CURRENT_DATE + interval '365 days', true, 'a0000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 22. VISITOR — Access Log
-- ============================================================
INSERT INTO dm3_visitor.visitor_access_log (tenant_id, visit_id, visitor_id, access_point_name, direction, decision, event_time, credential_type) VALUES
  ('00000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000003',
   'Main Entrance', 'in', 'granted', now() - interval '45 minutes', 'qr'),
  ('00000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000001',
   'Main Entrance', 'in', 'granted', now() - interval '4 hours', 'reception'),
  ('00000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000001',
   'Main Entrance', 'out', 'granted', now() - interval '3 hours', 'reception');

-- ============================================================
-- 23. PARKING — Lots
-- ============================================================
INSERT INTO dm3_parking.parking_lots (id, tenant_id, name, code, description, status) VALUES
  ('e0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
   'Main Building Parking', 'MAIN-PKG', 'Underground parking beneath main office building', 'active'),
  ('e0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
   'Annex Surface Lot', 'ANNEX-PKG', 'Open-air parking lot near annex building', 'active')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 24. PARKING — Zones
-- ============================================================
INSERT INTO dm3_parking.parking_zones (id, tenant_id, lot_id, name, code, type, level, total_spaces, vehicle_types, status) VALUES
  ('e1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
   'e0000000-0000-0000-0000-000000000001', 'B1 Car Park', 'B1-CAR', 'covered', 'B1', 80,
   '{"car","truck"}', 'active'),
  ('e1000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
   'e0000000-0000-0000-0000-000000000001', 'B2 Motorbike Park', 'B2-MOTO', 'covered', 'B2', 200,
   '{"motorbike","bicycle"}', 'active'),
  ('e1000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
   'e0000000-0000-0000-0000-000000000002', 'Surface Car Lot', 'SURF-CAR', 'surface', null, 40,
   '{"car"}', 'active'),
  ('e1000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001',
   'e0000000-0000-0000-0000-000000000002', 'Rooftop Motorbike', 'ROOF-MOTO', 'rooftop', null, 100,
   '{"motorbike","bicycle"}', 'active')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 25. PARKING — Fee Rules
-- ============================================================
INSERT INTO dm3_parking.parking_fee_rules (id, tenant_id, name, vehicle_type, rate_type, rates, free_minutes, max_daily, applies_to, priority, enabled) VALUES
  ('e2000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
   'Hourly Car Rate', 'car', 'hourly',
   '{"first_hour": 20000, "additional_hour": 10000, "currency": "VND"}',
   15, 120000, 'visitor', 10, true),
  ('e2000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
   'Hourly Motorbike Rate', 'motorbike', 'hourly',
   '{"first_hour": 5000, "additional_hour": 3000, "currency": "VND"}',
   15, 30000, 'visitor', 10, true),
  ('e2000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
   'Flat Visitor Car Rate', 'car', 'flat',
   '{"amount": 30000, "currency": "VND"}',
   0, null, 'visitor', 5, true),
  ('e2000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001',
   'Daily Truck Rate', 'truck', 'daily',
   '{"amount": 100000, "currency": "VND"}',
   30, 100000, 'all', 10, true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 26. PARKING — Vehicles
-- ============================================================
INSERT INTO dm3_parking.parking_vehicles (id, tenant_id, plate_number, normalized_plate, type, category, brand, color, registration_status, owner_user_id, rfid_tag, nfc_card_id) VALUES
  ('e3000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
   '51A-123.45', '51A12345', 'car', 'resident', 'Toyota', 'White', 'verified', 'a0000000-0000-0000-0000-000000000001', 'E200-0001-0001-0001', '04:A1:B2:C3:D4:01'),
  ('e3000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
   '59C1-456.78', '59C145678', 'motorbike', 'resident', 'Honda', 'Black', 'verified', 'a0000000-0000-0000-0000-000000000002', 'E200-0001-0001-0002', null),
  ('e3000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
   '30H-789.01', '30H78901', 'car', 'resident', 'Hyundai', 'Silver', 'verified', 'a0000000-0000-0000-0000-000000000004', null, '04:A1:B2:C3:D4:03'),
  ('e3000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001',
   '51F-222.33', '51F22233', 'car', 'visitor', null, 'Red', 'unverified', null, null, null),
  ('e3000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001',
   '59B2-333.44', '59B233344', 'motorbike', 'temporary', null, null, 'unverified', null, null, null),
  ('e3000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001',
   '51G-555.66', '51G55566', 'car', 'visitor', 'BMW', 'Black', 'unverified', null, null, null),
  ('e3000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001',
   '30K-888.99', '30K88899', 'car', 'resident', 'Mercedes', 'White', 'verified', 'a0000000-0000-0000-0000-000000000008', 'E200-0001-0001-0007', '04:A1:B2:C3:D4:07'),
  ('e3000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000001',
   '59D1-111.22', '59D111122', 'motorbike', 'resident', 'Yamaha', 'Blue', 'verified', 'a0000000-0000-0000-0000-000000000006', 'E200-0001-0001-0008', null),
  ('e3000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000001',
   '51H-444.55', '51H44455', 'truck', 'temporary', null, 'White', 'unverified', null, null, null),
  ('e3000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001',
   '29A-777.88', '29A77788', 'car', 'visitor', 'Kia', 'Gray', 'unverified', null, null, null)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 27. PARKING — Passes (monthly)
-- ============================================================
INSERT INTO dm3_parking.parking_passes (id, tenant_id, zone_id, vehicle_id, pass_type, valid_from, valid_until, fee_amount, status, auto_renew) VALUES
  ('e4000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
   'e1000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000001',
   'monthly', CURRENT_DATE - interval '15 days', CURRENT_DATE + interval '15 days',
   1500000, 'active', true),
  ('e4000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
   'e1000000-0000-0000-0000-000000000002', 'e3000000-0000-0000-0000-000000000002',
   'monthly', CURRENT_DATE - interval '10 days', CURRENT_DATE + interval '20 days',
   300000, 'active', true),
  ('e4000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
   'e1000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000003',
   'monthly', CURRENT_DATE - interval '45 days', CURRENT_DATE - interval '15 days',
   1500000, 'expired', false),
  ('e4000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001',
   'e1000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000007',
   'monthly', CURRENT_DATE - interval '5 days', CURRENT_DATE + interval '25 days',
   1500000, 'active', true)
ON CONFLICT (id) DO NOTHING;

-- Link active passes to vehicles
UPDATE dm3_parking.parking_vehicles SET active_pass_id = 'e4000000-0000-0000-0000-000000000001' WHERE id = 'e3000000-0000-0000-0000-000000000001';
UPDATE dm3_parking.parking_vehicles SET active_pass_id = 'e4000000-0000-0000-0000-000000000002' WHERE id = 'e3000000-0000-0000-0000-000000000002';
UPDATE dm3_parking.parking_vehicles SET active_pass_id = 'e4000000-0000-0000-0000-000000000004' WHERE id = 'e3000000-0000-0000-0000-000000000007';

-- ============================================================
-- 28. PARKING — Sessions
-- ============================================================

-- Active: resident car in B1 (2 hours ago)
INSERT INTO dm3_parking.parking_sessions (id, tenant_id, lot_id, zone_id, vehicle_id, plate_number, normalized_plate, vehicle_type, entry_time, status, fee_currency, matched_by, monthly_pass_id) VALUES
  ('e5000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
   'e0000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001',
   'e3000000-0000-0000-0000-000000000001', '51A-123.45', '51A12345', 'car',
   now() - interval '2 hours', 'active', 'VND', 'anpr', 'e4000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- Active: visitor car in surface lot (45 min ago)
INSERT INTO dm3_parking.parking_sessions (id, tenant_id, lot_id, zone_id, vehicle_id, plate_number, normalized_plate, vehicle_type, entry_time, status, fee_currency, matched_by) VALUES
  ('e5000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
   'e0000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000003',
   'e3000000-0000-0000-0000-000000000004', '51F-222.33', '51F22233', 'car',
   now() - interval '45 minutes', 'active', 'VND', 'anpr')
ON CONFLICT (id) DO NOTHING;

-- Active: motorbike in B2 (30 min ago)
INSERT INTO dm3_parking.parking_sessions (id, tenant_id, lot_id, zone_id, vehicle_id, plate_number, normalized_plate, vehicle_type, entry_time, status, fee_currency, matched_by, monthly_pass_id) VALUES
  ('e5000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
   'e0000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000002',
   'e3000000-0000-0000-0000-000000000002', '59C1-456.78', '59C145678', 'motorbike',
   now() - interval '30 minutes', 'active', 'VND', 'anpr', 'e4000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- Active: Mercedes in B1 (1 hour ago)
INSERT INTO dm3_parking.parking_sessions (id, tenant_id, lot_id, zone_id, vehicle_id, plate_number, normalized_plate, vehicle_type, entry_time, status, fee_currency, matched_by, monthly_pass_id) VALUES
  ('e5000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001',
   'e0000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001',
   'e3000000-0000-0000-0000-000000000007', '30K-888.99', '30K88899', 'car',
   now() - interval '1 hour', 'active', 'VND', 'anpr', 'e4000000-0000-0000-0000-000000000004')
ON CONFLICT (id) DO NOTHING;

-- Completed: visitor car (3-hour visit yesterday, paid)
INSERT INTO dm3_parking.parking_sessions (id, tenant_id, lot_id, zone_id, vehicle_id, plate_number, normalized_plate, vehicle_type, entry_time, exit_time, status, fee_amount, fee_currency, fee_rule_id, payment_status, payment_method, payment_time, matched_by, duration_minutes) VALUES
  ('e5000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001',
   'e0000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000003',
   'e3000000-0000-0000-0000-000000000006', '51G-555.66', '51G55566', 'car',
   now() - interval '1 day 3 hours', now() - interval '1 day', 'completed',
   40000, 'VND', 'e2000000-0000-0000-0000-000000000001', 'paid', 'cash', now() - interval '1 day',
   'anpr', 180)
ON CONFLICT (id) DO NOTHING;

-- Completed: motorbike (1-hour visit today, paid by e-wallet)
INSERT INTO dm3_parking.parking_sessions (id, tenant_id, lot_id, zone_id, plate_number, normalized_plate, vehicle_type, entry_time, exit_time, status, fee_amount, fee_currency, fee_rule_id, payment_status, payment_method, payment_time, matched_by, duration_minutes) VALUES
  ('e5000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001',
   'e0000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000002',
   '59B2-333.44', '59B233344', 'motorbike',
   now() - interval '4 hours', now() - interval '3 hours', 'completed',
   5000, 'VND', 'e2000000-0000-0000-0000-000000000002', 'paid', 'e_wallet', now() - interval '3 hours',
   'manual', 60)
ON CONFLICT (id) DO NOTHING;

-- Completed: visitor car (2-day-ago visit, Kia)
INSERT INTO dm3_parking.parking_sessions (id, tenant_id, lot_id, zone_id, vehicle_id, plate_number, normalized_plate, vehicle_type, entry_time, exit_time, status, fee_amount, fee_currency, fee_rule_id, payment_status, payment_method, payment_time, matched_by, duration_minutes) VALUES
  ('e5000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001',
   'e0000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000003',
   'e3000000-0000-0000-0000-000000000010', '29A-777.88', '29A77788', 'car',
   now() - interval '2 days 2 hours', now() - interval '2 days', 'completed',
   30000, 'VND', 'e2000000-0000-0000-0000-000000000003', 'paid', 'card', now() - interval '2 days',
   'anpr', 120)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 29. PARKING — Settings
-- ============================================================
INSERT INTO dm3_parking.parking_settings (id, tenant_id, auto_open_barrier_on_pass, confidence_threshold,
  require_payment_before_exit, free_minutes_global, max_session_hours, allow_unregistered_entry,
  plate_recognition_enabled, default_fee_currency, notify_on_disputed, capacity_alert_threshold)
VALUES (
  'f4000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
  true, 0.85, true, 15, 24, true, true, 'VND', true, 80
) ON CONFLICT DO NOTHING;

COMMIT;

-- ============================================================
-- SUMMARY
-- ============================================================
-- Tenant: 1 (Duali Vietnam Demo, plugins: core + visitor + parking)
-- Accounts: 5 (sysadmin, admin, manager, operator, viewer — all password: admin123)
-- Departments: 6
-- Users: 10 (3 with login accounts, 7 employees only)
-- Credentials: 15 (10 cards + 5 PINs)
-- User Groups: 3 (Engineering, Management, Security)
-- Identity Vehicles: 5
-- Devices: 8 (3 terminals, 1 controller, 3 sensors, 1 camera)
-- Access Zones: 6
-- Access Times: 3 (Business Hours, 24/7, Extended)
-- Access Groups: 4 (General Staff, Security, Server Room, Visitor)
-- Access Points: 5
-- Access Events: 8 recent entries
-- Visitor Settings: 1 tenant config
-- Visitors: 8 (1 blacklisted, 1 VIP, 6 regular)
-- Visits: 8 (2 pre_registered, 2 approved, 1 checked_in, 1 checked_out, 1 no_show, 1 waiting)
-- Watchlist: 3 entries
-- Agreements: 2 (NDA, Safety Waiver)
-- Visit Groups: 1 (Q2 Partner Meeting)
-- Recurring Templates: 2 (weekly + monthly)
-- Parking Lots: 2 (Main Building, Annex)
-- Parking Zones: 4 (B1 Car, B2 Moto, Surface Car, Rooftop Moto)
-- Parking Fee Rules: 4 (hourly car, hourly moto, flat visitor, daily truck)
-- Parking Vehicles: 10 (4 resident, 4 visitor, 2 temporary)
-- Parking Passes: 4 (3 active, 1 expired)
-- Parking Sessions: 7 (4 active, 3 completed with payment)
-- Parking Settings: 1 tenant config
