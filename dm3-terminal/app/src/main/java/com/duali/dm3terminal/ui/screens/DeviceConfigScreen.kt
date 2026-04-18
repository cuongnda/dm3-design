package com.duali.dm3terminal.ui.screens

import android.util.Log
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.HourglassEmpty
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.duali.dm3terminal.data.DeviceConfig
import com.duali.dm3terminal.data.DeviceCredentials
import com.duali.dm3terminal.data.DevicePreferences
import com.duali.dm3terminal.data.ProvisioningCredentials
import com.duali.dm3terminal.mqtt.MqttConnectionState
import com.duali.dm3terminal.mqtt.MqttService
import com.duali.dm3terminal.ui.components.*
import com.duali.dm3terminal.ui.theme.*
import com.duali.dm3terminal.util.HardwareFingerprint
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import com.hivemq.client.mqtt.MqttClient
import com.hivemq.client.mqtt.datatypes.MqttQos
import com.hivemq.client.mqtt.mqtt5.Mqtt5AsyncClient
import com.hivemq.client.mqtt.mqtt5.message.connect.Mqtt5Connect
import org.json.JSONObject
import java.net.URI
import java.util.UUID
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec
import javax.inject.Inject

sealed class BootstrapState {
    data object Idle : BootstrapState()
    data object Connecting : BootstrapState()
    data object WaitingApproval : BootstrapState()
    data class Approved(val companyName: String) : BootstrapState()
    data class Rejected(val message: String) : BootstrapState()
    data class Error(val message: String) : BootstrapState()
}

