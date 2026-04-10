-- DM3 Visitor Management Seed Data
-- Run: PGPASSWORD=dm3secret psql -h localhost -p 5433 -U dm3 -d dm3 -f scripts/seed_visitors.sql

BEGIN;

-- ─── Ensure default tenant exists ───────────────────────────────────────────
INSERT INTO dm3_auth.tenants (id, name, code, plan, status)
VALUES ('00000000-0000-0000-0000-000000000001', 'Duali Vietnam Demo', 'DUALI', 'enterprise', 'active')
ON CONFLICT (id) DO NOTHING;

-- ─── Host users (employees who receive visitors) ────────────────────────────
INSERT INTO dm3_identity.users (id, tenant_id, first_name, last_name, email, phone, status, is_deleted)
VALUES
  ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
   'Nguyen', 'Van An', 'an.nguyen@duali.com', '+84901234001', 'active', false),
  ('a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
   'Tran', 'Thi Binh', 'binh.tran@duali.com', '+84901234002', 'active', false),
  ('a0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
   'Le', 'Duc Cuong', 'cuong.le@duali.com', '+84901234003', 'active', false)
ON CONFLICT (id) DO NOTHING;

-- ─── Visitors ───────────────────────────────────────────────────────────────
INSERT INTO dm3_identity.visitors (id, tenant_id, first_name, last_name, email, phone, company, national_id, watchlist_status, visit_count, last_visit_at)
VALUES
  -- Regular visitors
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
  -- Watchlisted visitor (for testing)
  ('b0000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001',
   'David', 'Blackwell', 'dblackwell@unknown.com', '+1555000006', null, '999888777', 'blacklisted', 1, now() - interval '30 days')
ON CONFLICT (id) DO NOTHING;

-- ─── Visits (various statuses for testing) ──────────────────────────────────

-- Visit 1: Pre-registered for today (waiting for arrival)
INSERT INTO dm3_identity.visits (id, tenant_id, visitor_id, host_user_id, purpose, purpose_note, status,
  expected_arrival, expected_departure, qr_token, qr_expires_at, escort_required, nda_signed, host_approved)
VALUES (
  'c0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
  'meeting', 'Q2 project review with engineering team', 'pre_registered',
  now() + interval '2 hours', now() + interval '5 hours',
  'qr_seed_token_001_' || replace(gen_random_uuid()::text, '-', ''), now() + interval '24 hours',
  false, false, false
) ON CONFLICT (id) DO NOTHING;

-- Visit 2: Approved and waiting (arrived at reception)
INSERT INTO dm3_identity.visits (id, tenant_id, visitor_id, host_user_id, purpose, purpose_note, status,
  expected_arrival, expected_departure, qr_token, qr_expires_at, escort_required, nda_signed, host_approved, host_approved_at)
VALUES (
  'c0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002',
  'interview', 'Software Engineer position interview', 'approved',
  now() + interval '1 hour', now() + interval '3 hours',
  'qr_seed_token_002_' || replace(gen_random_uuid()::text, '-', ''), now() + interval '24 hours',
  true, true, true, now() - interval '30 minutes'
) ON CONFLICT (id) DO NOTHING;

-- Visit 3: Currently checked in
INSERT INTO dm3_identity.visits (id, tenant_id, visitor_id, host_user_id, purpose, purpose_note, status,
  expected_arrival, expected_departure, actual_checkin, checkin_method,
  qr_token, qr_expires_at, badge_number, escort_required, nda_signed, host_approved, host_approved_at)
VALUES (
  'c0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001',
  'business', 'Partnership contract signing', 'checked_in',
  now() - interval '1 hour', now() + interval '3 hours', now() - interval '45 minutes', 'qr',
  'qr_seed_token_003_' || replace(gen_random_uuid()::text, '-', ''), now() + interval '24 hours',
  'V-001', false, true, true, now() - interval '2 hours'
) ON CONFLICT (id) DO NOTHING;

