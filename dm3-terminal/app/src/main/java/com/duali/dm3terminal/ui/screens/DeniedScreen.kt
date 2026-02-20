package com.duali.dm3terminal.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.duali.dm3terminal.ui.components.*
import com.duali.dm3terminal.ui.theme.*
import kotlinx.coroutines.delay
import java.text.SimpleDateFormat
import java.util.*

@Composable
fun DeniedScreen(
    reason: String = "Face not recognized",
    onTimeout: () -> Unit,
) {
    LaunchedEffect(Unit) {
        delay(3000)
        onTimeout()
    }

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
    val logId = SimpleDateFormat("yyyyMMdd-HHmm", Locale.getDefault()).format(cal.time)

    // Red glow background
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(DM3Background)
            .background(
                Brush.radialGradient(
                    colors = listOf(DM3Red.copy(alpha = 0.15f), DM3Background.copy(alpha = 0f)),
                    radius = 600f,
                )
            ),
    ) {
        Column(modifier = Modifier.fillMaxSize()) {

            Spacer(modifier = Modifier.height(8.dp))

            // Camera card with red border
            Box(
                modifier = Modifier
                    .weight(1f)
                    .padding(horizontal = 24.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .background(DM3Surface)
                    .border(2.dp, DM3Red, RoundedCornerShape(16.dp)),
            ) {
                // Top bar
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("✗", color = DM3Red, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("DENIED", color = DM3Red, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                    Spacer(modifier = Modifier.width(8.dp))
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(4.dp))
                            .background(DM3Red)
                            .padding(horizontal = 8.dp, vertical = 2.dp),
                    ) {
                        Text("Unknown", color = DM3White, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    }
                    Spacer(modifier = Modifier.weight(1f))
                    Text("$timeStr • $dateStr", color = DM3Gray, fontSize = 11.sp)
                }

                // Camera placeholder
                Box(
                    modifier = Modifier
                        .align(Alignment.Center)
                        .padding(top = 20.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text("📷", fontSize = 64.sp)
                }

                // Bottom denied card
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .align(Alignment.BottomCenter)
                        .clip(RoundedCornerShape(bottomStart = 14.dp, bottomEnd = 14.dp))
                        .background(DM3Red.copy(alpha = 0.85f))
                        .padding(16.dp),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(40.dp)
                                .clip(CircleShape)
                                .background(DM3White.copy(alpha = 0.2f)),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text("✕", color = DM3White, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                        }
                        Spacer(modifier = Modifier.width(12.dp))
                        Column {
                            Text("Access Denied", color = DM3White, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                            Text(reason, color = DM3White.copy(alpha = 0.8f), fontSize = 13.sp)
                            Text("⚠ Security alert logged", color = DM3White.copy(alpha = 0.6f), fontSize = 12.sp)
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(8.dp))
        }
    }
}
