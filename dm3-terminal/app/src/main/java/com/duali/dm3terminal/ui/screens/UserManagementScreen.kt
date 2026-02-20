package com.duali.dm3terminal.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.duali.dm3terminal.ui.components.*
import com.duali.dm3terminal.ui.theme.*

private data class UserItem(
    val initials: String,
    val name: String,
    val info: String,
    val color: Color,
    val synced: Boolean = true,
)

private val sampleUsers = listOf(
    UserItem("CN", "Cuong Nguyen", "Engineering • Director • EMP-0001", Color(0xFF3B82F6)),
    UserItem("TH", "Tran Hiep", "R&D • Engineer • EMP-0012", Color(0xFF10B981)),
    UserItem("NM", "Nguyen Muoi", "Operations • Manager • EMP-0023", Color(0xFFF59E0B)),
    UserItem("BN", "Bich Ngoc", "Admin • HR • EMP-0034", Color(0xFFEF4444)),
    UserItem("NL", "Nguyen Luat", "Support • Technician • EMP-0045", Color(0xFF8B5CF6)),
    UserItem("LN", "Le Nam", "R&D • Developer • EMP-0056", Color(0xFF06B6D4)),
)

@Composable
fun UserManagementScreen(
    onBack: () -> Unit,
) {
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
            androidx.compose.material3.TextButton(onClick = onBack) {
                Text("←", color = DM3White, fontSize = 20.sp)
            }
            Spacer(modifier = Modifier.width(4.dp))
            Text("User Management", color = DM3White, fontSize = 18.sp, fontWeight = FontWeight.Bold)
        }

        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp),
        ) {
            Spacer(modifier = Modifier.height(12.dp))

            // Search bar
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(10.dp))
                    .background(GlassCardBg)
                    .border(1.dp, GlassCardBorder, RoundedCornerShape(10.dp))
                    .padding(horizontal = 14.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("🔍", fontSize = 14.sp)
                Spacer(modifier = Modifier.width(8.dp))
                Text("Search users...", color = DM3GrayDark, fontSize = 14.sp, modifier = Modifier.weight(1f))
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(12.dp))
                        .background(GlassCardBorder)
                        .padding(horizontal = 10.dp, vertical = 4.dp),
                ) {
                    Text("1,247 users", color = DM3Gray, fontSize = 12.sp)
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Recently synced
            GlassCard(title = "RECENTLY SYNCED") {
                sampleUsers.forEachIndexed { index, user ->
                    if (index > 0) CardDivider()
                    UserRow(user)
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            GlassCard(title = "SYNC STATUS") {
                SettingsInfoRow("Total Users", "1,247", valueColor = DM3AccentBlue)
                CardDivider()
                SettingsInfoRow("Last Full Sync", "5 min ago")
                CardDivider()
                SettingsInfoRow("Status", "Up to date", valueColor = DM3Green, showDot = true)
            }

            Spacer(modifier = Modifier.height(16.dp))
        }
    }
}

@Composable
private fun UserRow(user: UserItem) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Avatar circle
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(CircleShape)
                .background(user.color),
            contentAlignment = Alignment.Center,
        ) {
            Text(user.initials, color = DM3White, fontSize = 14.sp, fontWeight = FontWeight.Bold)
        }
        Spacer(modifier = Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(user.name, color = DM3White, fontSize = 14.sp, fontWeight = FontWeight.Medium)
            Text(user.info, color = DM3Gray, fontSize = 12.sp)
        }
        if (user.synced) {
            Box(
                modifier = Modifier
                    .size(24.dp)
                    .clip(CircleShape)
                    .background(DM3Green.copy(alpha = 0.2f)),
                contentAlignment = Alignment.Center,
            ) {
                Text("✓", color = DM3Green, fontSize = 12.sp)
            }
        }
    }
}
