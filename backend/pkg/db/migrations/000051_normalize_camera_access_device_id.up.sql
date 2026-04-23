-- ================================================================
-- 000051 — Normalize camera bindings to use devices.id directly.
--
-- Historical data had two conventions in access_point_devices.access_device_id
-- (TEXT column, no FK):
--   * door controllers / readers: stored dm3_devices.devices.id
--   * cameras: stored dm3_access.access_devices.id (the wrapper row)
--
-- All current cctv-svc code (camera_handlers, access_event_consumer,
-- tungson_sync, hanet_webhook) joins via d.id::text = apd.access_device_id
-- with d.type='camera' — so the camera-side wrapper convention silently
-- breaks clip/snapshot capture and camera listings.
--
-- This migration:
--   1. Rewrites camera junction rows to point at the underlying devices.id.
--   2. Removes the orphan access_devices rows of type='camera' that nothing
--      references anymore.
-- ================================================================

BEGIN;

-- Step 1: rewrite camera-role junction rows whose access_device_id still
-- resolves to an access_devices.id row with a known underlying device.
UPDATE dm3_access.access_point_devices apd
   SET access_device_id = ad.device_id::text
  FROM dm3_access.access_devices ad
 WHERE apd.role = 'camera'
   AND apd.access_device_id = ad.id::text
   AND ad.device_id IS NOT NULL;

-- Step 2: delete camera wrapper rows that no junction row references.
-- After Step 1 these are unreferenced; cctv-svc never creates or reads them.
-- Rows with device_id IS NULL (unresolvable) remain if still referenced;
-- those were already broken before this migration, so no regression.
DELETE FROM dm3_access.access_devices ad
 WHERE ad.type = 'camera'
   AND NOT EXISTS (
       SELECT 1 FROM dm3_access.access_point_devices apd
        WHERE apd.access_device_id = ad.id::text
   );

COMMIT;
