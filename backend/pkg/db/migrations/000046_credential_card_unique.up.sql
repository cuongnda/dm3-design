-- Credential values must be unique per tenant, regardless of type: a raw
-- value like "ABC123" must resolve to exactly one user whether it's stored
-- as a card, PIN, QR, fingerprint template, etc. Before this index the
-- admin UI happily attached the same value to two users, and the
-- device-side lookup path silently picked the first row — the wrong user
-- was granted access at the door.
--
-- Note this is stricter than (tenant_id, type, value): two users cannot
-- share a value across different types either. H_<personID> and M_<user_code>
-- values are naturally collision-free by convention, so this doesn't break
-- the face-enrolment flow.
--
-- If an admin genuinely wants to reassign a value (retire a badge and hand
-- it to a new employee, etc.), they must delete the existing row first.
-- No status filter — a deactivated row still owns the value, which matches
-- how operators reason about physical credentials.

CREATE UNIQUE INDEX IF NOT EXISTS idx_credentials_tenant_value_unique
    ON dm3_identity.credentials (tenant_id, value);
