package com.duali.dm3terminal.ui.screens

import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.text.style.TextAlign
import com.duali.dm3terminal.BuildConfig
import com.duali.dm3terminal.mqtt.MqttConnectionState
import com.duali.dm3terminal.ui.theme.*
import java.text.SimpleDateFormat
import java.util.*

@Composable
fun IdleScreen(
    onTap: () -> Unit,
    onLongPress: () -> Unit,
    mqttState: MqttConnectionState = MqttConnectionState.DISCONNECTED,
) {
    var currentTime by remember { mutableStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) {
            currentTime = System.currentTimeMillis()
            kotlinx.coroutines.delay(1000)
        }
    }

    val cal = Calendar.getInstance().apply { timeInMillis = currentTime }
    val timeStr = SimpleDateFormat("HH:mm", Locale.getDefault()).format(cal.time)
    val dateStr = SimpleDateFormat("EEEE, MMMM dd", Locale.ENGLISH).format(cal.time)

    // Pulse animation for the face icon ring
    val infiniteTransition = rememberInfiniteTransition(label = "ring")
    val ringScale by infiniteTransition.animateFloat(
        initialValue = 1f,
        targetValue = 1.15f,
        animationSpec = infiniteRepeatable(
            animation = tween(2000, easing = EaseInOutSine),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "ringScale",
    )
    val ringAlpha by infiniteTransition.animateFloat(
        initialValue = 0.6f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(2000, easing = EaseInOutSine),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "ringAlpha",
    )

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(DM3Background)
            .pointerInput(Unit) {
                detectTapGestures(
                    onTap = { onTap() },
                    onLongPress = { onLongPress() },
                )
            },
    ) {
        // Center content
        Column(
            modifier = Modifier
                .fillMaxSize(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            // Large clock
            Text(
                text = timeStr,
                color = DM3White,
                fontSize = 72.sp,
                fontWeight = FontWeight.Thin,
                letterSpacing = 2.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = dateStr,
                color = DM3Gray,
                fontSize = 16.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(),
            )

            Spacer(modifier = Modifier.height(48.dp))

            // Face icon with pulsing ring
            Box(contentAlignment = Alignment.Center) {
                // Outer ring (pulsing)
                Box(
                    modifier = Modifier
                        .size(100.dp)
                        .scale(ringScale)
                        .alpha(ringAlpha)
                        .clip(CircleShape)
                        .border(1.5.dp, DM3AccentBlue.copy(alpha = 0.4f), CircleShape),
                )
                // Inner ring
                Box(
                    modifier = Modifier
                        .size(84.dp)
                        .clip(CircleShape)
                        .border(2.dp, DM3AccentBlue.copy(alpha = 0.6f), CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    Text("👤", fontSize = 28.sp)
                }
            }

            Spacer(modifier = Modifier.height(20.dp))

            Text(
                text = "Face • QR Code • NFC • PIN",
                color = DM3Gray,
                fontSize = 14.sp,
            )
        }

        // Bottom-left: version + MQTT status
        Row(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(6.dp)
                    .clip(CircleShape)
                    .background(
                        when (mqttState) {
                            MqttConnectionState.CONNECTED -> DM3Green
                            MqttConnectionState.CONNECTING -> DM3Yellow
                            MqttConnectionState.DISCONNECTED -> DM3Red
                        }
                    ),
            )
            Spacer(modifier = Modifier.width(6.dp))
            Text(
                text = "v${BuildConfig.VERSION_NAME} • ${
                    when (mqttState) {
                        MqttConnectionState.CONNECTED -> "Connected"
                        MqttConnectionState.CONNECTING -> "Connecting..."
                        MqttConnectionState.DISCONNECTED -> "Disconnected"
                    }
                }",
                color = DM3GrayDark,
                fontSize = 10.sp,
            )
        }
    }
}
