-- Rename created_on/updated_on → created_at/updated_at in dm3_access.access_groups
ALTER TABLE dm3_access.access_groups
    RENAME COLUMN created_on TO created_at;

ALTER TABLE dm3_access.access_groups
    RENAME COLUMN updated_on TO updated_at;
