package com.duali.dm3terminal.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.Icon
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.text.font.FontWeight
import androidx.hilt.navigation.compose.hiltViewModel
import com.duali.dm3terminal.ui.components.*
import com.duali.dm3terminal.ui.theme.*

@Composable
fun FaceRecognitionSettingsScreen(
    onBack: () -> Unit,
    viewModel: FaceRecognitionSettingsViewModel = hiltViewModel(),
) {
    val config by viewModel.config.collectAsState()
    val saved by viewModel.saved.collectAsState()

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
            Text("Face Recognition", color = DM3White, fontSize = 18.sp, fontWeight = FontWeight.Bold)
        }

        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp),
        ) {
            Spacer(modifier = Modifier.height(12.dp))

            GlassCard(title = "RECOGNITION SETTINGS") {
                // Match threshold slider
                Row(
                    modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("Match Threshold", color = DM3White, fontSize = 14.sp)
                    Text("${config.matchThreshold.toInt()}%", color = DM3AccentPurple, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                }
                Slider(
                    value = config.matchThreshold,
                    onValueChange = { viewModel.updateThreshold(it) },
                    valueRange = 50f..100f,
                    modifier = Modifier.fillMaxWidth(),
                    colors = SliderDefaults.colors(
                        thumbColor = DM3AccentPurple,
                        activeTrackColor = DM3AccentPurple,
                    ),
                )

                CardDivider()

                // Liveness toggle
                Row(
                    modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("Liveness Detection", color = DM3White, fontSize = 14.sp)
                    Switch(
                        checked = config.livenessEnabled,
                        onCheckedChange = { viewModel.updateLivenessEnabled(it) },
                        colors = SwitchDefaults.colors(
                            checkedThumbColor = DM3Green,
                            checkedTrackColor = DM3Green.copy(alpha = 0.3f),
                        ),
                    )
                }

                if (config.livenessEnabled) {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text("Liveness Threshold", color = DM3Gray, fontSize = 14.sp)
                        Text("${config.livenessThreshold.toInt()}%", color = DM3AccentBlue, fontSize = 14.sp)
                    }
                    Slider(
                        value = config.livenessThreshold,
                        onValueChange = { viewModel.updateLivenessThreshold(it) },
                        valueRange = 50f..100f,
                        modifier = Modifier.fillMaxWidth(),
                        colors = SliderDefaults.colors(
                            thumbColor = DM3AccentBlue,
                            activeTrackColor = DM3AccentBlue,
                        ),
                    )
                }

                CardDivider()

                // Cooldown
                Row(
                    modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("Cooldown Period", color = DM3White, fontSize = 14.sp)
                    Text("${config.cooldownMs / 1000}s", color = DM3AccentBlue, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                }
                Slider(
                    value = (config.cooldownMs / 1000f),
                    onValueChange = { viewModel.updateCooldown((it * 1000).toLong()) },
                    valueRange = 1f..30f,
                    modifier = Modifier.fillMaxWidth(),
                    colors = SliderDefaults.colors(
                        thumbColor = DM3AccentBlue,
                        activeTrackColor = DM3AccentBlue,
                    ),
                )
            }

            Spacer(modifier = Modifier.height(16.dp))

            GlassCard(title = "CAMERA") {
                SettingsInfoRow("RGB Camera", "Active", valueColor = DM3Green, showDot = true)
                CardDivider()
                SettingsInfoRow("IR Camera", "Active", valueColor = DM3Green, showDot = true)
                CardDivider()
                SettingsInfoRow("Resolution", "1280×720")
                CardDivider()
                SettingsInfoRow("Rotation", "270°")
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Save button
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.Center,
            ) {
                TextButton(onClick = { viewModel.save() }) {
                    if (saved) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.Check, contentDescription = null, tint = DM3Green, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("Saved", color = DM3Green, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                        }
                    } else {
                        Text("Save Settings", color = DM3AccentPurple, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))
        }
    }
}
