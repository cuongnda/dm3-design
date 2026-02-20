package com.duali.dm3terminal.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material.icons.outlined.Face
import androidx.compose.material.icons.automirrored.outlined.List
import androidx.compose.material.icons.outlined.People
import androidx.compose.material.icons.outlined.QrCode2
import androidx.compose.material.icons.outlined.BugReport
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.duali.dm3terminal.BuildConfig
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
    val deviceConfig by viewModel.deviceConfig.collectAsState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(DM3Background),
    ) {
        // Simple header
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
            Text("Settings", color = DM3White, fontSize = 18.sp, fontWeight = FontWeight.Bold)
        }

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
                SettingsMenuItem(icon = Icons.Outlined.Settings, label = "Device Configuration", onClick = onDeviceConfig)
                CardDivider()
                SettingsMenuItem(icon = Icons.Outlined.Face, label = "Face Recognition", onClick = onFaceRecognition)
                CardDivider()
                SettingsMenuItem(icon = Icons.Outlined.People, label = "User Management", onClick = onUserManagement)
                CardDivider()
                SettingsMenuItem(icon = Icons.AutoMirrored.Outlined.List, label = "Access Logs", onClick = onAccessLogs)
                CardDivider()
                SettingsMenuItem(icon = Icons.Outlined.QrCode2, label = "Activate Device", onClick = onActivateDevice)
                CardDivider()
                SettingsMenuItem(icon = Icons.Default.Sync, label = "Sync Database", onClick = {
                    viewModel.seedData()
                    onSyncDatabase()
                })
                CardDivider()
                SettingsMenuItem(icon = Icons.AutoMirrored.Filled.ArrowBack, label = "Back to Authentication", onClick = onBack)
            }

            Spacer(modifier = Modifier.height(16.dp))

            // DEBUG
            GlassCard(title = "DEVELOPER") {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Outlined.BugReport, contentDescription = null, tint = DM3Gray, modifier = Modifier.size(20.dp))
                    Spacer(modifier = Modifier.width(12.dp))
                    Text("Debug Overlay", color = DM3White, fontSize = 14.sp, modifier = Modifier.weight(1f))
                    Switch(
                        checked = deviceConfig.debugOverlay,
                        onCheckedChange = { viewModel.toggleDebugOverlay() },
                        colors = SwitchDefaults.colors(
                            checkedThumbColor = DM3AccentBlue,
                            checkedTrackColor = DM3AccentBlue.copy(alpha = 0.3f),
                            uncheckedThumbColor = DM3Gray,
                            uncheckedTrackColor = DM3GrayDark,
                        ),
                    )
                }
            }

            Spacer(modifier = Modifier.height(16.dp))
        }

        // Simple footer
        Text(
            text = "v${BuildConfig.VERSION_NAME}",
            color = DM3GrayDark,
            fontSize = 12.sp,
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 8.dp),
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
        )
    }
}

@Composable
private fun StatColumn(value: String, label: String, color: androidx.compose.ui.graphics.Color) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(text = value, color = color, fontSize = 32.sp, fontWeight = FontWeight.Bold)
        Text(text = label, color = DM3Gray, fontSize = 12.sp)
    }
}
