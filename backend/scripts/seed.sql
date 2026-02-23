-- DM3 Seed Data

-- Default tenant (implicit via DEFAULT values)

-- Sample devices (matching simulator device IDs)
INSERT INTO dm3_devices.devices (device_id, name, type, status, firmware_version, site_id, location) VALUES
    ('100001', 'Main Entrance Terminal', 'terminal', 'online', '2.1.0', 'HQ', 'Building A - Main Lobby'),
    ('100002', 'Side Door Controller', 'controller', 'online', '2.1.0', 'HQ', 'Building A - Side Entrance'),
    ('100003', 'Parking Gate Sensor', 'sensor', 'online', '1.5.3', 'HQ', 'Parking Level B1'),
    ('100004', 'Server Room Camera', 'camera', 'offline', '3.0.1', 'HQ', 'Building A - Floor 3'),
    ('100005', 'Warehouse Terminal', 'terminal', 'online', '2.1.0', 'WH', 'Warehouse Main')
ON CONFLICT (device_id) DO NOTHING;

-- Sample persons
INSERT INTO dm3_identity.persons (first_name, last_name, email, phone, department, role, employee_id, status) VALUES
    ('Nguyen', 'Van An', 'an.nguyen@duali.com', '+84901234001', 'Engineering', 'Engineer', 'EMP001', 'active'),
    ('Tran', 'Thi Binh', 'binh.tran@duali.com', '+84901234002', 'HR', 'Manager', 'EMP002', 'active'),
    ('Le', 'Duc Cuong', 'cuong.le@duali.com', '+84901234003', 'Engineering', 'Lead', 'EMP003', 'active'),
    ('Pham', 'Minh Duc', 'duc.pham@duali.com', '+84901234004', 'Sales', 'Executive', 'EMP004', 'active'),
    ('Hoang', 'Thi Em', 'em.hoang@duali.com', '+84901234005', 'Admin', 'Receptionist', 'EMP005', 'active'),
    ('Vo', 'Van Phuc', 'phuc.vo@duali.com', '+84901234006', 'Engineering', 'Intern', 'EMP006', 'active'),
    ('Dang', 'Quang Gia', 'gia.dang@duali.com', '+84901234007', 'Operations', 'Supervisor', 'EMP007', 'active'),
    ('Bui', 'Thi Huong', 'huong.bui@duali.com', '+84901234008', 'Finance', 'Accountant', 'EMP008', 'active'),
    ('Do', 'Minh Ich', 'ich.do@duali.com', '+84901234009', 'Security', 'Guard', 'EMP009', 'active'),
    ('Ngo', 'Van Khanh', 'khanh.ngo@duali.com', '+84901234010', 'IT', 'SysAdmin', 'EMP010', 'active')
ON CONFLICT DO NOTHING;

-- Credentials for persons (card + pin)
INSERT INTO dm3_identity.credentials (person_id, type, value, status)
SELECT p.id, 'card', 'CARD' || LPAD(ROW_NUMBER() OVER ()::text, 6, '0'), 'active'
FROM dm3_identity.persons p
ON CONFLICT DO NOTHING;

INSERT INTO dm3_identity.credentials (person_id, type, value, status)
SELECT p.id, 'pin', LPAD((1000 + ROW_NUMBER() OVER ())::text, 4, '0'), 'active'
FROM dm3_identity.persons p
ON CONFLICT DO NOTHING;

-- Doors (linked to devices)
INSERT INTO dm3_access.doors (name, device_id, location, status)
SELECT 'Main Entrance', d.id, 'Building A - Main Lobby', 'locked'
FROM dm3_devices.devices d WHERE d.device_id = '100001'
ON CONFLICT DO NOTHING;

INSERT INTO dm3_access.doors (name, device_id, location, status)
SELECT 'Side Door', d.id, 'Building A - Side Entrance', 'locked'
FROM dm3_devices.devices d WHERE d.device_id = '100002'
ON CONFLICT DO NOTHING;

INSERT INTO dm3_access.doors (name, device_id, location, status)
SELECT 'Parking Gate', d.id, 'Parking Level B1', 'locked'
FROM dm3_devices.devices d WHERE d.device_id = '100003'
ON CONFLICT DO NOTHING;

-- Access rules
INSERT INTO dm3_access.access_rules (name, schedule, priority, enabled) VALUES
    ('Business Hours - All Doors', '{"days": ["mon","tue","wed","thu","fri"], "start": "08:00", "end": "18:00"}', 10, true),
    ('24/7 Security Access', '{"days": ["mon","tue","wed","thu","fri","sat","sun"], "start": "00:00", "end": "23:59"}', 100, true),
    ('Weekend Maintenance', '{"days": ["sat","sun"], "start": "09:00", "end": "17:00"}', 5, true)
ON CONFLICT DO NOTHING;

-- Admin user (password: admin123, bcrypt hash)
INSERT INTO dm3_auth.users (email, password_hash, name, roles, status) VALUES
    ('admin@duali.com', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'DM3 Admin', '{"admin"}', 'active')
ON CONFLICT (email) DO NOTHING;
