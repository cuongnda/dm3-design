package com.duali.dm3terminal.ui.components

import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.duali.dm3terminal.ui.theme.*
import java.text.SimpleDateFormat
import java.util.*

/**
 * Top status bar: MQTT connection status left, device model right
 */
@Composable
fun DeviceStatusBar(
    modifier: Modifier = Modifier,
    mqttConnected: Boolean = false,
    isAlert: Boolean = false,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(8.dp)
                    .clip(CircleShape)
                    .background(if (isAlert) DM3Red else if (mqttConnected) DM3Green else DM3Yellow),
            )
            Spacer(modifier = Modifier.width(6.dp))
            Text(
                text = if (isAlert) "Alert" else if (mqttConnected) "MQTT Connected" else "MQTT Disconnected",
                color = if (isAlert) DM3Red else if (mqttConnected) DM3Green else DM3Yellow,
                fontSize = 12.sp,
            )
        }
        Text(text = "DF-970", color = DM3Gray, fontSize = 12.sp)
    }
}

/**
 * Header bar: Purple "D" logo + "DUALL PASS" + subtitle, clock on right
 */
@Composable
fun DuallPassHeader(
    subtitle: String = "Access Control",
    locationRight: String? = null,
    showClock: Boolean = true,
    modifier: Modifier = Modifier,
) {
    var currentTime by remember { mutableStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) {
            currentTime = System.currentTimeMillis()
            kotlinx.coroutines.delay(1000)
        }
    }
    val cal = Calendar.getInstance().apply { timeInMillis = currentTime }
    val timeStr = SimpleDateFormat("HH:mm", Locale.getDefault()).format(cal.time)
    val dateStr = SimpleDateFormat("EEE, MMM dd", Locale.ENGLISH).format(cal.time)

    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Purple D logo
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(RoundedCornerShape(10.dp))
                .background(DM3AccentPurple),
            contentAlignment = Alignment.Center,
        ) {
            Text("D", color = DM3White, fontSize = 20.sp, fontWeight = FontWeight.Bold)
        }
        Spacer(modifier = Modifier.width(10.dp))
        Column {
            Text(
                text = "DUALL PASS",
                color = DM3White,
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.sp,
            )
            Text(
                text = subtitle,
                color = DM3AccentPurple,
                fontSize = 12.sp,
            )
        }
        Spacer(modifier = Modifier.weight(1f))
        if (showClock) {
            Column(horizontalAlignment = Alignment.End) {
                Text(
                    text = timeStr,
                    color = DM3White,
                    fontSize = 32.sp,
                    fontWeight = FontWeight.Light,
                    letterSpacing = 2.sp,
                )
                Text(
                    text = dateStr,
                    color = DM3Gray,
                    fontSize = 11.sp,
                )
            }
        } else if (locationRight != null) {
            Text(
                text = locationRight,
                color = DM3Gray,
                fontSize = 12.sp,
            )
        }
    }
}

/**
 * Footer bar: left text + right text
 */
@Composable
fun DuallPassFooter(
    leftText: String = "Duali Vietnam",
    rightText: String = "DF-970",
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(text = leftText, color = DM3GrayDark, fontSize = 11.sp)
        Text(text = rightText, color = DM3GrayDark, fontSize = 11.sp)
    }
}

/**
 * Glassmorphism card with subtle border
 */
@Composable
fun GlassCard(
    modifier: Modifier = Modifier,
    title: String? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(GlassCardBg)
            .border(1.dp, GlassCardBorder, RoundedCornerShape(12.dp))
            .padding(16.dp),
    ) {
        if (title != null) {
            Text(
                text = title,
                color = DM3Gray,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.5.sp,
            )
            Spacer(modifier = Modifier.height(12.dp))
        }
        content()
    }
}

/**
 * Info row used in settings cards: label left, value right
 */
@Composable
fun SettingsInfoRow(
    label: String,
    value: String,
    valueColor: Color = DM3White,
    showDot: Boolean = false,
    dotColor: Color = DM3Green,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(text = label, color = DM3Gray, fontSize = 14.sp)
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (showDot) {
                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .clip(CircleShape)
                        .background(dotColor),
                )
                Spacer(modifier = Modifier.width(6.dp))
            }
            Text(text = value, color = valueColor, fontSize = 14.sp, fontWeight = FontWeight.Medium)
        }
    }
}

/**
 * Settings menu item row with icon, label, and chevron
 */
@Composable
fun SettingsMenuItem(
    icon: String,
    label: String,
    onClick: () -> Unit,
) {
    androidx.compose.material3.Surface(
        onClick = onClick,
        color = Color.Transparent,
        shape = RoundedCornerShape(8.dp),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 14.dp, horizontal = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(text = icon, fontSize = 18.sp)
            Spacer(modifier = Modifier.width(12.dp))
            Text(text = label, color = DM3White, fontSize = 15.sp, modifier = Modifier.weight(1f))
            Text(text = "›", color = DM3GrayDark, fontSize = 18.sp)
        }
    }
}

/**
 * Divider line for inside cards
 */
@Composable
fun CardDivider() {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(1.dp)
            .background(GlassCardBorder),
    )
}

/**
 * Base screen scaffold with status bar, header, content, and footer
 */
@Composable
fun ScreenScaffold(
    subtitle: String = "Access Control",
    isAlert: Boolean = false,
    footerLeft: String = "Duali Vietnam",
    footerRight: String = "DF-970",
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(DM3Background),
    ) {
        DeviceStatusBar(isAlert = isAlert)
        DuallPassHeader(subtitle = subtitle)
        Column(
            modifier = Modifier.weight(1f),
            content = content,
        )
        DuallPassFooter(leftText = footerLeft, rightText = footerRight)
    }
}

/**
 * Camera preview placeholder with rounded corners and colored border
 */
@Composable
fun CameraPreviewBox(
    modifier: Modifier = Modifier,
    borderColor: Color = GlassCardBorder,
    borderWidth: Dp = 1.dp,
    content: @Composable BoxScope.() -> Unit = {},
) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(16.dp))
            .background(DM3Surface)
            .border(borderWidth, borderColor, RoundedCornerShape(16.dp)),
        contentAlignment = Alignment.Center,
        content = content,
    )
}
