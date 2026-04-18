package com.duali.dm3terminal.hardware

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.util.Log
import com.duali.dm3terminal.mqtt.MqttService
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import org.json.JSONObject
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

enum class DoorState { CLOSED, OPEN, HELD_OPEN, UNKNOWN }

sealed class DoorAlarm {
    data class HeldOpen(val durationMs: Long) : DoorAlarm()
    data class ForcedOpen(val timestampMs: Long) : DoorAlarm()
    data class TamperDetected(val magnitude: Float) : DoorAlarm()
}

@Singleton
class DoorController @Inject constructor(
    @ApplicationContext private val context: Context,
    private val mqttService: MqttService,
) {
    companion object {
        private const val TAG = "DoorController"
        private const val DEFAULT_UNLOCK_DURATION_MS = 3000L
        private const val DOOR_HELD_OPEN_THRESHOLD_MS = 30_000L
        private const val DOOR_MONITOR_POLL_MS = 500L
        private const val TAMPER_THRESHOLD = 15f // m/s² — significant impact
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val _doorState = MutableStateFlow(DoorState.UNKNOWN)
    val doorState: StateFlow<DoorState> = _doorState

    private val _alarms = MutableSharedFlow<DoorAlarm>(extraBufferCapacity = 10)
    val alarms: SharedFlow<DoorAlarm> = _alarms

    private var monitorJob: Job? = null
    private var tamperListener: SensorEventListener? = null
    private var sensorManager: SensorManager? = null
    private var unlockDurationMs = DEFAULT_UNLOCK_DURATION_MS
    private var heldOpenThresholdMs = DOOR_HELD_OPEN_THRESHOLD_MS
    private var doorOpenSince: Long? = null

    fun configure(unlockDurationMs: Long = DEFAULT_UNLOCK_DURATION_MS, heldOpenThresholdMs: Long = DOOR_HELD_OPEN_THRESHOLD_MS) {
        this.unlockDurationMs = unlockDurationMs
        this.heldOpenThresholdMs = heldOpenThresholdMs
    }

    /**
     * Pulse relay to unlock door for configured duration.
     */
    fun pulseRelay(durationMs: Long = unlockDurationMs) {
        HardwareController.openDoorTimed(durationMs)
        HardwareController.ledGranted()
        scope.launch {
            delay(durationMs)
            HardwareController.ledOff()
        }
    }

    /**
     * Grant access: pulse relay + LED feedback.
     */
    fun grantAccess(durationMs: Long = unlockDurationMs) {
        pulseRelay(durationMs)
    }

    /**
     * Deny access: LED feedback only.
     */
    fun denyAccess() {
        HardwareController.denyAccess()
    }

    /**
     * Remote lock command — ensure relay is off.
     */
    fun lockDoor() {
        HardwareController.closeDoor()
        HardwareController.ledOff()
    }

    /**
     * Remote hold-open — keep relay energized until explicitly locked.
     */
    fun holdOpen() {
        HardwareController.openDoor()
        HardwareController.ledGranted()
    }

    /**
     * Start door sensor monitoring and tamper detection.
     */
    fun startMonitoring() {
        startDoorSensorMonitor()
        startTamperDetection()
    }

    /**
     * Stop all monitoring.
     */
    fun stopMonitoring() {
        monitorJob?.cancel()
        monitorJob = null
        stopTamperDetection()
    }

    private fun startDoorSensorMonitor() {
        monitorJob?.cancel()
        monitorJob = scope.launch {
            var lastState = DoorState.UNKNOWN
            while (isActive) {
                val isOpen = HardwareController.isDoorOpen()
                val now = System.currentTimeMillis()

                val newState = if (isOpen) {
                    if (doorOpenSince == null) doorOpenSince = now
                    val openDuration = now - (doorOpenSince ?: now)
                    if (openDuration > heldOpenThresholdMs) {
                        DoorState.HELD_OPEN
                    } else {
                        DoorState.OPEN
                    }
                } else {
                    doorOpenSince = null
                    DoorState.CLOSED
                }

                if (newState != lastState) {
                    _doorState.value = newState
                    lastState = newState
                    publishDoorStateEvent(newState)

                    if (newState == DoorState.HELD_OPEN) {
                        val duration = now - (doorOpenSince ?: now)
                        _alarms.emit(DoorAlarm.HeldOpen(duration))
                        publishAlarmEvent("held_open", "Door held open for ${duration / 1000}s")
                    }
                }

                delay(DOOR_MONITOR_POLL_MS)
            }
        }
    }

    private fun startTamperDetection() {
        sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
        val accel = sensorManager?.getDefaultSensor(Sensor.TYPE_ACCELEROMETER) ?: return

        tamperListener = object : SensorEventListener {
            override fun onSensorChanged(event: SensorEvent) {
                val x = event.values[0]
                val y = event.values[1]
                val z = event.values[2]
                val magnitude = Math.sqrt((x * x + y * y + z * z).toDouble()).toFloat()

                if (magnitude > TAMPER_THRESHOLD) {
                    Log.w(TAG, "Tamper detected! magnitude=$magnitude")
                    scope.launch {
                        _alarms.emit(DoorAlarm.TamperDetected(magnitude))
                        publishAlarmEvent("tamper", "Impact detected: magnitude=$magnitude")
                    }
                }
            }

            override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
        }

        sensorManager?.registerListener(tamperListener, accel, SensorManager.SENSOR_DELAY_NORMAL)
    }

    private fun stopTamperDetection() {
        tamperListener?.let { sensorManager?.unregisterListener(it) }
        tamperListener = null
    }

    private fun publishDoorStateEvent(state: DoorState) {
        val config = mqttService.getCurrentConfig() ?: return
        val envelope = JSONObject().apply {
            put("v", 1)
            put("id", UUID.randomUUID().toString())
            put("ts", System.currentTimeMillis())
            put("src", "device:${config.deviceId}")
            put("type", "door.state")
            put("data", JSONObject().apply {
                put("state", state.name.lowercase())
                put("door_id", "main-door")
            })
        }
        mqttService.publishDirect(mqttService.topicFor(config, "evt"), envelope)
    }

    private fun publishAlarmEvent(type: String, message: String) {
        val config = mqttService.getCurrentConfig() ?: return
        val envelope = JSONObject().apply {
            put("v", 1)
            put("id", UUID.randomUUID().toString())
            put("ts", System.currentTimeMillis())
            put("src", "device:${config.deviceId}")
            put("type", "alarm.triggered")
            put("data", JSONObject().apply {
                put("alarm_type", type)
                put("message", message)
                put("door_id", "main-door")
            })
        }
        mqttService.publishDirect(
            mqttService.topicFor(config, "evt"),
            envelope,
            com.hivemq.client.mqtt.datatypes.MqttQos.AT_LEAST_ONCE,
        )
    }
}
