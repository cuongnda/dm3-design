-- Add missing foreign key from firmware_deployments.tenant_id to dm3_auth.tenants.
ALTER TABLE dm3_devices.firmware_deployments
    ADD CONSTRAINT fk_firmware_deployments_tenant
    FOREIGN KEY (tenant_id) REFERENCES dm3_auth.tenants(id);
