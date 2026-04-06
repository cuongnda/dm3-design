DROP TRIGGER IF EXISTS update_access_time_templates_updated_at ON dm3_access.access_time_templates;
DROP TRIGGER IF EXISTS update_user_access_times_updated_at ON dm3_access.user_access_times;
DROP FUNCTION IF EXISTS dm3_access.update_updated_at_column() CASCADE;
DROP TABLE IF EXISTS dm3_access.access_time_validations CASCADE;
DROP TABLE IF EXISTS dm3_access.user_access_times CASCADE;
DROP TABLE IF EXISTS dm3_access.access_time_slots CASCADE;
DROP TABLE IF EXISTS dm3_access.access_time_templates CASCADE;
