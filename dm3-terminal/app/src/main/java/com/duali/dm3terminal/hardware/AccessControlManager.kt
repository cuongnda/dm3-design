package com.duali.dm3terminal.hardware

import com.duali.dm3terminal.BuildConfig
import android.util.Log
import com.duali.dm3terminal.data.local.dao.ConfigDao
import com.duali.dm3terminal.data.local.dao.FaceTemplateDao
import com.duali.dm3terminal.data.local.entities.ConfigEntity
import com.duali.dm3terminal.domain.AccessDecision
import com.duali.dm3terminal.domain.AccessEngine
import com.duali.dm3terminal.domain.RecognitionConfig
import com.duali.dm3terminal.mqtt.MqttService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import android.graphics.Bitmap
import android.graphics.ImageFormat
import android.graphics.Matrix
import android.graphics.Rect
import android.graphics.YuvImage
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import kotlinx.coroutines.channels.Channel
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
    data class MultiFactorPending(val personId: String, val personName: String?, val completedMethod: String, val requiredMethods: List<String>) : AccessEvent()
    data class PinRequired(val personId: String, val personName: String?) : AccessEvent()
    object FaceDetected : AccessEvent()
    object Idle : AccessEvent()
}

enum class HardwareStatus {
    NOT_INITIALIZED, INITIALIZING, READY, ERROR
}

/**
 * Orchestrates hardware (face, NFC, Wiegand) with the access engine.
 * Phase 4: Added DoorController, MultiFactorManager, WiegandOutput, NfcCardService.
 */
