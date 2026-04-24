"""Pydantic models for DM3 simulator data structures."""

from __future__ import annotations

import enum
import uuid
import time
from typing import Any

from pydantic import BaseModel, Field


def generate_uuidv7() -> str:
    """Generate a UUIDv7-like string (time-ordered UUID)."""
    ts_ms = int(time.time() * 1000)
    rand = uuid.uuid4().hex[12:]
    hex_ts = f"{ts_ms:012x}"
    return f"{hex_ts[:8]}-{hex_ts[8:12]}-7{rand[:3]}-{'8' + rand[3:6]}-{rand[6:18]}"


class DeviceState(str, enum.Enum):
    """Device lifecycle states."""
    INIT = "init"
    CONNECTING = "connecting"
    SYNCING = "syncing"
    READY = "ready"
    OFFLINE = "offline"
    ERROR = "error"


class ProvisioningStatus(str, enum.Enum):
    """Device provisioning states."""
    UNPROVISIONED = "unprovisioned"
    REGISTERING = "registering"
    PENDING_APPROVAL = "pending_approval"
    APPROVED = "approved"
    REJECTED = "rejected"
    PROVISIONED = "provisioned"


class DoorState(str, enum.Enum):
    """Door physical states."""
    LOCKED = "locked"
    UNLOCKED = "unlocked"
    OPEN = "open"
    CLOSED = "closed"
    HELD_OPEN = "held_open"
    HELD_CLOSE = "held_close"
    FORCED = "forced"
    TAMPERED = "tampered"
    ALARM = "alarm"


class LockdownLevel(str, enum.Enum):
    """Lockdown severity levels."""
    FULL = "full"
    ZONE = "zone"


class FirmwareStatus(str, enum.Enum):
    """Firmware OTA update status."""
    IDLE = "idle"
    DOWNLOADING = "downloading"
    INSTALLING = "installing"
    SUCCESS = "success"
    FAILED = "failed"
    ROLLED_BACK = "rolled_back"


class CredentialType(str, enum.Enum):
    """Credential types."""
    FACE = "face"
    CARD = "card"
    PIN = "pin"
    QR = "qr"
    FINGERPRINT = "fingerprint"
    UHF = "uhf"


class AccessDecision(BaseModel):
    """Result of an access decision evaluation."""
    granted: bool = False
    reason: str = "denied_unknown"
    person_id: str | None = None
    person_name: str | None = None
    rule_id: str | None = None
    decision_time_ms: float = 0.0
    confidence: float | None = None
    pending_multi_factor: bool = False


class PersonRecord(BaseModel):
    """A person record from the local database."""
    person_id: str
    name: str
    status: str = "active"
    valid_from: int | None = None
    valid_until: int | None = None


class CredentialRecord(BaseModel):
    """A credential record from the local database."""
    id: str
    person_id: str
    type: str
    value: str
    status: str = "active"
    valid_from: int | None = None
    valid_until: int | None = None


class AccessRule(BaseModel):
    """An access rule from the local database."""
    rule_id: str
    name: str
    door_ids: list[str] = Field(default_factory=list)
    person_group_ids: list[str] = Field(default_factory=list)
    schedule_json: dict[str, Any] | None = None
    anti_passback: bool = False
    multi_factor: bool = False
    priority: int = 0
    enabled: bool = True
    valid_from: int | None = None
    valid_until: int | None = None


class MqttMessage(BaseModel):
    """Standard MQTT message envelope."""
    v: int = 1
    id: str = Field(default_factory=generate_uuidv7)
    ts: int = Field(default_factory=lambda: int(time.time() * 1000))
    src: str = ""
    type: str = ""
    data: dict[str, Any] = Field(default_factory=dict)
    ref: str | None = None
    status: str | None = None
    error: str | None = None


class DeviceConfig(BaseModel):
    """Runtime device configuration received via cfg.device_update."""
    device_id: str = ""
    name: str = ""
    location: str = ""
    model: str = ""
    open_relay_ms: int = 3000
    timezone: str = "Asia/Ho_Chi_Minh"
    verify_methods: list[str] = Field(default_factory=lambda: ["face", "nfc", "pin"])
    verify_logic: str = "or"


class FirmwareInfo(BaseModel):
    """Firmware OTA deployment info."""
    deployment_id: str = ""
    version: str = ""
    url: str = ""
    checksum: str = ""
    size_bytes: int = 0
    force: bool = False
    status: FirmwareStatus = FirmwareStatus.IDLE
    progress_pct: int = 0
    previous_version: str = "sim-0.1.0"
    error: str | None = None


class SimulationConfig(BaseModel):
    """Top-level simulation configuration."""
    devices: int = 10
    tenant_id: str = "tenant-001"
    site_id: str = "site-001"
    broker: str = "mqtt://localhost:1883"
    broker_username: str | None = None
    broker_password: str | None = None
    device_prefix: str = "sim"
    device_type: str = "terminal"
    doors_per_device: int = 1
    mode: str = "normal"
    event_rate: float = 1.0
    event_mix: dict[str, int] = Field(default_factory=lambda: {
        "grant": 70, "deny": 20, "alarm": 5, "tamper": 3, "door_held": 2
    })
    persons: int = 50
    db_mode: str = "memory"
    api_port: int = 9090
    metrics_port: int = 9091
    heartbeat_interval: int = 30
    connect_delay: float = 0.1
    log_level: str = "info"
    # Base URL for the device-gateway HTTP API (used by the media upload flow,
    # mqtt-protocol.md §15). The simulator POSTs /devices/{id}/media-url here,
    # then PUTs the placeholder JPEG directly to the returned MinIO URL.
    gateway_url: str = "http://localhost:8002"
