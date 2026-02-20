package com.duali.dm3terminal.hardware

import android.util.Log
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Sends card data via Wiegand 26/34 output to external controllers.
 * Uses the existing WiegandReader's sendData JNI method.
 */
@Singleton
class WiegandOutput @Inject constructor(
    private val wiegandReader: WiegandReader,
) {
    companion object {
        private const val TAG = "WiegandOutput"
        const val FORMAT_WIEGAND_26 = 26
        const val FORMAT_WIEGAND_34 = 34
    }

    private var format: Int = FORMAT_WIEGAND_26

    fun configure(format: Int) {
        this.format = format
        Log.d(TAG, "Wiegand output format set to $format")
    }

    /**
     * Send card number via Wiegand output.
     * @param cardUidHex Card UID as hex string (e.g., "A1B2C3D4")
     */
    fun sendCardNumber(cardUidHex: String) {
        try {
            val cardBytes = hexToBytes(cardUidHex)
            val data: ByteArray
            val parity: Int

            when (format) {
                FORMAT_WIEGAND_26 -> {
                    // Wiegand 26: 1 even parity + 8 facility + 16 card number + 1 odd parity = 26 bits
                    // Use last 3 bytes: first byte = facility, last 2 = card number
                    data = when {
                        cardBytes.size >= 3 -> cardBytes.copyOfRange(cardBytes.size - 3, cardBytes.size)
                        cardBytes.size == 2 -> byteArrayOf(0) + cardBytes
                        cardBytes.size == 1 -> byteArrayOf(0, 0) + cardBytes
                        else -> byteArrayOf(0, 0, 0)
                    }
                    parity = FORMAT_WIEGAND_26
                }
                FORMAT_WIEGAND_34 -> {
                    // Wiegand 34: 1 even parity + 16 facility + 16 card number + 1 odd parity = 34 bits
                    data = when {
                        cardBytes.size >= 4 -> cardBytes.copyOfRange(cardBytes.size - 4, cardBytes.size)
                        else -> ByteArray(4 - cardBytes.size) + cardBytes
                    }
                    parity = FORMAT_WIEGAND_34
                }
                else -> {
                    Log.w(TAG, "Unsupported Wiegand format: $format")
                    return
                }
            }

            val result = wiegandReader.sendData(parity, data)
            Log.d(TAG, "Wiegand output: format=$format uid=$cardUidHex result=$result")
        } catch (e: Exception) {
            Log.e(TAG, "Wiegand output error", e)
        }
    }

    private fun hexToBytes(hex: String): ByteArray {
        val cleanHex = hex.replace(" ", "").uppercase()
        return ByteArray(cleanHex.length / 2) { i ->
            cleanHex.substring(i * 2, i * 2 + 2).toInt(16).toByte()
        }
    }
}