@Singleton
class AccessControlManager @Inject constructor(
    private val facePassManager: FacePassManager,
    private val nfcReader: NfcReader,
    private val wiegandReader: WiegandReader,
    private val faceCamera: FaceCamera,
    private val accessEngine: AccessEngine,
    private val configDao: ConfigDao,
    private val faceTemplateDao: FaceTemplateDao,
    private val mqttService: MqttService,
    private val doorController: DoorController,
    private val multiFactorManager: MultiFactorManager,
    private val wiegandOutput: WiegandOutput,
    private val nfcCardService: NfcCardService,
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
    private var configJob: Job? = null
    private var nfcCardServiceJob: Job? = null
    private var isStarted = false

    // Cooldown: track last recognition time per person
    private val cooldownMap = mutableMapOf<String, Long>()
    private var config = RecognitionConfig()

    // Software-rendered camera preview (SurfaceView causes kernel panic on DF-970)
    private val _previewBitmap = MutableStateFlow<ImageBitmap?>(null)
    val previewBitmap: StateFlow<ImageBitmap?> = _previewBitmap
    private var previewFrameCount = 0

    // FPS counter for debug overlay
    private val _currentFps = MutableStateFlow(0)
    val currentFps: StateFlow<Int> = _currentFps
    private var fpsFrameCount = 0
    private var fpsLastTime = System.currentTimeMillis()
    // Camera2 ImageReader on DF-970 camera "100": sensor orientation = 270°
    // Raw NV21 is landscape (1280x720), device is portrait (480x800)
    // Need to rotate 270° to get correct portrait orientation
    private val rotationMatrix = Matrix().apply { postRotate(90f) }

    /**
     * Initialize all hardware. Call once at app start.
     */
    suspend fun initialize() {
        _status.value = HardwareStatus.INITIALIZING
        try {
            // Load config from Room
            loadConfig()

            if (BuildConfig.HARDWARE_SAFE_MODE) {
                Log.w(TAG, "HARDWARE_SAFE_MODE — all hardware except camera/face recognition")
                try { nfcReader.open(); Log.i(TAG, "NFC OK") } catch (e: Throwable) { Log.e(TAG, "NFC fail", e) }
                try { wiegandReader.open(); Log.i(TAG, "Wiegand OK") } catch (e: Throwable) { Log.e(TAG, "Wiegand fail", e) }
                try { doorController.startMonitoring(); Log.i(TAG, "Door monitor OK") } catch (e: Throwable) { Log.e(TAG, "Door fail", e) }
                // Skip FacePass + camera — causes kernel panic on current firmware
                Log.w(TAG, "Camera/FacePass SKIPPED — kernel panic on Camera1 API")
                _status.value = HardwareStatus.READY
                return
            }

            // Initialize FacePass (may fail if native lib corrupted)
            try {
                val faceReady = facePassManager.initialize()
                if (!faceReady) {
                    Log.w(TAG, "FacePass init failed (may need device license)")
                }
            } catch (e: Throwable) {
                Log.e(TAG, "FacePass init error", e)
            }

            // Open NFC (graceful — may not be available)
            try {
                nfcReader.open()
            } catch (e: Throwable) {
                Log.e(TAG, "NFC init error", e)
            }

            // Open Wiegand (graceful — JNI may fail)
            try {
                wiegandReader.open()
            } catch (e: Throwable) {
                Log.e(TAG, "Wiegand init error", e)
            }

            // Start door monitoring (graceful — GPIO may not be available)
            try {
                doorController.startMonitoring()
            } catch (e: Throwable) {
                Log.e(TAG, "Door monitoring init error", e)
            }

            _status.value = HardwareStatus.READY
            Log.d(TAG, "Hardware initialized (face=${facePassManager.isReady})")
        } catch (e: Exception) {
            Log.e(TAG, "Hardware init error", e)
            _status.value = HardwareStatus.ERROR
        }
    }

    private suspend fun loadConfig() {
        try {
            val entity = configDao.get(RecognitionConfig.CONFIG_KEY)
            if (entity != null) {
                config = RecognitionConfig.fromJson(entity.valueJson)
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to load recognition config", e)
        }
    }

    /**
     * Update recognition config and persist to Room.
     */
    suspend fun updateConfig(newConfig: RecognitionConfig) {
        config = newConfig
        configDao.set(ConfigEntity(RecognitionConfig.CONFIG_KEY, newConfig.toJson()))
        Log.d(TAG, "Config updated: $newConfig")
    }

    fun getConfig(): RecognitionConfig = config

    /**
     * Start all credential monitoring (face, NFC, Wiegand).
     */
    fun start() {
        if (isStarted) return
        isStarted = true

        // Turn on IR LED for face recognition
        HardwareController.irOn()
        HardwareController.ledScanning()

        // Watch config changes
        configJob = scope.launch {
            configDao.observe(RecognitionConfig.CONFIG_KEY).collect { entity ->
                if (entity != null) {
                    config = RecognitionConfig.fromJson(entity.valueJson)
                    Log.d(TAG, "Config reloaded: $config")
                }
            }
        }

        startFaceRecognition()
        startNfcPolling()
        startWiegandPolling()
        startNfcCardServicePolling()

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
        configJob?.cancel()
        nfcCardServiceJob?.cancel()

        faceCamera.stop()
        HardwareController.irOff()
        HardwareController.ledOff()

        Log.d(TAG, "Access control stopped")
    }

    /** Pause camera to avoid kernel panic during touch-heavy screens (PIN, settings). */
    fun pauseCamera() {
        faceCamera.stop()
        _previewBitmap.value = null
        Log.d(TAG, "Camera paused")
    }

    /** Resume camera after returning to idle screen. */
    fun resumeCamera() {
        if (isStarted && facePassManager.isReady) {
            startFaceRecognition()
            Log.d(TAG, "Camera resumed")
        }
    }

    /**
     * Shutdown and release all hardware resources.
     */
    fun shutdown() {
        stop()
        nfcReader.close()
        wiegandReader.close()
        facePassManager.release()
        nfcCardService.release()
        doorController.stopMonitoring()
        scope.cancel()
    }

    /**
     * Handle PIN entry for multi-factor auth (Card+PIN flow).
     */
    suspend fun handlePinEntry(personId: String, pin: String) {
        val decision = accessEngine.evaluate(
            credentialType = "pin",
            credentialValue = pin,
            doorId = DEFAULT_DOOR_ID,
            skipMultiFactor = true,
        )

        if (decision.personId == personId && decision.granted) {
            // PIN matches same person — MFA satisfied
            multiFactorManager.clearPending(personId)
            onAccessGranted(decision, "card+pin", null)
        } else {
            multiFactorManager.clearPending(personId)
            onAccessDenied("denied_pin_mismatch", "card+pin")
        }
    }

    // Frame data for sequential processing
    private data class FrameData(val nv21: ByteArray, val width: Int, val height: Int)
    private val frameChannel = Channel<FrameData>(capacity = 1, onBufferOverflow = kotlinx.coroutines.channels.BufferOverflow.DROP_OLDEST)
    private var lastDeniedTime = 0L

    private fun startFaceRecognition() {
        if (!facePassManager.isReady) {
            Log.w(TAG, "FacePass not ready, skipping face recognition (camera available)")
            return
        }

        Log.d(TAG, "Starting face recognition pipeline")

        // Single consumer coroutine — processes frames sequentially (critical for FacePass tracking)
        faceJob = scope.launch(Dispatchers.Default) {
            Log.d(TAG, "Face recognition consumer started")
            for (frame in frameChannel) {
                try {
                    val result = facePassManager.processFrame(frame.nv21, frame.width, frame.height)
                    if (result != null) {
                        Log.d(TAG, "Face result: match=${result.isMatch}, confidence=${result.confidence}, personId=${result.personId}, trackId=${result.trackId}")
                        if (result.isMatch && result.personId != null) {
                            val personId = faceTemplateDao.getPersonIdByFaceToken(result.personId)
                            if (personId != null) {
                                val now = System.currentTimeMillis()
                                val lastTime = cooldownMap[personId] ?: 0L
                                if (now - lastTime < config.cooldownMs) {
                                    continue
                                }
                                cooldownMap[personId] = now
                                Log.d(TAG, "Face GRANTED: $personId")
                                handleFaceMatch(result.copy(personId = personId))
                            } else {
                                Log.d(TAG, "Face token not in DB, emitting denied")
                                val now = System.currentTimeMillis()
                                if (now - lastDeniedTime > 4000) {
                                    lastDeniedTime = now
                                    _events.emit(AccessEvent.FaceDenied("Face not registered"))
                                }
                            }
                        } else if (!result.isMatch) {
                            Log.d(TAG, "Face not recognized (no match)")
                            val now = System.currentTimeMillis()
                            if (now - lastDeniedTime > 4000) {
                                lastDeniedTime = now
                                _events.emit(AccessEvent.FaceDenied("Face not recognized"))
                            }
                        }
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "Face frame error: ${e.message}")
                }
            }
        }

        // Preview bitmap channel — separate from face recognition to avoid blocking
        val previewChannel = Channel<FrameData>(capacity = 1, onBufferOverflow = kotlinx.coroutines.channels.BufferOverflow.DROP_OLDEST)

        // Preview consumer — runs on IO dispatcher to avoid blocking main/camera thread
        scope.launch(Dispatchers.IO) {
            for (frame in previewChannel) {
                try {
                    val yuvImage = YuvImage(frame.nv21, ImageFormat.NV21, frame.width, frame.height, null)
                    val out = java.io.ByteArrayOutputStream()
                    yuvImage.compressToJpeg(Rect(0, 0, frame.width, frame.height), 40, out)
                    val bytes = out.toByteArray()
                    val bmp = android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                    if (bmp != null) {
                        val rotated = Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, rotationMatrix, true)
                        _previewBitmap.value = rotated.asImageBitmap()
                        if (rotated !== bmp) bmp.recycle()
                        fpsFrameCount++
                        val now = System.currentTimeMillis()
                        if (now - fpsLastTime >= 1000) {
                            _currentFps.value = fpsFrameCount
                            fpsFrameCount = 0
                            fpsLastTime = now
                        }
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "Preview bitmap error: ${e.message}")
                }
            }
        }

        faceCamera.setFrameCallback(object : FaceCamera.FrameCallback {
            override fun onFrame(nv21Data: ByteArray, width: Int, height: Int) {
                previewFrameCount++

                // Preview every 4th frame (offloaded to IO thread)
                if (previewFrameCount % 4 == 0) {
                    previewChannel.trySend(FrameData(nv21Data.copyOf(), width, height))
                }

                // FacePass every frame (needs its own copy since Camera1 reuses buffer)
                frameChannel.trySend(FrameData(nv21Data.copyOf(), width, height))
            }
        })

        faceCamera.start()
    }

    private fun startNfcPolling() {
        nfcJob = scope.launch {
            nfcReader.cardFlow().collect { cardId ->
                handleCardCredential(cardId, "nfc")
            }
        }
    }

    private fun startWiegandPolling() {
        wiegandJob = scope.launch {
            wiegandReader.cardFlow().collect { cardId ->
                handleCardCredential(cardId, "wiegand")
            }
        }
    }

    private fun startNfcCardServicePolling() {
        nfcCardServiceJob = scope.launch {
            nfcCardService.cardEvents.collect { event ->
                handleCardCredential(event.uid, "card")
            }
        }
    }

    private suspend fun handleFaceMatch(result: FaceResult) {
        val decision = accessEngine.evaluate(
            credentialType = "face",
            credentialValue = result.personId ?: "",
            doorId = DEFAULT_DOOR_ID,
        )

        if (decision.requiresMultiFactor) {
            handleMultiFactor(decision, "face", result.personId ?: "")
            return
        }

        mqttService.publishAccessEvent(decision, "face", DEFAULT_DOOR_ID)

        if (decision.granted) {
            onAccessGranted(decision, "face", null)
            _events.emit(AccessEvent.FaceGranted(decision.personId ?: "", decision.personName))
        } else {
            onAccessDenied(decision.reason, "face")
            _events.emit(AccessEvent.FaceDenied(decision.reason))
        }
    }

    private suspend fun handleCardCredential(cardId: String, source: String) {
        Log.d(TAG, "$source card: $cardId")
        // Look up as "card" type in credentials (unified for nfc/wiegand/card sources)
        val credType = if (source == "wiegand") "wiegand" else "card"
        val decision = accessEngine.evaluate(
            credentialType = credType,
            credentialValue = cardId,
            doorId = DEFAULT_DOOR_ID,
        )

        if (decision.requiresMultiFactor) {
            handleMultiFactor(decision, credType, cardId)
            return
        }

        mqttService.publishAccessEvent(decision, source, DEFAULT_DOOR_ID)

        if (decision.granted) {
            onAccessGranted(decision, source, cardId)
            when (source) {
                "wiegand" -> _events.emit(AccessEvent.WiegandGranted(decision.personId ?: "", decision.personName, cardId))
                else -> _events.emit(AccessEvent.NfcGranted(decision.personId ?: "", decision.personName, cardId))
            }
        } else {
            onAccessDenied(decision.reason, source)
            when (source) {
                "wiegand" -> _events.emit(AccessEvent.WiegandDenied(cardId, decision.reason))
                else -> _events.emit(AccessEvent.NfcDenied(cardId, decision.reason))
            }
        }
    }

    private suspend fun handleMultiFactor(decision: AccessDecision, credentialType: String, credentialValue: String) {
        val personId = decision.personId ?: return
        val methods = decision.multiFactorMethods ?: listOf("face", "card")

        val mfaResult = multiFactorManager.processCredential(
            personId = personId,
            credentialType = credentialType,
            credentialValue = credentialValue,
            requiredMethods = methods,
        )

        when (mfaResult) {
            is MultiFactorResult.PendingSecondFactor -> {
                // Check if PIN is the second required method
                val remainingMethods = methods.filter { it != credentialType }
                if (remainingMethods.contains("pin")) {
                    _events.emit(AccessEvent.PinRequired(personId, decision.personName))
                } else {
                    _events.emit(AccessEvent.MultiFactorPending(
                        personId = personId,
                        personName = decision.personName,
                        completedMethod = credentialType,
                        requiredMethods = methods,
                    ))
                }
            }
            is MultiFactorResult.Satisfied -> {
                // Both factors done — grant access
                val finalDecision = accessEngine.evaluate(
                    credentialType = credentialType,
                    credentialValue = credentialValue,
                    doorId = DEFAULT_DOOR_ID,
                    skipMultiFactor = true,
                )
                mqttService.publishAccessEvent(finalDecision, "multi_factor", DEFAULT_DOOR_ID)
                if (finalDecision.granted) {
                    onAccessGranted(finalDecision, "multi_factor", credentialValue)
                    _events.emit(AccessEvent.NfcGranted(personId, decision.personName, credentialValue))
                } else {
                    onAccessDenied(finalDecision.reason, "multi_factor")
                }
            }
            is MultiFactorResult.Timeout -> {
                mqttService.publishAccessEvent(
                    AccessDecision(false, "denied_mfa_timeout", personId, decision.personName),
                    credentialType, DEFAULT_DOOR_ID,
                )
                onAccessDenied("denied_mfa_timeout", credentialType)
                _events.emit(AccessEvent.NfcDenied(credentialValue, "denied_mfa_timeout"))
            }
            is MultiFactorResult.SameFactorRejected -> {
                // Same factor type — just re-emit pending
                _events.emit(AccessEvent.MultiFactorPending(
                    personId = personId,
                    personName = decision.personName,
                    completedMethod = credentialType,
                    requiredMethods = methods,
                ))
            }
            is MultiFactorResult.PersonMismatch -> {
                onAccessDenied("denied_mfa_person_mismatch", credentialType)
            }
        }
    }

    private fun onAccessGranted(decision: AccessDecision, method: String, cardId: String?) {
        doorController.grantAccess()

        // Wiegand output on successful card-based access
        if (cardId != null && cardId.isNotEmpty()) {
            wiegandOutput.sendCardNumber(cardId)
        }
    }

    private fun onAccessDenied(reason: String, method: String) {
        doorController.denyAccess()
    }
}
