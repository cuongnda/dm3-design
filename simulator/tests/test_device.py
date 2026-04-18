"""Tests for VirtualDevice (unit tests, no MQTT connection)."""

from __future__ import annotations

import pytest

from dm3_simulator.models import DeviceState, SimulationConfig


def test_device_state_enum():
    assert DeviceState.INIT.value == "init"
    assert DeviceState.READY.value == "ready"


def test_simulation_config_defaults():
    config = SimulationConfig()
    assert config.devices == 10
    assert config.broker == "mqtt://localhost:1883"
    assert config.event_mix["grant"] == 70


def test_simulation_config_custom():
    config = SimulationConfig(devices=100, mode="stress", tenant_id="t-001")
    assert config.devices == 100
    assert config.mode == "stress"
    assert config.tenant_id == "t-001"
