DROP TABLE IF EXISTS dm3_access.schedules CASCADE;

ALTER TABLE dm3_access.doors
    DROP COLUMN IF EXISTS site_id,
    DROP COLUMN IF EXISTS zone_id,
    DROP COLUMN IF EXISTS description,
    DROP COLUMN IF EXISTS type,
    DROP COLUMN IF EXISTS floor,
    DROP COLUMN IF EXISTS building,
    DROP COLUMN IF EXISTS state,
    DROP COLUMN IF EXISTS mode,
    DROP COLUMN IF EXISTS controller_id,
    DROP COLUMN IF EXISTS unlock_duration_ms,
    DROP COLUMN IF EXISTS anti_passback,
    DROP COLUMN IF EXISTS emergency_unlock,
    DROP COLUMN IF EXISTS camera_id,
    DROP COLUMN IF EXISTS firmware_version,
    DROP COLUMN IF EXISTS ip_address,
    DROP COLUMN IF EXISTS last_event_at,
    DROP COLUMN IF EXISTS last_heartbeat_at,
    DROP COLUMN IF EXISTS config_version,
    DROP COLUMN IF EXISTS person_db_version,
    DROP COLUMN IF EXISTS rules_version,
    DROP COLUMN IF EXISTS metadata,
    DROP COLUMN IF EXISTS updated_at;

ALTER TABLE dm3_access.access_rules
    DROP COLUMN IF EXISTS site_id,
    DROP COLUMN IF EXISTS description,
    DROP COLUMN IF EXISTS schedule_id,
    DROP COLUMN IF EXISTS anti_passback,
    DROP COLUMN IF EXISTS multi_factor,
    DROP COLUMN IF EXISTS max_failed_attempts,
    DROP COLUMN IF EXISTS lockout_duration_ms,
    DROP COLUMN IF EXISTS valid_from,
    DROP COLUMN IF EXISTS valid_until,
    DROP COLUMN IF EXISTS created_by;

ALTER TABLE dm3_access.access_events
    DROP COLUMN IF EXISTS confidence,
    DROP COLUMN IF EXISTS photo_ref,
    DROP COLUMN IF EXISTS temperature,
    DROP COLUMN IF EXISTS decided_locally;
