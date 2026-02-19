"""MQTT client wrapper with auto-reconnect and exponential backoff."""

from __future__ import annotations

import asyncio
import json
import ssl
from typing import Any, Callable, Coroutine
from urllib.parse import urlparse

import aiomqtt
import structlog

from dm3_simulator.models import MqttMessage, generate_uuidv7

logger = structlog.get_logger()


class DeviceMqttClient:
    """MQTT client for a single virtual device.

    Manages connection, subscriptions, publishing, and auto-reconnect.
    """

    def __init__(
        self,
        broker_url: str,
        tenant_id: str,
        device_id: str,
        username: str | None = None,
        password: str | None = None,
        on_message: Callable[[str, dict[str, Any]], Coroutine] | None = None,
    ) -> None:
        self.tenant_id = tenant_id
        self.device_id = device_id
        self.username = username
        self.password = password
        self.on_message = on_message
        self._connected = False
        self._client: aiomqtt.Client | None = None
        self._listen_task: asyncio.Task | None = None

        parsed = urlparse(broker_url)
        self.host = parsed.hostname or "localhost"
        self.port = parsed.port or (8883 if parsed.scheme == "mqtts" else 1883)
        self.use_tls = parsed.scheme == "mqtts"

    @property
    def topic_prefix(self) -> str:
        return f"dm/{self.tenant_id}/device/{self.device_id}"

    @property
    def connected(self) -> bool:
        return self._connected

    def _build_lwt(self) -> aiomqtt.Will:
        """Build Last Will and Testament message."""
        payload = json.dumps({
            "v": 1, "id": generate_uuidv7(),
            "ts": 0, "src": f"device:{self.device_id}",
            "type": "status.offline",
            "data": {"reason": "unexpected_disconnect"},
        })
        return aiomqtt.Will(
            topic=f"{self.topic_prefix}/sta",
            payload=payload.encode(),
            qos=1, retain=False,
        )

    async def connect(self) -> None:
        """Connect to MQTT broker."""
        tls_params = ssl.create_default_context() if self.use_tls else None

        self._client = aiomqtt.Client(
            hostname=self.host,
            port=self.port,
            username=self.username,
            password=self.password,
            tls_context=tls_params,
            identifier=f"dm3-sim-{self.device_id}",
            will=self._build_lwt(),
            keepalive=60,
        )
        await self._client.__aenter__()
        self._connected = True

        # Subscribe to device topics
        await self._client.subscribe(f"{self.topic_prefix}/cmd", qos=2)
        await self._client.subscribe(f"{self.topic_prefix}/cfg", qos=2)
        await self._client.subscribe(
            f"dm/{self.tenant_id}/emergency/broadcast", qos=2
        )

        logger.info("mqtt_connected", device_id=self.device_id, broker=f"{self.host}:{self.port}")

    async def disconnect(self) -> None:
        """Disconnect from MQTT broker."""
        if self._listen_task:
            self._listen_task.cancel()
            try:
                await self._listen_task
            except asyncio.CancelledError:
                pass
        if self._client:
            try:
                await self._client.__aexit__(None, None, None)
            except Exception:
                pass
        self._connected = False

    async def publish(self, topic: str, payload: str, qos: int = 1) -> None:
        """Publish a message to a topic."""
        if self._client and self._connected:
            await self._client.publish(topic, payload.encode(), qos=qos)

    async def publish_event(self, event_type: str, data: dict[str, Any]) -> None:
        """Publish an event message."""
        msg = MqttMessage(
            src=f"device:{self.device_id}",
            type=event_type,
            data=data,
        )
        await self.publish(f"{self.topic_prefix}/evt", msg.model_dump_json(), qos=1)

    async def publish_status(self, data: dict[str, Any]) -> None:
        """Publish a heartbeat/status message."""
        msg = MqttMessage(
            src=f"device:{self.device_id}",
            type="status.heartbeat",
            data=data,
        )
        await self.publish(f"{self.topic_prefix}/sta", msg.model_dump_json(), qos=0)

    async def publish_ack(self, msg_type: str, ref_id: str, data: dict[str, Any]) -> None:
        """Publish a config acknowledgment."""
        msg = MqttMessage(
            src=f"device:{self.device_id}",
            type=msg_type,
            data=data,
            ref=ref_id,
            status="ok",
        )
        await self.publish(f"{self.topic_prefix}/cfg/ack", msg.model_dump_json(), qos=2)

    async def listen(self) -> None:
        """Listen for incoming messages. Run as a task."""
        if not self._client:
            return
        try:
            async for message in self._client.messages:
                try:
                    topic = str(message.topic)
                    payload = json.loads(message.payload.decode())
                    if self.on_message:
                        await self.on_message(topic, payload)
                except Exception as e:
                    logger.error("mqtt_message_error", error=str(e), device_id=self.device_id)
        except aiomqtt.MqttError:
            self._connected = False
            logger.warning("mqtt_disconnected", device_id=self.device_id)
        except asyncio.CancelledError:
            pass

    async def connect_with_retry(self, max_retries: int = 10) -> bool:
        """Connect with exponential backoff retry."""
        delay = 1.0
        for attempt in range(max_retries):
            try:
                await self.connect()
                return True
            except Exception as e:
                logger.warning(
                    "mqtt_connect_retry",
                    device_id=self.device_id,
                    attempt=attempt + 1,
                    delay=delay,
                    error=str(e),
                )
                await asyncio.sleep(delay)
                delay = min(delay * 2, 60)
        return False
