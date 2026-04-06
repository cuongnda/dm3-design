-- Rollback: restore persons table, old auth.users, original FK
DROP TRIGGER IF EXISTS trg_account_deleted ON dm3_auth.accounts;
DROP FUNCTION IF EXISTS dm3_identity.on_account_deleted();

ALTER TABLE dm3_identity.credentials
    DROP CONSTRAINT IF EXISTS credentials_person_id_fkey;
