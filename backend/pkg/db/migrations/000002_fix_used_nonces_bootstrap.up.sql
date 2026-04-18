-- Fix used_nonces for bootstrap flow: device has no tenant_id yet during registration.
-- Change PK from (tenant_id, nonce) to just (nonce) and make tenant_id nullable.

ALTER TABLE dm3_devices.used_nonces DROP CONSTRAINT used_nonces_pkey;
ALTER TABLE dm3_devices.used_nonces ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE dm3_devices.used_nonces DROP CONSTRAINT IF EXISTS used_nonces_tenant_id_fkey;
ALTER TABLE dm3_devices.used_nonces ADD PRIMARY KEY (nonce);
