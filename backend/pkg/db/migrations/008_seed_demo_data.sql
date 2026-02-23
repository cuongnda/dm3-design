-- 008_seed_demo_data.sql
-- Seed ~50 Vietnamese persons with credentials and access rules for demo company
-- Company: 00000000-0000-0000-0000-000000000001 (Duali Demo)

-- ============================================================
-- Persons (50 Vietnamese names)
-- ============================================================
INSERT INTO dm3_identity.persons (tenant_id, first_name, last_name, email, phone, department, role, employee_id, status) VALUES
('00000000-0000-0000-0000-000000000001', 'Nguyễn Văn', 'An', 'an.nguyen@duali.vn', '+84901000001', 'Engineering', 'Software Engineer', 'DM-001', 'active'),
('00000000-0000-0000-0000-000000000001', 'Trần Thị', 'Bình', 'binh.tran@duali.vn', '+84901000002', 'HR', 'HR Manager', 'DM-002', 'active'),
('00000000-0000-0000-0000-000000000001', 'Lê Đức', 'Cường', 'cuong.le@duali.vn', '+84901000003', 'Engineering', 'Tech Lead', 'DM-003', 'active'),
('00000000-0000-0000-0000-000000000001', 'Phạm Minh', 'Dũng', 'dung.pham@duali.vn', '+84901000004', 'Sales', 'Sales Director', 'DM-004', 'active'),
('00000000-0000-0000-0000-000000000001', 'Hoàng Thị', 'Em', 'em.hoang@duali.vn', '+84901000005', 'Admin', 'Receptionist', 'DM-005', 'active'),
('00000000-0000-0000-0000-000000000001', 'Huỳnh Văn', 'Phúc', 'phuc.huynh@duali.vn', '+84901000006', 'Engineering', 'DevOps', 'DM-006', 'active'),
('00000000-0000-0000-0000-000000000001', 'Phan Quốc', 'Gia', 'gia.phan@duali.vn', '+84901000007', 'Operations', 'Ops Manager', 'DM-007', 'active'),
('00000000-0000-0000-0000-000000000001', 'Vũ Thị', 'Hương', 'huong.vu@duali.vn', '+84901000008', 'Finance', 'Accountant', 'DM-008', 'active'),
('00000000-0000-0000-0000-000000000001', 'Võ Minh', 'Khải', 'khai.vo@duali.vn', '+84901000009', 'Security', 'Security Lead', 'DM-009', 'active'),
('00000000-0000-0000-0000-000000000001', 'Đặng Văn', 'Long', 'long.dang@duali.vn', '+84901000010', 'IT', 'SysAdmin', 'DM-010', 'active'),
('00000000-0000-0000-0000-000000000001', 'Bùi Thị', 'Mai', 'mai.bui@duali.vn', '+84901000011', 'Marketing', 'Marketing Manager', 'DM-011', 'active'),
('00000000-0000-0000-0000-000000000001', 'Đỗ Hoàng', 'Nam', 'nam.do@duali.vn', '+84901000012', 'Engineering', 'Backend Dev', 'DM-012', 'active'),
('00000000-0000-0000-0000-000000000001', 'Hồ Thị', 'Nga', 'nga.ho@duali.vn', '+84901000013', 'HR', 'Recruiter', 'DM-013', 'active'),
('00000000-0000-0000-0000-000000000001', 'Ngô Thanh', 'Phong', 'phong.ngo@duali.vn', '+84901000014', 'Engineering', 'Frontend Dev', 'DM-014', 'active'),
('00000000-0000-0000-0000-000000000001', 'Dương Minh', 'Quân', 'quan.duong@duali.vn', '+84901000015', 'Sales', 'Account Exec', 'DM-015', 'active'),
('00000000-0000-0000-0000-000000000001', 'Lý Văn', 'Sơn', 'son.ly@duali.vn', '+84901000016', 'Engineering', 'QA Engineer', 'DM-016', 'active'),
('00000000-0000-0000-0000-000000000001', 'Nguyễn Thị', 'Tâm', 'tam.nguyen@duali.vn', '+84901000017', 'Admin', 'Office Manager', 'DM-017', 'active'),
('00000000-0000-0000-0000-000000000001', 'Trần Đức', 'Uy', 'uy.tran@duali.vn', '+84901000018', 'Engineering', 'Mobile Dev', 'DM-018', 'active'),
('00000000-0000-0000-0000-000000000001', 'Lê Thị', 'Vy', 'vy.le@duali.vn', '+84901000019', 'Finance', 'CFO', 'DM-019', 'active'),
('00000000-0000-0000-0000-000000000001', 'Phạm Văn', 'Xuân', 'xuan.pham@duali.vn', '+84901000020', 'Operations', 'Warehouse Mgr', 'DM-020', 'active'),
('00000000-0000-0000-0000-000000000001', 'Hoàng Minh', 'Tuấn', 'tuan.hoang@duali.vn', '+84901000021', 'Engineering', 'Architect', 'DM-021', 'active'),
('00000000-0000-0000-0000-000000000001', 'Huỳnh Thị', 'Linh', 'linh.huynh@duali.vn', '+84901000022', 'Marketing', 'Content Creator', 'DM-022', 'active'),
('00000000-0000-0000-0000-000000000001', 'Phan Văn', 'Hải', 'hai.phan@duali.vn', '+84901000023', 'Security', 'Guard', 'DM-023', 'active'),
('00000000-0000-0000-0000-000000000001', 'Vũ Quang', 'Hiếu', 'hieu.vu@duali.vn', '+84901000024', 'IT', 'Network Admin', 'DM-024', 'active'),
('00000000-0000-0000-0000-000000000001', 'Võ Thị', 'Hạnh', 'hanh.vo@duali.vn', '+84901000025', 'HR', 'Payroll Specialist', 'DM-025', 'active'),
('00000000-0000-0000-0000-000000000001', 'Đặng Thị', 'Lan', 'lan.dang@duali.vn', '+84901000026', 'Admin', 'Secretary', 'DM-026', 'active'),
('00000000-0000-0000-0000-000000000001', 'Bùi Văn', 'Minh', 'minh.bui@duali.vn', '+84901000027', 'Engineering', 'Data Engineer', 'DM-027', 'active'),
('00000000-0000-0000-0000-000000000001', 'Đỗ Thị', 'Nhung', 'nhung.do@duali.vn', '+84901000028', 'Sales', 'Sales Rep', 'DM-028', 'active'),
('00000000-0000-0000-0000-000000000001', 'Hồ Văn', 'Phát', 'phat.ho@duali.vn', '+84901000029', 'Engineering', 'Embedded Dev', 'DM-029', 'active'),
('00000000-0000-0000-0000-000000000001', 'Ngô Thị', 'Quỳnh', 'quynh.ngo@duali.vn', '+84901000030', 'Finance', 'Financial Analyst', 'DM-030', 'active'),
('00000000-0000-0000-0000-000000000001', 'Dương Văn', 'Thành', 'thanh.duong@duali.vn', '+84901000031', 'Operations', 'Logistics', 'DM-031', 'active'),
('00000000-0000-0000-0000-000000000001', 'Lý Thị', 'Thảo', 'thao.ly@duali.vn', '+84901000032', 'Marketing', 'Brand Manager', 'DM-032', 'active'),
('00000000-0000-0000-0000-000000000001', 'Nguyễn Hoàng', 'Thiện', 'thien.nguyen@duali.vn', '+84901000033', 'Engineering', 'SRE', 'DM-033', 'active'),
('00000000-0000-0000-0000-000000000001', 'Trần Văn', 'Trung', 'trung.tran@duali.vn', '+84901000034', 'Sales', 'Business Dev', 'DM-034', 'active'),
('00000000-0000-0000-0000-000000000001', 'Lê Minh', 'Tú', 'tu.le@duali.vn', '+84901000035', 'Engineering', 'Fullstack Dev', 'DM-035', 'active'),
('00000000-0000-0000-0000-000000000001', 'Phạm Thị', 'Thúy', 'thuy.pham@duali.vn', '+84901000036', 'Admin', 'Admin Assistant', 'DM-036', 'active'),
('00000000-0000-0000-0000-000000000001', 'Hoàng Văn', 'Tiến', 'tien.hoang@duali.vn', '+84901000037', 'Security', 'Night Guard', 'DM-037', 'active'),
('00000000-0000-0000-0000-000000000001', 'Huỳnh Đức', 'Tùng', 'tung.huynh@duali.vn', '+84901000038', 'IT', 'Helpdesk', 'DM-038', 'active'),
('00000000-0000-0000-0000-000000000001', 'Phan Thị', 'Hoa', 'hoa.phan@duali.vn', '+84901000039', 'HR', 'Training Mgr', 'DM-039', 'active'),
('00000000-0000-0000-0000-000000000001', 'Vũ Văn', 'Hùng', 'hung.vu@duali.vn', '+84901000040', 'Engineering', 'IoT Engineer', 'DM-040', 'active'),
('00000000-0000-0000-0000-000000000001', 'Võ Thanh', 'Khánh', 'khanh.vo@duali.vn', '+84901000041', 'Sales', 'Regional Mgr', 'DM-041', 'active'),
('00000000-0000-0000-0000-000000000001', 'Đặng Minh', 'Nhân', 'nhan.dang@duali.vn', '+84901000042', 'Engineering', 'AI/ML Engineer', 'DM-042', 'active'),
('00000000-0000-0000-0000-000000000001', 'Bùi Quốc', 'Bảo', 'bao.bui@duali.vn', '+84901000043', 'Operations', 'Supply Chain', 'DM-043', 'active'),
('00000000-0000-0000-0000-000000000001', 'Đỗ Văn', 'Đạt', 'dat.do@duali.vn', '+84901000044', 'Finance', 'Treasurer', 'DM-044', 'active'),
('00000000-0000-0000-0000-000000000001', 'Hồ Thị', 'Diễm', 'diem.ho@duali.vn', '+84901000045', 'Marketing', 'Designer', 'DM-045', 'active'),
('00000000-0000-0000-0000-000000000001', 'Ngô Văn', 'Khoa', 'khoa.ngo@duali.vn', '+84901000046', 'Engineering', 'Cloud Engineer', 'DM-046', 'active'),
('00000000-0000-0000-0000-000000000001', 'Dương Thị', 'Ngọc', 'ngoc.duong@duali.vn', '+84901000047', 'Admin', 'Purchasing', 'DM-047', 'active'),
('00000000-0000-0000-0000-000000000001', 'Lý Minh', 'Phương', 'phuong.ly@duali.vn', '+84901000048', 'Sales', 'Pre-Sales', 'DM-048', 'active'),
('00000000-0000-0000-0000-000000000001', 'Nguyễn Quang', 'Vinh', 'vinh.nguyen@duali.vn', '+84901000049', 'Engineering', 'CTO', 'DM-049', 'active'),
('00000000-0000-0000-0000-000000000001', 'Trần Minh', 'Anh', 'anh.tran@duali.vn', '+84901000050', 'Engineering', 'VP Engineering', 'DM-050', 'active')
ON CONFLICT DO NOTHING;

