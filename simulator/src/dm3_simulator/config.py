"""Configuration loading from YAML files and environment variables."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import yaml

from dm3_simulator.models import SimulationConfig


def load_config(
    config_path: str | None = None,
    overrides: dict[str, Any] | None = None,
) -> SimulationConfig:
    """Load configuration from YAML file, env vars, and CLI overrides.

    Priority: CLI overrides > env vars > YAML file > defaults.
    """
    data: dict[str, Any] = {}

    # Load from YAML
    if config_path and Path(config_path).exists():
        with open(config_path) as f:
            raw = yaml.safe_load(f) or {}
        # Flatten nested YAML structure
        if "simulation" in raw:
            data.update(raw["simulation"])
        if "mqtt" in raw:
            data["broker"] = raw["mqtt"].get("broker", data.get("broker"))
            data["broker_username"] = raw["mqtt"].get("username")
            data["broker_password"] = raw["mqtt"].get("password")
        if "tenant" in raw:
            data["tenant_id"] = raw["tenant"].get("tenant_id", data.get("tenant_id"))
            data["site_id"] = raw["tenant"].get("site_id", data.get("site_id"))
        if "events" in raw:
            data["event_rate"] = raw["events"].get("rate_per_device", data.get("event_rate"))
            data["event_mix"] = raw["events"].get("mix", data.get("event_mix"))
            data["heartbeat_interval"] = raw["events"].get(
                "heartbeat_interval_s", data.get("heartbeat_interval")
            )
        if "persons" in raw:
            data["persons"] = raw["persons"].get("count", data.get("persons"))
        if "database" in raw:
            data["db_mode"] = raw["database"].get("mode", data.get("db_mode"))
        if "api" in raw:
            data["api_port"] = raw["api"].get("port", data.get("api_port"))
            data["metrics_port"] = raw["api"].get("metrics_port", data.get("metrics_port"))
        if "logging" in raw:
            data["log_level"] = raw["logging"].get("level", data.get("log_level"))

    # Env var overrides
    env_map = {
        "DM3_DEVICES": ("devices", int),
        "DM3_TENANT_ID": ("tenant_id", str),
        "DM3_SITE_ID": ("site_id", str),
        "DM3_BROKER": ("broker", str),
        "DM3_BROKER_USERNAME": ("broker_username", str),
        "DM3_BROKER_PASSWORD": ("broker_password", str),
        "DM3_MODE": ("mode", str),
        "DM3_EVENT_RATE": ("event_rate", float),
        "DM3_LOG_LEVEL": ("log_level", str),
        "DM3_API_PORT": ("api_port", int),
        "DM3_GATEWAY_URL": ("gateway_url", str),
    }
    for env_key, (field, cast) in env_map.items():
        val = os.environ.get(env_key)
        if val is not None:
            data[field] = cast(val)

    # CLI overrides
    if overrides:
        data.update({k: v for k, v in overrides.items() if v is not None})

    return SimulationConfig(**data)
