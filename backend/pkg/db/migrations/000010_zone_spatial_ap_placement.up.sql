-- 000010: Add spatial fields to zones and map placement to access points
-- Zone becomes a spatial container with location, timezone, and optional indoor map.
-- Access Points can store normalized placement coordinates on their zone's map.

-- ─── Zones: spatial / location fields ────────────────────────────────────────

ALTER TABLE dm3_access.zones
    ADD COLUMN IF NOT EXISTS timezone      VARCHAR(50),
    ADD COLUMN IF NOT EXISTS latitude       DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS longitude      DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS address        TEXT,
    ADD COLUMN IF NOT EXISTS floor          VARCHAR(50),
    ADD COLUMN IF NOT EXISTS building       VARCHAR(100),
    ADD COLUMN IF NOT EXISTS map_image_url  VARCHAR(500),
    ADD COLUMN IF NOT EXISTS map_width      INT,
    ADD COLUMN IF NOT EXISTS map_height     INT;

COMMENT ON COLUMN dm3_access.zones.timezone      IS 'IANA timezone (e.g. Asia/Ho_Chi_Minh). NULL = inherit from parent or site default';
COMMENT ON COLUMN dm3_access.zones.latitude       IS 'GPS latitude of zone centroid';
COMMENT ON COLUMN dm3_access.zones.longitude      IS 'GPS longitude of zone centroid';
COMMENT ON COLUMN dm3_access.zones.address        IS 'Human-readable address';
COMMENT ON COLUMN dm3_access.zones.floor          IS 'Floor/level identifier (e.g. 1F, B1)';
COMMENT ON COLUMN dm3_access.zones.building       IS 'Building name';
COMMENT ON COLUMN dm3_access.zones.map_image_url  IS 'Path/URL to indoor map or floor plan image (MinIO)';
COMMENT ON COLUMN dm3_access.zones.map_width      IS 'Map image natural width in px (for coordinate normalization)';
COMMENT ON COLUMN dm3_access.zones.map_height     IS 'Map image natural height in px (for coordinate normalization)';

-- ─── Access Points: map placement on zone floor plan ─────────────────────────

ALTER TABLE dm3_access.access_points
    ADD COLUMN IF NOT EXISTS map_x          DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS map_y          DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS map_rotation   DOUBLE PRECISION DEFAULT 0;

COMMENT ON COLUMN dm3_access.access_points.map_x        IS 'X position on zone map (0.0–1.0 normalized)';
COMMENT ON COLUMN dm3_access.access_points.map_y        IS 'Y position on zone map (0.0–1.0 normalized)';
COMMENT ON COLUMN dm3_access.access_points.map_rotation IS 'Rotation angle in degrees (0–360) for map icon';
