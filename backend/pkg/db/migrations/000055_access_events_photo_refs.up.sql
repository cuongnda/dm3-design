-- Multi-photo support on access_events.
-- Devices (terminals, cameras) may capture snapshots from several cameras per
-- event. The legacy `photo_ref` column holds only one. Add `photo_refs text[]`
-- for the full list; keep `photo_ref` populated as photo_refs[1] for backward
-- compatibility with older readers. See mqtt-protocol.md §4.1.
ALTER TABLE dm3_access.access_events
    ADD COLUMN IF NOT EXISTS photo_refs TEXT[];
