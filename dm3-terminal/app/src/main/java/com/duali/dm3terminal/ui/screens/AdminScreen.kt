package com.duali.dm3terminal.ui.screens

import android.os.Build
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.duali.dm3terminal.ui.theme.*

@Composable
fun AdminScreen(
    onBack: () -> Unit,
    viewModel: AdminViewModel = hiltViewModel(),
) {
    val stats by viewModel.stats.collectAsState()

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(DM3Background),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(16.dp)
                .verticalScroll(rememberScrollState()),
        ) {
            // Header
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) {
                    Icon(
                        Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = "Quay lại",
                        tint = DM3White,
                    )
                }
                Text(
                    text = "Quản trị",
                    color = DM3White,
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold,
                )
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Device Info
            InfoCard(title = "Thông tin thiết bị") {
                InfoRow("Device ID", Build.SERIAL.ifEmpty { "DF-970-001" })
                InfoRow("Site ID", "site-hcm-01")
                InfoRow("Android", "${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})")
                InfoRow("App", "1.0.0")
                InfoRow("Model", "${Build.MANUFACTURER} ${Build.MODEL}")
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Sync Status
            InfoCard(title = "Đồng bộ") {
                InfoRow("Lần đồng bộ cuối", stats.lastSyncTime)
                InfoRow("Số người", "${stats.personCount}")
                InfoRow("Số quy tắc", "${stats.ruleCount}")
            }

            Spacer(modifier = Modifier.height(12.dp))

            // MQTT
            InfoCard(title = "MQTT") {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(10.dp)
                            .background(DM3Yellow, shape = androidx.compose.foundation.shape.CircleShape),
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Chưa kết nối", color = DM3Yellow, fontSize = 16.sp)
                }
                InfoRow("Broker", "mqtt://broker.local:1883")
            }

            Spacer(modifier = Modifier.height(24.dp))

            // Actions
            Button(
                onClick = { viewModel.seedData() },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp),
                colors = ButtonDefaults.buttonColors(containerColor = DM3AccentBlue),
                shape = RoundedCornerShape(12.dp),
            ) {
                Text("Tạo dữ liệu mẫu", fontSize = 16.sp)
            }

            Spacer(modifier = Modifier.height(8.dp))

            Button(
                onClick = { viewModel.clearData() },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp),
                colors = ButtonDefaults.buttonColors(containerColor = DM3Red.copy(alpha = 0.2f)),
                shape = RoundedCornerShape(12.dp),
            ) {
                Text("Xoá dữ liệu", color = DM3Red, fontSize = 16.sp)
            }
        }
    }
}

@Composable
private fun InfoCard(title: String, content: @Composable ColumnScope.() -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = DM3Surface),
        shape = RoundedCornerShape(12.dp),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = title,
                color = DM3AccentBlue,
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
            )
            Spacer(modifier = Modifier.height(12.dp))
            content()
        }
    }
}

@Composable
private fun InfoRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(text = label, color = DM3Gray, fontSize = 14.sp)
        Text(text = value, color = DM3White, fontSize = 14.sp)
    }
}