-- ============================================================
-- Credentials: each person gets card + face, ~60% get PIN
-- ============================================================

-- Card credentials for all persons
INSERT INTO dm3_identity.credentials (tenant_id, person_id, type, value, status)
SELECT '00000000-0000-0000-0000-000000000001', p.id, 'card',
       'CARD' || LPAD(ROW_NUMBER() OVER (ORDER BY p.created_at)::text, 6, '0'),
       'active'
FROM dm3_identity.persons p
WHERE p.tenant_id = '00000000-0000-0000-0000-000000000001'
  AND p.employee_id LIKE 'DM-%'
ON CONFLICT DO NOTHING;

-- Face credentials for all persons
INSERT INTO dm3_identity.credentials (tenant_id, person_id, type, value, status)
SELECT '00000000-0000-0000-0000-000000000001', p.id, 'face',
       md5(p.id::text || 'face-template'),
       'active'
FROM dm3_identity.persons p
WHERE p.tenant_id = '00000000-0000-0000-0000-000000000001'
  AND p.employee_id LIKE 'DM-%'
ON CONFLICT DO NOTHING;

-- PIN credentials for first 30 persons (~60%)
INSERT INTO dm3_identity.credentials (tenant_id, person_id, type, value, status)
SELECT '00000000-0000-0000-0000-000000000001', p.id, 'pin',
       LPAD((1000 + ROW_NUMBER() OVER (ORDER BY p.created_at))::text, 4, '0'),
       'active'
