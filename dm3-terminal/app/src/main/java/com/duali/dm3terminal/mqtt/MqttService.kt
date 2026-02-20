package com.duali.dm3terminal.mqtt

import android.util.Log
import com.duali.dm3terminal.data.DeviceConfig
import com.duali.dm3terminal.data.DevicePreferences
import com.duali.dm3terminal.data.local.dao.EventQueueDao
import com.duali.dm3terminal.data.local.dao.SyncStateDao
import com.duali.dm3terminal.data.local.entities.EventQueueEntity
import com.duali.dm3terminal.domain.AccessDecision
import com.hivemq.client.mqtt.MqttClient
import com.hivemq.client.mqtt.datatypes.MqttQos
import com.hivemq.client.mqtt.lifecycle.MqttClientConnectedContext
import com.hivemq.client.mqtt.lifecycle.MqttClientConnectedListener
import com.hivemq.client.mqtt.lifecycle.MqttClientDisconnectedContext
import com.hivemq.client.mqtt.lifecycle.MqttClientDisconnectedListener
import com.hivemq.client.mqtt.mqtt5.Mqtt5AsyncClient
import com.hivemq.client.mqtt.mqtt5.message.connect.Mqtt5Connect
import com.hivemq.client.mqtt.mqtt5.message.publish.Mqtt5Publish
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONObject
import java.net.URI
import java.util.UUID
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

enum class MqttConnectionState { DISCONNECTED, CONNECTING, CONNECTED }

