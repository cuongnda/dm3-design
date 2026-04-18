package com.duali.dm3terminal.ui.screens

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
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

    // Full-screen camera with overlays
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(DM3Background),
    ) {
        // Camera preview — fills entire screen
        val previewBitmap by accessControlManager?.previewBitmap?.collectAsState()
            ?: remember { mutableStateOf(null) }

        if (previewBitmap != null) {
            Image(
                bitmap = previewBitmap!!,
                contentDescription = "Camera preview",
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop,
            )
        }

        // Face bounding box corners (centered)
        Box(
            modifier = Modifier
                .align(Alignment.Center)
                .size(200.dp, 260.dp)
                .drawBehind {
                    val cornerLen = 30f
                    val strokeW = 3f
                    drawLine(blueCorner, Offset(0f, 0f), Offset(cornerLen, 0f), strokeW)
                    drawLine(blueCorner, Offset(0f, 0f), Offset(0f, cornerLen), strokeW)
                    drawLine(blueCorner, Offset(size.width, 0f), Offset(size.width - cornerLen, 0f), strokeW)
                    drawLine(blueCorner, Offset(size.width, 0f), Offset(size.width, cornerLen), strokeW)
                    drawLine(blueCorner, Offset(0f, size.height), Offset(cornerLen, size.height), strokeW)
                    drawLine(blueCorner, Offset(0f, size.height), Offset(0f, size.height - cornerLen), strokeW)
                    drawLine(blueCorner, Offset(size.width, size.height), Offset(size.width - cornerLen, size.height), strokeW)
                    drawLine(blueCorner, Offset(size.width, size.height), Offset(size.width, size.height - cornerLen), strokeW)
                },
        )

        // Top gradient overlay with status
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(80.dp)
                .align(Alignment.TopCenter)
                .background(
                    Brush.verticalGradient(
                        colors = listOf(Color.Black.copy(alpha = 0.7f), Color.Transparent)
                    )
                ),
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                // Recording indicator
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

                Text("$timeStr • $dateStr", color = DM3White.copy(alpha = 0.8f), fontSize = 11.sp)
            }
        }

        // Bottom gradient overlay with status
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(80.dp)
                .align(Alignment.BottomCenter)
                .background(
                    Brush.verticalGradient(
                        colors = listOf(Color.Transparent, Color.Black.copy(alpha = 0.7f))
                    )
                ),
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .align(Alignment.BottomCenter)
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Verifying identity...", color = DM3White, fontSize = 14.sp)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(8.dp)
                            .clip(CircleShape)
                            .background(DM3AccentBlue),
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("Matching", color = DM3AccentBlue, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                }
            }
        }
    }
}
