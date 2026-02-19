package com.duali.dm3terminal.ui.screens

import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.duali.dm3terminal.ui.theme.*
import java.text.SimpleDateFormat
import java.util.*

@Composable
fun StandbyScreen(
    onTap: () -> Unit,
    onLongPress: () -> Unit,
) {
    var currentTime by remember { mutableStateOf(System.currentTimeMillis()) }

    // Update clock every second
    LaunchedEffect(Unit) {
        while (true) {
            currentTime = System.currentTimeMillis()
            kotlinx.coroutines.delay(1000)
        }
    }

    // Pulsing animation for prompt text
    val infiniteTransition = rememberInfiniteTransition(label = "pulse")
    val alpha by infiniteTransition.animateFloat(
        initialValue = 0.4f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(1500, easing = EaseInOutSine),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "pulseAlpha",
    )

    val cal = Calendar.getInstance().apply { timeInMillis = currentTime }
    val timeStr = SimpleDateFormat("HH:mm", Locale.getDefault()).format(cal.time)

    val vietnameseDays = arrayOf("Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy")
    val dayOfWeek = vietnameseDays[cal.get(Calendar.DAY_OF_WEEK) - 1]
    val dateStr = "$dayOfWeek, ${SimpleDateFormat("dd/MM/yyyy", Locale.getDefault()).format(cal.time)}"

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(DM3Background)
            .pointerInput(Unit) {
                detectTapGestures(
                    onTap = { onTap() },
                    onLongPress = { onLongPress() },
                )
            },
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            // Logo
            Text(
                text = "DUALL MASTER",
                color = DM3AccentBlue,
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 4.sp,
            )

            Spacer(modifier = Modifier.height(48.dp))

            // Clock
            Text(
                text = timeStr,
                color = DM3White,
                fontSize = 72.sp,
                fontWeight = FontWeight.Bold,
            )

            Spacer(modifier = Modifier.height(8.dp))

            // Date
            Text(
                text = dateStr,
                color = DM3Gray,
                fontSize = 20.sp,
            )

            Spacer(modifier = Modifier.height(64.dp))

            // Prompt (pulsing)
            Text(
                text = "Chạm thẻ hoặc nhìn vào camera",
                color = DM3Gray,
                fontSize = 18.sp,
                modifier = Modifier.alpha(alpha),
            )
        }

        // Offline indicator (top-right)
        Row(
            modifier = Modifier
                .align(Alignment.TopEnd)
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(10.dp)
                    .background(DM3Yellow, shape = androidx.compose.foundation.shape.CircleShape),
            )
            Spacer(modifier = Modifier.width(6.dp))
            Text(text = "Offline", color = DM3Yellow, fontSize = 14.sp)
        }
    }
}
