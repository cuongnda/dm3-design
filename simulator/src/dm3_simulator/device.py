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
                if self.state == DeviceState.READY:
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
        }
