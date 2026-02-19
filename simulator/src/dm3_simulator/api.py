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
        self.app.router.add_get("/api/stats", self.get_stats)
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
        self.app.router.add_post("/api/devices/{device_id}/start", self.start_device)
        self.app.router.add_post("/api/devices/{device_id}/stop", self.stop_device)
        self.app.router.add_post("/api/devices/{device_id}/network/disconnect", self.disconnect_device_network)
        self.app.router.add_post("/api/devices/{device_id}/network/reconnect", self.reconnect_device_network)
        self.app.router.add_post("/api/devices/{device_id}/auto-trigger", self.toggle_auto_trigger)
        self.app.router.add_get("/api/simulation/status", self.get_simulation_status)
        self.app.router.add_post("/api/simulation/start", self.start_simulation)
        self.app.router.add_post("/api/simulation/stop", self.stop_simulation)
        # Sync endpoint
        self.app.router.add_post("/api/devices/{device_id}/sync", self.trigger_sync)
        # Provisioning endpoints
        self.app.router.add_post("/api/devices/new", self.create_new_device)
        self.app.router.add_post("/api/devices/{device_id}/bootstrap", self.start_bootstrap)
        self.app.router.add_post("/api/devices/{device_id}/activate", self.activate_qr)
        self.app.router.add_post("/api/simulate/activate", self.simulate_activate)
        self.app.router.add_post("/api/simulate/bootstrap", self.simulate_bootstrap)
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
        """Detailed statistics for dashboard metrics panel."""
        connected = sum(1 for d in self.devices.values() if d.mqtt.connected)
        network_off = sum(1 for d in self.devices.values() if d.network_disabled)
        stopped = sum(1 for d in self.devices.values() if not d._running)
        total_events = sum(d.events_published for d in self.devices.values())
        uptime = time.time() - self.start_time

        # Per-device stats
        per_device_eps = []
        for d in self.devices.values():
            dev_uptime = time.time() - d.start_time
            if dev_uptime > 0 and d._running:
                per_device_eps.append(d.events_published / dev_uptime)

        # Event feed analysis
        events = list(self.recent_events)
        granted = sum(1 for e in events if e.get("decision") in ("granted", "GRANTED"))
        denied = sum(1 for e in events if e.get("decision") in ("denied", "DENIED"))
        latencies = [e["decision_time_ms"] for e in events if e.get("decision_time_ms")]
        avg_latency = sum(latencies) / len(latencies) if latencies else 0
        p99_latency = sorted(latencies)[int(len(latencies) * 0.99)] if len(latencies) > 10 else max(latencies, default=0)
        min_latency = min(latencies, default=0)
        max_latency = max(latencies, default=0)

        # Queued events (across offline devices)
        total_queued = 0
        for d in self.devices.values():
            if d.network_disabled and d._running:
                try:
                    q = await d.db.get_pending_events(limit=10000)
                    total_queued += len(q)
                except Exception:
                    pass

        return web.json_response({
            "uptime_s": int(uptime),
            "devices": {
                "total": len(self.devices),
                "connected": connected,
                "disconnected": len(self.devices) - connected,
                "network_off": network_off,
                "stopped": stopped,
                "error": sum(1 for d in self.devices.values() if d.state.value == "error"),
            },
            "events": {
                "total_published": total_events,
                "events_per_second": round(total_events / max(uptime, 1), 1),
                "granted": granted,
                "denied": denied,
                "grant_rate_pct": round(granted / max(granted + denied, 1) * 100, 1),
                "recent_count": len(events),
            },
            "latency": {
                "avg_ms": round(avg_latency, 2),
                "min_ms": round(min_latency, 2),
                "max_ms": round(max_latency, 2),
                "p99_ms": round(p99_latency, 2),
            },
            "offline": {
                "devices_offline": network_off,
                "queued_events": total_queued,
            },
            "throughput": {
                "avg_eps_per_device": round(sum(per_device_eps) / max(len(per_device_eps), 1), 2),
                "max_eps_per_device": round(max(per_device_eps, default=0), 2),
                "total_eps": round(sum(per_device_eps), 2),
            },
        })

    async def get_devices(self, request: web.Request) -> web.Response:
        """List all virtual devices with sync status."""
        devices = []
        for d in self.devices.values():
            info = d.to_dict()
            # Add sync info inline
            try:
                person_count = await d.db.get_person_count()
                db_version = int(await d.db.get_sync_state("person_db_version") or "0")
                if person_count == 0 and db_version == 0:
                    info["sync_status"] = "empty"
                elif db_version > 0:
                    info["sync_status"] = "synced"
                else:
                    info["sync_status"] = "syncing"
                info["local_person_count"] = person_count
                info["local_db_version"] = db_version
            except Exception:
                info["sync_status"] = "unknown"
                info["local_person_count"] = 0
                info["local_db_version"] = 0
            devices.append(info)
        return web.json_response({"devices": devices, "count": len(devices)})

    async def get_device(self, request: web.Request) -> web.Response:
        """Get a single device's status, including sync info."""
        device_id = request.match_info["device_id"]
        device = self.devices.get(device_id)
        if not device:
            return web.json_response({"error": "Device not found"}, status=404)
        info = device.to_dict()
        # Add sync status
        try:
            person_count = await device.db.get_person_count()
            db_version = int(await device.db.get_sync_state("person_db_version") or "0")
            last_sync = await device.db.get_sync_state("last_sync_time")
            if person_count == 0 and db_version == 0:
                sync_status = "empty"
            elif db_version > 0:
                sync_status = "synced"
            else:
                sync_status = "syncing"
            info["local_person_count"] = person_count
            info["sync_status"] = sync_status
            info["last_sync_time"] = last_sync
            info["local_db_version"] = db_version
        except Exception:
            info["local_person_count"] = 0
            info["sync_status"] = "unknown"
            info["last_sync_time"] = None
            info["local_db_version"] = 0
        return web.json_response(info)

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

        # Start devices in background (empty DB — data comes via server sync)
        async def _start_devices() -> None:
            for device_id, device in list(self.devices.items()):
                try:
                    await device.start()
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

    async def start_device(self, request: web.Request) -> web.Response:
        """Start a stopped device."""
        device_id = request.match_info["device_id"]
        device = self.devices.get(device_id)
        if not device:
            return web.json_response({"error": "Device not found"}, status=404)
        if device._running:
            return web.json_response({"status": "already_running"})
        await device.start()
        return web.json_response({"status": "started", "device_id": device_id})

    async def stop_device(self, request: web.Request) -> web.Response:
        """Stop a running device."""
        device_id = request.match_info["device_id"]
        device = self.devices.get(device_id)
        if not device:
            return web.json_response({"error": "Device not found"}, status=404)
        if not device._running:
            return web.json_response({"status": "already_stopped"})
        await device.stop()
        return web.json_response({"status": "stopped", "device_id": device_id})

    async def disconnect_device_network(self, request: web.Request) -> web.Response:
        """Simulate network disconnection on a device."""
        device_id = request.match_info["device_id"]
        device = self.devices.get(device_id)
        if not device:
            return web.json_response({"error": "Device not found"}, status=404)
        await device.disconnect_network()
        queue_size = len(await device.db.get_pending_events(limit=1000))
        return web.json_response({"status": "disconnected", "device_id": device_id, "queue_size": queue_size})

    async def reconnect_device_network(self, request: web.Request) -> web.Response:
        """Restore network connection on a device."""
        device_id = request.match_info["device_id"]
        device = self.devices.get(device_id)
        if not device:
            return web.json_response({"error": "Device not found"}, status=404)
        await device.reconnect_network()
        return web.json_response({"status": "reconnected", "device_id": device_id, "state": device.state.value})

    async def toggle_auto_trigger(self, request: web.Request) -> web.Response:
        """Toggle auto event generation on a device."""
        device_id = request.match_info["device_id"]
        device = self.devices.get(device_id)
        if not device:
            return web.json_response({"error": "Device not found"}, status=404)
        body = {}
        if request.body_exists:
            body = await request.json()
        # Explicit value or toggle
        if "enabled" in body:
            device.auto_trigger = bool(body["enabled"])
        else:
            device.auto_trigger = not device.auto_trigger
        return web.json_response({"status": "ok", "device_id": device_id, "auto_trigger": device.auto_trigger})

    async def trigger_sync(self, request: web.Request) -> web.Response:
        """Trigger a sync push from the backend for this device."""
        device_id = request.match_info["device_id"]
        device = self.devices.get(device_id)
        if not device:
            return web.json_response({"error": "Device not found"}, status=404)

        # Call the backend's sync endpoint
        try:
            import aiohttp as _aiohttp

            # Look up device UUID from backend
            backend_url = "http://localhost:8002"
            async with _aiohttp.ClientSession() as session:
                # Find the device by device_id
                async with session.get(
                    f"{backend_url}/api/v1/devices?status=",
                    headers={"Authorization": f"Bearer {self._generate_admin_jwt()}"},
                ) as resp:
                    if resp.status != 200:
                        return web.json_response({"error": "Failed to list devices from backend", "status": resp.status}, status=502)
                    devices_list = await resp.json()

                # Find the matching device
                device_uuid = None
                for d in devices_list:
                    if d.get("device_id") == device_id:
                        device_uuid = d.get("id")
                        break

                if not device_uuid:
                    return web.json_response({"error": f"Device {device_id} not found in backend"}, status=404)

                # Trigger sync
                async with session.post(
                    f"{backend_url}/api/v1/devices/{device_uuid}/sync",
                    headers={"Authorization": f"Bearer {self._generate_admin_jwt()}"},
                ) as resp:
                    result = await resp.json()
                    return web.json_response({"status": "sync_triggered", "backend_response": result})

        except Exception as e:
            return web.json_response({"error": f"Failed to trigger sync: {e}"}, status=500)

    @staticmethod
    def _generate_admin_jwt() -> str:
        """Generate a dev admin JWT for backend API calls."""
        import base64
        import hashlib
        import hmac
        import json as _json

        secret = "dm3-dev-secret-key"
        now = int(time.time())
        header = {"alg": "HS256", "typ": "JWT"}
        payload = {
            "sub": "user:admin",
            "role": "system_admin",
            "cid": "00000000-0000-0000-0000-000000000001",
            "iat": now,
            "exp": now + 3600,
            "iss": "dm3",
        }

        def b64url(data: bytes) -> str:
            return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

        h = b64url(_json.dumps(header, separators=(",", ":")).encode())
        p = b64url(_json.dumps(payload, separators=(",", ":")).encode())
        sig = hmac.new(secret.encode(), f"{h}.{p}".encode(), hashlib.sha256).digest()
        return f"{h}.{p}.{b64url(sig)}"

    # ─── Provisioning Endpoints ─────────────────────────────────────────────

    async def create_new_device(self, request: web.Request) -> web.Response:
        """Create a new unprovisioned virtual device."""
        body = await request.json() if request.body_exists else {}
        rid = body.get("rid") or body.get("device_id")
        if not rid:
            return web.json_response({"error": "rid is required"}, status=400)

        if rid in self.devices:
            return web.json_response({"error": "device already exists"}, status=409)

        from dm3_simulator.device import VirtualDevice
        from dm3_simulator.models import SimulationConfig, ProvisioningStatus

        # Create config matching current simulation — inherit broker from existing devices
        existing_broker = "mqtt://localhost:1884"
        if self.devices:
            first_dev = next(iter(self.devices.values()))
            existing_broker = first_dev.config.broker
        config = SimulationConfig(
            broker=body.get("broker", self.simulation_config.get("broker", existing_broker)),
            tenant_id=body.get("tenant_id", self.simulation_config.get("tenant_id", "tenant-001")),
            site_id=body.get("site_id", self.simulation_config.get("site_id", "site-001")),
            device_type=body.get("device_type", "terminal"),
            devices=1,
            event_rate=float(body.get("event_rate", 1.0)),
        )

        device = VirtualDevice(rid, config)
        device.provisioning_status = ProvisioningStatus.UNPROVISIONED
        device.auto_trigger = False
        device.event_callback = self.record_event
        self.devices[rid] = device

        # Initialize DB only (don't connect MQTT)
        await device.db.connect()

        logger.info("new_unprovisioned_device", device_id=rid)
        return web.json_response({
            "status": "created",
            "device_id": rid,
            "provisioning_status": "unprovisioned",
        }, status=201)

    async def start_bootstrap(self, request: web.Request) -> web.Response:
        """Start bootstrap provisioning flow for a device."""
        device_id = request.match_info["device_id"]
        device = self.devices.get(device_id)
        if not device:
            return web.json_response({"error": "Device not found"}, status=404)

        body = await request.json() if request.body_exists else {}
        secret = body.get("bootstrap_secret", "dm3-bootstrap-v1-dev-secret")

        result = await device.start_bootstrap(bootstrap_secret=secret)
        return web.json_response(result)

    async def activate_qr(self, request: web.Request) -> web.Response:
        """Activate a device using a QR token."""
        device_id = request.match_info["device_id"]
        device = self.devices.get(device_id)
        if not device:
            return web.json_response({"error": "Device not found"}, status=404)

        body = await request.json() if request.body_exists else {}
        qr_token = body.get("qr_token")
        if not qr_token:
            return web.json_response({"error": "qr_token is required"}, status=400)

        backend_url = body.get("backend_url", "http://localhost:8002")
        result = await device.activate_qr(qr_token, backend_url=backend_url)
        return web.json_response(result)

    async def simulate_activate(self, request: web.Request) -> web.Response:
        """Shortcut: create device + activate with QR token in one step."""
        body = await request.json() if request.body_exists else {}
        qr_token = body.get("qr_token")
        if not qr_token:
            return web.json_response({"error": "qr_token is required"}, status=400)

        rid = body.get("rid", f"sim-qr-{int(time.time()) % 100000:05d}")

        # Create device
        from dm3_simulator.device import VirtualDevice
        from dm3_simulator.models import SimulationConfig, ProvisioningStatus

        config = SimulationConfig(
            broker=body.get("broker", self.simulation_config.get("broker", "mqtt://localhost:1884")),
            tenant_id=body.get("tenant_id", self.simulation_config.get("tenant_id", "tenant-001")),
            devices=1,
        )
        device = VirtualDevice(rid, config)
        device.provisioning_status = ProvisioningStatus.UNPROVISIONED
        device.auto_trigger = False
        device.event_callback = self.record_event
        self.devices[rid] = device
        await device.db.connect()

        backend_url = body.get("backend_url", "http://localhost:8002")
        result = await device.activate_qr(qr_token, backend_url=backend_url)
        return web.json_response({"device_id": rid, **result})

    async def simulate_bootstrap(self, request: web.Request) -> web.Response:
        """Shortcut: create device + start bootstrap in one step."""
        body = await request.json() if request.body_exists else {}
        rid = body.get("rid")
        if not rid:
            return web.json_response({"error": "rid is required"}, status=400)

        from dm3_simulator.device import VirtualDevice
        from dm3_simulator.models import SimulationConfig, ProvisioningStatus

        config = SimulationConfig(
            broker=body.get("broker", self.simulation_config.get("broker", "mqtt://localhost:1884")),
            tenant_id=body.get("tenant_id", self.simulation_config.get("tenant_id", "tenant-001")),
            device_type=body.get("device_type", "terminal"),
            devices=1,
        )
        device = VirtualDevice(rid, config)
        device.provisioning_status = ProvisioningStatus.UNPROVISIONED
        device.auto_trigger = False
        device.event_callback = self.record_event
        self.devices[rid] = device
        await device.db.connect()

        secret = body.get("bootstrap_secret", "dm3-bootstrap-v1-dev-secret")
        result = await device.start_bootstrap(bootstrap_secret=secret)
        return web.json_response({"device_id": rid, **result})

    def record_event(self, event: dict[str, Any]) -> None:
        """Record an event for the recent events feed."""
        event["_recorded_at"] = time.time()
        self.recent_events.append(event)
