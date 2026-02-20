package com.duali.dm3terminal.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.duali.dm3terminal.ui.components.*
import com.duali.dm3terminal.ui.theme.*

@Composable
fun SettingsMenuScreen(
    onDeviceConfig: () -> Unit,
    onFaceRecognition: () -> Unit,
    onUserManagement: () -> Unit,
    onActivateDevice: () -> Unit = {},
    onAccessLogs: () -> Unit = {},
    onSyncDatabase: () -> Unit = {},
    onBack: () -> Unit,
    viewModel: AdminViewModel = hiltViewModel(),
) {
    val stats by viewModel.stats.collectAsState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(DM3Background),
    ) {
        DuallPassHeader(subtitle = "Settings")

        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp),
        ) {
            Spacer(modifier = Modifier.height(12.dp))

            // TODAY'S STATS
            GlassCard(title = "TODAY'S STATS") {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceEvenly,
                ) {
                    StatColumn("147", "Granted", DM3Green)
                    StatColumn("3", "Denied", DM3Red)
                    StatColumn("150", "Total", DM3AccentBlue)
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // MENU
            GlassCard(title = "MENU") {
                SettingsMenuItem(icon = "⚙", label = "Device Configuration", onClick = onDeviceConfig)
                CardDivider()
                SettingsMenuItem(icon = "🎭", label = "Face Recognition", onClick = onFaceRecognition)
                CardDivider()
                SettingsMenuItem(icon = "👥", label = "User Management", onClick = onUserManagement)
                CardDivider()
                SettingsMenuItem(icon = "📊", label = "Access Logs", onClick = onAccessLogs)
                CardDivider()
                SettingsMenuItem(icon = "📱", label = "Activate Device (QR)", onClick = onActivateDevice)
                CardDivider()
                SettingsMenuItem(icon = "🔄", label = "Sync Database", onClick = {
                    viewModel.seedData()
                    onSyncDatabase()
                })
                CardDivider()
                SettingsMenuItem(icon = "←", label = "Back to Authentication", onClick = onBack)
            }

            Spacer(modifier = Modifier.height(16.dp))
        }

        DuallPassFooter(leftText = "Duali Vietnam", rightText = "DUALL PASS v3.2.1")
    }
}

@Composable
private fun StatColumn(value: String, label: String, color: androidx.compose.ui.graphics.Color) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(text = value, color = color, fontSize = 32.sp, fontWeight = FontWeight.Bold)
        Text(text = label, color = DM3Gray, fontSize = 12.sp)
    }
}
