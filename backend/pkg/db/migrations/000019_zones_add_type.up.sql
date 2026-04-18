-- Add `type` column to zones so a single recursive tree can represent
-- Site / Building / Floor / Room / generic Zone without introducing a new table.
ALTER TABLE dm3_access.zones
    ADD COLUMN type VARCHAR(20) NOT NULL DEFAULT 'zone'
    CHECK (type IN ('site', 'building', 'floor', 'room', 'zone'));
