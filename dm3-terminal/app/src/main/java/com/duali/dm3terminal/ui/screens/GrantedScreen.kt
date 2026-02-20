package com.duali.dm3terminal.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.duali.dm3terminal.ui.theme.*
import kotlinx.coroutines.delay
import java.text.SimpleDateFormat
import java.util.*

@Composable
fun GrantedScreen(
    personName: String,
    department: String = "Engineering",
    role: String = "Director",
    method: String = "Face",
    onTimeout: () -> Unit,
) {
    LaunchedEffect(Unit) {
        delay(3000)
        onTimeout()
    }

    val checkInTime = remember {
        SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date())
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(DM3Background)
            .background(
                Brush.radialGradient(
                    colors = listOf(DM3Green.copy(alpha = 0.2f), DM3Background.copy(alpha = 0f)),
                    radius = 800f,
                )
            ),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.padding(32.dp),
        ) {
            // Large checkmark
            Text(
                text = "✓",
                color = DM3Green,
                fontSize = 96.sp,
                fontWeight = FontWeight.Bold,
            )

            Spacer(modifier = Modifier.height(16.dp))

            // Person name
            Text(
                text = personName,
                color = DM3White,
                fontSize = 28.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
            )

            Spacer(modifier = Modifier.height(8.dp))

            // CHECK IN OK
            Text(
                text = "CHECK IN OK",
                color = DM3Green,
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold,
            )

            Spacer(modifier = Modifier.height(12.dp))

            // Department / role
            Text(
                text = "$department • $role",
                color = DM3Gray,
                fontSize = 16.sp,
            )

            Spacer(modifier = Modifier.height(24.dp))

            // Check-in time
            Text(
                text = checkInTime,
                color = DM3GrayDark,
                fontSize = 14.sp,
            )
        }
    }
}
