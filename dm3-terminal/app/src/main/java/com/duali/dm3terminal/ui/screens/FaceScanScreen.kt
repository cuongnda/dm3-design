package com.duali.dm3terminal.ui.screens

import androidx.compose.foundation.Image
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
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.duali.dm3terminal.hardware.AccessControlManager
import com.duali.dm3terminal.ui.components.*
import com.duali.dm3terminal.ui.theme.*
import java.text.SimpleDateFormat
import java.util.*

@Composable
fun FaceScanScreen(
    onResult: (granted: Boolean, personName: String, reason: String) -> Unit,
    onCancel: () -> Unit,
    accessControlManager: AccessControlManager? = null,
    viewModel: RecognitionViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()

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

    // React to recognition results
    LaunchedEffect(uiState) {
        when (val state = uiState) {
            is RecognitionUiState.Granted -> {
                onResult(true, state.personName, "authorized")
            }
            is RecognitionUiState.Denied -> {
                onResult(false, "", state.reason)
            }
            else -> {}
        }
    }

    // Timeout fallback
    LaunchedEffect(Unit) {
        kotlinx.coroutines.delay(10_000)
        if (uiState is RecognitionUiState.Scanning || uiState is RecognitionUiState.FaceDetected || uiState is RecognitionUiState.Idle) {
            onCancel()
        }
    }

    val blueCorner = DM3AccentBlue

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(DM3Background),
    ) {
        DeviceStatusBar()

        Spacer(modifier = Modifier.height(8.dp))

        // Camera card
        Box(
            modifier = Modifier
                .weight(1f)
                .padding(horizontal = 24.dp)
                .clip(RoundedCornerShape(16.dp))
                .background(DM3Surface)
                .border(1.dp, GlassCardBorder, RoundedCornerShape(16.dp)),
        ) {
            // Top info bar
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(8.dp)
                            .clip(CircleShape)
                            .background(DM3Red),
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("IR+RGB", color = DM3Red, fontSize = 11.sp, fontWeight = FontWeight.Medium)
                }

                Spacer(modifier = Modifier.width(8.dp))

                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(4.dp))
                        .background(DM3Green)
                        .padding(horizontal = 8.dp, vertical = 2.dp),
                ) {
                    Text("Face Detected", color = DM3White, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                }

                Spacer(modifier = Modifier.weight(1f))

                Text("$timeStr • $dateStr", color = DM3Gray, fontSize = 11.sp)
            }

            // Live camera preview with face bounding box corners
            Box(
                modifier = Modifier
                    .align(Alignment.Center)
                    .fillMaxWidth()
                    .aspectRatio(720f / 1280f) // Portrait aspect (camera is 1280x720 landscape, rotated 270)
                    .padding(horizontal = 16.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .drawBehind {
                        val cornerLen = 30f
                        val strokeW = 3f
                        val cx = size.width / 2; val cy = size.height / 2
                        val bw = size.width * 0.55f; val bh = size.height * 0.45f
                        val l = cx - bw / 2; val t = cy - bh / 2; val r = cx + bw / 2; val b = cy + bh / 2
                        drawLine(blueCorner, Offset(l, t), Offset(l + cornerLen, t), strokeW)
                        drawLine(blueCorner, Offset(l, t), Offset(l, t + cornerLen), strokeW)
                        drawLine(blueCorner, Offset(r, t), Offset(r - cornerLen, t), strokeW)
                        drawLine(blueCorner, Offset(r, t), Offset(r, t + cornerLen), strokeW)
                        drawLine(blueCorner, Offset(l, b), Offset(l + cornerLen, b), strokeW)
                        drawLine(blueCorner, Offset(l, b), Offset(l, b - cornerLen), strokeW)
                        drawLine(blueCorner, Offset(r, b), Offset(r - cornerLen, b), strokeW)
                        drawLine(blueCorner, Offset(r, b), Offset(r, b - cornerLen), strokeW)
                    },
            ) {
                // Software-rendered camera preview (hardware SurfaceView causes kernel panic on DF-970)
                val previewBitmap by accessControlManager?.previewBitmap?.collectAsState()
                    ?: remember { mutableStateOf(null) }
                if (previewBitmap != null) {
                    androidx.compose.foundation.Image(
                        bitmap = previewBitmap!!,
                        contentDescription = "Camera preview",
                        modifier = Modifier.fillMaxSize(),
                        contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                    )
                } else {
                    Box(
                        modifier = Modifier.fillMaxSize().background(DM3Background),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text("📷", fontSize = 48.sp)
                    }
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
                Text("Verifying identity...", color = DM3White, fontSize = 13.sp)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(8.dp)
                            .clip(CircleShape)
                            .background(DM3AccentBlue),
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("Matching", color = DM3AccentBlue, fontSize = 13.sp, fontWeight = FontWeight.Medium)
                }
            }
        }

        Spacer(modifier = Modifier.height(8.dp))
        DuallPassFooter(leftText = "Lobby A • Gate 1")
    }
}
