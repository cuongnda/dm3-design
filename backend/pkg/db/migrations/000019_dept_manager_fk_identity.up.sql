-- 000019: Drop department_manager_id FK so it can store dm3_identity.users IDs

DO $$
DECLARE
    v_constraint_name TEXT;
BEGIN
    SELECT tc.constraint_name INTO v_constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_schema = 'dm3_identity'
      AND tc.table_name = 'departments'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND kcu.column_name = 'department_manager_id'
    LIMIT 1;

    IF v_constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE dm3_identity.departments DROP CONSTRAINT %I', v_constraint_name);
    END IF;
END $$;
