-- Identity Enhanced: person_groups, group membership, additional indexes

CREATE TABLE IF NOT EXISTS dm3_identity.person_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dm3_identity.person_group_members (
    group_id UUID NOT NULL REFERENCES dm3_identity.person_groups(id) ON DELETE CASCADE,
    person_id UUID NOT NULL REFERENCES dm3_identity.persons(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (group_id, person_id)
);

-- Additional indexes for search/sync
CREATE INDEX IF NOT EXISTS idx_persons_name ON dm3_identity.persons(first_name, last_name);
CREATE INDEX IF NOT EXISTS idx_persons_email ON dm3_identity.persons(email);
CREATE INDEX IF NOT EXISTS idx_persons_department ON dm3_identity.persons(department);
CREATE INDEX IF NOT EXISTS idx_persons_status ON dm3_identity.persons(status);
CREATE INDEX IF NOT EXISTS idx_persons_updated ON dm3_identity.persons(updated_at);
CREATE INDEX IF NOT EXISTS idx_credentials_type ON dm3_identity.credentials(type);
CREATE INDEX IF NOT EXISTS idx_credentials_status ON dm3_identity.credentials(status);
CREATE INDEX IF NOT EXISTS idx_person_groups_name ON dm3_identity.person_groups(name);

-- Add updated_at to credentials for sync
ALTER TABLE dm3_identity.credentials ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
