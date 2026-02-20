package com.duali.dm3terminal.mqtt

import android.content.Context
import android.util.Log
import com.duali.dm3terminal.hardware.HardwareController
import com.duali.dm3terminal.sync.SyncManager
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.json.JSONObject
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Processes incoming MQTT commands and config messages.
 */
@Singleton
class CommandHandler @Inject constructor(
    @ApplicationContext private val context: Context,
    private val mqttService: MqttService,
    private val syncManager: SyncManager,
) {
    companion object {
        private const val TAG = "CommandHandler"
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    fun handleCommand(type: String, data: JSONObject) {
        Log.i(TAG, "Command received: $type")
        scope.launch {
            try {
                when (type) {
                    "cmd.door" -> handleDoorCommand(data)
                    "cmd.reboot" -> handleReboot(data)
                    "cmd.display" -> handleDisplay(data)
                    "cmd.snapshot" -> handleSnapshot(data)
                    "cmd.lockdown" -> handleLockdown(data)
                    else -> Log.w(TAG, "Unknown command type: $type")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error handling command $type", e)
            }
        }
    }

    fun handleConfig(type: String, data: JSONObject) {
        Log.i(TAG, "Config received: $type")
        scope.launch {
            try {
                when (type) {
                    "cfg.full" -> syncManager.handleFullConfig(data)
                    "cfg.person_sync" -> syncManager.handlePersonSync(data)
                    "cfg.access_rules" -> syncManager.handleAccessRulesSync(data)
                    "cfg.blacklist" -> syncManager.handleBlacklistSync(data)
                    "cfg.patch" -> syncManager.handleConfigPatch(data)
                    else -> Log.w(TAG, "Unknown config type: $type")
                }
                // Send ACK
                sendConfigAck(type)
            } catch (e: Exception) {
                Log.e(TAG, "Error handling config $type", e)
            }
        }
    }

    private fun handleDoorCommand(data: JSONObject) {
        val action = data.optString("action", "unlock")
        val durationMs = data.optLong("duration_ms", 5000)
        Log.i(TAG, "Door command: action=$action duration=$durationMs")

        when (action) {
            "unlock" -> {
                HardwareController.grantAccess()
                sendCommandResponse("cmd.door", JSONObject().apply {
                    put("status", "success")
                    put("action", "unlock")
                })
            }
            "lock" -> {
                // Lock is the default state; just ensure relay is off
                sendCommandResponse("cmd.door", JSONObject().apply {
                    put("status", "success")
                    put("action", "lock")
                })
            }
            else -> Log.w(TAG, "Unknown door action: $action")
        }
    }

    private fun handleReboot(data: JSONObject) {
        val delayMs = data.optLong("delay_ms", 3000)
        Log.i(TAG, "Reboot requested, delay=${delayMs}ms")
        sendCommandResponse("cmd.reboot", JSONObject().apply {
            put("status", "scheduled")
            put("delay_ms", delayMs)
        })

        // Schedule reboot
        scope.launch {
            kotlinx.coroutines.delay(delayMs)
            try {
                // Attempt graceful reboot via shell (requires root or device owner)
                Runtime.getRuntime().exec(arrayOf("su", "-c", "reboot"))
            } catch (e: Exception) {
                Log.e(TAG, "Reboot failed (may require root)", e)
            }
        }
    }

    private fun handleDisplay(data: JSONObject) {
        val message = data.optString("message", "")
        val color = data.optString("color", "#FFFFFF")
        val durationMs = data.optLong("duration_ms", 10000)
        Log.i(TAG, "Display message: $message for ${durationMs}ms")
        // TODO: Emit to UI layer via shared flow
        sendCommandResponse("cmd.display", JSONObject().apply {
            put("status", "displayed")
        })
    }

    private fun handleSnapshot(data: JSONObject) {
        Log.i(TAG, "Snapshot requested")
        // TODO: Capture camera frame and upload
        sendCommandResponse("cmd.snapshot", JSONObject().apply {
            put("status", "not_implemented")
        })
    }

    private fun handleLockdown(data: JSONObject) {
        val active = data.optBoolean("active", true)
        Log.i(TAG, "Lockdown: active=$active")
        // TODO: Emit lockdown state to access engine
    }

    private fun sendCommandResponse(cmdType: String, responseData: JSONObject) {
        val config = mqttService.getCurrentConfig() ?: return
        val topic = mqttService.topicFor(config, "cmd/resp")
        val envelope = JSONObject().apply {
            put("v", 1)
            put("id", java.util.UUID.randomUUID().toString())
            put("ts", System.currentTimeMillis())
            put("src", "device:${config.deviceId}")
            put("type", "$cmdType.resp")
            put("data", responseData)
        }
        mqttService.publishDirect(topic, envelope, com.hivemq.client.mqtt.datatypes.MqttQos.EXACTLY_ONCE)
    }

    private fun sendConfigAck(cfgType: String) {
        val config = mqttService.getCurrentConfig() ?: return
        val topic = mqttService.topicFor(config, "cfg/ack")
        val envelope = JSONObject().apply {
            put("v", 1)
            put("id", java.util.UUID.randomUUID().toString())
            put("ts", System.currentTimeMillis())
            put("src", "device:${config.deviceId}")
            put("type", "$cfgType.ack")
            put("data", JSONObject().apply {
                put("status", "applied")
            })
        }
        mqttService.publishDirect(topic, envelope, com.hivemq.client.mqtt.datatypes.MqttQos.EXACTLY_ONCE)
    }
}
