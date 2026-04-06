-- 008_seed_demo_data.sql
-- Seed ~50 Vietnamese demo users into dm3_auth.users with credentials
-- Company: 00000000-0000-0000-0000-000000000001 (Duali Demo)

-- ============================================================
-- Fix credentials FK to reference dm3_auth.users instead of users
-- ============================================================
ALTER TABLE dm3_identity.credentials
    DROP CONSTRAINT IF EXISTS credentials_person_id_fkey;

ALTER TABLE dm3_identity.credentials
    ADD CONSTRAINT credentials_person_id_fkey
    FOREIGN KEY (person_id) REFERENCES dm3_auth.users(id) ON DELETE CASCADE;

-- ============================================================
-- Demo Users (50 Vietnamese names) — password: Demo@2024
-- hash: $2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhy2
-- ============================================================
INSERT INTO dm3_auth.users (id, tenant_id, email, password_hash, name, roles, status) VALUES
('a0000001-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'an.nguyen@duali.vn',      '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhy2', 'Nguyễn Văn An',       '{"user"}', 'active'),
('a0000001-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'binh.tran@duali.vn',     '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhy2', 'Trần Thị Bình',        '{"user"}', 'active'),
('a0000001-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'cuong.le@duali.vn',      '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhy2', 'Lê Đức Cường',         '{"user"}', 'active'),
('a0000001-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'dung.pham@duali.vn',     '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhy2', 'Phạm Minh Dũng',       '{"user"}', 'active'),
('a0000001-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'em.hoang@duali.vn',      '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhy2', 'Hoàng Thị Em',         '{"user"}', 'active'),
('a0000001-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', 'phuc.huynh@duali.vn',    '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhy2', 'Huỳnh Văn Phúc',       '{"user"}', 'active'),
('a0000001-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001', 'gia.phan@duali.vn',      '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhy2', 'Phan Quốc Gia',        '{"user"}', 'active'),
('a0000001-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000001', 'huong.vu@duali.vn',      '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhy2', 'Vũ Thị Hương',         '{"user"}', 'active'),
('a0000001-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000001', 'khai.vo@duali.vn',       '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhy2', 'Võ Minh Khải',         '{"user"}', 'active'),
('a0000001-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'long.dang@duali.vn',     '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhy2', 'Đặng Văn Long',        '{"user"}', 'active'),
('a0000001-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'mai.bui@duali.vn',       '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhy2', 'Bùi Thị Mai',          '{"user"}', 'active'),
('a0000001-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001', 'nam.do@duali.vn',        '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhy2', 'Đỗ Hoàng Nam',         '{"user"}', 'active'),
('a0000001-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000001', 'nga.ho@duali.vn',        '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhy2', 'Hồ Thị Nga',           '{"user"}', 'active'),
('a0000001-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000000001', 'phong.ngo@duali.vn',     '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhy2', 'Ngô Thanh Phong',      '{"user"}', 'active'),
('a0000001-0000-0000-0000-000000000015', '00000000-0000-0000-0000-000000000001', 'quan.duong@duali.vn',    '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhy2', 'Dương Minh Quân',      '{"user"}', 'active'),
('a0000001-0000-0000-0000-000000000016', '00000000-0000-0000-0000-000000000001', 'son.ly@duali.vn',        '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhy2', 'Lý Văn Sơn',           '{"user"}', 'active'),
('a0000001-0000-0000-0000-000000000017', '00000000-0000-0000-0000-000000000001', 'tam.nguyen@duali.vn',    '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhy2', 'Nguyễn Thị Tâm',       '{"user"}', 'active'),
('a0000001-0000-0000-0000-000000000018', '00000000-0000-0000-0000-000000000001', 'uy.tran@duali.vn',       '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhy2', 'Trần Đức Uy',          '{"user"}', 'active'),
('a0000001-0000-0000-0000-000000000019', '00000000-0000-0000-0000-000000000001', 'vy.le@duali.vn',         '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhy2', 'Lê Thị Vy',            '{"user"}', 'active'),
('a0000001-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000001', 'xuan.pham@duali.vn',     '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhy2', 'Phạm Văn Xuân',        '{"user"}', 'active'),
('a0000001-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000001', 'tuan.hoang@duali.vn',    '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhy2', 'Hoàng Minh Tuấn',      '{"user"}', 'active'),
('a0000001-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000001', 'linh.huynh@duali.vn',    '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhy2', 'Huỳnh Thị Linh',       '{"user"}', 'active'),
('a0000001-0000-0000-0000-000000000023', '00000000-0000-0000-0000-000000000001', 'hai.phan@duali.vn',      '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhy2', 'Phan Văn Hải',         '{"user"}', 'active'),
('a0000001-0000-0000-0000-000000000024', '00000000-0000-0000-0000-000000000001', 'hieu.vu@duali.vn',       '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhy2', 'Vũ Quang Hiếu',        '{"user"}', 'active'),
('a0000001-0000-0000-0000-000000000025', '00000000-0000-0000-0000-000000000001', 'hanh.vo@duali.vn',       '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhy2', 'Võ Thị Hạnh',          '{"user"}', 'active'),
('a0000001-0000-0000-0000-000000000026', '00000000-0000-0000-0000-000000000001', 'lan.dang@duali.vn',      '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhy2', 'Đặng Thị Lan',         '{"user"}', 'active'),
('a0000001-0000-0000-0000-000000000027', '00000000-0000-0000-0000-000000000001', 'minh.bui@duali.vn',      '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhy2', 'Bùi Văn Minh',         '{"user"}', 'active'),
('a0000001-0000-0000-0000-000000000028', '00000000-0000-0000-0000-000000000001', 'nhung.do@duali.vn',      '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhy2', 'Đỗ Thị Nhung',         '{"user"}', 'active'),
('a0000001-0000-0000-0000-000000000029', '00000000-0000-0000-0000-000000000001', 'phat.ho@duali.vn',       '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhy2', 'Hồ Văn Phát',          '{"user"}', 'active'),
('a0000001-0000-0000-0000-000000000030', '00000000-0000-0000-0000-000000000001', 'quynh.ngo@duali.vn',     '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhy2', 'Ngô Thị Quỳnh',        '{"user"}', 'active'),
('a0000001-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000001', 'thanh.duong@duali.vn',   '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhy2', 'Dương Văn Thành',      '{"user"}', 'active'),
('a0000001-0000-0000-0000-000000000032', '00000000-0000-0000-0000-000000000001', 'thao.ly@duali.vn',       '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhy2', 'Lý Thị Thảo',          '{"user"}', 'active'),
('a0000001-0000-0000-0000-000000000033', '00000000-0000-0000-0000-000000000001', 'thien.nguyen@duali.vn',  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhy2', 'Nguyễn Hoàng Thiện',   '{"user"}', 'active'),
('a0000001-0000-0000-0000-000000000034', '00000000-0000-0000-0000-000000000001', 'trung.tran@duali.vn',    '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhy2', 'Trần Văn Trung',       '{"user"}', 'active'),
('a0000001-0000-0000-0000-000000000035', '00000000-0000-0000-0000-000000000001', 'tu.le@duali.vn',         '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhy2', 'Lê Minh Tú',           '{"user"}', 'active'),
('a0000001-0000-0000-0000-000000000036', '00000000-0000-0000-0000-000000000001', 'thuy.pham@duali.vn',     '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhy2', 'Phạm Thị Thúy',        '{"user"}', 'active'),
('a0000001-0000-0000-0000-000000000037', '00000000-0000-0000-0000-000000000001', 'tien.hoang@duali.vn',    '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhy2', 'Hoàng Văn Tiến',       '{"user"}', 'active'),
('a0000001-0000-0000-0000-000000000038', '00000000-0000-0000-0000-000000000001', 'tung.huynh@duali.vn',    '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhy2', 'Huỳnh Đức Tùng',       '{"user"}', 'active'),
('a0000001-0000-0000-0000-000000000039', '00000000-0000-0000-0000-000000000001', 'hoa.phan@duali.vn',      '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhy2', 'Phan Thị Hoa',         '{"user"}', 'active'),
('a0000001-0000-0000-0000-000000000040', '00000000-0000-0000-0000-000000000001', 'hung.vu@duali.vn',       '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhy2', 'Vũ Văn Hùng',          '{"user"}', 'active'),
('a0000001-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000001', 'khanh.vo@duali.vn',      '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhy2', 'Võ Thanh Khánh',       '{"user"}', 'active'),
('a0000001-0000-0000-0000-000000000042', '00000000-0000-0000-0000-000000000001', 'nhan.dang@duali.vn',     '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhy2', 'Đặng Minh Nhân',       '{"user"}', 'active'),
('a0000001-0000-0000-0000-000000000043', '00000000-0000-0000-0000-000000000001', 'bao.bui@duali.vn',       '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhy2', 'Bùi Quốc Bảo',         '{"user"}', 'active'),
('a0000001-0000-0000-0000-000000000044', '00000000-0000-0000-0000-000000000001', 'dat.do@duali.vn',        '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhy2', 'Đỗ Văn Đạt',           '{"user"}', 'active'),
('a0000001-0000-0000-0000-000000000045', '00000000-0000-0000-0000-000000000001', 'diem.ho@duali.vn',       '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhy2', 'Hồ Thị Diễm',          '{"user"}', 'active'),
('a0000001-0000-0000-0000-000000000046', '00000000-0000-0000-0000-000000000001', 'khoa.ngo@duali.vn',      '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhy2', 'Ngô Văn Khoa',         '{"user"}', 'active'),
('a0000001-0000-0000-0000-000000000047', '00000000-0000-0000-0000-000000000001', 'ngoc.duong@duali.vn',    '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhy2', 'Dương Thị Ngọc',       '{"user"}', 'active'),
('a0000001-0000-0000-0000-000000000048', '00000000-0000-0000-0000-000000000001', 'phuong.ly@duali.vn',     '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhy2', 'Lý Minh Phương',       '{"user"}', 'active'),
('a0000001-0000-0000-0000-000000000049', '00000000-0000-0000-0000-000000000001', 'vinh.nguyen@duali.vn',   '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhy2', 'Nguyễn Quang Vinh',    '{"user"}', 'active'),
('a0000001-0000-0000-0000-000000000050', '00000000-0000-0000-0000-000000000001', 'anh.tran@duali.vn',      '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhy2', 'Trần Minh Anh',        '{"user"}', 'active')
ON CONFLICT (email) DO NOTHING;

-- ============================================================
-- Credentials: card for all 50 users, PIN for first 30
-- ============================================================

-- Card credentials
INSERT INTO dm3_identity.credentials (tenant_id, person_id, type, value, status)
SELECT '00000000-0000-0000-0000-000000000001',
       u.id,
       'card',
       'CARD' || LPAD(ROW_NUMBER() OVER (ORDER BY u.created_at)::text, 6, '0'),
       'active'
FROM dm3_auth.users u
WHERE u.tenant_id = '00000000-0000-0000-0000-000000000001'
  AND u.email LIKE '%@duali.vn'
ON CONFLICT DO NOTHING;

-- Face credentials
INSERT INTO dm3_identity.credentials (tenant_id, person_id, type, value, status)
SELECT '00000000-0000-0000-0000-000000000001',
       u.id,
       'face',
       md5(u.id::text || 'face-template'),
       'active'
FROM dm3_auth.users u
WHERE u.tenant_id = '00000000-0000-0000-0000-000000000001'
  AND u.email LIKE '%@duali.vn'
ON CONFLICT DO NOTHING;

-- PIN credentials for first 30 users
INSERT INTO dm3_identity.credentials (tenant_id, person_id, type, value, status)
SELECT '00000000-0000-0000-0000-000000000001',
       u.id,
       'pin',
       LPAD((1000 + ROW_NUMBER() OVER (ORDER BY u.created_at))::text, 4, '0'),
       'active'
FROM dm3_auth.users u
WHERE u.tenant_id = '00000000-0000-0000-0000-000000000001'
  AND u.email LIKE '%@duali.vn'
ORDER BY u.created_at
LIMIT 30
ON CONFLICT DO NOTHING;

-- ============================================================
-- Sync version tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS dm3_identity.sync_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO dm3_identity.sync_meta (key, value) VALUES ('sync_version', '1')
ON CONFLICT (key) DO UPDATE SET value = (CAST(dm3_identity.sync_meta.value AS int) + 1)::text, updated_at = now();