@Singleton
class MqttService @Inject constructor(
    private val devicePreferences: DevicePreferences,
    private val eventQueueDao: EventQueueDao,
    private val syncStateDao: SyncStateDao,
) {
    companion object {
        private const val TAG = "MqttService"
        private const val HEARTBEAT_INTERVAL_MS = 30_000L
        private const val EVENT_DRAIN_INTERVAL_MS = 5_000L
    }

    private val _connectionState = MutableStateFlow(MqttConnectionState.DISCONNECTED)
    val connectionState: StateFlow<MqttConnectionState> = _connectionState.asStateFlow()

    private var client: Mqtt5AsyncClient? = null
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var heartbeatJob: Job? = null
    private var drainJob: Job? = null
    private var configCollectJob: Job? = null
    private var currentConfig: DeviceConfig? = null
    private var startTime = System.currentTimeMillis()

    // Callbacks for incoming commands
    var onCommandReceived: ((String, JSONObject) -> Unit)? = null
    var onConfigReceived: ((String, JSONObject) -> Unit)? = null

    fun start() {
        configCollectJob = scope.launch {
            devicePreferences.config.collect { config ->
                val oldConfig = currentConfig
                currentConfig = config
                if (oldConfig == null || oldConfig.mqttBrokerUrl != config.mqttBrokerUrl
                    || oldConfig.deviceId != config.deviceId || oldConfig.tenantId != config.tenantId
                ) {
                    reconnect(config)
                }
            }
        }
    }

    fun stop() {
        heartbeatJob?.cancel()
        drainJob?.cancel()
        configCollectJob?.cancel()
        try {
            client?.disconnect()
        } catch (_: Exception) {}
        client = null
        _connectionState.value = MqttConnectionState.DISCONNECTED
    }

    private fun reconnect(config: DeviceConfig) {
        heartbeatJob?.cancel()
        drainJob?.cancel()
        try { client?.disconnect() } catch (_: Exception) {}
        client = null
        _connectionState.value = MqttConnectionState.DISCONNECTED
        connect(config)
    }

    private fun connect(config: DeviceConfig) {
        _connectionState.value = MqttConnectionState.CONNECTING

        val uri = URI(config.mqttBrokerUrl.replace("tcp://", "http://"))
        val host = uri.host ?: "127.0.0.1"
        val port = if (uri.port > 0) uri.port else 1884

        val clientId = "dm3-term-${config.deviceId}-${System.currentTimeMillis() % 10000}"

        val mqttClient = MqttClient.builder()
            .useMqttVersion5()
            .identifier(clientId)
            .serverHost(host)
            .serverPort(port)
            .automaticReconnect()
                .initialDelay(1, TimeUnit.SECONDS)
                .maxDelay(60, TimeUnit.SECONDS)
                .applyAutomaticReconnect()
            .addConnectedListener(object : MqttClientConnectedListener {
                override fun onConnected(context: MqttClientConnectedContext) {
                    Log.i(TAG, "MQTT connected to $host:$port")
                    _connectionState.value = MqttConnectionState.CONNECTED
                    startTime = System.currentTimeMillis()
                    subscribe(config)
                    startHeartbeat(config)
                    startEventDrain(config)
                }
            })
            .addDisconnectedListener(object : MqttClientDisconnectedListener {
                override fun onDisconnected(context: MqttClientDisconnectedContext) {
                    Log.w(TAG, "MQTT disconnected: ${context.cause?.message}")
                    _connectionState.value = MqttConnectionState.DISCONNECTED
                    heartbeatJob?.cancel()
                    drainJob?.cancel()
                }
            })
            .buildAsync()

        client = mqttClient

        // Build LWT
        val lwtPayload = lwtPayload(config)
        val lwt = Mqtt5Publish.builder()
            .topic(topicFor(config, "sta"))
            .payload(lwtPayload)
            .qos(MqttQos.AT_LEAST_ONCE)
            .build()

        val connectMsg = Mqtt5Connect.builder()
            .cleanStart(false)
            .sessionExpiryInterval(3600)
            .keepAlive(60)
            .willPublish(lwt)
            .build()

        mqttClient.connect(connectMsg).whenComplete { _, throwable ->
            if (throwable != null) {
                Log.e(TAG, "MQTT connect failed", throwable)
                // Auto-reconnect will handle retry
            }
        }
    }

    private fun subscribe(config: DeviceConfig) {
        val c = client ?: return
        val cmdTopic = topicFor(config, "cmd")
        val cfgTopic = topicFor(config, "cfg")
        val emergencyTopic = "dm/${config.tenantId}/emergency/broadcast"

        c.subscribeWith()
            .topicFilter(cmdTopic)
            .qos(MqttQos.EXACTLY_ONCE)
            .callback { publish -> handleIncoming(publish) }
            .send()

        c.subscribeWith()
            .topicFilter(cfgTopic)
            .qos(MqttQos.EXACTLY_ONCE)
            .callback { publish -> handleIncoming(publish) }
            .send()

        c.subscribeWith()
            .topicFilter(emergencyTopic)
            .qos(MqttQos.EXACTLY_ONCE)
            .callback { publish -> handleIncoming(publish) }
            .send()

        Log.i(TAG, "Subscribed: $cmdTopic, $cfgTopic, $emergencyTopic")
    }

    private fun handleIncoming(publish: Mqtt5Publish) {
        try {
            val topic = publish.topic.toString()
            val payload = publish.payloadAsBytes?.let { String(it) } ?: return
            val json = JSONObject(payload)
            val type = json.optString("type", "")
            val data = json.optJSONObject("data") ?: JSONObject()
            Log.d(TAG, "Received: $topic type=$type")

            when {
                topic.endsWith("/cmd") -> onCommandReceived?.invoke(type, data)
                topic.endsWith("/cfg") -> onConfigReceived?.invoke(type, data)
                topic.contains("/emergency/") -> onCommandReceived?.invoke(type, data)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to parse incoming message", e)
        }
    }

    // --- Publishing ---

    fun publishAccessEvent(
        decision: AccessDecision,
        method: String,
        doorId: String,
        direction: String = "entry",
        cardUid: String? = null,
    ) {
        val config = currentConfig ?: return
        val envelope = JSONObject().apply {
            put("v", 1)
            put("id", UUID.randomUUID().toString())
            put("ts", System.currentTimeMillis())
            put("src", "device:${config.deviceId}")
            put("type", "access.log")
            put("data", JSONObject().apply {
                put("method", method)
                put("door_id", doorId)
                put("direction", direction)
                put("decision", if (decision.granted) "granted" else "denied")
                put("decided_locally", true)
                put("decision_time_ms", decision.decisionTimeMs)
                if (decision.personId != null) put("person_id", decision.personId)
                if (decision.personName != null) put("person_name", decision.personName)
                put("reason", decision.reason)
                put("credential_type", method)
                if (cardUid != null) put("card_uid", cardUid)
            })
        }

        val topic = topicFor(config, "evt")
        if (!publishDirect(topic, envelope, MqttQos.AT_LEAST_ONCE)) {
            scope.launch {
                eventQueueDao.insert(
                    EventQueueEntity(
                        messageId = envelope.getString("id"),
                        topic = topic,
                        payloadJson = envelope.toString(),
                    )
                )
            }
        }
    }

    fun publishDirect(topic: String, payload: JSONObject, qos: MqttQos = MqttQos.AT_LEAST_ONCE): Boolean {
        return try {
            val c = client ?: return false
            if (_connectionState.value != MqttConnectionState.CONNECTED) return false
            c.publishWith()
                .topic(topic)
                .payload(payload.toString().toByteArray())
                .qos(qos)
                .send()
            true
        } catch (e: Exception) {
            Log.w(TAG, "Publish failed: $topic", e)
            false
        }
    }

    fun publishHeartbeat(config: DeviceConfig, personCount: Int, lastSyncTime: Long) {
        val envelope = JSONObject().apply {
            put("v", 1)
            put("id", UUID.randomUUID().toString())
            put("ts", System.currentTimeMillis())
            put("src", "device:${config.deviceId}")
            put("type", "status.heartbeat")
            put("data", JSONObject().apply {
                put("online", true)
                put("uptime_s", (System.currentTimeMillis() - startTime) / 1000)
                put("firmware", "1.0.0")
                put("ip", "0.0.0.0")
                put("cpu_pct", 0)
                put("mem_pct", 0)
                put("disk_pct", 0)
                put("person_count", personCount)
                put("last_sync_time", lastSyncTime)
                put("network", JSONObject().apply {
                    put("type", "wifi")
                    put("signal_dbm", -50)
                    put("latency_ms", 0)
                })
                put("peripherals", JSONObject().apply {
                    put("camera", "ok")
                    put("reader", "na")
                    put("lock", "na")
                    put("printer", "na")
                })
                put("queue_depth", 0)
            })
        }
        publishDirect(topicFor(config, "sta"), envelope, MqttQos.AT_MOST_ONCE)
    }

    private fun startHeartbeat(config: DeviceConfig) {
        heartbeatJob?.cancel()
        heartbeatJob = scope.launch {
            while (isActive) {
                delay(HEARTBEAT_INTERVAL_MS)
                publishHeartbeat(config, 0, 0L)
            }
        }
    }

    private fun startEventDrain(config: DeviceConfig) {
        drainJob?.cancel()
        drainJob = scope.launch {
            while (isActive) {
                delay(EVENT_DRAIN_INTERVAL_MS)
                try {
                    val pending = eventQueueDao.getPending(50)
                    if (pending.isEmpty()) continue
                    val sent = mutableListOf<String>()
                    for (event in pending) {
                        val ok = publishDirect(
                            event.topic,
                            JSONObject(event.payloadJson),
                            MqttQos.AT_LEAST_ONCE,
                        )
                        if (ok) sent.add(event.messageId) else break
                    }
                    if (sent.isNotEmpty()) {
                        eventQueueDao.deleteByIds(sent)
                        Log.d(TAG, "Drained ${sent.size} queued events")
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "Event drain error", e)
                }
            }
        }
    }

    fun topicFor(config: DeviceConfig, suffix: String): String =
        "dm/${config.tenantId}/device/${config.deviceId}/$suffix"

    fun getCurrentConfig(): DeviceConfig? = currentConfig

    private fun lwtPayload(config: DeviceConfig): ByteArray {
        return JSONObject().apply {
            put("v", 1)
            put("id", UUID.randomUUID().toString())
            put("ts", System.currentTimeMillis())
            put("src", "device:${config.deviceId}")
            put("type", "status.offline")
            put("data", JSONObject().apply {
                put("reason", "unexpected_disconnect")
                put("last_seen", System.currentTimeMillis())
            })
        }.toString().toByteArray()
    }
}
