-- Revert: restore tenant_id NOT NULL and composite PK
ALTER TABLE dm3_devices.used_nonces DROP CONSTRAINT used_nonces_pkey;
DELETE FROM dm3_devices.used_nonces WHERE tenant_id IS NULL;
ALTER TABLE dm3_devices.used_nonces ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE dm3_devices.used_nonces ADD PRIMARY KEY (tenant_id, nonce);
ALTER TABLE dm3_devices.used_nonces ADD CONSTRAINT used_nonces_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES dm3_auth.tenants(id) ON DELETE CASCADE;
