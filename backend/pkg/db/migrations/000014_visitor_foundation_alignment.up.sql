ALTER TABLE dm3_identity.visits
    ADD COLUMN IF NOT EXISTS site_id UUID;

ALTER TABLE dm3_identity.watchlist
    ADD COLUMN IF NOT EXISTS site_id UUID;

CREATE INDEX IF NOT EXISTS idx_visits_tenant_site_status
    ON dm3_identity.visits(tenant_id, site_id, status);

CREATE INDEX IF NOT EXISTS idx_watchlist_tenant_site
    ON dm3_identity.watchlist(tenant_id, site_id, entry_type);
