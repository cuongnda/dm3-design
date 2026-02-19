package com.duali.dm3terminal.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily

// Core palette
val DM3Background = Color(0xFF0B1120)
val DM3Surface = Color(0xFF111827)
val DM3CardBg = Color(0xFF151D2E)
val DM3CardBorder = Color(0xFF1E293B)
val DM3AccentPurple = Color(0xFF7C3AED)
val DM3AccentPurpleLight = Color(0xFF8B5CF6)
val DM3AccentBlue = Color(0xFF3B82F6)
val DM3Green = Color(0xFF10B981)
val DM3GreenDark = Color(0xFF059669)
val DM3Red = Color(0xFFEF4444)
val DM3RedDark = Color(0xFFDC2626)
val DM3Yellow = Color(0xFFEAB308)
val DM3Gray = Color(0xFF9CA3AF)
val DM3GrayDark = Color(0xFF6B7280)
val DM3GrayLight = Color(0xFFD1D5DB)
val DM3White = Color(0xFFFFFFFF)
val DM3Teal = Color(0xFF14B8A6)

// Glassmorphism card colors
val GlassCardBg = Color(0xFF131B2E)
val GlassCardBorder = Color(0xFF1F2937)

private val DM3ColorScheme = darkColorScheme(
    primary = DM3AccentPurple,
    onPrimary = DM3White,
    background = DM3Background,
    surface = DM3Surface,
    onBackground = DM3White,
    onSurface = DM3White,
    error = DM3Red,
)

@Composable
fun DM3Theme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = DM3ColorScheme,
        content = content,
    )
}
