-- Restore NOT NULL on host_user_id for both tables. Will fail if any
-- rows have NULL — backfill or delete those rows before downgrading.
ALTER TABLE dm3_visitor.visit_groups
    ALTER COLUMN host_user_id SET NOT NULL;

ALTER TABLE dm3_visitor.recurring_visit_templates
    ALTER COLUMN host_user_id SET NOT NULL;
