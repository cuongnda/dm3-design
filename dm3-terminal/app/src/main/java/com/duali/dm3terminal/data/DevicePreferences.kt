package com.duali.dm3terminal.data

import android.content.Context
import android.content.SharedPreferences
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

data class DeviceConfig(
    val deviceId: String = "000001",
    val tenantId: String = "00000000-0000-0000-0000-000000000001",
    val mqttBrokerUrl: String = "tcp://127.0.0.1:1884",
    val deviceName: String = "Lobby A Gate 1",
    val doorId: String = "door-001",
    val debugOverlay: Boolean = false,
)

@Singleton
class DevicePreferences @Inject constructor(
    @ApplicationContext context: Context,
) {
    private val prefs: SharedPreferences =
        context.getSharedPreferences("dm3_device", Context.MODE_PRIVATE)

    private val _config = MutableStateFlow(load())
    val config: StateFlow<DeviceConfig> = _config.asStateFlow()

    private fun load(): DeviceConfig = DeviceConfig(
        deviceId = prefs.getString("device_id", "000001") ?: "000001",
        tenantId = prefs.getString("tenant_id", "00000000-0000-0000-0000-000000000001")
            ?: "00000000-0000-0000-0000-000000000001",
        mqttBrokerUrl = prefs.getString("mqtt_broker_url", "tcp://127.0.0.1:1884")
            ?: "tcp://127.0.0.1:1884",
        deviceName = prefs.getString("device_name", "Lobby A Gate 1") ?: "Lobby A Gate 1",
        doorId = prefs.getString("door_id", "door-001") ?: "door-001",
        debugOverlay = prefs.getBoolean("debug_overlay", false),
    )

    fun save(config: DeviceConfig) {
        prefs.edit()
            .putString("device_id", config.deviceId)
            .putString("tenant_id", config.tenantId)
            .putString("mqtt_broker_url", config.mqttBrokerUrl)
            .putString("device_name", config.deviceName)
            .putString("door_id", config.doorId)
            .putBoolean("debug_overlay", config.debugOverlay)
            .apply()
        _config.value = config
    }
}
