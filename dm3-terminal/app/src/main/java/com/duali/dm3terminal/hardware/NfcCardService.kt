package com.duali.dm3terminal.hardware

import android.app.Activity
import android.app.PendingIntent
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioManager
import android.media.ToneGenerator
import android.nfc.NfcAdapter
import android.nfc.Tag
import android.nfc.tech.IsoDep
import android.nfc.tech.MifareClassic
import android.nfc.tech.MifareUltralight
import android.nfc.tech.NfcA
import android.nfc.tech.NfcB
import android.nfc.tech.NfcF
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import javax.inject.Inject
import javax.inject.Singleton

data class NfcCardEvent(
    val uid: String,
    val techType: String, // mifare_classic, desfire, felica, iso14443a, iso14443b
    val timestampMs: Long = System.currentTimeMillis(),
)

/**
 * NFC card reading service using Android NFC API.
 * Supports Mifare Classic, DESFire, FeliCa, ISO 14443A/B.
 * 
 * This complements the JNI-based NfcReader for cases where the Android NFC stack
 * is preferred (e.g., foreground dispatch, enableReaderMode).
 * On the DF-970, the JNI NfcReader (DualRFJni) is the primary reader.
 * This service provides fallback / Android-standard NFC handling.
 */
@Singleton
class NfcCardService @Inject constructor() {

    companion object {
        private const val TAG = "NfcCardService"
        private const val DEBOUNCE_MS = 2000L
    }

    private val _cardEvents = MutableSharedFlow<NfcCardEvent>(extraBufferCapacity = 10)
    val cardEvents: SharedFlow<NfcCardEvent> = _cardEvents

    private var nfcAdapter: NfcAdapter? = null
    private var lastCardUid: String? = null
    private var lastCardTime = 0L
    private var toneGenerator: ToneGenerator? = null

    /**
     * Enable NFC reader mode on an activity for faster polling.
     * Call from Activity.onResume().
     */
    fun enableReaderMode(activity: Activity) {
        nfcAdapter = NfcAdapter.getDefaultAdapter(activity)
        if (nfcAdapter == null) {
            Log.w(TAG, "NFC not available on this device")
            return
        }

        val flags = NfcAdapter.FLAG_READER_NFC_A or
                NfcAdapter.FLAG_READER_NFC_B or
                NfcAdapter.FLAG_READER_NFC_F or
                NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK or
                NfcAdapter.FLAG_READER_NO_PLATFORM_SOUNDS

        nfcAdapter?.enableReaderMode(activity, { tag ->
            handleTag(tag, activity)
        }, flags, null)

        Log.d(TAG, "Reader mode enabled")
    }

    /**
     * Disable NFC reader mode. Call from Activity.onPause().
     */
    fun disableReaderMode(activity: Activity) {
        nfcAdapter?.disableReaderMode(activity)
    }

    /**
     * Handle an NFC tag from foreground dispatch or reader mode.
     */
    fun handleTag(tag: Tag, activity: Activity? = null) {
        val uid = tag.id.toHexString()
        val techType = detectTechType(tag)
        val now = System.currentTimeMillis()

        // Debounce
        if (uid == lastCardUid && (now - lastCardTime) < DEBOUNCE_MS) {
            return
        }
        lastCardUid = uid
        lastCardTime = now

        Log.d(TAG, "Card detected: UID=$uid tech=$techType")

        // Audio/haptic feedback
        playTapFeedback(activity)

        _cardEvents.tryEmit(NfcCardEvent(uid, techType, now))
    }

    /**
     * Handle NFC intent from foreground dispatch.
     */
    fun handleIntent(intent: Intent, activity: Activity? = null): Boolean {
        val tag = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            intent.getParcelableExtra(NfcAdapter.EXTRA_TAG, Tag::class.java)
        } else {
            @Suppress("DEPRECATION")
            intent.getParcelableExtra(NfcAdapter.EXTRA_TAG)
        } ?: return false

        handleTag(tag, activity)
        return true
    }

    private fun detectTechType(tag: Tag): String {
        val techList = tag.techList
        return when {
            techList.contains(MifareClassic::class.java.name) -> "mifare_classic"
            techList.contains(IsoDep::class.java.name) -> "desfire" // DESFire uses IsoDep
            techList.contains(NfcF::class.java.name) -> "felica"
            techList.contains(NfcB::class.java.name) -> "iso14443b"
            techList.contains(NfcA::class.java.name) -> "iso14443a"
            techList.contains(MifareUltralight::class.java.name) -> "mifare_ultralight"
            else -> "unknown"
        }
    }

    private fun playTapFeedback(activity: Activity?) {
        try {
            // Tone
            if (toneGenerator == null) {
                toneGenerator = ToneGenerator(AudioManager.STREAM_NOTIFICATION, 50)
            }
            toneGenerator?.startTone(ToneGenerator.TONE_PROP_ACK, 100)

            // Vibrate
            activity?.let { ctx ->
                val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    (ctx.getSystemService(Activity.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
                } else {
                    @Suppress("DEPRECATION")
                    ctx.getSystemService(Activity.VIBRATOR_SERVICE) as? Vibrator
                }
                vibrator?.vibrate(VibrationEffect.createOneShot(50, VibrationEffect.DEFAULT_AMPLITUDE))
            }
        } catch (e: Exception) {
            Log.w(TAG, "Feedback error: ${e.message}")
        }
    }

    fun release() {
        toneGenerator?.release()
        toneGenerator = null
    }

    private fun ByteArray.toHexString(): String =
        joinToString("") { "%02X".format(it) }
}
