package com.duali.dm3terminal.hardware

import android.util.Log
import com.duali.rf.jni.DualRFJni
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.withContext

/**
 * Wrapper for DF970 PN5180 NFC card reader via JNI.
 */
class NfcReader {

    companion object {
        private const val TAG = "NfcReader"
        private const val POLL_INTERVAL_MS = 200L
        private const val DEBOUNCE_MS = 2000L // Avoid reading same card repeatedly
    }

    private val dualRF = DualRFJni.getInstance()
    private var isOpen = false

    fun open() {
        try {
            dualRF.DE_RF_Open()
            isOpen = true
            Log.d(TAG, "NFC reader opened")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to open NFC reader", e)
        }
    }

    fun close() {
        try {
            dualRF.DE_RF_Close()
            isOpen = false
            Log.d(TAG, "NFC reader closed")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to close NFC reader", e)
        }
    }

    /**
     * Poll for an NFC card. Returns the card ID as a hex string, or null if no card detected.
     */
    suspend fun pollCard(timeoutMs: Int = 100): String? = withContext(Dispatchers.IO) {
        if (!isOpen) return@withContext null
        try {
            val emptyData = ByteArray(0)
            val response = dualRF.DE_Polling(0, emptyData, timeoutMs)
            if (response != null && response.responseCode == 0) {
                val data = response.responseData
                if (data != null && data.isNotEmpty()) {
                    return@withContext data.toHexString()
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "pollCard error: ${e.message}")
        }
        null
    }

    /**
     * Continuous flow of card IDs. Emits a card ID when detected, with debounce
     * to avoid emitting the same card repeatedly.
     */
    fun cardFlow(): Flow<String> = flow {
        var lastCardId: String? = null
        var lastCardTime = 0L

        while (true) {
            val cardId = pollCard()
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
