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
    DeviceConfig,
    DeviceState,
    DoorState,
    FirmwareInfo,
    FirmwareStatus,
    LockdownLevel,
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
        self.lockdown_level: LockdownLevel | None = None
        self.lockdown_zone_ids: list[str] = []
        self.current_direction = "entry"
        self.event_callback: Any = None  # Set by API to capture events
        self._network_disabled = False
        self.auto_trigger = True  # Auto-generate events in event loop
        self.provisioning_status = ProvisioningStatus.PROVISIONED  # default for existing devices
        self.mqtt_token: str | None = None  # JWT token from provisioning
        self._bootstrap_mqtt: DeviceMqttClient | None = None  # separate client for bootstrap
        self.device_config = DeviceConfig()  # runtime config from server
        self.firmware = FirmwareInfo()  # firmware OTA state
        self.display_message: str | None = None  # current display message
        self._door_relock_task: asyncio.Task | None = None  # auto-relock timer

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
        for task in [self._heartbeat_task, self._event_task, self._listen_task, self._queue_drain_task, self._door_relock_task]:
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

            # Build payload — server validates HMAC by removing "hmac" key
            # from received JSON and re-marshalling with Go's json.Marshal
            # (which sorts keys alphabetically, no spaces).
            nonce = str(uuid_mod.uuid4())
            ts = int(time.time())
            payload_dict = {
                "device_type": self.config.device_type,
                "firmware_version": "sim-0.1.0",
                "hardware_fingerprint": {
                    "android_id": hashlib.md5(rid.encode()).hexdigest()[:12],
                    "firmware_version": "sim-0.1.0",
                    "mac_address": ":".join(f"{b:02X}" for b in hashlib.md5(rid.encode()).digest()[:6]),
                    "model": "DM3-SIM",
                },
                "nonce": nonce,
                "rid": rid,
                "timestamp": ts,
                "type": "device.register",
            }
            # Compute HMAC same way Go does: sorted keys, compact separators
            canonical = json.dumps(payload_dict, sort_keys=True, separators=(",", ":"))
            payload_hmac = hmac_mod.new(
                bootstrap_secret.encode(), canonical.encode(), hashlib.sha256
            ).hexdigest()

            # Add hmac and publish the full payload (also sorted to match)
            payload_dict["hmac"] = payload_hmac

            await self._bootstrap_mqtt.publish(
                "dm/bootstrap/register",
                json.dumps(payload_dict, sort_keys=True, separators=(",", ":")),
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

            # Update tenant_id from server response
            company = payload.get("company", {})
            real_tenant_id = company.get("id") or payload.get("config", {}).get("tenant_id")
            if real_tenant_id:
                self.tenant_id = real_tenant_id
                self.mqtt.tenant_id = real_tenant_id
                logger.info("tenant_id_updated", device_id=self.device_id, tenant_id=real_tenant_id)

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
            "user_id": decision.person_id or "",
            "user_name": decision.person_name or "",
            "confidence": round(random.uniform(0.75, 0.99), 2) if decision.granted else None,
            "reason": decision.reason,
            "credential_type": credential_type,
            "person_detected": True,
            "local_db_version": int(await self.db.get_sync_state("person_db_version") or "0"),
            "local_person_count": await self.db.get_person_count(),
        }

        # Upload a placeholder snapshot via §15 media-url flow on every granted
        # event. On any failure (MinIO down, gateway 503, network) we silently
        # omit `photo` — the event itself must always go through.
        if decision.granted:
            object_key = await self._upload_snapshot_placeholder()
            if object_key:
                event_data["photo"] = object_key

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

            elif msg_type == "cfg.device_update":
                ack_data = await self.sync_handler.handle_device_update(payload)
                self._apply_device_config(payload.get("data", {}))
                await self.mqtt.publish_ack("cfg.device_update.ack", msg_id, ack_data)

            elif msg_type == "cfg.firmware":
                asyncio.create_task(self._handle_firmware_update(payload))

            elif msg_type == "cmd.lockdown":
                await self._handle_lockdown(payload)

            elif msg_type == "cmd.door":
                await self._handle_door_command(payload)

            elif msg_type == "cmd.reboot":
                await self._handle_reboot(payload)

            elif msg_type == "cmd.display":
                await self._handle_display(payload)

            elif msg_type == "cmd.snapshot":
                await self._handle_snapshot(payload)

            elif msg_type == "cmd.logs":
                # Run the upload on a background task so one slow MinIO PUT
                # doesn't stall the MQTT router. Matches the real firmware
                # contract from docs/specs/devices/android-terminal.md §13.3
                # which says log collection must never block the UI / control
                # loop.
                asyncio.create_task(self._handle_log_request(payload))

            else:
                logger.debug("unhandled_message", device_id=self.device_id, type=msg_type)

        except Exception as e:
            logger.error("message_handler_error", device_id=self.device_id, type=msg_type, error=str(e))

    async def _handle_door_command(self, payload: dict[str, Any]) -> None:
        """Handle door control commands: unlock, lock, hold_open, hold_close, release."""
        data = payload.get("data", {})
        action = data.get("action", "unlock")
        door_id = data.get("door_id", self.door_ids[0])
        duration_ms = data.get("duration_ms", self.device_config.open_relay_ms)

        prev_state = self.door_state

        if action == "unlock":
            self.door_state = DoorState.UNLOCKED
            # Auto-relock after duration
            if self._door_relock_task:
                self._door_relock_task.cancel()
            self._door_relock_task = asyncio.create_task(
                self._auto_relock(door_id, duration_ms)
            )
        elif action == "lock":
            self.door_state = DoorState.LOCKED
        elif action == "hold_open":
            self.door_state = DoorState.HELD_OPEN
        elif action == "hold_close":
            self.door_state = DoorState.HELD_CLOSE
        elif action == "release":
            self.door_state = DoorState.LOCKED

        # Publish door.state event if state changed
        if self.door_state != prev_state:
            await self._publish_door_state(door_id, action)

        # Send command response
        resp = MqttMessage(
            src=f"device:{self.device_id}",
            type="cmd.door.resp",
            ref=payload.get("id"),
            status="ok",
            data={"door_id": door_id, "current_state": self.door_state.value, "executed_at": int(time.time() * 1000)},
        )
        await self.mqtt.publish(f"{self.mqtt.topic_prefix}/cmd/resp", resp.model_dump_json(), qos=2)
        logger.info("door_command", device_id=self.device_id, action=action, door=door_id, state=self.door_state.value)

    async def _auto_relock(self, door_id: str, duration_ms: int) -> None:
        """Auto-relock door after unlock duration."""
        try:
            await asyncio.sleep(duration_ms / 1000.0)
            if self.door_state == DoorState.UNLOCKED:
                self.door_state = DoorState.LOCKED
                await self._publish_door_state(door_id, "auto_relock")
                logger.info("door_auto_relocked", device_id=self.device_id, door=door_id)
        except asyncio.CancelledError:
            pass

    async def _publish_door_state(self, door_id: str, trigger: str) -> None:
        """Publish a door.state event to the server."""
        msg = MqttMessage(
            src=f"device:{self.device_id}",
            type="door.state",
            data={
                "door_id": door_id,
                "state": self.door_state.value,
                "trigger": trigger,
                "timestamp": int(time.time() * 1000),
            },
        )
        if self.mqtt.connected:
            await self.mqtt.publish(f"{self.mqtt.topic_prefix}/evt", msg.model_dump_json(), qos=1)

    async def _handle_lockdown(self, payload: dict[str, Any]) -> None:
        """Handle emergency lockdown with level and zone support."""
        data = payload.get("data", {})
        action = data.get("action", "activate")
        level = data.get("level", "full")
        zone_ids = data.get("zone_ids", [])

        if action == "activate":
            self.lockdown_active = True
            self.lockdown_level = LockdownLevel(level) if level in ("full", "zone") else LockdownLevel.FULL
            self.lockdown_zone_ids = zone_ids
            self.access_engine.lockdown_active = True
            # Lock all doors
            for door_id in self.door_ids:
                self.door_state = DoorState.HELD_CLOSE
                await self._publish_door_state(door_id, "lockdown")
        elif action == "deactivate":
            self.lockdown_active = False
            self.lockdown_level = None
            self.lockdown_zone_ids = []
            self.access_engine.lockdown_active = False
            # Restore doors to locked (normal)
            for door_id in self.door_ids:
                self.door_state = DoorState.LOCKED
                await self._publish_door_state(door_id, "lockdown_released")

        logger.info(
            "lockdown_changed", device_id=self.device_id,
            active=self.lockdown_active, level=level, zones=zone_ids,
        )

    async def _handle_reboot(self, payload: dict[str, Any]) -> None:
        """Handle reboot command — simulate device restart cycle."""
        data = payload.get("data", {})
        delay_ms = data.get("delay_ms", 5000)
        reason = data.get("reason", "remote")

        # Send response acknowledging reboot
        resp = MqttMessage(
            src=f"device:{self.device_id}",
            type="cmd.reboot.resp",
            ref=payload.get("id"),
            status="ok",
            data={"reason": reason, "delay_ms": delay_ms},
        )
        await self.mqtt.publish(f"{self.mqtt.topic_prefix}/cmd/resp", resp.model_dump_json(), qos=2)

        logger.info("reboot_requested", device_id=self.device_id, reason=reason, delay_ms=delay_ms)

        # Simulate reboot: disconnect → wait → reconnect
        await asyncio.sleep(delay_ms / 1000.0)
        self.state = DeviceState.OFFLINE
        await self.mqtt.disconnect()

        # Simulate boot time
        await asyncio.sleep(3.0)

        # Reconnect
        self.start_time = time.time()
        connected = await self.mqtt.connect_with_retry(max_retries=5)
        if connected:
            self.state = DeviceState.READY
            self._listen_task = asyncio.create_task(self.mqtt.listen())
            logger.info("reboot_complete", device_id=self.device_id)
        else:
            self.state = DeviceState.ERROR
            logger.error("reboot_reconnect_failed", device_id=self.device_id)

    async def _handle_display(self, payload: dict[str, Any]) -> None:
        """Handle display message command."""
        data = payload.get("data", {})
        message = data.get("message", "")
        duration_ms = data.get("duration_ms", 30000)

        self.display_message = message
        logger.info("display_message", device_id=self.device_id, message=message, duration_ms=duration_ms)

        # Send response
        resp = MqttMessage(
            src=f"device:{self.device_id}",
            type="cmd.display.resp",
            ref=payload.get("id"),
            status="ok",
            data={"message": message, "displayed_at": int(time.time() * 1000)},
        )
        await self.mqtt.publish(f"{self.mqtt.topic_prefix}/cmd/resp", resp.model_dump_json(), qos=2)

        # Clear display after duration
        async def _clear_display():
            await asyncio.sleep(duration_ms / 1000.0)
            self.display_message = None
        asyncio.create_task(_clear_display())

    async def _handle_snapshot(self, payload: dict[str, Any]) -> None:
        """Handle snapshot command — return a simulated placeholder image."""
        import base64
        data = payload.get("data", {})
        camera = data.get("camera", "main")

        # Generate a minimal 1x1 JPEG placeholder (simulated snapshot)
        # Real device would capture from camera
        placeholder_jpeg = base64.b64encode(
            bytes([
                0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
                0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xD9,
            ])
        ).decode()

        resp = MqttMessage(
            src=f"device:{self.device_id}",
            type="cmd.snapshot.resp",
            ref=payload.get("id"),
            status="ok",
            data={
                "camera": camera,
                "format": "jpeg",
                "image_base64": placeholder_jpeg,
                "width": 1,
                "height": 1,
                "captured_at": int(time.time() * 1000),
            },
        )
        await self.mqtt.publish(f"{self.mqtt.topic_prefix}/cmd/resp", resp.model_dump_json(), qos=2)
        logger.info("snapshot_captured", device_id=self.device_id, camera=camera)

    # 1x1 baseline JPEG used as a stand-in for camera snapshots in the
    # simulator. Real firmware would PUT the actual capture bytes.
    _PLACEHOLDER_JPEG: bytes = bytes([
        0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
        0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xD9,
    ])

    async def _handle_log_request(self, payload: dict[str, Any]) -> None:
        """Handle cmd.logs — simulate the Android/Linux log-pull flow.

        Wire spec: docs/architecture/mqtt-protocol.md §6.5.

        Simulator shortcut: we don't actually have a rolling log buffer, so we
        synthesise a handful of plausible log lines that echo the device_id +
        any filters the server asked for, gzip them, PUT to the presigned URL,
        and ack. Real firmware would collect from Logcat / journalctl here.
        """
        import gzip
        import aiohttp

        data = payload.get("data", {}) or {}
        msg_id = payload.get("id")
        request_id = data.get("request_id", "")
        upload_url = data.get("upload_url", "")
        object_key = data.get("object_key", "")
        content_type = data.get("content_type", "application/gzip")

        async def _ack(status: str, ack_data: dict[str, Any], error: str | None = None) -> None:
            resp = MqttMessage(
                src=f"device:{self.device_id}",
                type="cmd.logs.resp",
                ref=msg_id,
                status=status,
                data=ack_data,
            )
            if error:
                resp.error = error
            await self.mqtt.publish(
                f"{self.mqtt.topic_prefix}/cmd/resp",
                resp.model_dump_json(),
                qos=1,
            )

        if not request_id or not upload_url:
            logger.warning("cmd.logs: missing request_id or upload_url",
                           device_id=self.device_id)
            await _ack("error",
                       {"request_id": request_id, "error": "filters_invalid"},
                       error="filters_invalid")
            return

        # Synthesise a log body. Keep it human-readable so automation tests
        # can assert on its contents after downloading.
        lines: list[str] = [
            f"{time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())} INFO simulator boot device_id={self.device_id}",
            f"{time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())} INFO mqtt connected topic_prefix={self.mqtt.topic_prefix}",
            f"{time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())} INFO cmd.logs received request_id={request_id}",
        ]
        if data.get("from_ts"):
            lines.append(f"INFO filter from_ts={data['from_ts']}")
        if data.get("to_ts"):
            lines.append(f"INFO filter to_ts={data['to_ts']}")
        if data.get("level_min"):
            lines.append(f"INFO filter level_min={data['level_min']}")
        if data.get("lines_max") is not None:
            max_lines = int(data["lines_max"])
            if max_lines >= 0:
                lines = lines[:max_lines]

        body_bytes = gzip.compress(("\n".join(lines) + "\n").encode("utf-8"))

        timeout = aiohttp.ClientTimeout(total=10)
        try:
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.put(
                    upload_url,
                    data=body_bytes,
                    headers={"Content-Type": content_type},
                ) as put_resp:
                    if put_resp.status not in (200, 204):
                        put_body = await put_resp.text()
                        logger.warning(
                            "cmd.logs: upload failed",
                            device_id=self.device_id,
                            status=put_resp.status,
                            body=put_body[:200],
                        )
                        await _ack("error",
                                   {"request_id": request_id, "object_key": object_key,
                                    "error": "upload_failed"},
                                   error="upload_failed")
                        return
        except Exception as e:
            logger.warning("cmd.logs: upload exception",
                           device_id=self.device_id, error=str(e))
            await _ack("error",
                       {"request_id": request_id, "object_key": object_key,
                        "error": "upload_failed"},
                       error="upload_failed")
            return

        logger.info("cmd.logs: uploaded",
                    device_id=self.device_id,
                    request_id=request_id,
                    lines=len(lines),
                    bytes=len(body_bytes))
        await _ack("ok", {
            "request_id": request_id,
            "object_key": object_key,
            "lines_uploaded": len(lines),
            "bytes": len(body_bytes),
        })

    async def _upload_snapshot_placeholder(self) -> str | None:
        """Run the two-step §15 media upload and return the object_key.

        Best-effort: returns None on any failure (no token yet, gateway 503
        because object storage isn't configured, network error, MinIO down).
        Callers must treat the photo as optional.
        """
        if not self.mqtt_token:
            return None
        import aiohttp
        media_url = f"{self.config.gateway_url}/api/v1/gateway/devices/{self.device_id}/media-url"
        headers = {"Authorization": f"Bearer {self.mqtt_token}"}
        timeout = aiohttp.ClientTimeout(total=3)
        try:
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.post(
                    media_url,
                    json={"kind": "snapshot", "content_type": "image/jpeg"},
                    headers=headers,
                ) as resp:
                    if resp.status != 200:
                        logger.debug(
                            "snapshot_url_failed",
                            device_id=self.device_id,
                            status=resp.status,
                        )
                        return None
                    issued = await resp.json()
                put_url = issued.get("upload_url")
                object_key = issued.get("object_key")
                if not put_url or not object_key:
                    return None
                async with session.put(
                    put_url,
                    data=self._PLACEHOLDER_JPEG,
                    headers={"Content-Type": "image/jpeg"},
                ) as put_resp:
                    if put_resp.status not in (200, 204):
                        logger.debug(
                            "snapshot_minio_put_failed",
                            device_id=self.device_id,
                            status=put_resp.status,
                        )
                        return None
                return object_key
        except Exception as e:
            logger.debug("snapshot_upload_error", device_id=self.device_id, error=str(e))
            return None

    async def _handle_firmware_update(self, payload: dict[str, Any]) -> None:
        """Handle firmware OTA: download, verify, install with progress acks."""
        data = payload.get("data", {})
        msg_id = payload.get("id", "")
        deployment_id = data.get("deployment_id", "")
        version = data.get("version", "")
        url = data.get("url", "")
        checksum = data.get("checksum", "")
        size_bytes = data.get("size_bytes", 0)
        force = data.get("force", False)

        self.firmware = FirmwareInfo(
            deployment_id=deployment_id, version=version, url=url,
            checksum=checksum, size_bytes=size_bytes, force=force,
            previous_version="sim-0.1.0",
        )

        logger.info("firmware_update_started", device_id=self.device_id, version=version)

        async def _send_firmware_ack(status: str, progress: int, error: str | None = None):
            ack_data: dict[str, Any] = {
                "deployment_id": deployment_id,
                "status": status,
                "progress_pct": progress,
                "version": version,
            }
            if error:
                ack_data["error"] = error
                ack_data["previous_version"] = self.firmware.previous_version
            await self.mqtt.publish_ack("cfg.firmware.ack", msg_id, ack_data)

        try:
            # Phase 1: Downloading (simulate with progress)
            self.firmware.status = FirmwareStatus.DOWNLOADING
            for pct in (10, 30, 50, 70, 90, 100):
                self.firmware.progress_pct = pct
                await _send_firmware_ack("downloading", pct)
                await asyncio.sleep(0.5)

            # Phase 2: Verify checksum (simulated)
            logger.info("firmware_download_complete", device_id=self.device_id, version=version)

            # Phase 3: Installing
            self.firmware.status = FirmwareStatus.INSTALLING
            self.firmware.progress_pct = 0
            await _send_firmware_ack("installing", 0)
            await asyncio.sleep(2.0)

            # Phase 4: Success
            self.firmware.status = FirmwareStatus.SUCCESS
            self.firmware.progress_pct = 100
            await _send_firmware_ack("success", 100)
            logger.info("firmware_update_complete", device_id=self.device_id, version=version)

        except Exception as e:
            self.firmware.status = FirmwareStatus.FAILED
            self.firmware.error = str(e)
            await _send_firmware_ack("failed", self.firmware.progress_pct, str(e))
            logger.error("firmware_update_failed", device_id=self.device_id, error=str(e))

    def _apply_device_config(self, data: dict[str, Any]) -> None:
        """Apply cfg.device_update settings to the running device."""
        self.device_config = DeviceConfig(
            device_id=data.get("device_id", self.device_id),
            name=data.get("name", self.device_config.name),
            location=data.get("location", self.device_config.location),
            model=data.get("model", self.device_config.model),
            open_relay_ms=data.get("open_relay_ms", self.device_config.open_relay_ms),
            timezone=data.get("timezone", self.device_config.timezone),
            verify_methods=data.get("verify_methods", self.device_config.verify_methods),
            verify_logic=data.get("verify_logic", self.device_config.verify_logic),
        )
        logger.info("device_config_applied", device_id=self.device_id, name=self.device_config.name)

    async def trigger_alarm(self, alarm_type: str = "forced_entry", zone_id: str | None = None) -> None:
        """Trigger an alarm event."""
        self.door_state = DoorState.ALARM
        msg = MqttMessage(
            src=f"device:{self.device_id}",
            type="alarm.triggered",
            data={
                "alarm_type": alarm_type,
                "zone_id": zone_id or self.site_id,
                "door_id": self.door_ids[0],
                "severity": "critical" if alarm_type in ("forced_entry", "tamper") else "warning",
                "timestamp": int(time.time() * 1000),
            },
        )
        if self.mqtt.connected:
            await self.mqtt.publish(f"{self.mqtt.topic_prefix}/evt", msg.model_dump_json(), qos=1)
        logger.info("alarm_triggered", device_id=self.device_id, type=alarm_type)

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
                    "local_user_count": person_count,
                    "network": {
                        "type": "ethernet",
                        "signal_dbm": 0,
                        "latency_ms": random.randint(5, 50),
                    },
                    "peripherals": {
                        "camera": "ok",
                        "reader": "ok",
                        "lock": "ok",
                        "printer": "na",
                    },
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
            "lockdown_level": self.lockdown_level.value if self.lockdown_level else None,
            "lockdown_zone_ids": self.lockdown_zone_ids,
            "network_disabled": self.network_disabled,
            "auto_trigger": self.auto_trigger,
            "running": self._running,
            "provisioning_status": self.provisioning_status.value,
            "display_message": self.display_message,
            "firmware_status": self.firmware.status.value,
            "firmware_version": self.firmware.version or "sim-0.1.0",
            "device_name": self.device_config.name,
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
