package com.duali.dm3terminal.ui.screens

import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.duali.dm3terminal.ui.components.*
import com.duali.dm3terminal.ui.theme.*

@Composable
fun NfcScreen(
    onNfcDetected: (granted: Boolean, personName: String, reason: String) -> Unit,
    onCancel: () -> Unit,
) {
    // Ripple animation
    val infiniteTransition = rememberInfiniteTransition(label = "nfcRipple")

    @Composable
    fun rippleValues(delayMs: Int): Pair<Float, Float> {
        val scale by infiniteTransition.animateFloat(
            initialValue = 1f,
            targetValue = 1.8f,
            animationSpec = infiniteRepeatable(
                animation = tween(2000, delayMillis = delayMs, easing = EaseOut),
                repeatMode = RepeatMode.Restart,
            ),
            label = "scale$delayMs",
        )
        val alpha by infiniteTransition.animateFloat(
            initialValue = 0.4f,
            targetValue = 0f,
            animationSpec = infiniteRepeatable(
                animation = tween(2000, delayMillis = delayMs, easing = EaseOut),
                repeatMode = RepeatMode.Restart,
            ),
            label = "alpha$delayMs",
        )
        return scale to alpha
    }

    val (s1, a1) = rippleValues(0)
    val (s2, a2) = rippleValues(500)
    val (s3, a3) = rippleValues(1000)

    // Simulate NFC tap after 5 seconds
    LaunchedEffect(Unit) {
        kotlinx.coroutines.delay(5000)
        onNfcDetected(true, "Cuong Nguyen", "granted_nfc")
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(DM3Background),
    ) {

        Column(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            // NFC icon with concentric ripples
            Box(contentAlignment = Alignment.Center) {
                // Ripple circles
                listOf(s1 to a1, s2 to a2, s3 to a3).forEach { (s, a) ->
                    Box(
                        modifier = Modifier
                            .size(120.dp)
                            .scale(s)
                            .alpha(a)
                            .clip(CircleShape)
                            .border(1.5.dp, DM3AccentBlue.copy(alpha = 0.3f), CircleShape),
                    )
                }
                // Static outer ring
                Box(
                    modifier = Modifier
                        .size(120.dp)
                        .clip(CircleShape)
                        .border(2.dp, DM3AccentBlue.copy(alpha = 0.2f), CircleShape)
                        .background(DM3AccentBlue.copy(alpha = 0.05f)),
                    contentAlignment = Alignment.Center,
                ) {
                    // Inner icon box
                    Box(
                        modifier = Modifier
                            .size(56.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .border(2.dp, DM3AccentBlue.copy(alpha = 0.4f), RoundedCornerShape(12.dp))
                            .background(DM3AccentBlue.copy(alpha = 0.1f)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text("📶", fontSize = 24.sp) // NFC symbol
                    }
                }
            }

            Spacer(modifier = Modifier.height(32.dp))

            Text(
                text = "Tap your card or phone",
                color = DM3White,
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold,
            )

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = "Hold near the reader for 1-2 seconds",
                color = DM3Gray,
                fontSize = 14.sp,
            )
        }

    }
}
