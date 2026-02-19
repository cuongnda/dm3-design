package com.duali.dm3terminal.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.duali.dm3terminal.data.DeviceConfig
import com.duali.dm3terminal.data.DevicePreferences
import com.duali.dm3terminal.mqtt.MqttConnectionState
import com.duali.dm3terminal.mqtt.MqttService
import com.duali.dm3terminal.ui.components.*
import com.duali.dm3terminal.ui.theme.*
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject

@HiltViewModel
class DeviceConfigViewModel @Inject constructor(
    private val devicePreferences: DevicePreferences,
    private val mqttService: MqttService,
) : ViewModel() {
    val config = devicePreferences.config
    val mqttState = mqttService.connectionState

    fun save(config: DeviceConfig) {
        devicePreferences.save(config)
    }
}

@Composable
fun DeviceConfigScreen(
    onBack: () -> Unit,
    viewModel: DeviceConfigViewModel = hiltViewModel(),
) {
    val config by viewModel.config.collectAsStateWithLifecycle()
    val mqttState by viewModel.mqttState.collectAsStateWithLifecycle()

    var deviceId by remember(config) { mutableStateOf(config.deviceId) }
    var tenantId by remember(config) { mutableStateOf(config.tenantId) }
    var brokerUrl by remember(config) { mutableStateOf(config.mqttBrokerUrl) }
    var deviceName by remember(config) { mutableStateOf(config.deviceName) }
    var doorId by remember(config) { mutableStateOf(config.doorId) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(DM3Background),
    ) {
        DeviceStatusBar()
        DuallPassHeader(subtitle = "Device Configuration")

        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp),
        ) {
            Spacer(modifier = Modifier.height(12.dp))

            GlassCard(title = "DEVICE IDENTITY") {
                EditableRow("Device ID", deviceId) { deviceId = it }
                CardDivider()
                EditableRow("Device Name", deviceName) { deviceName = it }
                CardDivider()
                EditableRow("Door ID", doorId) { doorId = it }
                CardDivider()
                SettingsInfoRow("Model", "DF-970")
                CardDivider()
                SettingsInfoRow("Firmware", "v1.0.0")
            }

            Spacer(modifier = Modifier.height(16.dp))

            GlassCard(title = "MQTT CONNECTION") {
                EditableRow("Broker URL", brokerUrl) { brokerUrl = it }
                CardDivider()
                EditableRow("Tenant ID", tenantId) { tenantId = it }
                CardDivider()
                val statusText = when (mqttState) {
                    MqttConnectionState.CONNECTED -> "Connected"
                    MqttConnectionState.CONNECTING -> "Connecting..."
                    MqttConnectionState.DISCONNECTED -> "Disconnected"
                }
                val statusColor = when (mqttState) {
                    MqttConnectionState.CONNECTED -> DM3Green
                    MqttConnectionState.CONNECTING -> DM3Yellow
                    MqttConnectionState.DISCONNECTED -> DM3Red
                }
                SettingsInfoRow("MQTT Status", statusText, valueColor = statusColor, showDot = true, dotColor = statusColor)
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Save button
            Surface(
                onClick = {
                    viewModel.save(
                        DeviceConfig(
                            deviceId = deviceId,
                            tenantId = tenantId,
                            mqttBrokerUrl = brokerUrl,
                            deviceName = deviceName,
                            doorId = doorId,
                        )
                    )
                },
                color = DM3AccentPurple,
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(
                    text = "Save Configuration",
                    color = DM3White,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(16.dp),
                )
            }

            Spacer(modifier = Modifier.height(16.dp))
        }

        DuallPassFooter(leftText = "← Settings", rightText = "Device Config")
    }
}

@Composable
private fun EditableRow(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(text = label, color = DM3Gray, fontSize = 14.sp, modifier = Modifier.weight(0.4f))
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            textStyle = TextStyle(
                color = DM3White,
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
            ),
            cursorBrush = SolidColor(DM3AccentPurple),
            singleLine = true,
            modifier = Modifier
                .weight(0.6f)
                .background(DM3Surface, RoundedCornerShape(6.dp))
                .padding(horizontal = 8.dp, vertical = 6.dp),
        )
    }
}
