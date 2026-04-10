DROP INDEX IF EXISTS idx_watchlist_tenant_site;
DROP INDEX IF EXISTS idx_visits_tenant_site_status;

ALTER TABLE dm3_identity.watchlist
    DROP COLUMN IF EXISTS site_id;

ALTER TABLE dm3_identity.visits
    DROP COLUMN IF EXISTS site_id;
