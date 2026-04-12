-- Reverse 000013_cctv_schema.up.sql

DROP TABLE IF EXISTS dm3_cctv.cctv_settings;
DROP TABLE IF EXISTS dm3_cctv.event_clips;
DROP TABLE IF EXISTS dm3_cctv.cameras;
DROP FUNCTION IF EXISTS dm3_cctv.set_updated_at();
DROP SCHEMA IF EXISTS dm3_cctv;
