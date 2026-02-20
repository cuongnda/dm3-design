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
                                val personId = faceTemplateDao.getPersonIdByFaceToken(result.personId)
                                if (personId != null) {
                                    val now = System.currentTimeMillis()
                                    val lastTime = cooldownMap[personId] ?: 0L
                                    if (now - lastTime < config.cooldownMs) {
                                        return@launch
                                    }
                                    cooldownMap[personId] = now
                                    handleFaceMatch(result.copy(personId = personId))
                                } else {
                                    _events.emit(AccessEvent.FaceDenied("Face not registered"))
                                }
                            } else if (!result.isMatch) {
                                _events.emit(AccessEvent.FaceDenied("Face not recognized"))
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
