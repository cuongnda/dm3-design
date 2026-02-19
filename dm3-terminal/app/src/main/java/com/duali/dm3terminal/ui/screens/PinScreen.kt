package com.duali.dm3terminal.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Backspace
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.duali.dm3terminal.ui.theme.*

private const val ADMIN_PIN = "123456"
private const val PIN_LENGTH = 6

@Composable
fun PinScreen(
    onPinVerified: () -> Unit,
    onCancel: () -> Unit,
) {
    var pin by remember { mutableStateOf("") }
    var error by remember { mutableStateOf(false) }

    fun onDigit(d: String) {
        if (pin.length < PIN_LENGTH) {
            pin += d
            error = false
            if (pin.length == PIN_LENGTH) {
                if (pin == ADMIN_PIN) {
                    onPinVerified()
                } else {
                    error = true
                    pin = ""
                }
            }
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(DM3Background),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.padding(24.dp),
        ) {
            Text(
                text = "Nhập mã PIN",
                color = DM3White,
                fontSize = 28.sp,
                fontWeight = FontWeight.Bold,
            )

            Spacer(modifier = Modifier.height(8.dp))

            if (error) {
                Text(text = "Mã PIN không đúng", color = DM3Red, fontSize = 16.sp)
            }

            Spacer(modifier = Modifier.height(32.dp))

            // PIN dots
            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                repeat(PIN_LENGTH) { i ->
                    Box(
                        modifier = Modifier
                            .size(20.dp)
                            .clip(CircleShape)
                            .background(
                                if (i < pin.length) DM3AccentBlue else DM3Gray.copy(alpha = 0.3f)
                            ),
                    )
                }
            }

            Spacer(modifier = Modifier.height(48.dp))

            // Keypad: 1-9
            val keys = listOf(
                listOf("1", "2", "3"),
                listOf("4", "5", "6"),
                listOf("7", "8", "9"),
            )
            keys.forEach { row ->
                Row(
                    horizontalArrangement = Arrangement.spacedBy(16.dp),
                    modifier = Modifier.padding(vertical = 8.dp),
                ) {
                    row.forEach { digit ->
                        KeypadButton(text = digit, onClick = { onDigit(digit) })
                    }
                }
            }

            // Bottom row: cancel, 0, backspace
            Row(
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                modifier = Modifier.padding(vertical = 8.dp),
            ) {
                // Cancel
                Button(
                    onClick = onCancel,
                    modifier = Modifier.size(80.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = DM3Red.copy(alpha = 0.2f)),
                    shape = RoundedCornerShape(16.dp),
                ) {
                    Text("✕", fontSize = 24.sp, color = DM3Red)
                }

                // 0
                KeypadButton(text = "0", onClick = { onDigit("0") })

                // Backspace
                Button(
                    onClick = { if (pin.isNotEmpty()) pin = pin.dropLast(1) },
                    modifier = Modifier.size(80.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = DM3Surface),
                    shape = RoundedCornerShape(16.dp),
                ) {
                    Icon(
                        Icons.AutoMirrored.Filled.Backspace,
                        contentDescription = "Xoá",
                        tint = DM3White,
                        modifier = Modifier.size(28.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun KeypadButton(text: String, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        modifier = Modifier.size(80.dp),
        colors = ButtonDefaults.buttonColors(containerColor = DM3Surface),
        shape = RoundedCornerShape(16.dp),
    ) {
        Text(text = text, fontSize = 28.sp, color = DM3White, fontWeight = FontWeight.Bold)
    }
}
