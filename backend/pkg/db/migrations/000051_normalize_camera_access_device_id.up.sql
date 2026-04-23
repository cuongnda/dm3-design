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
--   0. Drops wrapper-based junction rows that would collide with an
--      existing devices.id-based row for the same (access_point, camera)
--      pair. Prod has both conventions coexisting on some cameras, so
--      rewriting the wrapper row would violate uq_ap_access_device.
--   1. Rewrites remaining camera junction rows to point at devices.id.
--   2. Removes the orphan access_devices rows of type='camera' that
--      nothing references anymore.
-- ================================================================

BEGIN;

-- Step 0: eliminate the duplicate before the rewrite. When a camera
-- already has a devices.id-based junction row, the wrapper-based
-- junction row is redundant — keep the canonical one.
DELETE FROM dm3_access.access_point_devices apd
 USING dm3_access.access_devices ad
 WHERE apd.role = 'camera'
   AND apd.access_device_id = ad.id::text
   AND ad.device_id IS NOT NULL
   AND EXISTS (
       SELECT 1 FROM dm3_access.access_point_devices apd2
        WHERE apd2.access_point_id = apd.access_point_id
          AND apd2.access_device_id = ad.device_id::text
   );

-- Step 1: rewrite surviving wrapper-based rows to point at devices.id.
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
