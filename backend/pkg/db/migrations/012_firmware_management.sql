-- 012: Firmware Management
-- Firmware binary management for DUALi device types

BEGIN;

CREATE TABLE IF NOT EXISTS dm3_devices.firmwares (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version         VARCHAR(50)  NOT NULL,
    device_type     VARCHAR(50)  NOT NULL,
    description     TEXT,
    file_path       VARCHAR(500) NOT NULL,
    file_size       BIGINT       NOT NULL,
    checksum        VARCHAR(64),          -- SHA-256
    is_active       BOOLEAN      DEFAULT true,
    uploaded_by     UUID,
    created_at      TIMESTAMPTZ  DEFAULT now(),
    updated_at      TIMESTAMPTZ  DEFAULT now(),
    UNIQUE (version, device_type)
);

-- Allowed device types (check constraint)
ALTER TABLE dm3_devices.firmwares
    ADD CONSTRAINT chk_firmware_device_type
    CHECK (device_type IN (
        'icu300n', 'itouch_pop', 'desktop_app', 'itouch_pop_x',
        'dq_mini_plus', 'it100', 'nexpa_lpr', 'xstation2',
        'fv6000', 'pm85', 'itouch_30a', 'dp636x', 'df970',
        'biostation2', 'icu300nx', 'biostation3', 'ebkn_reader',
        'ba8300', 'icu400', 'ra08', 'dq8500', 'dq200',
        'camera_dc', 'tb_vision', 'icu970'
    ));

CREATE INDEX idx_firmwares_device_type ON dm3_devices.firmwares (device_type);
CREATE INDEX idx_firmwares_is_active   ON dm3_devices.firmwares (is_active);
CREATE INDEX idx_firmwares_created_at  ON dm3_devices.firmwares (created_at DESC);

COMMIT;
