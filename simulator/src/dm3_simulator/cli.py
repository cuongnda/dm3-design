"""CLI commands for the DM3 device simulator."""

from __future__ import annotations

import asyncio
import os
import time

import click
import structlog

from dm3_simulator.config import load_config
from dm3_simulator.models import SimulationConfig


def setup_logging(level: str) -> None:
    """Configure structured logging."""
    structlog.configure(
        processors=[
            structlog.stdlib.add_log_level,
            structlog.dev.ConsoleRenderer(),
        ],
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
    )


@click.group()
def cli() -> None:
    """DM3 Device Simulator — simulate access control devices for testing."""
    pass


@cli.command()
@click.option("--devices", default=10, help="Number of virtual devices")
@click.option("--broker", default="mqtt://localhost:1883", help="MQTT broker URL")
@click.option("--tenant-id", default="tenant-001", help="Tenant ID")
@click.option("--site-id", default="site-001", help="Site ID")
@click.option("--device-prefix", default="sim", help="Device ID prefix")
@click.option("--mode", default="normal", type=click.Choice(["normal", "stress", "chaos"]))
@click.option("--event-rate", default=1.0, type=float, help="Events per second per device")
@click.option("--persons", default=50, type=int, help="Mock persons per device")
@click.option("--db-mode", default="memory", type=click.Choice(["memory", "file"]))
@click.option("--api-port", default=9090, type=int, help="REST API port")
@click.option("--log-level", default="info", type=click.Choice(["debug", "info", "warning", "error"]))
@click.option("--heartbeat-interval", default=30, type=int, help="Heartbeat interval in seconds")
@click.option("--connect-delay", default=0.1, type=float, help="Delay between device connections")
@click.option("--config", "config_path", default=None, help="YAML config file path")
@click.option("--broker-username", default=None, help="MQTT username")
@click.option("--broker-password", default=None, help="MQTT password")
def run(
    devices: int, broker: str, tenant_id: str, site_id: str,
    device_prefix: str, mode: str, event_rate: float, persons: int,
    db_mode: str, api_port: int, log_level: str, heartbeat_interval: int,
    connect_delay: float, config_path: str | None,
    broker_username: str | None, broker_password: str | None,
) -> None:
    """Run the device simulator."""
    setup_logging(log_level)
    logger = structlog.get_logger()

    config = load_config(config_path, {
        "devices": devices, "broker": broker, "tenant_id": tenant_id,
        "site_id": site_id, "device_prefix": device_prefix, "mode": mode,
        "event_rate": event_rate, "persons": persons, "db_mode": db_mode,
        "api_port": api_port, "log_level": log_level,
        "heartbeat_interval": heartbeat_interval, "connect_delay": connect_delay,
        "broker_username": broker_username, "broker_password": broker_password,
    })

    logger.info(
        "starting_simulator",
        devices=config.devices, broker=config.broker,
        mode=config.mode, tenant_id=config.tenant_id,
    )

    asyncio.run(_run_simulation(config))


async def _run_simulation(config: SimulationConfig) -> None:
    """Main simulation loop."""
    from aiohttp import web

    from dm3_simulator.api import SimulatorAPI
    from dm3_simulator.device import VirtualDevice
    from dm3_simulator.event_generator import generate_mock_persons, generate_mock_rules

    logger = structlog.get_logger()
    start_time = time.time()
    devices: dict[str, VirtualDevice] = {}

    # Create virtual devices
    for i in range(config.devices):
        device_id = f"{i + 1:06d}"
        door_ids = [f"{device_id}-door-{j + 1:03d}" for j in range(config.doors_per_device)]
        device = VirtualDevice(device_id, config, door_ids)
        devices[device_id] = device

    # Start REST API
    api = SimulatorAPI(devices, start_time)
    runner = web.AppRunner(api.app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", config.api_port)
    await site.start()
    logger.info("api_started", port=config.api_port)

    # Start devices with staggered connections
    for device_id, device in devices.items():
        try:
            await device.start()
            # Seed with mock data
            persons = generate_mock_persons(config.persons)
            await device.db.bulk_upsert_persons(persons)
            person_ids = [p["person_id"] for p in persons]
            rules, groups = generate_mock_rules(device.door_ids, person_ids)
            for rule in rules:
                await device.db.upsert_access_rule(rule)
            for group in groups:
                await device.db.upsert_person_group(group["group_id"], group["person_ids"])
            logger.info("device_seeded", device_id=device_id, persons=len(persons), rules=len(rules))
        except Exception as e:
            logger.error("device_start_error", device_id=device_id, error=str(e))

        await asyncio.sleep(config.connect_delay)

    logger.info("all_devices_started", count=len(devices))

    # Run until interrupted
    try:
        while True:
            await asyncio.sleep(60)
    except (KeyboardInterrupt, asyncio.CancelledError):
        logger.info("shutting_down")

    # Stop all devices
    for device in devices.values():
        await device.stop()
    await runner.cleanup()
    logger.info("simulator_stopped")


@cli.command()
@click.option("--devices", default=10, help="Number of device databases to seed")
@click.option("--persons", default=50, type=int, help="Persons per device")
@click.option("--output-dir", default="/tmp/dm3-sim", help="Output directory for SQLite files")
def seed(devices: int, persons: int, output_dir: str) -> None:
    """Pre-populate device databases with mock data for standalone testing."""
    setup_logging("info")
    asyncio.run(_seed_databases(devices, persons, output_dir))


async def _seed_databases(devices: int, persons: int, output_dir: str) -> None:
    """Create and seed device databases."""
    from dm3_simulator.database import DeviceDatabase
    from dm3_simulator.event_generator import generate_mock_persons, generate_mock_rules

    logger = structlog.get_logger()
    os.makedirs(output_dir, exist_ok=True)

    for i in range(devices):
        device_id = f"{i + 1:06d}"
        db_path = os.path.join(output_dir, f"{device_id}.db")
        door_ids = [f"{device_id}-door-001"]

        db = DeviceDatabase(db_path)
        await db.connect()

        mock_persons = generate_mock_persons(persons)
        count = await db.bulk_upsert_persons(mock_persons)
        person_ids = [p["person_id"] for p in mock_persons]

        rules, groups = generate_mock_rules(door_ids, person_ids)
        for rule in rules:
            await db.upsert_access_rule(rule)
        for group in groups:
            await db.upsert_person_group(group["group_id"], group["person_ids"])

        await db.close()
        logger.info("seeded_device", device_id=device_id, persons=count, rules=len(rules), path=db_path)

    logger.info("seeding_complete", devices=devices)
