-- 000011: Revert visitor management tables

DROP TRIGGER IF EXISTS trg_visits_updated_at ON dm3_identity.visits;
DROP TRIGGER IF EXISTS trg_visitors_updated_at ON dm3_identity.visitors;

DROP TABLE IF EXISTS dm3_identity.visitor_badges CASCADE;
DROP TABLE IF EXISTS dm3_identity.watchlist CASCADE;
DROP TABLE IF EXISTS dm3_identity.visits CASCADE;
DROP TABLE IF EXISTS dm3_identity.visitors CASCADE;
