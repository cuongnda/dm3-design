"""REST API for controlling the simulation."""

from __future__ import annotations

import collections
import pathlib
import time
from typing import Any

from aiohttp import web
from prometheus_client import generate_latest

import structlog

logger = structlog.get_logger()

STATIC_DIR = pathlib.Path(__file__).parent / "static"


class SimulatorAPI:
    """aiohttp REST API for the DM3 simulator control plane."""

    def __init__(self, devices: dict[str, Any], start_time: float) -> None:
        self.devices = devices  # device_id -> VirtualDevice
        self.start_time = start_time
        self.recent_events: collections.deque[dict[str, Any]] = collections.deque(maxlen=200)
        self.simulation_running = bool(devices)
        self.simulation_config: dict[str, Any] = {}
        self.app = web.Application()
        self._setup_routes()

    def _setup_routes(self) -> None:
        self.app.router.add_get("/status", self.get_status)
        self.app.router.add_get("/stats", self.get_stats)
        self.app.router.add_get("/api/status", self.get_status)
        self.app.router.add_get("/api/devices", self.get_devices)
        self.app.router.add_get("/api/devices/{device_id}", self.get_device)
        self.app.router.add_post("/api/devices/{device_id}/trigger", self.trigger_event)
        self.app.router.add_post("/trigger/event", self.trigger_event_body)
        self.app.router.add_get("/api/metrics", self.get_metrics)
        self.app.router.add_get("/metrics", self.get_metrics)
        self.app.router.add_get("/api/events/recent", self.get_recent_events)
        self.app.router.add_get("/api/devices/{device_id}/persons", self.get_device_persons)
        self.app.router.add_get("/api/devices/{device_id}/credentials", self.get_device_credentials)
        self.app.router.add_get("/api/devices/{device_id}/rules", self.get_device_rules)
        self.app.router.add_get("/api/devices/{device_id}/events-queue", self.get_device_events_queue)
        self.app.router.add_get("/api/devices/{device_id}/config", self.get_device_config)
        self.app.router.add_get("/api/simulation/status", self.get_simulation_status)
        self.app.router.add_post("/api/simulation/start", self.start_simulation)
        self.app.router.add_post("/api/simulation/stop", self.stop_simulation)
        # Serve index.html at root
        self.app.router.add_get("/", self.serve_index)
        # Serve static files
        if STATIC_DIR.exists():
            self.app.router.add_static("/static", STATIC_DIR)

    async def get_status(self, request: web.Request) -> web.Response:
        """Overall simulation status."""
        connected = sum(1 for d in self.devices.values() if d.mqtt.connected)
        total = len(self.devices)
        return web.json_response({
            "status": "running",
            "uptime_s": int(time.time() - self.start_time),
            "devices": {
                "total": total,
                "connected": connected,
                "disconnected": total - connected,
            },
        })

    async def get_stats(self, request: web.Request) -> web.Response:
        """Detailed statistics."""
        connected = sum(1 for d in self.devices.values() if d.mqtt.connected)
        total_events = sum(d.events_published for d in self.devices.values())
        uptime = time.time() - self.start_time
        return web.json_response({
            "uptime_s": int(uptime),
            "devices": {
                "total": len(self.devices),
                "connected": connected,
                "disconnected": len(self.devices) - connected,
                "error": sum(1 for d in self.devices.values() if d.state.value == "error"),
            },
            "events": {
                "total_published": total_events,
                "events_per_second": round(total_events / max(uptime, 1), 1),
            },
        })

    async def get_devices(self, request: web.Request) -> web.Response:
        """List all virtual devices."""
        devices = [d.to_dict() for d in self.devices.values()]
        return web.json_response({"devices": devices, "count": len(devices)})

    async def get_device(self, request: web.Request) -> web.Response:
        """Get a single device's status."""
        device_id = request.match_info["device_id"]
        device = self.devices.get(device_id)
        if not device:
            return web.json_response({"error": "Device not found"}, status=404)
        return web.json_response(device.to_dict())

    async def trigger_event(self, request: web.Request) -> web.Response:
        """Trigger a simulated access event on a device."""
        device_id = request.match_info["device_id"]
        device = self.devices.get(device_id)
        if not device:
            return web.json_response({"error": "Device not found"}, status=404)

        body = {}
        if request.body_exists:
            body = await request.json()

        decision = await device.trigger_access(
            credential_type=body.get("credential_type", "card"),
            credential_value=body.get("credential_value"),
            door_id=body.get("door_id"),
        )
        result = decision.model_dump()
        self.record_event({
            "device_id": device_id, "timestamp": time.time(),
            "decision": "GRANTED" if result["granted"] else "DENIED",
            "person_name": result.get("person_name"), "reason": result.get("reason"),
            "credential_type": body.get("credential_type", "card"),
            "decision_time_ms": result.get("decision_time_ms", 0),
        })
        return web.json_response(result)

    async def trigger_event_body(self, request: web.Request) -> web.Response:
        """Trigger event via POST body with device_id."""
        body = await request.json()
        device_id = body.get("device_id")
        device = self.devices.get(device_id)
        if not device:
            return web.json_response({"error": "Device not found"}, status=404)

        decision = await device.trigger_access(
            credential_type=body.get("credential_type", "card"),
            credential_value=body.get("credential_value"),
            door_id=body.get("door_id"),
        )
        result = decision.model_dump()
        self.record_event({
            "device_id": device_id, "timestamp": time.time(),
            "decision": "GRANTED" if result["granted"] else "DENIED",
            "person_name": result.get("person_name"), "reason": result.get("reason"),
            "credential_type": body.get("credential_type", "card"),
            "decision_time_ms": result.get("decision_time_ms", 0),
        })
        return web.json_response(result)

    async def get_metrics(self, request: web.Request) -> web.Response:
        """Prometheus metrics endpoint."""
        return web.Response(
            body=generate_latest(),
            content_type="text/plain; version=0.0.4; charset=utf-8",
        )

    async def get_recent_events(self, request: web.Request) -> web.Response:
        """Return last 100 events across all devices."""
        limit = int(request.query.get("limit", "100"))
        events = list(self.recent_events)[-limit:]
        return web.json_response({"events": events, "count": len(events)})

    async def get_simulation_status(self, request: web.Request) -> web.Response:
        """Return simulation running status."""
        connected = sum(1 for d in self.devices.values() if d.mqtt.connected)
        return web.json_response({
            "running": self.simulation_running,
            "config": self.simulation_config,
            "uptime_s": int(time.time() - self.start_time),
            "devices_total": len(self.devices),
            "devices_connected": connected,
        })

    async def start_simulation(self, request: web.Request) -> web.Response:
        """Start simulation with config from request body."""
        if self.simulation_running and self.devices:
            return web.json_response({"status": "already_running", "devices": len(self.devices)})

        body = await request.json() if request.body_exists else {}
        self.simulation_config = body

        # Import here to avoid circular imports
        import asyncio
        from dm3_simulator.device import VirtualDevice
        from dm3_simulator.event_generator import generate_mock_persons, generate_mock_rules
        from dm3_simulator.models import SimulationConfig

        config = SimulationConfig(
            broker=body.get("broker", "mqtt://localhost:1883"),
            site_id=body.get("site_id", "site-001"),
            tenant_id=body.get("tenant_id", "tenant-001"),
            devices=body.get("num_devices", 10),
            mode=body.get("mode", "normal"),
            event_rate=body.get("event_rate", 1.0),
        )

        self.start_time = time.time()

        for i in range(config.devices):
            device_id = f"{config.device_prefix}-{i + 1:04d}"
            door_ids = [f"{device_id}-door-{j + 1:03d}" for j in range(config.doors_per_device)]
            device = VirtualDevice(device_id, config, door_ids)
            self.devices[device_id] = device

        # Start devices in background
        async def _start_devices() -> None:
            for device_id, device in list(self.devices.items()):
                try:
                    await device.start()
                    persons = generate_mock_persons(config.persons)
                    await device.db.bulk_upsert_persons(persons)
                    person_ids = [p["person_id"] for p in persons]
                    rules, groups = generate_mock_rules(device.door_ids, person_ids)
                    for rule in rules:
                        await device.db.upsert_access_rule(rule)
                    for group in groups:
                        await device.db.upsert_person_group(group["group_id"], group["person_ids"])
                except Exception as e:
                    logger.error("device_start_error", device_id=device_id, error=str(e))
                await asyncio.sleep(config.connect_delay)

        asyncio.create_task(_start_devices())
        self.simulation_running = True

        return web.json_response({"status": "starting", "devices": config.devices})

    async def stop_simulation(self, request: web.Request) -> web.Response:
        """Stop all simulated devices."""
        if not self.simulation_running:
            return web.json_response({"status": "already_stopped"})

        for device in list(self.devices.values()):
            try:
                await device.stop()
            except Exception as e:
                logger.error("device_stop_error", device_id=device.device_id, error=str(e))

        self.devices.clear()
        self.simulation_running = False
        return web.json_response({"status": "stopped"})

    async def serve_index(self, request: web.Request) -> web.Response:
        """Serve the dashboard index.html."""
        index_path = STATIC_DIR / "index.html"
        if not index_path.exists():
            return web.Response(text="Dashboard not found", status=404)
        return web.FileResponse(index_path)

    async def get_device_persons(self, request: web.Request) -> web.Response:
        """Get persons stored in a device's local DB."""
        device_id = request.match_info["device_id"]
        device = self.devices.get(device_id)
        if not device:
            return web.json_response({"error": "Device not found"}, status=404)
        limit = int(request.query.get("limit", "50"))
        offset = int(request.query.get("offset", "0"))
        async with device.db.db.execute(
            "SELECT person_id, name, status, valid_from, valid_until FROM persons LIMIT ? OFFSET ?",
            (limit, offset),
        ) as cursor:
            rows = await cursor.fetchall()
        async with device.db.db.execute("SELECT COUNT(*) FROM persons") as cursor:
            total = (await cursor.fetchone())[0]
        persons = [
            {"person_id": r[0], "name": r[1], "status": r[2], "valid_from": r[3], "valid_until": r[4]}
            for r in rows
        ]
        return web.json_response({"persons": persons, "total": total})

    async def get_device_credentials(self, request: web.Request) -> web.Response:
        """Get credentials stored in a device's local DB."""
        device_id = request.match_info["device_id"]
        device = self.devices.get(device_id)
        if not device:
            return web.json_response({"error": "Device not found"}, status=404)
        async with device.db.db.execute(
            "SELECT person_id, type, value, status FROM credentials LIMIT 100"
        ) as cursor:
            rows = await cursor.fetchall()
        creds = [{"person_id": r[0], "type": r[1], "value": r[2][:20] + "..." if len(r[2]) > 20 else r[2], "status": r[3]} for r in rows]
        return web.json_response({"credentials": creds, "count": len(creds)})

    async def get_device_rules(self, request: web.Request) -> web.Response:
        """Get access rules stored in a device's local DB."""
        device_id = request.match_info["device_id"]
        device = self.devices.get(device_id)
        if not device:
            return web.json_response({"error": "Device not found"}, status=404)
        import json as _json
        async with device.db.db.execute(
            "SELECT rule_id, name, priority, enabled, door_ids, person_group_ids, schedule_json FROM access_rules"
        ) as cursor:
            rows = await cursor.fetchall()
        rules = []
        for r in rows:
            door_ids = _json.loads(r[4]) if r[4] else []
            group_ids = _json.loads(r[5]) if r[5] else []
            schedule = _json.loads(r[6]) if r[6] else []
            rules.append({
                "rule_id": r[0], "name": r[1], "priority": r[2], "enabled": bool(r[3]),
                "doors": door_ids, "groups": group_ids, "schedules": schedule,
            })
        return web.json_response({"rules": rules, "count": len(rules)})

    async def get_device_events_queue(self, request: web.Request) -> web.Response:
        """Get pending events in device's offline queue."""
        device_id = request.match_info["device_id"]
        device = self.devices.get(device_id)
        if not device:
            return web.json_response({"error": "Device not found"}, status=404)
        events = await device.db.get_pending_events(limit=50)
        return web.json_response({"events": events, "count": len(events)})

    async def get_device_config(self, request: web.Request) -> web.Response:
        """Get device configuration and sync state."""
        device_id = request.match_info["device_id"]
        device = self.devices.get(device_id)
        if not device:
            return web.json_response({"error": "Device not found"}, status=404)
        config = {
            "device_id": device.device_id,
            "site_id": device.site_id,
            "tenant_id": device.tenant_id,
            "doors": device.door_ids,
            "state": device.state.value,
            "mqtt_connected": device.mqtt.connected,
            "events_published": device.events_published,
            "uptime_s": int(time.time() - device.start_time),
            "lockdown_active": device.lockdown_active,
            "person_count": await device.db.get_person_count(),
        }
        # Sync state
        async with device.db.db.execute("SELECT key, value FROM sync_state") as cursor:
            rows = await cursor.fetchall()
        config["sync_state"] = {r[0]: r[1] for r in rows}
        return web.json_response(config)

    def record_event(self, event: dict[str, Any]) -> None:
        """Record an event for the recent events feed."""
        event["_recorded_at"] = time.time()
        self.recent_events.append(event)
