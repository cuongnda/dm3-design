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
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.duali.dm3terminal.ui.components.*
import com.duali.dm3terminal.ui.theme.*
import java.text.SimpleDateFormat
import java.util.*

@Composable
fun FaceScanScreen(
    onResult: (granted: Boolean, personName: String, reason: String) -> Unit,
    onCancel: () -> Unit,
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

            // Face bounding box with blue corners
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
                contentAlignment = Alignment.Center,
            ) {
                Text("📷", fontSize = 48.sp)
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
