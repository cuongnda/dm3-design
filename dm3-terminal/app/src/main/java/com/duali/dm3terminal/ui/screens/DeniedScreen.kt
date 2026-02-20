package com.duali.dm3terminal.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.duali.dm3terminal.ui.theme.*
import kotlinx.coroutines.delay

@Composable
fun DeniedScreen(
    reason: String = "Face not recognized",
    onTimeout: () -> Unit,
) {
    LaunchedEffect(Unit) {
        delay(3000)
        onTimeout()
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(DM3Background)
            .background(
                Brush.radialGradient(
                    colors = listOf(DM3Red.copy(alpha = 0.2f), DM3Background.copy(alpha = 0f)),
                    radius = 800f,
                )
            ),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.padding(32.dp),
        ) {
            // Large X mark
            Text(
                text = "✕",
                color = DM3Red,
                fontSize = 96.sp,
                fontWeight = FontWeight.Bold,
            )

            Spacer(modifier = Modifier.height(16.dp))

            // ACCESS DENIED
            Text(
                text = "ACCESS DENIED",
                color = DM3Red,
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold,
            )

            Spacer(modifier = Modifier.height(12.dp))

            // Reason
            Text(
                text = reason,
                color = DM3Gray,
                fontSize = 16.sp,
                textAlign = TextAlign.Center,
            )
        }
    }
}
