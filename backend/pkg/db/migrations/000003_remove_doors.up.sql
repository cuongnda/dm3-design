-- ============================================================
-- Migration 000003: Remove doors table, link access_point → device
--
-- WHAT: Each access_point IS a single entrance with one device.
--       The doors + access_point_doors indirection is removed.
--
-- WHY:  Devices are the controllers. Each access point is a single
--       entrance — the junction layer adds complexity with no value.
-- ============================================================

-- 1. Add device-related columns to access_points
ALTER TABLE dm3_access.access_points
    ADD COLUMN IF NOT EXISTS device_id         UUID REFERENCES dm3_devices.devices(id),
    ADD COLUMN IF NOT EXISTS status            VARCHAR(20) DEFAULT 'offline',
    ADD COLUMN IF NOT EXISTS state             VARCHAR(20) DEFAULT 'locked',
    ADD COLUMN IF NOT EXISTS mode              VARCHAR(20) DEFAULT 'normal',
    ADD COLUMN IF NOT EXISTS anti_passback     BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS unlock_duration_ms INT DEFAULT 5000,
    ADD COLUMN IF NOT EXISTS last_event_at     TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_access_points_device ON dm3_access.access_points(device_id);
CREATE INDEX IF NOT EXISTS idx_access_points_status ON dm3_access.access_points(status);

-- 2. Migrate data: copy first door's properties into each access_point
UPDATE dm3_access.access_points ap
SET device_id         = sub.device_id,
    status            = sub.status,
    state             = sub.state,
    mode              = sub.mode,
    anti_passback     = sub.anti_passback,
    unlock_duration_ms = sub.unlock_duration_ms,
    last_event_at     = sub.last_event_at
FROM (
    SELECT DISTINCT ON (apd.access_point_id)
        apd.access_point_id,
        d.device_id,
        d.status,
        d.state,
        d.mode,
        d.anti_passback,
        d.unlock_duration_ms,
        d.last_event_at
    FROM dm3_access.access_point_doors apd
    JOIN dm3_access.doors d ON d.id = apd.door_id
    ORDER BY apd.access_point_id, apd.created_at ASC
) sub
WHERE ap.id = sub.access_point_id;

-- 3. Drop triggers on doors before dropping the table
DROP TRIGGER IF EXISTS trg_doors_updated_at ON dm3_access.doors;

-- 4. Drop the junction table (references both access_points and doors)
DROP TABLE IF EXISTS dm3_access.access_point_doors;

-- 5. Drop the doors table (data migrated to access_points)
DROP TABLE IF EXISTS dm3_access.doors;
