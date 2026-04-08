-- ============================================================
-- Migration 000005: Rename companies table to tenants
--
-- WHAT: Rename dm3_auth.companies to dm3_auth.tenants
--
-- WHY:  The table represents tenants in the multi-tenant system.
--       Aligning the table name with the domain concept (tenant)
--       reduces confusion with the "company" terminology used
--       elsewhere for different purposes.
-- ============================================================

ALTER TABLE dm3_auth.companies RENAME TO tenants;
