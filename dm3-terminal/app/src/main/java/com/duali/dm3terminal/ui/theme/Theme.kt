package com.duali.dm3terminal.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val DM3Background = Color(0xFF0B1120)
val DM3Surface = Color(0xFF111827)
val DM3AccentBlue = Color(0xFF3B82F6)
val DM3Green = Color(0xFF22C55E)
val DM3Red = Color(0xFFEF4444)
val DM3Yellow = Color(0xFFEAB308)
val DM3Gray = Color(0xFF9CA3AF)
val DM3White = Color(0xFFFFFFFF)

private val DM3ColorScheme = darkColorScheme(
    primary = DM3AccentBlue,
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
