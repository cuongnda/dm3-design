-- ============================================================
-- Migration 000004: Standardize timestamp column names
--
-- WHAT: Rename created_on/updated_on to created_at/updated_at
--       on access_groups and departments tables.
--
-- WHY:  All other tables use created_at/updated_at convention.
--       These two tables used created_on/updated_on (legacy),
--       causing inconsistency across the schema.
-- ============================================================

-- 1. Rename columns on access_groups
ALTER TABLE dm3_access.access_groups
    RENAME COLUMN created_on TO created_at;
ALTER TABLE dm3_access.access_groups
    RENAME COLUMN updated_on TO updated_at;

-- 2. Rename columns on departments
ALTER TABLE dm3_identity.departments
    RENAME COLUMN created_on TO created_at;
ALTER TABLE dm3_identity.departments
    RENAME COLUMN updated_on TO updated_at;

-- 3. Update the trigger function if it references updated_on
-- (The trigger was created in 000001 as trg_access_groups_updated_at
--  but the column was named updated_on — now they match)
CREATE OR REPLACE FUNCTION dm3_access.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
