ALTER TABLE dm3_access.access_groups
    RENAME COLUMN created_at TO created_on;

ALTER TABLE dm3_access.access_groups
    RENAME COLUMN updated_at TO updated_on;
