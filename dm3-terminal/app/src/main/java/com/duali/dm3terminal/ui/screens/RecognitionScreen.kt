package com.duali.dm3terminal.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.duali.dm3terminal.ui.theme.*
import kotlinx.coroutines.delay

@Composable
fun RecognitionScreen(
    onResult: (granted: Boolean, personName: String, reason: String) -> Unit,
    onCancel: () -> Unit,
    viewModel: RecognitionViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()

    // Auto-timeout after 10s — simulate a recognition for demo
    LaunchedEffect(Unit) {
        delay(3000) // Simulate recognition delay
        viewModel.simulateRecognition()
    }

    LaunchedEffect(uiState) {
        if (uiState is RecognitionUiState.Result) {
            val result = uiState as RecognitionUiState.Result
            onResult(result.granted, result.personName, result.reason)
        }
    }

    // Timeout fallback
    LaunchedEffect(Unit) {
        delay(10_000)
        if (uiState is RecognitionUiState.Scanning) {
            onCancel()
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(DM3Background),
    ) {
        Column(
            modifier = Modifier.fillMaxSize(),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(modifier = Modifier.height(24.dp))

            // Camera preview placeholder (70% of screen)
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(0.7f)
                    .padding(horizontal = 16.dp)
                    .background(DM3Surface, RoundedCornerShape(12.dp))
                    .border(1.dp, DM3Gray.copy(alpha = 0.3f), RoundedCornerShape(12.dp)),
                contentAlignment = Alignment.Center,
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        text = "📷",
                        fontSize = 48.sp,
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "Camera Preview",
                        color = DM3Gray,
                        fontSize = 16.sp,
                    )
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Status
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center,
            ) {
                CircularProgressIndicator(
                    modifier = Modifier.size(24.dp),
                    color = DM3AccentBlue,
                    strokeWidth = 3.dp,
                )
                Spacer(modifier = Modifier.width(12.dp))
                Text(
                    text = "Đang nhận dạng...",
                    color = DM3White,
                    fontSize = 20.sp,
                )
            }

            Spacer(modifier = Modifier.height(24.dp))

            // Cancel button
            Button(
                onClick = onCancel,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 32.dp)
                    .height(56.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = DM3Surface,
                    contentColor = DM3White,
                ),
                shape = RoundedCornerShape(12.dp),
            ) {
                Text(text = "Huỷ", fontSize = 18.sp)
            }

            Spacer(modifier = Modifier.height(24.dp))
        }
    }
}
