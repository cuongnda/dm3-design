package com.duali.dm3terminal.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.duali.dm3terminal.ui.components.*
import com.duali.dm3terminal.ui.theme.*

@Composable
fun FaceRecognitionSettingsScreen(
    onBack: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(DM3Background),
    ) {
        DeviceStatusBar()
        DuallPassHeader(subtitle = "Face Recognition")

        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp),
        ) {
            Spacer(modifier = Modifier.height(12.dp))

            GlassCard(title = "RECOGNITION SETTINGS") {
                SettingsInfoRow("Match Threshold", "85%", valueColor = DM3AccentPurple)
                CardDivider()
                SettingsInfoRow("Liveness Detection", "Enabled", valueColor = DM3Green, showDot = true)
                CardDivider()
                SettingsInfoRow("IR Anti-Spoofing", "Enabled", valueColor = DM3Green, showDot = true)
                CardDivider()
                SettingsInfoRow("Max Distance", "1.5 m")
                CardDivider()
                SettingsInfoRow("Recognition Speed", "< 0.5s")
            }

            Spacer(modifier = Modifier.height(16.dp))

            GlassCard(title = "CAMERA") {
                SettingsInfoRow("RGB Camera", "Active", valueColor = DM3Green, showDot = true)
                CardDivider()
                SettingsInfoRow("IR Camera", "Active", valueColor = DM3Green, showDot = true)
                CardDivider()
                SettingsInfoRow("Resolution", "1080p")
                CardDivider()
                SettingsInfoRow("Frame Rate", "30 fps")
                CardDivider()
                SettingsInfoRow("Night Mode", "Auto")
            }

            Spacer(modifier = Modifier.height(16.dp))

            GlassCard(title = "AUTHENTICATION MODE") {
                SettingsInfoRow("Face Only", "Enabled", valueColor = DM3Green, showDot = true)
            }

            Spacer(modifier = Modifier.height(16.dp))
        }

        DuallPassFooter(leftText = "← Settings", rightText = "Face Recognition")
    }
}
