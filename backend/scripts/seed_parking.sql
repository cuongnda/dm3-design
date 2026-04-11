-- DM3 Parking Management Seed Data
-- Run: PGPASSWORD=dm3secret psql -h localhost -p 5433 -U dm3 -d dm3 -f scripts/seed_parking.sql

BEGIN;

-- ─── Ensure default tenant exists ───────────────────────────────────────────
INSERT INTO dm3_auth.tenants (id, name, code, plan, status)
VALUES ('00000000-0000-0000-0000-000000000001', 'Duali Vietnam Demo', 'DUALI', 'enterprise', 'active')
ON CONFLICT (id) DO NOTHING;

-- ─── Enable parking plugin ──────────────────────────────────────────────────
UPDATE dm3_auth.tenants
SET enabled_plugins = ARRAY(SELECT DISTINCT unnest(enabled_plugins || '{parking}'))
WHERE id = '00000000-0000-0000-0000-000000000001';

-- ─── Parking Lots ───────────────────────────────────────────────────────────
INSERT INTO dm3_parking.parking_lots (id, tenant_id, name, code, description, status)
VALUES
  ('e0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
   'Main Building Parking', 'MAIN-PKG', 'Underground parking beneath main office building', 'active'),
  ('e0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
   'Annex Surface Lot', 'ANNEX-PKG', 'Open-air parking lot near annex building', 'active')
ON CONFLICT (id) DO NOTHING;

-- ─── Parking Zones ──────────────────────────────────────────────────────────
INSERT INTO dm3_parking.parking_zones (id, tenant_id, lot_id, name, code, type, level, total_spaces, vehicle_types, status)
VALUES
  -- Main building zones
  ('e1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
   'e0000000-0000-0000-0000-000000000001', 'B1 Car Park', 'B1-CAR', 'covered', 'B1', 80,
   '{"car","truck"}', 'active'),
  ('e1000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
   'e0000000-0000-0000-0000-000000000001', 'B2 Motorbike Park', 'B2-MOTO', 'covered', 'B2', 200,
   '{"motorbike","bicycle"}', 'active'),
  -- Annex lot zones
  ('e1000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
   'e0000000-0000-0000-0000-000000000002', 'Surface Car Lot', 'SURF-CAR', 'surface', null, 40,
   '{"car"}', 'active'),
  ('e1000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001',
   'e0000000-0000-0000-0000-000000000002', 'Rooftop Motorbike', 'ROOF-MOTO', 'rooftop', null, 100,
   '{"motorbike","bicycle"}', 'active')
ON CONFLICT (id) DO NOTHING;

-- ─── Fee Rules ──────────────────────────────────────────────────────────────
INSERT INTO dm3_parking.parking_fee_rules (id, tenant_id, name, vehicle_type, rate_type, rates, free_minutes, max_daily, applies_to, priority, enabled)
VALUES
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
   0, null, 'visitor', 5, true)
ON CONFLICT (id) DO NOTHING;

-- ─── Vehicles ───────────────────────────────────────────────────────────────
INSERT INTO dm3_parking.parking_vehicles (id, tenant_id, plate_number, normalized_plate, type, category, brand, color, registration_status)
VALUES
  -- Resident vehicles
  ('e3000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
   '51A-123.45', '51A12345', 'car', 'resident', 'Toyota', 'White', 'verified'),
  ('e3000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
   '59C1-456.78', '59C145678', 'motorbike', 'resident', 'Honda', 'Black', 'verified'),
  ('e3000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
   '30H-789.01', '30H78901', 'car', 'resident', 'Hyundai', 'Silver', 'verified'),
  -- Visitor/temporary vehicles
  ('e3000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001',
   '51F-222.33', '51F22233', 'car', 'visitor', null, 'Red', 'unverified'),
  ('e3000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001',
   '59B2-333.44', '59B233344', 'motorbike', 'temporary', null, null, 'unverified'),
  ('e3000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001',
   '51G-555.66', '51G55566', 'car', 'visitor', 'BMW', 'Black', 'unverified'),
  ('e3000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001',
   '30K-888.99', '30K88899', 'car', 'resident', 'Mercedes', 'White', 'verified'),
  ('e3000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000001',
   '59D1-111.22', '59D111122', 'motorbike', 'resident', 'Yamaha', 'Blue', 'verified'),
  ('e3000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000001',
   '51H-444.55', '51H44455', 'truck', 'temporary', null, 'White', 'unverified'),
  ('e3000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001',
   '29A-777.88', '29A77788', 'car', 'visitor', 'Kia', 'Gray', 'unverified')
ON CONFLICT (id) DO NOTHING;

-- ─── Parking Passes (monthly) ───────────────────────────────────────────────
INSERT INTO dm3_parking.parking_passes (id, tenant_id, zone_id, vehicle_id, pass_type, valid_from, valid_until, fee_amount, status, auto_renew)
VALUES
  -- Active passes
  ('e4000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
   'e1000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000001',
   'monthly', CURRENT_DATE - interval '15 days', CURRENT_DATE + interval '15 days',
   1500000, 'active', true),
  ('e4000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
   'e1000000-0000-0000-0000-000000000002', 'e3000000-0000-0000-0000-000000000002',
   'monthly', CURRENT_DATE - interval '10 days', CURRENT_DATE + interval '20 days',
   300000, 'active', true),
  -- Expired pass
  ('e4000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
   'e1000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000003',
   'monthly', CURRENT_DATE - interval '45 days', CURRENT_DATE - interval '15 days',
   1500000, 'expired', false)
