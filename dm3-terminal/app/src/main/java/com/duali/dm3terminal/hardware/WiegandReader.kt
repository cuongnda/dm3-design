package com.duali.dm3terminal.hardware

import android.util.Log
import com.duali.wiegand.jni.DualWiegandJni
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.withContext

/**
 * Wrapper for DF970 Wiegand reader (external card readers).
 */
class WiegandReader {

    companion object {
        private const val TAG = "WiegandReader"
        private const val POLL_INTERVAL_MS = 200L
        private const val DEBOUNCE_MS = 2000L
    }

    private val dualWiegand = DualWiegandJni.getInstance()
    private var isOpen = false

    fun open(): Int {
        return try {
            val result = dualWiegand.DE_Wiegand_Open()
            isOpen = result == 0
            Log.d(TAG, "Wiegand opened, result=$result")
            result
        } catch (e: Exception) {
            Log.e(TAG, "Failed to open Wiegand", e)
            -1
        }
    }

    fun close() {
        try {
            dualWiegand.DE_Wiegand_Close()
            isOpen = false
            Log.d(TAG, "Wiegand closed")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to close Wiegand", e)
        }
    }

    /**
     * Read Wiegand data. Returns card data as hex string, or null.
     */
    suspend fun readData(): String? = withContext(Dispatchers.IO) {
        if (!isOpen) return@withContext null
        try {
            val response = dualWiegand.DE_Wiegand_ReadData()
            if (response != null && response.responseCode == 0) {
                val data = response.responseData
                if (data != null && data.isNotEmpty()) {
                    return@withContext data.toHexString()
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "readData error: ${e.message}")
        }
        null
    }

    /**
     * Send Wiegand data (e.g., for output to external controller).
     */
    fun sendData(parity: Int, data: ByteArray): Int {
        return try {
            dualWiegand.DE_Wiegand_SendData(parity, data.size, data)
        } catch (e: Exception) {
            Log.e(TAG, "sendData error", e)
            -1
        }
    }

    /**
     * Control WGD0 GPIO pin.
     */
    fun wgd0Control(gpio: Int): Int = dualWiegand.DE_Wiegand_WGD0Control(gpio)

    /**
     * Control WGD1 GPIO pin.
     */
    fun wgd1Control(gpio: Int): Int = dualWiegand.DE_Wiegand_WGD1Control(gpio)

    /**
     * Continuous flow of Wiegand card reads.
     */
    fun cardFlow(): Flow<String> = flow {
        var lastCardId: String? = null
        var lastCardTime = 0L

        while (true) {
            val cardId = readData()
            if (cardId != null) {
                val now = System.currentTimeMillis()
                if (cardId != lastCardId || (now - lastCardTime) > DEBOUNCE_MS) {
                    lastCardId = cardId
                    lastCardTime = now
                    emit(cardId)
                }
            }
            delay(POLL_INTERVAL_MS)
        }
    }.flowOn(Dispatchers.IO)

    private fun ByteArray.toHexString(): String =
        joinToString("") { "%02X".format(it) }
}