@HiltViewModel
class DeviceConfigViewModel @Inject constructor(
    @ApplicationContext private val appContext: android.content.Context,
    private val devicePreferences: DevicePreferences,
    private val mqttService: MqttService,
    private val provisioningCredentials: ProvisioningCredentials,
) : ViewModel() {
    companion object {
        private const val TAG = "DeviceConfigVM"
        private const val BOOTSTRAP_SECRET = "dm3-bootstrap-v1-dev-secret"
    }

    val config = devicePreferences.config
    val mqttState = mqttService.connectionState

    private val _bootstrapState = MutableStateFlow<BootstrapState>(BootstrapState.Idle)
    val bootstrapState: StateFlow<BootstrapState> = _bootstrapState.asStateFlow()

    private var bootstrapClient: Mqtt5AsyncClient? = null

    fun save(config: DeviceConfig) {
        devicePreferences.save(config)
    }

    fun startBootstrapRegistration() {
        val cfg = config.value
        val rid = cfg.deviceId
        val brokerUrl = cfg.mqttBrokerUrl

        _bootstrapState.value = BootstrapState.Connecting

        viewModelScope.launch(kotlinx.coroutines.Dispatchers.IO) {
            try {
                val timestampMinute = System.currentTimeMillis() / 60000
                val hmacInput = "$rid:$timestampMinute"
                val password = hmacSha256(hmacInput, BOOTSTRAP_SECRET)

                val uri = URI(brokerUrl.replace("tcp://", "http://"))
                val host = uri.host ?: "127.0.0.1"
                val port = if (uri.port > 0) uri.port else 1884
                val clientId = "dm3-bootstrap-$rid-${System.currentTimeMillis() % 10000}"

                val client = MqttClient.builder()
                    .useMqttVersion5()
                    .identifier(clientId)
                    .serverHost(host)
                    .serverPort(port)
                    .buildAsync()

                val responseTopic = "dm/bootstrap/$rid/response"

                // Subscribe to response topic before connecting
                val connectMsg = Mqtt5Connect.builder()
                    .cleanStart(true)
                    .keepAlive(60)
                    .simpleAuth()
                        .username("bootstrap:$rid")
                        .password(password.toByteArray())
                        .applySimpleAuth()
                    .build()

                client.connect(connectMsg).get()
                bootstrapClient = client

                // Subscribe to response topic
                client.subscribeWith()
                    .topicFilter(responseTopic)
                    .qos(MqttQos.AT_LEAST_ONCE)
                    .callback { publish ->
                        val payload = publish.payloadAsBytes?.let { String(it) } ?: return@callback
                        handleBootstrapResponse(publish.topic.toString(), payload)
                    }
                    .send()
                    .get()

                // Build registration payload
                val fingerprint = HardwareFingerprint.toJson(appContext)
                val nonce = UUID.randomUUID().toString()
                val timestamp = System.currentTimeMillis() / 1000

                val payload = JSONObject().apply {
                    put("type", "device.register")
                    put("rid", rid)
                    put("device_type", "terminal")
                    put("firmware_version", HardwareFingerprint.getFirmwareVersion(appContext))
                    put("hardware_fingerprint", fingerprint)
                    put("timestamp", timestamp)
                    put("nonce", nonce)
                }
                payload.put("hmac", hmacSha256(payload.toString(), BOOTSTRAP_SECRET))

                client.publishWith()
                    .topic("dm/bootstrap/register")
                    .payload(payload.toString().toByteArray())
                    .qos(MqttQos.AT_LEAST_ONCE)
                    .send()
                    .get()

                _bootstrapState.value = BootstrapState.WaitingApproval
                Log.i(TAG, "Bootstrap registration sent for RID=$rid")

            } catch (e: Exception) {
                Log.e(TAG, "Bootstrap registration failed", e)
                _bootstrapState.value = BootstrapState.Error(e.message ?: "Connection failed")
            }
        }
    }

    private fun handleBootstrapResponse(topic: String, payload: String) {
        try {
            val json = JSONObject(payload)
            val type = json.optString("type")
            Log.i(TAG, "Bootstrap response: $type")

            when (type) {
                "device.register_ack" -> {
                    _bootstrapState.value = BootstrapState.WaitingApproval
                }
                "device.approved" -> {
                    val creds = json.getJSONObject("credentials")
                    val company = json.getJSONObject("company")

                    provisioningCredentials.save(
                        DeviceCredentials(
                            mqttBrokerUrl = config.value.mqttBrokerUrl,
                            mqttUsername = creds.optString("mqtt_username"),
                            mqttToken = creds.optString("mqtt_token"),
                            tokenExpiresAt = creds.optString("token_expires_at"),
                            refreshUrl = creds.optString("refresh_url"),
                            companyId = company.optString("id"),
                            companyName = company.optString("name"),
                            companyCode = company.optString("code", ""),
                            isProvisioned = true,
                        )
                    )

                    _bootstrapState.value = BootstrapState.Approved(company.optString("name"))
                    disconnectBootstrap()
                }
                "device.rejected" -> {
                    _bootstrapState.value = BootstrapState.Rejected(
                        json.optString("message", "Registration rejected")
                    )
                    disconnectBootstrap()
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to parse bootstrap response", e)
        }
    }

    private fun disconnectBootstrap() {
        try { bootstrapClient?.disconnect() } catch (_: Exception) {}
        bootstrapClient = null
    }

    fun resetBootstrap() {
        disconnectBootstrap()
        _bootstrapState.value = BootstrapState.Idle
    }

    private fun hmacSha256(data: String, secret: String): String {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(secret.toByteArray(), "HmacSHA256"))
        return mac.doFinal(data.toByteArray()).joinToString("") { String.format("%02x", it) }
    }

    override fun onCleared() {
        super.onCleared()
        disconnectBootstrap()
    }
}

@Composable
fun DeviceConfigScreen(
    onBack: () -> Unit,
    viewModel: DeviceConfigViewModel = hiltViewModel(),
) {
    val config by viewModel.config.collectAsStateWithLifecycle()
    val mqttState by viewModel.mqttState.collectAsStateWithLifecycle()
    val bootstrapState by viewModel.bootstrapState.collectAsStateWithLifecycle()

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
        // Simple header
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            androidx.compose.material3.TextButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = DM3White, modifier = Modifier.size(24.dp))
            }
            Spacer(modifier = Modifier.width(4.dp))
            Text("Device Configuration", color = DM3White, fontSize = 18.sp, fontWeight = FontWeight.Bold)
        }

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

            // Bootstrap Registration
            GlassCard(title = "BOOTSTRAP REGISTRATION") {
                when (val bs = bootstrapState) {
                    is BootstrapState.Idle -> {
                        Text(
                            text = "Register this device via MQTT bootstrap. The admin will need to approve.",
                            color = DM3Gray,
                            fontSize = 14.sp,
                        )
                        Spacer(modifier = Modifier.height(12.dp))
                        Surface(
                            onClick = { viewModel.startBootstrapRegistration() },
                            color = DM3AccentPurple,
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text(
                                text = "Register Device",
                                color = DM3White,
                                fontSize = 16.sp,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(16.dp),
                                textAlign = TextAlign.Center,
                            )
                        }
                    }
                    is BootstrapState.Connecting -> {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            CircularProgressIndicator(
                                color = DM3AccentPurple,
                                modifier = Modifier.size(20.dp),
                                strokeWidth = 2.dp,
                            )
                            Spacer(modifier = Modifier.width(12.dp))
                            Text("Connecting to bootstrap...", color = DM3White, fontSize = 14.sp)
                        }
                    }
                    is BootstrapState.WaitingApproval -> {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            CircularProgressIndicator(
                                color = DM3Yellow,
                                modifier = Modifier.size(20.dp),
                                strokeWidth = 2.dp,
                            )
                            Spacer(modifier = Modifier.width(12.dp))
                            Icon(Icons.Default.HourglassEmpty, contentDescription = null, tint = DM3Yellow, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("Waiting for approval...", color = DM3Yellow, fontSize = 14.sp)
                        }
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = "Ask your admin to approve this device in the management portal.",
                            color = DM3Gray,
                            fontSize = 12.sp,
                        )
                    }
                    is BootstrapState.Approved -> {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.CheckCircle, contentDescription = null, tint = DM3Green, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("Approved — ${bs.companyName}", color = DM3Green, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                        }
                        Spacer(modifier = Modifier.height(8.dp))
                        Text("Device credentials stored. Reconnecting...", color = DM3Gray, fontSize = 12.sp)
                    }
                    is BootstrapState.Rejected -> {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.Cancel, contentDescription = null, tint = DM3Red, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("Registration rejected", color = DM3Red, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                        }
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(bs.message, color = DM3Gray, fontSize = 12.sp)
                        Spacer(modifier = Modifier.height(12.dp))
                        Surface(
                            onClick = { viewModel.resetBootstrap() },
                            color = DM3AccentPurple,
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text(
                                text = "Try Again",
                                color = DM3White,
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(12.dp),
                                textAlign = TextAlign.Center,
                            )
                        }
                    }
                    is BootstrapState.Error -> {
                        Text("Error: ${bs.message}", color = DM3Red, fontSize = 14.sp)
                        Spacer(modifier = Modifier.height(12.dp))
                        Surface(
                            onClick = { viewModel.resetBootstrap() },
                            color = DM3AccentPurple,
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text(
                                text = "Try Again",
                                color = DM3White,
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(12.dp),
                                textAlign = TextAlign.Center,
                            )
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))
        }
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
