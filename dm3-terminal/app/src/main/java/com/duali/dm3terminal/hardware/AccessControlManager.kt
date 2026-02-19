package com.duali.dm3terminal.hardware

import android.util.Log
import com.duali.dm3terminal.domain.AccessEngine
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject
import javax.inject.Singleton

sealed class AccessEvent {
    data class FaceGranted(val personId: String, val personName: String?) : AccessEvent()
    data class FaceDenied(val reason: String) : AccessEvent()
    data class NfcGranted(val personId: String, val personName: String?, val cardId: String) : AccessEvent()
    data class NfcDenied(val cardId: String, val reason: String) : AccessEvent()
    data class WiegandGranted(val personId: String, val personName: String?, val cardId: String) : AccessEvent()
    data class WiegandDenied(val cardId: String, val reason: String) : AccessEvent()
    object FaceDetected : AccessEvent()
    object Idle : AccessEvent()
}

enum class HardwareStatus {
    NOT_INITIALIZED, INITIALIZING, READY, ERROR
}

/**
 * Orchestrates hardware (face, NFC, Wiegand) with the access engine.
 * Runs face detection, NFC polling, and Wiegand polling in background.
 */
@Singleton
class AccessControlManager @Inject constructor(
    private val facePassManager: FacePassManager,
    private val nfcReader: NfcReader,
    private val wiegandReader: WiegandReader,
    private val faceCamera: FaceCamera,
    private val accessEngine: AccessEngine,
) {
    companion object {
        private const val TAG = "AccessControlMgr"
        private const val DEFAULT_DOOR_ID = "main-door"
    }

    private val scope = CoroutineScope(Dispatchers.Default + SupervisorJob())

    private val _events = MutableSharedFlow<AccessEvent>(replay = 1)
    val events: SharedFlow<AccessEvent> = _events

    private val _status = MutableStateFlow(HardwareStatus.NOT_INITIALIZED)
    val status: StateFlow<HardwareStatus> = _status

    private var faceJob: Job? = null
    private var nfcJob: Job? = null
    private var wiegandJob: Job? = null
    private var isStarted = false

    /**
     * Initialize all hardware. Call once at app start.
     */
    suspend fun initialize() {
        _status.value = HardwareStatus.INITIALIZING
        try {
            // Initialize FacePass
            val faceReady = facePassManager.initialize()
            if (!faceReady) {
                Log.w(TAG, "FacePass init failed (may need device license)")
            }

            // Open NFC
            nfcReader.open()

            // Open Wiegand
            wiegandReader.open()

            _status.value = HardwareStatus.READY
            Log.d(TAG, "Hardware initialized (face=${facePassManager.isReady})")
        } catch (e: Exception) {
            Log.e(TAG, "Hardware init error", e)
            _status.value = HardwareStatus.ERROR
        }
    }

    /**
     * Start all credential monitoring (face, NFC, Wiegand).
     */
    fun start() {
        if (isStarted) return
        isStarted = true

        // Turn on IR LED for face recognition
        HardwareController.irOn()
        HardwareController.ledScanning()

        startFaceRecognition()
        startNfcPolling()
        startWiegandPolling()

        Log.d(TAG, "Access control started")
    }

    /**
     * Stop all credential monitoring.
     */
    fun stop() {
        isStarted = false
        faceJob?.cancel()
        nfcJob?.cancel()
        wiegandJob?.cancel()

        faceCamera.stop()
        HardwareController.irOff()
        HardwareController.ledOff()

        Log.d(TAG, "Access control stopped")
    }

    /**
     * Shutdown and release all hardware resources.
     */
    fun shutdown() {
        stop()
        nfcReader.close()
        wiegandReader.close()
        facePassManager.release()
        scope.cancel()
    }

    private fun startFaceRecognition() {
        if (!facePassManager.isReady) {
            Log.w(TAG, "FacePass not ready, skipping face recognition")
            return
        }

        faceCamera.setFrameCallback(object : FaceCamera.FrameCallback {
            override fun onFrame(nv21Data: ByteArray, width: Int, height: Int) {
                scope.launch {
                    try {
                        val result = facePassManager.processFrame(nv21Data, width, height)
                        if (result != null) {
                            if (result.isMatch && result.personId != null) {
                                handleFaceMatch(result)
                            } else {
                                _events.emit(AccessEvent.FaceDetected)
                            }
                        }
                    } catch (e: Exception) {
                        Log.w(TAG, "Face frame error: ${e.message}")
                    }
                }
            }
        })

        faceCamera.start()
    }

    private fun startNfcPolling() {
        nfcJob = scope.launch {
            nfcReader.cardFlow().collect { cardId ->
                handleNfcCard(cardId)
            }
        }
    }

    private fun startWiegandPolling() {
        wiegandJob = scope.launch {
            wiegandReader.cardFlow().collect { cardId ->
                handleWiegandCard(cardId)
            }
        }
    }

    private suspend fun handleFaceMatch(result: FaceResult) {
        val decision = accessEngine.evaluate(
            credentialType = "face",
            credentialValue = result.personId ?: "",
            doorId = DEFAULT_DOOR_ID,
        )

        if (decision.granted) {
            HardwareController.grantAccess()
            _events.emit(AccessEvent.FaceGranted(decision.personId ?: "", decision.personName))
        } else {
            HardwareController.denyAccess()
            _events.emit(AccessEvent.FaceDenied(decision.reason))
        }
    }

    private suspend fun handleNfcCard(cardId: String) {
        Log.d(TAG, "NFC card: $cardId")
        val decision = accessEngine.evaluate(
            credentialType = "nfc",
            credentialValue = cardId,
            doorId = DEFAULT_DOOR_ID,
        )

        if (decision.granted) {
            HardwareController.grantAccess()
            _events.emit(AccessEvent.NfcGranted(decision.personId ?: "", decision.personName, cardId))
        } else {
            HardwareController.denyAccess()
            _events.emit(AccessEvent.NfcDenied(cardId, decision.reason))
        }
    }

    private suspend fun handleWiegandCard(cardId: String) {
        Log.d(TAG, "Wiegand card: $cardId")
        val decision = accessEngine.evaluate(
            credentialType = "wiegand",
            credentialValue = cardId,
            doorId = DEFAULT_DOOR_ID,
        )

        if (decision.granted) {
            HardwareController.grantAccess()
            _events.emit(AccessEvent.WiegandGranted(decision.personId ?: "", decision.personName, cardId))
        } else {
            HardwareController.denyAccess()
            _events.emit(AccessEvent.WiegandDenied(cardId, decision.reason))
        }
    }
}
