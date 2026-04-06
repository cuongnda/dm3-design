-- Reverse seed demo data
DELETE FROM dm3_access.access_rules WHERE name IN (
    'All Staff — Main Door (Weekdays)',
    'VIP — Executive Floor (24/7)',
    'Engineering — Lab Access',
    'Security — 24/7 Full Access'
);
DELETE FROM dm3_identity.person_group_members;
DELETE FROM dm3_identity.person_groups WHERE name IN (
    'All Staff', 'Engineering Team', 'VIP / Management', 'Security Team'
);
DELETE FROM dm3_identity.credentials WHERE person_id IN (
    SELECT id FROM dm3_identity.persons WHERE employee_id LIKE 'DM-%'
);
DELETE FROM dm3_identity.persons WHERE employee_id LIKE 'DM-%';
DROP TABLE IF EXISTS dm3_identity.sync_meta CASCADE;
