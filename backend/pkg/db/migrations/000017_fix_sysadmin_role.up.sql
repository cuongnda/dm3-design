-- 000017: Ensure system admin accounts have role=system_admin and are active
DO $$
BEGIN
    -- Fix/restore sysadmin@duali.com
    UPDATE dm3_auth.accounts
    SET role = 'system_admin', status = 'active', updated_at = NOW()
    WHERE email = 'sysadmin@duali.com' AND company_id IS NULL;

    IF NOT EXISTS (
        SELECT 1 FROM dm3_auth.accounts WHERE email = 'sysadmin@duali.com' AND company_id IS NULL
    ) THEN
        INSERT INTO dm3_auth.accounts (email, company_id, password_hash, role, status, created_at, updated_at)
        VALUES ('sysadmin@duali.com', NULL,
            '$2b$12$npOZArrFi4NNiuhqOCthxusfTqXHaKXbbXhWDv1Df2mF6svcqg1.S',
            'system_admin', 'active', NOW(), NOW());
    END IF;

    -- Fix/restore admin@duali.com
    UPDATE dm3_auth.accounts
    SET role = 'system_admin', status = 'active', updated_at = NOW()
    WHERE email = 'admin@duali.com' AND company_id IS NULL;

    IF NOT EXISTS (
        SELECT 1 FROM dm3_auth.accounts WHERE email = 'admin@duali.com' AND company_id IS NULL
    ) THEN
        INSERT INTO dm3_auth.accounts (email, company_id, password_hash, role, status, created_at, updated_at)
        VALUES ('admin@duali.com', NULL,
            '$2b$12$npOZArrFi4NNiuhqOCthxusfTqXHaKXbbXhWDv1Df2mF6svcqg1.S',
            'system_admin', 'active', NOW(), NOW());
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
