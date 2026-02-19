package com.duali.dm3terminal.mqtt

import android.os.Build
import android.util.Log
import com.duali.dm3terminal.data.DeviceConfig
import com.duali.dm3terminal.data.DevicePreferences
import com.duali.dm3terminal.data.local.dao.EventQueueDao
import com.duali.dm3terminal.data.local.dao.SyncStateDao
import com.duali.dm3terminal.data.local.entities.EventQueueEntity
import com.duali.dm3terminal.domain.AccessDecision
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.eclipse.paho.client.mqttv3.*
import org.eclipse.paho.client.mqttv3.persist.MemoryPersistence
import org.json.JSONObject
import java.util.UUID
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
        private const val INITIAL_RECONNECT_DELAY_MS = 1_000L
        private const val MAX_RECONNECT_DELAY_MS = 60_000L
        private const val EVENT_DRAIN_INTERVAL_MS = 5_000L
    }

    private val _connectionState = MutableStateFlow(MqttConnectionState.DISCONNECTED)
    val connectionState: StateFlow<MqttConnectionState> = _connectionState.asStateFlow()

    private var client: MqttAsyncClient? = null
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var heartbeatJob: Job? = null
    private var drainJob: Job? = null
    private var reconnectJob: Job? = null
    private var reconnectDelay = INITIAL_RECONNECT_DELAY_MS
    private var currentConfig: DeviceConfig? = null
    private var startTime = System.currentTimeMillis()

    // Callbacks for incoming commands
    var onCommandReceived: ((String, JSONObject) -> Unit)? = null
    var onConfigReceived: ((String, JSONObject) -> Unit)? = null

    fun start() {
        scope.launch {
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
        reconnectJob?.cancel()
        try {
            client?.disconnect()
        } catch (_: Exception) {}
        client = null
        _connectionState.value = MqttConnectionState.DISCONNECTED
    }

    private fun reconnect(config: DeviceConfig) {
        reconnectJob?.cancel()
        heartbeatJob?.cancel()
        drainJob?.cancel()
        try { client?.disconnectForcibly(100) } catch (_: Exception) {}
        client = null
        _connectionState.value = MqttConnectionState.DISCONNECTED
        reconnectDelay = INITIAL_RECONNECT_DELAY_MS
        connectWithBackoff(config)
    }

    private fun connectWithBackoff(config: DeviceConfig) {
        reconnectJob = scope.launch {
            while (isActive && _connectionState.value != MqttConnectionState.CONNECTED) {
                try {
                    _connectionState.value = MqttConnectionState.CONNECTING
                    doConnect(config)
                    _connectionState.value = MqttConnectionState.CONNECTED
                    reconnectDelay = INITIAL_RECONNECT_DELAY_MS
                    startHeartbeat(config)
                    startEventDrain(config)
                    subscribe(config)
                    Log.i(TAG, "MQTT connected to ${config.mqttBrokerUrl}")
                    break
                } catch (e: Exception) {
                    Log.w(TAG, "MQTT connect failed, retry in ${reconnectDelay}ms", e)
                    _connectionState.value = MqttConnectionState.DISCONNECTED
                    delay(reconnectDelay)
                    reconnectDelay = (reconnectDelay * 2).coerceAtMost(MAX_RECONNECT_DELAY_MS)
                }
            }
        }
    }

    private suspend fun doConnect(config: DeviceConfig) {
        val clientId = "dm3-term-${config.deviceId}-${System.currentTimeMillis() % 10000}"
        val mqttClient = MqttAsyncClient(config.mqttBrokerUrl, clientId, MemoryPersistence())

        val options = MqttConnectOptions().apply {
            isCleanSession = true
            keepAliveInterval = 60
            connectionTimeout = 10
            isAutomaticReconnect = false // we handle reconnection ourselves
            // LWT
            setWill(
                topicFor(config, "sta"),
                lwtPayload(config),
                1,
                false,
            )
        }

        mqttClient.setCallback(object : MqttCallbackExtended {
            override fun connectComplete(reconnect: Boolean, serverURI: String?) {
                Log.i(TAG, "connectComplete reconnect=$reconnect")
            }
            override fun connectionLost(cause: Throwable?) {
                Log.w(TAG, "Connection lost", cause)
                _connectionState.value = MqttConnectionState.DISCONNECTED
                heartbeatJob?.cancel()
                drainJob?.cancel()
                val cfg = currentConfig ?: return
                connectWithBackoff(cfg)
            }
            override fun messageArrived(topic: String, message: MqttMessage) {
                handleIncoming(topic, message)
            }
            override fun deliveryComplete(token: IMqttDeliveryToken?) {}
        })

        val token = mqttClient.connect(options)
        withContext(Dispatchers.IO) { token.waitForCompletion(10_000) }
        client = mqttClient
        startTime = System.currentTimeMillis()
    }

    private fun subscribe(config: DeviceConfig) {
        val c = client ?: return
        val cmdTopic = topicFor(config, "cmd")
        val cfgTopic = topicFor(config, "cfg")
        val emergencyTopic = "dm/${config.tenantId}/emergency/#"
        c.subscribe(arrayOf(cmdTopic, cfgTopic, emergencyTopic), intArrayOf(2, 2, 2))
        Log.i(TAG, "Subscribed: $cmdTopic, $cfgTopic, $emergencyTopic")
    }

    private fun handleIncoming(topic: String, message: MqttMessage) {
        try {
            val json = JSONObject(String(message.payload))
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
            })
        }

        val topic = topicFor(config, "evt")
        if (!publishDirect(topic, envelope, qos = 1)) {
            // Queue for later
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

    private fun publishDirect(topic: String, payload: JSONObject, qos: Int = 1): Boolean {
        return try {
            val c = client ?: return false
            if (!c.isConnected) return false
            c.publish(topic, MqttMessage(payload.toString().toByteArray()).apply {
                this.qos = qos
                isRetained = false
            })
            true
        } catch (e: Exception) {
            Log.w(TAG, "Publish failed: $topic", e)
            false
        }
    }

    private fun startHeartbeat(config: DeviceConfig) {
        heartbeatJob = scope.launch {
            while (isActive) {
                delay(HEARTBEAT_INTERVAL_MS)
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
                publishDirect(topicFor(config, "sta"), envelope, qos = 0)
            }
        }
    }

    private fun startEventDrain(config: DeviceConfig) {
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
                            qos = 1,
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

    private fun topicFor(config: DeviceConfig, suffix: String): String =
        "dm/${config.tenantId}/device/${config.deviceId}/$suffix"

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