FROM dm3_identity.persons p
WHERE p.tenant_id = '00000000-0000-0000-0000-000000000001'
  AND p.employee_id LIKE 'DM-%'
  AND CAST(SUBSTRING(p.employee_id FROM 4) AS int) <= 30
ON CONFLICT DO NOTHING;

-- ============================================================
-- Person Groups
-- ============================================================
INSERT INTO dm3_identity.person_groups (tenant_id, name, description) VALUES
('00000000-0000-0000-0000-000000000001', 'All Staff', 'All company employees'),
('00000000-0000-0000-0000-000000000001', 'Engineering Team', 'Engineering department'),
('00000000-0000-0000-0000-000000000001', 'VIP / Management', 'Directors and C-level'),
('00000000-0000-0000-0000-000000000001', 'Security Team', 'Security personnel')
ON CONFLICT DO NOTHING;

-- Add all DM-* persons to "All Staff" group
INSERT INTO dm3_identity.person_group_members (group_id, person_id)
SELECT g.id, p.id
FROM dm3_identity.person_groups g, dm3_identity.persons p
WHERE g.name = 'All Staff'
  AND g.tenant_id = '00000000-0000-0000-0000-000000000001'
  AND p.tenant_id = '00000000-0000-0000-0000-000000000001'
  AND p.employee_id LIKE 'DM-%'
