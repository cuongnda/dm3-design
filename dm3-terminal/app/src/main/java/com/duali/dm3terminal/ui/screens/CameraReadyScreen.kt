package com.duali.dm3terminal.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.duali.dm3terminal.ui.components.*
import com.duali.dm3terminal.ui.theme.*
import kotlinx.coroutines.delay
import java.text.SimpleDateFormat
import java.util.*

@Composable
fun CameraReadyScreen(
    onFaceDetected: () -> Unit,
    onCancel: () -> Unit,
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
    val dateStr = SimpleDateFormat("EEE, MMM dd", Locale.ENGLISH).format(cal.time)

    // Auto-transition to face scan after 2s (simulating face detection)
    LaunchedEffect(Unit) {
        delay(2500)
        onFaceDetected()
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(DM3Background),
    ) {
        DeviceStatusBar()

        Spacer(modifier = Modifier.height(8.dp))

        // Camera preview card
        Box(
            modifier = Modifier
                .weight(1f)
                .padding(horizontal = 24.dp)
                .clip(RoundedCornerShape(16.dp))
                .background(DM3Surface)
                .border(1.dp, GlassCardBorder, RoundedCornerShape(16.dp)),
        ) {
            // Top bar inside camera
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(12.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(8.dp)
                            .clip(androidx.compose.foundation.shape.CircleShape)
                            .background(DM3Red),
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("IR+RGB", color = DM3Red, fontSize = 12.sp, fontWeight = FontWeight.Medium)
                }
                Text(
                    text = "$timeStr • $dateStr",
                    color = DM3Gray,
                    fontSize = 12.sp,
                )
            }

            // Center content
            Column(
                modifier = Modifier.align(Alignment.Center),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text("👤", fontSize = 32.sp)
                Spacer(modifier = Modifier.height(12.dp))
                Text(
                    text = "Step forward to check in",
                    color = DM3White,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "Face or QR code • Camera is ready",
                    color = DM3Gray,
                    fontSize = 13.sp,
                )
            }

            // Bottom bar inside camera
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .align(Alignment.BottomCenter)
                    .padding(12.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text("Lobby A • Gate 1", color = DM3Gray, fontSize = 11.sp)
                Text("DUALL PASS", color = DM3Gray, fontSize = 11.sp)
            }
        }

        Spacer(modifier = Modifier.height(8.dp))
        DuallPassFooter(leftText = "Lobby A • Gate 1")
    }
}
