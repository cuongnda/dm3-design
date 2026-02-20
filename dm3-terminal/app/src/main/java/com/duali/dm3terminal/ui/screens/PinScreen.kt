package com.duali.dm3terminal.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.duali.dm3terminal.ui.components.*
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

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(DM3Background),
    ) {

        Column(
            modifier = Modifier
                .weight(1f)
                .padding(horizontal = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = "Enter PIN Code",
                color = DM3White,
                fontSize = 22.sp,
                fontWeight = FontWeight.Bold,
            )
            Spacer(modifier = Modifier.height(2.dp))
            Text(
                text = if (error) "Incorrect PIN. Try again." else "Enter your 6-digit access PIN",
                color = if (error) DM3Red else DM3Gray,
                fontSize = 13.sp,
            )

            Spacer(modifier = Modifier.height(16.dp))

            // PIN dots
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                repeat(PIN_LENGTH) { i ->
                    Box(
                        modifier = Modifier
                            .size(14.dp)
                            .clip(CircleShape)
                            .then(
                                if (i < pin.length) {
                                    Modifier.background(DM3AccentPurple)
                                } else {
                                    Modifier
                                        .background(DM3Background)
                                        .border(2.dp, DM3GrayDark, CircleShape)
                                }
                            ),
                    )
                }
            }

            Spacer(modifier = Modifier.height(20.dp))

            // Numpad - compact
            val keys = listOf(
                listOf("1", "2", "3"),
                listOf("4", "5", "6"),
                listOf("7", "8", "9"),
            )
            keys.forEach { row ->
                Row(
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    modifier = Modifier.padding(vertical = 4.dp),
                ) {
                    row.forEach { digit ->
                        PinKeyButton(text = digit, onClick = { onDigit(digit) })
                    }
                }
            }

            // Bottom row: backspace, 0, confirm
            Row(
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier.padding(vertical = 4.dp),
            ) {
                Button(
                    onClick = { if (pin.isNotEmpty()) pin = pin.dropLast(1) },
                    modifier = Modifier.size(width = 90.dp, height = 56.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = DM3CardBg),
                    shape = RoundedCornerShape(12.dp),
                ) {
                    Text("←", fontSize = 22.sp, color = DM3White)
                }

                PinKeyButton(text = "0", onClick = { onDigit("0") })

                Button(
                    onClick = {
                        if (pin.length == PIN_LENGTH) {
                            if (pin == ADMIN_PIN) onPinVerified()
                            else { error = true; pin = "" }
                        }
                    },
                    modifier = Modifier.size(width = 90.dp, height = 56.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = DM3AccentPurple),
                    shape = RoundedCornerShape(12.dp),
                ) {
                    Text("✓", fontSize = 22.sp, color = DM3White, fontWeight = FontWeight.Bold)
                }
            }
        }

    }
}

@Composable
private fun PinKeyButton(text: String, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        modifier = Modifier.size(width = 90.dp, height = 56.dp),
        colors = ButtonDefaults.buttonColors(containerColor = DM3CardBg),
        shape = RoundedCornerShape(12.dp),
    ) {
        Text(text = text, fontSize = 22.sp, color = DM3White, fontWeight = FontWeight.Medium)
    }
}
