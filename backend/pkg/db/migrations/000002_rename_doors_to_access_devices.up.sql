-- ============================================================
-- Migration: rename doors -> access_devices
-- ============================================================

-- 1. Rename main table
ALTER TABLE dm3_access.doors RENAME TO access_devices;

-- 2. Rename indexes on access_devices
ALTER INDEX IF EXISTS idx_doors_tenant RENAME TO idx_access_devices_tenant;
ALTER INDEX IF EXISTS idx_doors_device RENAME TO idx_access_devices_device;
ALTER INDEX IF EXISTS idx_doors_status RENAME TO idx_access_devices_status;
ALTER INDEX IF EXISTS idx_doors_state  RENAME TO idx_access_devices_state;

-- 3. Rename trigger
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_doors_updated_at') THEN
    ALTER TRIGGER trg_doors_updated_at ON dm3_access.access_devices RENAME TO trg_access_devices_updated_at;
  END IF;
END$$;

-- 4. Rename junction table and its column
ALTER TABLE dm3_access.access_point_doors RENAME TO access_point_devices;
ALTER TABLE dm3_access.access_point_devices RENAME COLUMN door_id TO access_device_id;

-- 5. Rename unique constraint on junction table
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_ap_door') THEN
    ALTER TABLE dm3_access.access_point_devices
      RENAME CONSTRAINT uq_ap_door TO uq_ap_access_device;
  END IF;
END$$;
