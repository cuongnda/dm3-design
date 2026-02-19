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
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.duali.dm3terminal.ui.components.*
import com.duali.dm3terminal.ui.theme.*

@Composable
fun FaceEnrollmentScreen(
    onBack: () -> Unit,
) {
    // Slow rotation animation for dashed circle
    val infiniteTransition = rememberInfiniteTransition(label = "enrollment")
    val rotation by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(10000, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "rotate",
    )

    val currentStep = 3
    val totalSteps = 5

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(DM3Background),
    ) {
        DeviceStatusBar()
        DuallPassHeader(subtitle = "Face Enrollment")

        Column(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            // Dashed circle with camera placeholder
            Box(contentAlignment = Alignment.Center) {
                // Outer dashed circle (rotating)
                Box(
                    modifier = Modifier
                        .size(200.dp)
                        .rotate(rotation)
                        .clip(CircleShape)
                        .border(
                            width = 2.dp,
                            color = DM3AccentBlue.copy(alpha = 0.3f),
                            shape = CircleShape,
                        ),
                )
                // Inner circle
                Box(
                    modifier = Modifier
                        .size(170.dp)
                        .clip(CircleShape)
                        .border(1.dp, DM3AccentBlue.copy(alpha = 0.15f), CircleShape)
                        .background(DM3Surface.copy(alpha = 0.3f)),
                    contentAlignment = Alignment.Center,
                ) {
                    // Camera icon placeholder
                    Box(
                        modifier = Modifier
                            .size(50.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .border(2.dp, DM3AccentBlue.copy(alpha = 0.3f), RoundedCornerShape(12.dp)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text("📷", fontSize = 20.sp)
                    }
                }
            }

            Spacer(modifier = Modifier.height(32.dp))

            Text(
                text = "Enrolling Face",
                color = DM3White,
                fontSize = 22.sp,
                fontWeight = FontWeight.Bold,
            )

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = "Step $currentStep of $totalSteps — Turn head slightly right",
                color = DM3AccentPurple,
                fontSize = 14.sp,
            )

            Spacer(modifier = Modifier.height(16.dp))

            // Progress bar (segments)
            Row(
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                modifier = Modifier.padding(horizontal = 64.dp),
            ) {
                repeat(totalSteps) { i ->
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .height(4.dp)
                            .clip(RoundedCornerShape(2.dp))
                            .background(
                                if (i < currentStep) DM3AccentPurple else DM3GrayDark.copy(alpha = 0.3f)
                            ),
                    )
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            Text(
                text = "Follow the on-screen instructions to capture all angles",
                color = DM3Gray,
                fontSize = 13.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(horizontal = 32.dp),
            )
        }

        DuallPassFooter(leftText = "Admin Mode")
    }
}
