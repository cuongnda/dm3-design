"""REST API for controlling the simulation."""

from __future__ import annotations

import time
from typing import Any

from aiohttp import web
from prometheus_client import generate_latest

import structlog

logger = structlog.get_logger()


class SimulatorAPI:
    """aiohttp REST API for the DM3 simulator control plane."""

    def __init__(self, devices: dict[str, Any], start_time: float) -> None:
        self.devices = devices  # device_id -> VirtualDevice
        self.start_time = start_time
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
        return web.json_response(decision.model_dump())

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
        return web.json_response(decision.model_dump())

    async def get_metrics(self, request: web.Request) -> web.Response:
        """Prometheus metrics endpoint."""
        return web.Response(
            body=generate_latest(),
            content_type="text/plain; version=0.0.4; charset=utf-8",
        )
