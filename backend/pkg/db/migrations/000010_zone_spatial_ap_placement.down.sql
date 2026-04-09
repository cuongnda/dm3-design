-- Revert 000010: remove spatial fields from zones and map placement from access points

ALTER TABLE dm3_access.access_points
    DROP COLUMN IF EXISTS map_x,
    DROP COLUMN IF EXISTS map_y,
    DROP COLUMN IF EXISTS map_rotation;

ALTER TABLE dm3_access.zones
    DROP COLUMN IF EXISTS timezone,
    DROP COLUMN IF EXISTS latitude,
    DROP COLUMN IF EXISTS longitude,
    DROP COLUMN IF EXISTS address,
    DROP COLUMN IF EXISTS floor,
    DROP COLUMN IF EXISTS building,
    DROP COLUMN IF EXISTS map_image_url,
    DROP COLUMN IF EXISTS map_width,
    DROP COLUMN IF EXISTS map_height;
