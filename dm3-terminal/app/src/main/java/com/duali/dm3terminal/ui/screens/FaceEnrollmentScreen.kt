package com.duali.dm3terminal.ui.screens

import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.duali.dm3terminal.ui.components.*
import com.duali.dm3terminal.ui.theme.*

@Composable
fun FaceEnrollmentScreen(
    onBack: () -> Unit,
    viewModel: FaceEnrollmentViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()

    // Start enrollment with a placeholder person (in real flow, this comes from navigation args)
    LaunchedEffect(Unit) {
        if (uiState is EnrollmentUiState.Idle) {
            viewModel.startEnrollment("new-person", "New Person")
        }
    }

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

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(DM3Background),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TextButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = DM3White, modifier = Modifier.size(24.dp))
            }
            Spacer(modifier = Modifier.width(4.dp))
            Text("Face Enrollment", color = DM3White, fontSize = 18.sp, fontWeight = FontWeight.Bold)
        }

        Column(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            when (val state = uiState) {
                is EnrollmentUiState.Idle -> {
                    Text("Preparing...", color = DM3Gray, fontSize = 16.sp)
                }

                is EnrollmentUiState.Capturing -> {
                    val step = state.steps[state.currentStep]
                    val totalSteps = state.steps.size
                    val currentStep = state.currentStep + 1

                    // Dashed circle with camera placeholder
                    Box(contentAlignment = Alignment.Center) {
                        Box(
                            modifier = Modifier
                                .size(200.dp)
                                .rotate(rotation)
                                .clip(CircleShape)
                                .border(2.dp, DM3AccentBlue.copy(alpha = 0.3f), CircleShape),
                        )
                        Box(
                            modifier = Modifier
                                .size(170.dp)
                                .clip(CircleShape)
                                .border(1.dp, DM3AccentBlue.copy(alpha = 0.15f), CircleShape)
                                .background(DM3Surface.copy(alpha = 0.3f)),
                            contentAlignment = Alignment.Center,
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(50.dp)
                                    .clip(RoundedCornerShape(12.dp))
                                    .border(2.dp, DM3AccentBlue.copy(alpha = 0.3f), RoundedCornerShape(12.dp)),
                                contentAlignment = Alignment.Center,
                            ) {
                                Icon(Icons.Default.CameraAlt, contentDescription = "Camera", tint = DM3AccentBlue, modifier = Modifier.size(24.dp))
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(32.dp))

                    Text(
                        text = "Enrolling: ${state.personName}",
                        color = DM3White,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                    )

                    Spacer(modifier = Modifier.height(8.dp))

                    Text(
                        text = "Step $currentStep of $totalSteps — ${step.instruction}",
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
                                        if (i < currentStep) DM3AccentPurple
                                        else if (i == state.currentStep) DM3AccentBlue
                                        else DM3GrayDark.copy(alpha = 0.3f)
                                    ),
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(24.dp))

                    // Capture button
                    TextButton(
                        onClick = {
                            // In production, this would capture from the camera preview.
                        },
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.CameraAlt, contentDescription = null, tint = DM3AccentBlue, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("Capture", color = DM3AccentBlue, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }

                is EnrollmentUiState.Processing -> {
                    Text("Processing face...", color = DM3AccentBlue, fontSize = 18.sp)
                    Spacer(modifier = Modifier.height(8.dp))
                    Text("Step ${state.step + 1}", color = DM3Gray, fontSize = 14.sp)
                }

                is EnrollmentUiState.Error -> {
                    Icon(Icons.Default.Warning, contentDescription = "Warning", tint = DM3Yellow, modifier = Modifier.size(48.dp))
                    Spacer(modifier = Modifier.height(16.dp))
                    Text(state.message, color = DM3Red, fontSize = 16.sp, textAlign = TextAlign.Center)
                }

                is EnrollmentUiState.Complete -> {
                    Icon(Icons.Default.CheckCircle, contentDescription = "Complete", tint = DM3Green, modifier = Modifier.size(64.dp))
                    Spacer(modifier = Modifier.height(16.dp))
                    Text(
                        "Enrollment Complete!",
                        color = DM3Green,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text("All face angles captured successfully.", color = DM3Gray, fontSize = 14.sp)
                    Spacer(modifier = Modifier.height(24.dp))
                    TextButton(onClick = onBack) {
                        Text("Done", color = DM3AccentPurple, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}