ON CONFLICT DO NOTHING;

-- Add Engineering dept to "Engineering Team" group
INSERT INTO dm3_identity.person_group_members (group_id, person_id)
SELECT g.id, p.id
FROM dm3_identity.person_groups g, dm3_identity.persons p
WHERE g.name = 'Engineering Team'
  AND g.tenant_id = '00000000-0000-0000-0000-000000000001'
  AND p.tenant_id = '00000000-0000-0000-0000-000000000001'
  AND p.department = 'Engineering'
ON CONFLICT DO NOTHING;

-- Add VIP management
INSERT INTO dm3_identity.person_group_members (group_id, person_id)
SELECT g.id, p.id
FROM dm3_identity.person_groups g, dm3_identity.persons p
WHERE g.name = 'VIP / Management'
  AND g.tenant_id = '00000000-0000-0000-0000-000000000001'
  AND p.tenant_id = '00000000-0000-0000-0000-000000000001'
  AND p.role IN ('CTO', 'VP Engineering', 'CFO', 'Sales Director', 'HR Manager', 'Marketing Manager', 'Ops Manager')
ON CONFLICT DO NOTHING;

-- Add Security team
INSERT INTO dm3_identity.person_group_members (group_id, person_id)
SELECT g.id, p.id
FROM dm3_identity.person_groups g, dm3_identity.persons p
WHERE g.name = 'Security Team'
  AND g.tenant_id = '00000000-0000-0000-0000-000000000001'
  AND p.tenant_id = '00000000-0000-0000-0000-000000000001'
  AND p.department = 'Security'
ON CONFLICT DO NOTHING;

-- ============================================================
-- Access Rules (linked to person groups, door_ids use group UUIDs)
-- Note: door_ids will reference doors created for simulator devices
-- For now, use person_group_ids referencing the groups above
-- ============================================================
INSERT INTO dm3_access.access_rules (tenant_id, name, person_group_ids, schedule, priority, enabled) VALUES
(
  '00000000-0000-0000-0000-000000000001',
  'All Staff - Main Door',
  (SELECT ARRAY_AGG(id) FROM dm3_identity.person_groups WHERE name = 'All Staff' AND tenant_id = '00000000-0000-0000-0000-000000000001'),
  '{"timezone": "Asia/Ho_Chi_Minh", "periods": [{"days": [1,2,3,4,5], "start": "07:00", "end": "19:00"}]}'::jsonb,
  10, true
),
(
  '00000000-0000-0000-0000-000000000001',
  'VIP - Executive Floor (24/7)',
  (SELECT ARRAY_AGG(id) FROM dm3_identity.person_groups WHERE name = 'VIP / Management' AND tenant_id = '00000000-0000-0000-0000-000000000001'),
  '{"timezone": "Asia/Ho_Chi_Minh", "periods": [{"days": [1,2,3,4,5,6,7], "start": "00:00", "end": "23:59"}]}'::jsonb,
  50, true
),
(
  '00000000-0000-0000-0000-000000000001',
  'Engineering Lab Access',
  (SELECT ARRAY_AGG(id) FROM dm3_identity.person_groups WHERE name = 'Engineering Team' AND tenant_id = '00000000-0000-0000-0000-000000000001'),
  '{"timezone": "Asia/Ho_Chi_Minh", "periods": [{"days": [1,2,3,4,5], "start": "08:00", "end": "22:00"}]}'::jsonb,
  20, true
),
(
  '00000000-0000-0000-0000-000000000001',
  'Security 24/7 All Areas',
  (SELECT ARRAY_AGG(id) FROM dm3_identity.person_groups WHERE name = 'Security Team' AND tenant_id = '00000000-0000-0000-0000-000000000001'),
  '{"timezone": "Asia/Ho_Chi_Minh", "periods": [{"days": [1,2,3,4,5,6,7], "start": "00:00", "end": "23:59"}]}'::jsonb,
  100, true
)
ON CONFLICT DO NOTHING;

-- ============================================================
-- Sync version tracking (simple approach using a config table)
-- ============================================================
CREATE TABLE IF NOT EXISTS dm3_identity.sync_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO dm3_identity.sync_meta (key, value) VALUES ('sync_version', '1')
ON CONFLICT (key) DO UPDATE SET value = (CAST(dm3_identity.sync_meta.value AS int) + 1)::text, updated_at = now();
