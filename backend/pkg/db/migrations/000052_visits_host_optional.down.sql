-- Restore NOT NULL on host_user_id. Will fail if any rows have NULL —
-- callers must backfill or delete those rows before downgrading.
ALTER TABLE dm3_visitor.visits
    ALTER COLUMN host_user_id SET NOT NULL;
