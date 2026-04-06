-- 000018: Force sysadmin/admin accounts to have company_id=NULL and role=system_admin
-- These are global system accounts and must not be scoped to a company.
DO $$
BEGIN
    UPDATE dm3_auth.accounts
    SET company_id = NULL, role = 'system_admin', status = 'active', updated_at = NOW()
    WHERE email IN ('sysadmin@duali.com', 'admin@duali.com');
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
