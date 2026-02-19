"""VirtualDevice — core device simulation with state machine."""

from __future__ import annotations

import asyncio
import json
import random
import time
from typing import Any

import structlog

from dm3_simulator import metrics
from dm3_simulator.access_engine import AccessEngine
from dm3_simulator.database import DeviceDatabase
from dm3_simulator.models import (
    AccessDecision,
    DeviceState,
    DoorState,
    MqttMessage,
    ProvisioningStatus,
    SimulationConfig,
    generate_uuidv7,
)
from dm3_simulator.mqtt_client import DeviceMqttClient
from dm3_simulator.sync import SyncHandler

logger = structlog.get_logger()


class VirtualDevice:
    """A self-contained virtual access control device.

    Each device has its own MQTT client, SQLite database, access engine,
    and state machine. Devices operate independently.
    """

    def __init__(
        self,
        device_id: str,
        config: SimulationConfig,
        door_ids: list[str] | None = None,
    ) -> None:
        self.device_id = device_id
        self.config = config
        self.tenant_id = config.tenant_id
        self.site_id = config.site_id
        self.door_ids = door_ids or [f"{device_id}-door-001"]
        self.state = DeviceState.INIT
        self.door_state = DoorState.LOCKED
        self.start_time = time.time()
        self.events_published = 0
        self.lockdown_active = False
        self.current_direction = "entry"
        self.event_callback: Any = None  # Set by API to capture events
        self._network_disabled = False
        self.auto_trigger = True  # Auto-generate events in event loop
        self.provisioning_status = ProvisioningStatus.PROVISIONED  # default for existing devices
        self.mqtt_token: str | None = None  # JWT token from provisioning
        self._bootstrap_mqtt: DeviceMqttClient | None = None  # separate client for bootstrap

        # Components
        db_path = ":memory:" if config.db_mode == "memory" else f"/tmp/dm3-sim/{device_id}.db"
        self.db = DeviceDatabase(db_path)
        self.mqtt = DeviceMqttClient(
            broker_url=config.broker,
            tenant_id=config.tenant_id,
            device_id=device_id,
            username=config.broker_username,
            password=config.broker_password,
            on_message=self._on_message,
        )
        self.access_engine = AccessEngine(self.db)
        self.sync_handler = SyncHandler(self.db, device_id)

        # Tasks
        self._heartbeat_task: asyncio.Task | None = None
        self._event_task: asyncio.Task | None = None
        self._listen_task: asyncio.Task | None = None
        self._queue_drain_task: asyncio.Task | None = None
        self._running = False

    async def start(self) -> None:
        """Start the virtual device."""
        self._running = True
        self.state = DeviceState.CONNECTING

        # Initialize database
        await self.db.connect()

        # Connect to MQTT
        try:
            connected = await self.mqtt.connect_with_retry(max_retries=5)
            if not connected:
                self.state = DeviceState.ERROR
                logger.error("device_start_failed", device_id=self.device_id)
                return
        except Exception as e:
            self.state = DeviceState.ERROR
            logger.error("device_start_failed", device_id=self.device_id, error=str(e))
            return

        self.state = DeviceState.SYNCING

        # Start background tasks
        self._listen_task = asyncio.create_task(self.mqtt.listen())
        self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())
        self._event_task = asyncio.create_task(self._event_loop())
        self._queue_drain_task = asyncio.create_task(self._queue_drain_loop())

        self.state = DeviceState.READY
        metrics.devices_total.labels(state="connected").inc()
        logger.info("device_started", device_id=self.device_id, doors=self.door_ids)

    async def stop(self) -> None:
        """Stop the virtual device."""
        self._running = False
        for task in [self._heartbeat_task, self._event_task, self._listen_task, self._queue_drain_task]:
            if task:
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass

        await self.mqtt.disconnect()
        await self.db.close()
        self.state = DeviceState.OFFLINE
        metrics.devices_total.labels(state="connected").dec()
        logger.info("device_stopped", device_id=self.device_id)

    async def disconnect_network(self) -> None:
        """Simulate network disconnection — MQTT drops but device keeps running."""
        if self.mqtt.connected:
            await self.mqtt.disconnect()
            self.state = DeviceState.OFFLINE
            self._network_disabled = True
            logger.info("network_disconnected", device_id=self.device_id)

    async def reconnect_network(self) -> None:
        """Simulate network restoration — reconnect MQTT and drain queued events."""
        self._network_disabled = False
        try:
            connected = await self.mqtt.connect_with_retry(max_retries=5)
            if connected:
                self.state = DeviceState.READY
                # Re-subscribe
                self._listen_task = asyncio.create_task(self.mqtt.listen())
                logger.info("network_reconnected", device_id=self.device_id)
                # Queue drain will pick up automatically
            else:
                self.state = DeviceState.ERROR
        except Exception as e:
            self.state = DeviceState.ERROR
            logger.error("reconnect_failed", device_id=self.device_id, error=str(e))

    @property
    def network_disabled(self) -> bool:
        return getattr(self, '_network_disabled', False)

    # ─── Provisioning: Bootstrap Flow ─────────────────────────────────────────

    async def start_bootstrap(self, bootstrap_secret: str = "dm3-bootstrap-v1-dev-secret") -> dict[str, Any]:
        """Start bootstrap provisioning flow.

        Connects with bootstrap credentials, publishes registration,
        subscribes to response topic.
        """
        import hashlib
        import hmac as hmac_mod
        import uuid as uuid_mod

        self.provisioning_status = ProvisioningStatus.REGISTERING
        rid = self.device_id

        # Generate HMAC: HMAC-SHA256 over "{RID}:{timestamp_minute}"
        timestamp_minute = int(time.time()) // 60
        hmac_message = f"{rid}:{timestamp_minute}"
        hmac_password = hmac_mod.new(
            bootstrap_secret.encode(), hmac_message.encode(), hashlib.sha256
        ).hexdigest()

        # Create bootstrap MQTT client
        self._bootstrap_mqtt = DeviceMqttClient(
            broker_url=self.config.broker,
            tenant_id=self.tenant_id,
            device_id=rid,
            username=f"bootstrap:{rid}",
            password=hmac_password,
            on_message=self._on_bootstrap_message,
        )

        try:
            connected = await self._bootstrap_mqtt.connect_with_retry(max_retries=3)
            if not connected:
                self.provisioning_status = ProvisioningStatus.UNPROVISIONED
                return {"status": "error", "message": "Failed to connect with bootstrap credentials"}

            # Subscribe to response topic
            if self._bootstrap_mqtt._client:
                await self._bootstrap_mqtt._client.subscribe(f"dm/bootstrap/{rid}/response", qos=1)

            # Start listening for responses
            asyncio.create_task(self._bootstrap_mqtt.listen())

            # Compute HMAC over the payload (excluding the hmac field itself)
            nonce = str(uuid_mod.uuid4())
            ts = int(time.time())
            payload_for_hmac = {
                "type": "device.register",
                "rid": rid,
                "device_type": self.config.device_type,
                "firmware_version": "sim-0.1.0",
                "hardware_fingerprint": {
                    "android_id": hashlib.md5(rid.encode()).hexdigest()[:12],
                    "mac_address": ":".join(f"{b:02X}" for b in hashlib.md5(rid.encode()).digest()[:6]),
                    "model": "DM3-SIM",
                    "firmware_version": "sim-0.1.0",
                },
                "timestamp": ts,
                "nonce": nonce,
            }
            canonical = json.dumps(payload_for_hmac, sort_keys=True, separators=(',', ':'))
            payload_hmac = hmac_mod.new(
                bootstrap_secret.encode(), canonical.encode(), hashlib.sha256
            ).hexdigest()

            # Add hmac to payload
            payload_for_hmac["hmac"] = payload_hmac

            # Publish registration
            await self._bootstrap_mqtt.publish(
                "dm/bootstrap/register",
                json.dumps(payload_for_hmac),
                qos=1,
            )

            logger.info("bootstrap_registration_sent", device_id=rid)
            return {"status": "registering", "rid": rid}

        except Exception as e:
            self.provisioning_status = ProvisioningStatus.UNPROVISIONED
            logger.error("bootstrap_failed", device_id=rid, error=str(e))
            return {"status": "error", "message": str(e)}

    async def _on_bootstrap_message(self, topic: str, payload: dict[str, Any]) -> None:
        """Handle bootstrap response messages."""
        msg_type = payload.get("type", "")
        rid = payload.get("rid", "")

        logger.info("bootstrap_response", device_id=self.device_id, type=msg_type, status=payload.get("status"))

        if msg_type == "device.register_ack":
            self.provisioning_status = ProvisioningStatus.PENDING_APPROVAL
            logger.info("bootstrap_pending_approval", device_id=self.device_id)

        elif msg_type == "device.approved":
            self.provisioning_status = ProvisioningStatus.APPROVED
            creds = payload.get("credentials", {})
            self.mqtt_token = creds.get("mqtt_token")

            # Disconnect bootstrap
            if self._bootstrap_mqtt:
                await self._bootstrap_mqtt.disconnect()
                self._bootstrap_mqtt = None

            # Reconnect as provisioned device
            if self.mqtt_token:
                self.provisioning_status = ProvisioningStatus.PROVISIONED
                # Update MQTT client credentials
                self.mqtt.username = creds.get("mqtt_username", f"device:{self.device_id}")
                self.mqtt.password = self.mqtt_token
                try:
                    connected = await self.mqtt.connect_with_retry(max_retries=3)
                    if connected:
                        self._running = True
                        self.state = DeviceState.READY
                        self._listen_task = asyncio.create_task(self.mqtt.listen())
                        self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())
                        self._event_task = asyncio.create_task(self._event_loop())
                        self._queue_drain_task = asyncio.create_task(self._queue_drain_loop())
                        logger.info("bootstrap_provisioned", device_id=self.device_id)
                except Exception as e:
                    logger.error("bootstrap_reconnect_failed", device_id=self.device_id, error=str(e))

        elif msg_type == "device.register_nack":
            self.provisioning_status = ProvisioningStatus.REJECTED
            logger.warn("bootstrap_rejected", device_id=self.device_id, message=payload.get("message"))

        elif msg_type == "device.rejected":
            self.provisioning_status = ProvisioningStatus.REJECTED

    # ─── Provisioning: QR Flow ────────────────────────────────────────────────

    async def activate_qr(self, qr_token: str, backend_url: str = "http://localhost:8002") -> dict[str, Any]:
        """Activate device using a QR token by calling the backend API."""
        import hashlib
        try:
            import aiohttp

            self.provisioning_status = ProvisioningStatus.REGISTERING

            payload = {
                "qr_token": qr_token,
                "hardware_fingerprint": {
                    "android_id": hashlib.md5(self.device_id.encode()).hexdigest()[:12],
                    "mac_address": ":".join(f"{b:02X}" for b in hashlib.md5(self.device_id.encode()).digest()[:6]),
                    "model": "DM3-SIM",
                    "firmware_version": "sim-0.1.0",
                },
            }

            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{backend_url}/api/v1/devices/activate",
                    json=payload,
                ) as resp:
                    result = await resp.json()

                    if resp.status == 200:
                        self.provisioning_status = ProvisioningStatus.PROVISIONED
                        mqtt_info = result.get("mqtt", {})
                        self.mqtt_token = mqtt_info.get("token")
                        self.mqtt.username = mqtt_info.get("username", f"device:{self.device_id}")
                        self.mqtt.password = self.mqtt_token

                        # Connect as provisioned device
                        connected = await self.mqtt.connect_with_retry(max_retries=3)
                        if connected:
                            self._running = True
                            self.state = DeviceState.READY
                            self._listen_task = asyncio.create_task(self.mqtt.listen())
                            self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())
                            self._event_task = asyncio.create_task(self._event_loop())
                            self._queue_drain_task = asyncio.create_task(self._queue_drain_loop())
                        logger.info("qr_activated", device_id=self.device_id)
                        return result
                    else:
                        self.provisioning_status = ProvisioningStatus.UNPROVISIONED
                        logger.error("qr_activation_failed", device_id=self.device_id, status=resp.status, error=result)
                        return {"status": "error", "error": result}
        except Exception as e:
            self.provisioning_status = ProvisioningStatus.UNPROVISIONED
            logger.error("qr_activation_error", device_id=self.device_id, error=str(e))
            return {"status": "error", "message": str(e)}

    async def trigger_access(
        self,
        credential_type: str = "card",
        credential_value: str | None = None,
        door_id: str | None = None,
    ) -> AccessDecision:
        """Trigger a simulated access event.

        If no credential_value is given, picks a random one from the local DB.
        """
        door_id = door_id or self.door_ids[0]

        # If no credential given, pick random from DB
        if not credential_value:
            async with self.db.db.execute(
                "SELECT type, value FROM credentials WHERE status='active' ORDER BY RANDOM() LIMIT 1"
            ) as cursor:
                row = await cursor.fetchone()
                if row:
                    credential_type = row[0]
                    credential_value = row[1]
                else:
                    credential_value = "UNKNOWN"

        # Run decision engine
        decision = await self.access_engine.evaluate(
            credential_type, credential_value, door_id,
            direction=self.current_direction,
        )

        # Record metrics
        metrics.decision_time.observe(decision.decision_time_ms)
        result = "granted" if decision.granted else "denied"
        metrics.decisions_total.labels(result=result).inc()

        # Post-decision actions
        if decision.granted:
            await self.db.reset_failed_attempts(decision.person_id)
            await self.db.update_anti_passback(
                decision.person_id or "", self.current_direction, door_id
            )
        elif decision.person_id:
            await self.db.increment_failed_attempts(decision.person_id)

        # Build and publish event
        event_data = {
            "method": credential_type,
            "door_id": door_id,
            "direction": self.current_direction,
            "decision": result,
            "decided_locally": True,
            "decision_time_ms": decision.decision_time_ms,
            "person_id": decision.person_id,
            "person_name": decision.person_name,
            "confidence": round(random.uniform(0.75, 0.99), 2) if decision.granted else None,
            "reason": decision.reason,
            "credential_type": credential_type,
            "local_db_version": int(await self.db.get_sync_state("person_db_version") or "0"),
            "local_person_count": await self.db.get_person_count(),
        }

        msg = MqttMessage(
            src=f"device:{self.device_id}",
            type="access.log",
            data=event_data,
        )
        payload = msg.model_dump_json()

        if self.mqtt.connected:
            try:
                await self.mqtt.publish(
                    f"{self.mqtt.topic_prefix}/evt", payload, qos=1
                )
                self.events_published += 1
            except Exception:
                await self.db.queue_event(msg.id, f"{self.mqtt.topic_prefix}/evt", payload)
        else:
            await self.db.queue_event(msg.id, f"{self.mqtt.topic_prefix}/evt", payload)

        metrics.events_total.labels(type="access_log", decision=result).inc()

        # Notify API event callback
        if self.event_callback:
            self.event_callback({
                "device_id": self.device_id,
                "door_id": door_id,
                "decision": result,
                "person_name": decision.person_name,
                "credential_type": credential_type,
                "reason": decision.reason,
                "decision_time_ms": decision.decision_time_ms,
                "timestamp": time.time(),
            })

        return decision

    async def _on_message(self, topic: str, payload: dict[str, Any]) -> None:
        """Handle incoming MQTT messages."""
        msg_type = payload.get("type", "")
        msg_id = payload.get("id", "")

        try:
            if msg_type == "cfg.full":
                ack_data = await self.sync_handler.handle_config(payload)
                await self.mqtt.publish_ack("cfg.full.ack", msg_id, ack_data)

            elif msg_type == "cfg.person_sync":
                ack_data = await self.sync_handler.handle_person_sync(payload)
                await self.mqtt.publish_ack("cfg.person_sync.ack", msg_id, ack_data)

            elif msg_type == "cfg.access_rules":
                ack_data = await self.sync_handler.handle_access_rules(payload)
                await self.mqtt.publish_ack("cfg.access_rules.ack", msg_id, ack_data)

            elif msg_type == "cfg.blacklist":
                ack_data = await self.sync_handler.handle_blacklist(payload)

            elif msg_type == "cmd.lockdown":
                action = payload.get("data", {}).get("action", "activate")
                self.lockdown_active = action == "activate"
                self.access_engine.lockdown_active = self.lockdown_active
                logger.info("lockdown_changed", device_id=self.device_id, active=self.lockdown_active)

            elif msg_type == "cmd.door":
                await self._handle_door_command(payload)

            else:
                logger.debug("unhandled_message", device_id=self.device_id, type=msg_type)

        except Exception as e:
            logger.error("message_handler_error", device_id=self.device_id, type=msg_type, error=str(e))

    async def _handle_door_command(self, payload: dict[str, Any]) -> None:
        """Handle door control commands."""
        data = payload.get("data", {})
        action = data.get("action", "unlock")
        door_id = data.get("door_id", self.door_ids[0])

        if action == "unlock":
            self.door_state = DoorState.UNLOCKED
        elif action == "lock":
            self.door_state = DoorState.LOCKED
        elif action == "hold_open":
            self.door_state = DoorState.HELD_OPEN

        # Send response
        resp = MqttMessage(
            src=f"device:{self.device_id}",
            type="cmd.door.resp",
            ref=payload.get("id"),
            status="ok",
            data={"door_id": door_id, "current_state": self.door_state.value, "executed_at": int(time.time() * 1000)},
        )
        await self.mqtt.publish(f"{self.mqtt.topic_prefix}/cmd/resp", resp.model_dump_json(), qos=2)

    async def _heartbeat_loop(self) -> None:
        """Send periodic heartbeat messages."""
        while self._running:
            try:
                queue_depth = await self.db.get_queue_depth()
                person_count = await self.db.get_person_count()
                db_version = int(await self.db.get_sync_state("person_db_version") or "0")
                data = {
                    "online": True,
                    "uptime_s": int(time.time() - self.start_time),
                    "firmware": "sim-0.1.0",
                    "ip": "127.0.0.1",
                    "cpu_pct": random.randint(10, 50),
                    "mem_pct": random.randint(30, 70),
                    "disk_pct": random.randint(20, 60),
                    "temperature_c": random.randint(35, 55),
                    "queue_depth": queue_depth,
                    "last_access_ts": int(time.time() * 1000),
                    "local_db_version": db_version,
                    "local_person_count": person_count,
                }
                await self.mqtt.publish_status(data)
                metrics.queue_depth.labels(device_id=self.device_id).set(queue_depth)
            except Exception as e:
                logger.error("heartbeat_error", device_id=self.device_id, error=str(e))
            await asyncio.sleep(self.config.heartbeat_interval)

    async def _event_loop(self) -> None:
        """Generate simulated access events at configured rate."""
        while self._running:
            try:
                if self.auto_trigger and self.state in (DeviceState.READY, DeviceState.OFFLINE):
                    await self.trigger_access()
                    self.current_direction = random.choice(["entry", "exit"])
            except Exception as e:
                logger.error("event_loop_error", device_id=self.device_id, error=str(e))

            # Normal mode: random delay; stress mode: minimal delay
            if self.config.mode == "stress":
                delay = 1.0 / max(self.config.event_rate, 0.1)
            else:
                base = 1.0 / max(self.config.event_rate, 0.01)
                delay = max(0.5, random.gauss(base, base * 0.3))
            await asyncio.sleep(delay)

    async def _queue_drain_loop(self) -> None:
        """Drain the offline event queue when connected."""
        while self._running:
            try:
                if self.mqtt.connected:
                    events = await self.db.get_pending_events(limit=100)
                    if events:
                        sent_ids = []
                        for evt in events:
                            try:
                                await self.mqtt.publish(evt["topic"], evt["payload_json"], qos=1)
                                sent_ids.append(evt["message_id"])
                                self.events_published += 1
                            except Exception:
                                break
                        await self.db.mark_events_sent(sent_ids)
            except Exception as e:
                logger.error("queue_drain_error", device_id=self.device_id, error=str(e))
            await asyncio.sleep(5)

    def to_dict(self) -> dict[str, Any]:
        """Return device status as a dict."""
        return {
            "device_id": self.device_id,
            "state": self.state.value,
            "door_state": self.door_state.value,
            "door_ids": self.door_ids,
            "mqtt_connected": self.mqtt.connected,
            "events_published": self.events_published,
            "uptime_s": int(time.time() - self.start_time),
            "lockdown_active": self.lockdown_active,
            "network_disabled": self.network_disabled,
            "auto_trigger": self.auto_trigger,
            "running": self._running,
            "provisioning_status": self.provisioning_status.value,
        }

    async def to_dict_full(self) -> dict[str, Any]:
        """Return device status with sync info (async)."""
        info = self.to_dict()
        try:
            person_count = await self.db.get_person_count()
            db_version = int(await self.db.get_sync_state("person_db_version") or "0")
            last_sync = await self.db.get_sync_state("last_sync_time")
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
        return info
