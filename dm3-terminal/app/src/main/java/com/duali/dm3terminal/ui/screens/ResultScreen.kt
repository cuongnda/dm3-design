package com.duali.dm3terminal.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.duali.dm3terminal.ui.theme.*
import kotlinx.coroutines.delay

@Composable
fun ResultScreen(
    granted: Boolean,
    personName: String,
    reason: String,
    onTimeout: () -> Unit,
) {
    // Auto-return after 3s
    LaunchedEffect(Unit) {
        delay(3000)
        onTimeout()
    }

    val gradient = if (granted) {
        Brush.verticalGradient(listOf(DM3Green.copy(alpha = 0.3f), DM3Background))
    } else {
        Brush.verticalGradient(listOf(DM3Red.copy(alpha = 0.3f), DM3Background))
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(gradient),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            // Checkmark / X
            Text(
                text = if (granted) "✓" else "✗",
                color = if (granted) DM3Green else DM3Red,
                fontSize = 120.sp,
                fontWeight = FontWeight.Bold,
            )

            Spacer(modifier = Modifier.height(24.dp))

            if (granted) {
                Text(
                    text = personName,
                    color = DM3White,
                    fontSize = 36.sp,
                    fontWeight = FontWeight.Bold,
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "Xin chào, $personName!",
                    color = DM3Green,
                    fontSize = 22.sp,
                )
            } else {
                Text(
                    text = "Từ chối truy cập",
                    color = DM3Red,
                    fontSize = 28.sp,
                    fontWeight = FontWeight.Bold,
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = reasonToVietnamese(reason),
                    color = DM3Gray,
                    fontSize = 18.sp,
                )
            }
        }
    }
}

private fun reasonToVietnamese(reason: String): String = when (reason) {
    "denied_unknown" -> "Thẻ không được nhận dạng"
    "denied_blacklist" -> "Người dùng bị cấm"
    "denied_inactive" -> "Tài khoản không hoạt động"
    "denied_expired" -> "Thẻ đã hết hạn"
    "denied_lockout" -> "Tài khoản bị khoá"
    "denied_zone" -> "Không có quyền truy cập khu vực này"
    "denied_time" -> "Ngoài giờ cho phép"
    "denied_anti_passback" -> "Vi phạm anti-passback"
    "lockdown_active" -> "Hệ thống đang khoá"
    else -> reason
}
