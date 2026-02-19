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
fun DeviceConfigScreen(
    onBack: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(DM3Background),
    ) {
        DeviceStatusBar()
        DuallPassHeader(subtitle = "Device Configuration")

        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp),
        ) {
            Spacer(modifier = Modifier.height(12.dp))

            GlassCard(title = "DEVICE IDENTITY") {
                SettingsInfoRow("Device ID", "DL-LOBBY-A01")
                CardDivider()
                SettingsInfoRow("Device Name", "Lobby A Gate 1")
                CardDivider()
                SettingsInfoRow("Model", "DF-970")
                CardDivider()
                SettingsInfoRow("Serial No.", "DL240001")
                CardDivider()
                SettingsInfoRow("Firmware", "v3.2.1")
            }

            Spacer(modifier = Modifier.height(16.dp))

            GlassCard(title = "SERVER CONNECTION") {
                SettingsInfoRow("Server URL", "app.dualimaster.com")
                CardDivider()
                SettingsInfoRow("Status", "Connected", valueColor = DM3Green, showDot = true, dotColor = DM3Green)
                CardDivider()
                SettingsInfoRow("Last Sync", "2 min ago")
                CardDivider()
                SettingsInfoRow("Protocol", "HTTPS / MQTT")
            }

            Spacer(modifier = Modifier.height(16.dp))

            GlassCard(title = "GENERAL") {
                SettingsInfoRow("Language", "English 🇬🇧")
                CardDivider()
                SettingsInfoRow("Timezone", "GMT+7")
            }

            Spacer(modifier = Modifier.height(16.dp))
        }

        DuallPassFooter(leftText = "← Settings", rightText = "Device Config")
    }
}
