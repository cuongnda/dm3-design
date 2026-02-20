package com.duali.dm3terminal.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.QrCode2
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.duali.dm3terminal.ui.components.*
import com.duali.dm3terminal.ui.theme.*
import kotlinx.coroutines.delay
import java.text.SimpleDateFormat
import java.util.*

@Composable
fun QrScanScreen(
    onResult: (granted: Boolean, personName: String, reason: String) -> Unit,
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

    // Simulate QR scan result
    LaunchedEffect(Unit) {
        delay(4000)
        onResult(true, "Cuong Nguyen", "granted_qr")
    }

    val blueCorner = DM3AccentBlue
    val purpleCorner = DM3AccentPurple

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(DM3Background),
    ) {

        Spacer(modifier = Modifier.height(8.dp))

        Box(
            modifier = Modifier
                .weight(1f)
                .padding(horizontal = 24.dp)
                .clip(RoundedCornerShape(16.dp))
                .background(DM3Surface)
                .border(1.dp, GlassCardBorder, RoundedCornerShape(16.dp)),
        ) {
            // Top bar
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(modifier = Modifier.size(8.dp).clip(CircleShape).background(DM3Red))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("IR+RGB", color = DM3Red, fontSize = 10.sp, fontWeight = FontWeight.Medium)
                }
                Spacer(modifier = Modifier.width(8.dp))
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(4.dp))
                        .background(DM3Green)
                        .padding(horizontal = 8.dp, vertical = 2.dp),
                ) {
                    Text("Face Detected", color = DM3White, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                }
                Spacer(modifier = Modifier.weight(1f))
                Text("$timeStr • $dateStr", color = DM3Gray, fontSize = 10.sp)
            }

            // Face bounding box (blue corners)
            Box(
                modifier = Modifier
                    .align(Alignment.Center)
                    .offset(x = (-20).dp)
                    .size(180.dp, 240.dp)
                    .drawBehind {
                        val cornerLen = 25f
                        val sw = 3f
                        drawLine(blueCorner, Offset(0f, 0f), Offset(cornerLen, 0f), sw)
                        drawLine(blueCorner, Offset(0f, 0f), Offset(0f, cornerLen), sw)
                        drawLine(blueCorner, Offset(size.width, 0f), Offset(size.width - cornerLen, 0f), sw)
                        drawLine(blueCorner, Offset(size.width, 0f), Offset(size.width, cornerLen), sw)
                        drawLine(blueCorner, Offset(0f, size.height), Offset(cornerLen, size.height), sw)
                        drawLine(blueCorner, Offset(0f, size.height), Offset(0f, size.height - cornerLen), sw)
                        drawLine(blueCorner, Offset(size.width, size.height), Offset(size.width - cornerLen, size.height), sw)
                        drawLine(blueCorner, Offset(size.width, size.height), Offset(size.width, size.height - cornerLen), sw)
                    },
            )

            // QR overlay box (purple corners) - bottom right area
            Column(
                modifier = Modifier
                    .align(Alignment.CenterEnd)
                    .padding(end = 30.dp, top = 40.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(4.dp))
                        .background(DM3AccentPurple)
                        .padding(horizontal = 6.dp, vertical = 2.dp),
                ) {
                    Text("QR Code", color = DM3White, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                }
                Spacer(modifier = Modifier.height(4.dp))
                Box(
                    modifier = Modifier
                        .size(80.dp)
                        .drawBehind {
                            val cornerLen = 18f
                            val sw = 3f
                            drawLine(purpleCorner, Offset(0f, 0f), Offset(cornerLen, 0f), sw)
                            drawLine(purpleCorner, Offset(0f, 0f), Offset(0f, cornerLen), sw)
                            drawLine(purpleCorner, Offset(size.width, 0f), Offset(size.width - cornerLen, 0f), sw)
                            drawLine(purpleCorner, Offset(size.width, 0f), Offset(size.width, cornerLen), sw)
                            drawLine(purpleCorner, Offset(0f, size.height), Offset(cornerLen, size.height), sw)
                            drawLine(purpleCorner, Offset(0f, size.height), Offset(0f, size.height - cornerLen), sw)
                            drawLine(purpleCorner, Offset(size.width, size.height), Offset(size.width - cornerLen, size.height), sw)
                            drawLine(purpleCorner, Offset(size.width, size.height), Offset(size.width, size.height - cornerLen), sw)
                        },
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.Default.QrCode2, contentDescription = "QR Code", tint = DM3AccentPurple.copy(alpha = 0.5f), modifier = Modifier.size(24.dp))
                }
            }

            // Bottom status
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .align(Alignment.BottomCenter)
                    .padding(12.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Verifying QR + Face...", color = DM3White, fontSize = 14.sp)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(modifier = Modifier.size(8.dp).clip(CircleShape).background(DM3AccentPurple))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("QR Detected", color = DM3AccentPurple, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                }
            }
        }

        Spacer(modifier = Modifier.height(8.dp))
    }
}