ON CONFLICT (id) DO NOTHING;

-- Link active passes to vehicles
UPDATE dm3_parking.parking_vehicles SET active_pass_id = 'e4000000-0000-0000-0000-000000000001' WHERE id = 'e3000000-0000-0000-0000-000000000001';
UPDATE dm3_parking.parking_vehicles SET active_pass_id = 'e4000000-0000-0000-0000-000000000002' WHERE id = 'e3000000-0000-0000-0000-000000000002';

-- ─── Parking Sessions ───────────────────────────────────────────────────────

-- Session 1: Active — resident car in B1 (entered 2 hours ago)
INSERT INTO dm3_parking.parking_sessions (id, tenant_id, lot_id, zone_id, vehicle_id, plate_number, normalized_plate, vehicle_type, entry_time, status, fee_currency, matched_by, monthly_pass_id)
VALUES (
  'e5000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
  'e0000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001',
  'e3000000-0000-0000-0000-000000000001', '51A-123.45', '51A12345', 'car',
  now() - interval '2 hours', 'active', 'VND', 'anpr', 'e4000000-0000-0000-0000-000000000001'
) ON CONFLICT (id) DO NOTHING;

-- Session 2: Active — visitor car in surface lot (entered 45 min ago)
INSERT INTO dm3_parking.parking_sessions (id, tenant_id, lot_id, zone_id, vehicle_id, plate_number, normalized_plate, vehicle_type, entry_time, status, fee_currency, matched_by)
VALUES (
  'e5000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
  'e0000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000003',
  'e3000000-0000-0000-0000-000000000004', '51F-222.33', '51F22233', 'car',
  now() - interval '45 minutes', 'active', 'VND', 'anpr'
) ON CONFLICT (id) DO NOTHING;

-- Session 3: Active — motorbike in B2 (entered 30 min ago)
INSERT INTO dm3_parking.parking_sessions (id, tenant_id, lot_id, zone_id, vehicle_id, plate_number, normalized_plate, vehicle_type, entry_time, status, fee_currency, matched_by, monthly_pass_id)
VALUES (
  'e5000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
  'e0000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000002',
  'e3000000-0000-0000-0000-000000000002', '59C1-456.78', '59C145678', 'motorbike',
  now() - interval '30 minutes', 'active', 'VND', 'anpr', 'e4000000-0000-0000-0000-000000000002'
) ON CONFLICT (id) DO NOTHING;

-- Session 4: Completed — visitor car exited and paid (3 hours visit yesterday)
INSERT INTO dm3_parking.parking_sessions (id, tenant_id, lot_id, zone_id, vehicle_id, plate_number, normalized_plate, vehicle_type, entry_time, exit_time, status, fee_amount, fee_currency, fee_rule_id, payment_status, payment_method, payment_time, matched_by, duration_minutes)
VALUES (
  'e5000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001',
  'e0000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000003',
  'e3000000-0000-0000-0000-000000000006', '51G-555.66', '51G55566', 'car',
  now() - interval '1 day 3 hours', now() - interval '1 day', 'completed',
  40000, 'VND', 'e2000000-0000-0000-0000-000000000001', 'paid', 'cash', now() - interval '1 day',
  'anpr', 180
) ON CONFLICT (id) DO NOTHING;

-- Session 5: Completed — motorbike exited and paid (1 hour visit today)
INSERT INTO dm3_parking.parking_sessions (id, tenant_id, lot_id, zone_id, plate_number, normalized_plate, vehicle_type, entry_time, exit_time, status, fee_amount, fee_currency, fee_rule_id, payment_status, payment_method, payment_time, matched_by, duration_minutes)
VALUES (
  'e5000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001',
  'e0000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000002',
  '59B2-333.44', '59B233344', 'motorbike',
  now() - interval '4 hours', now() - interval '3 hours', 'completed',
  5000, 'VND', 'e2000000-0000-0000-0000-000000000002', 'paid', 'e_wallet', now() - interval '3 hours',
  'manual', 60
) ON CONFLICT (id) DO NOTHING;

COMMIT;

-- ─── Summary ────────────────────────────────────────────────────────────────
-- After running this seed:
--   2 parking lots (Main Building, Annex)
--   4 parking zones (B1 Car, B2 Moto, Surface Car, Rooftop Moto)
--   3 fee rules (hourly car, hourly motorbike, flat visitor)
--   10 vehicles (4 resident, 4 visitor, 2 temporary)
--   3 monthly passes (2 active, 1 expired)
--   5 parking sessions:
--     - 3 active (1 resident car, 1 visitor car, 1 resident motorbike)
--     - 2 completed with payment (1 car yesterday, 1 motorbike today)