-- Visit 4: Checked out (completed visit)
INSERT INTO dm3_identity.visits (id, tenant_id, visitor_id, host_user_id, purpose, purpose_note, status,
  expected_arrival, expected_departure, actual_checkin, actual_checkout, checkin_method,
  checkout_by, qr_token, qr_expires_at, badge_number, escort_required, nda_signed, host_approved, host_approved_at)
VALUES (
  'c0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003',
  'delivery', 'Server rack delivery - Building B', 'checked_out',
  now() - interval '5 hours', now() - interval '2 hours', now() - interval '4 hours', now() - interval '3 hours', 'manual',
  'a0000000-0000-0000-0000-000000000003',
  'qr_seed_token_004_' || replace(gen_random_uuid()::text, '-', ''), now() - interval '1 hour',
  'V-002', false, false, true, now() - interval '6 hours'
) ON CONFLICT (id) DO NOTHING;

-- Visit 5: No-show
INSERT INTO dm3_identity.visits (id, tenant_id, visitor_id, host_user_id, purpose, status,
  expected_arrival, expected_departure, qr_token, qr_expires_at, escort_required, nda_signed, host_approved, host_approved_at)
VALUES (
  'c0000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000002',
  'meeting', 'no_show',
  now() - interval '1 day', now() - interval '20 hours',
  'qr_seed_token_005_' || replace(gen_random_uuid()::text, '-', ''), now() - interval '12 hours',
  false, false, true, now() - interval '25 hours'
) ON CONFLICT (id) DO NOTHING;

-- Visit 6: Waiting status (walk-in, arrived today)
INSERT INTO dm3_identity.visits (id, tenant_id, visitor_id, host_user_id, purpose, purpose_note, status,
  expected_arrival, expected_departure, qr_token, qr_expires_at, vehicle_plate, escort_required, nda_signed, host_approved)
VALUES (
  'c0000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001',
  'maintenance', 'AC unit maintenance in server room', 'waiting',
  now(), now() + interval '4 hours',
  'qr_seed_token_006_' || replace(gen_random_uuid()::text, '-', ''), now() + interval '4 hours',
  '51A-12345', true, false, false
) ON CONFLICT (id) DO NOTHING;

-- Visit 7: Pre-registered for tomorrow
INSERT INTO dm3_identity.visits (id, tenant_id, visitor_id, host_user_id, purpose, purpose_note, status,
  expected_arrival, expected_departure, qr_token, qr_expires_at, escort_required, nda_signed, host_approved)
VALUES (
  'c0000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000003',
  'interview', 'Follow-up technical interview', 'pre_registered',
  now() + interval '1 day', now() + interval '1 day 3 hours',
  'qr_seed_token_007_' || replace(gen_random_uuid()::text, '-', ''), now() + interval '2 days',
  false, false, false
) ON CONFLICT (id) DO NOTHING;

-- ─── Watchlist entries ──────────────────────────────────────────────────────
INSERT INTO dm3_identity.watchlist (id, tenant_id, entry_type, match_field, match_value, reason, added_by)
VALUES
  ('d0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
   'blacklisted', 'name', 'David Blackwell', 'Previous security incident - unauthorized area access', 'a0000000-0000-0000-0000-000000000001'),
  ('d0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
   'blacklisted', 'email', 'banned@suspicious.com', 'Fraudulent identity documents', 'a0000000-0000-0000-0000-000000000001'),
  ('d0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
   'blacklisted', 'national_id', '999888777', 'Linked to watchlist entry for David Blackwell', 'a0000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- ─── Visitor badges (for checked-in visit) ──────────────────────────────────
INSERT INTO dm3_identity.visitor_badges (tenant_id, visit_id, badge_number)
VALUES ('00000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003', 'V-001')
ON CONFLICT DO NOTHING;

COMMIT;

-- ─── Summary ────────────────────────────────────────────────────────────────
-- After running this seed:
--   6 visitors (1 blacklisted)
--   7 visits:
--     - 2 pre_registered (today + tomorrow)
--     - 1 approved
--     - 1 checked_in (with badge V-001)
--     - 1 checked_out (completed)
--     - 1 no_show
--     - 1 waiting (walk-in, with vehicle plate)
--   3 watchlist entries (name, email, national_id)
--   3 host users
