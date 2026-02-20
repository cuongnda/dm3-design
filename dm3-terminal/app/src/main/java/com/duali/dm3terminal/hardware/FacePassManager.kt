package com.duali.dm3terminal.hardware

import android.content.Context
import android.graphics.Bitmap
import android.os.Environment
import android.util.Log
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import mcv.facepass.FacePassException
import mcv.facepass.FacePassHandler
import mcv.facepass.types.FacePassConfig
import mcv.facepass.types.FacePassImage
import mcv.facepass.types.FacePassImageType
import mcv.facepass.types.FacePassModel
import mcv.facepass.types.FacePassPose
import mcv.facepass.types.FacePassRecognitionResult
import mcv.facepass.types.FacePassRecognitionState
import mcv.facepass.types.FacePassTrackOptions
import mcv.facepass.types.FacePassRCAttribute
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume

data class FaceResult(
    val personId: String?,
    val confidence: Float,
    val isLive: Boolean,
    val isMatch: Boolean,
    val trackId: Long = 0,
)

/**
 * Manages Megvii FacePass SDK for face recognition on DF970.
 *
 * Camera must use Camera1 API with NV21 format.
 * Camera rotation = 270 on DF970.
 * Resolution: 1280x720.
 */
@Singleton
class FacePassManager @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    companion object {
        private const val TAG = "FacePassManager"
        const val GROUP_NAME = "DualiPass"
        // Camera1 on DF-970: same as old app ConfigUtil.CAMERA_ROTATION
        const val CAMERA_ROTATION = 270
        const val CAMERA_WIDTH = 1280
        const val CAMERA_HEIGHT = 720
        const val CAMERA_ID = "100" // Main face camera on DF970 (Camera2 ID)

        // Thresholds
        private const val SEARCH_THRESHOLD = 65f
        private const val LIVENESS_THRESHOLD = 80f
        private const val LIVENESS_GA_THRESHOLD = 85f
    }

    private var handler: FacePassHandler? = null
    private var processFrameCount = 0L

    val isReady: Boolean get() = handler != null

    /**
     * Initialize FacePass SDK. Must be called before any other operations.
     * Returns true if initialization successful.
     */
    suspend fun initialize(): Boolean = withContext(Dispatchers.IO) {
        if (handler != null) return@withContext true

        try {
            // Init SDK — may throw UnsatisfiedLinkError if native lib is corrupted
            try {
                FacePassHandler.initSDK(context.applicationContext, "")
            } catch (e: UnsatisfiedLinkError) {
                Log.e(TAG, "FacePass native library failed to load — face recognition unavailable", e)
                return@withContext false
            }

            // Wait for SDK to become available
            var retries = 0
            while (!FacePassHandler.isAvailable() && retries < 20) {
                Thread.sleep(500)
                retries++
            }

            if (!FacePassHandler.isAvailable()) {
                Log.e(TAG, "FacePass SDK not available after waiting")
                return@withContext false
            }

            // Build config
            val assets = context.applicationContext.assets
            val config = FacePassConfig().apply {
                poseBlurModel = FacePassModel.initModel(assets, "attr.pose_blur.arm.190630.bin")
                livenessModel = FacePassModel.initModel(assets, "liveness.CPU.rgb.G.bin")
                searchModel = FacePassModel.initModel(assets, "feat2.arm.K.v1.0_1core.bin")
                detectModel = FacePassModel.initModel(assets, "detector.arm.G.bin")
                detectRectModel = FacePassModel.initModel(assets, "detector_rect.arm.G.bin")
                landmarkModel = FacePassModel.initModel(assets, "pf.lmk.arm.E.bin")
                rcAttributeModel = FacePassModel.initModel(assets, "attr.RC.arm.G.bin")
                occlusionFilterModel = FacePassModel.initModel(assets, "attr.occlusion.arm.20201209.bin")

                rcAttributeAndOcclusionMode = 1
                searchThreshold = SEARCH_THRESHOLD
                livenessThreshold = LIVENESS_THRESHOLD
                livenessGaThreshold = LIVENESS_GA_THRESHOLD
                livenessEnabled = true
                rgbIrLivenessEnabled = false

                poseThreshold = FacePassPose(35f, 35f, 35f)
                blurThreshold = 0.8f
                lowBrightnessThreshold = 30f
                highBrightnessThreshold = 210f
                brightnessSTDThreshold = 80f
                faceMinThreshold = 60
                retryCount = 10
                smileEnabled = false
                maxFaceEnabled = true
                fileRootPath = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)?.absolutePath ?: ""
            }

            // Create handler
            val facePassHandler = FacePassHandler()
            val ret = facePassHandler.initHandle(config)
            if (ret != 0) {
                Log.e(TAG, "FacePassHandler initHandle failed, error: $ret")
                return@withContext false
            }

            // Configure IR
            facePassHandler.setIRConfig(1.0, 0.0, 1.0, 0.0, 0.3)

            // Configure addFace thresholds
            val addFaceConfig = facePassHandler.addFaceConfig
            addFaceConfig.poseThreshold.pitch = 35f
            addFaceConfig.poseThreshold.roll = 35f
            addFaceConfig.poseThreshold.yaw = 35f
            addFaceConfig.blurThreshold = 0.7f
            addFaceConfig.lowBrightnessThreshold = 70f
            addFaceConfig.highBrightnessThreshold = 220f
            addFaceConfig.brightnessSTDThresholdLow = 14.14f
            addFaceConfig.brightnessSTDThreshold = 63.25f
            addFaceConfig.faceMinThreshold = 100
            addFaceConfig.rcAttributeAndOcclusionMode = 2
            facePassHandler.setAddFaceConfig(addFaceConfig)

            // Create/init group
            val groups = facePassHandler.localGroups
            if (groups == null || !groups.contains(GROUP_NAME)) {
                facePassHandler.createLocalGroup(GROUP_NAME)
            }
            facePassHandler.initLocalGroup(GROUP_NAME)

            handler = facePassHandler
            Log.d(TAG, "FacePass initialized successfully")
            true
        } catch (e: FacePassException) {
            Log.e(TAG, "FacePass initialization failed", e)
            false
        } catch (e: Exception) {
            Log.e(TAG, "FacePass initialization failed (unexpected)", e)
            false
        }
    }

    /**
     * Enroll a face from a bitmap image.
     * Returns the faceToken on success, null on failure.
     */
    suspend fun enrollFace(personId: String, faceImage: Bitmap): String? = withContext(Dispatchers.IO) {
        val h = handler ?: return@withContext null
        try {
            val result = h.addFace(faceImage)
            if (result != null && result.result == 0) {
                val faceToken = String(result.faceToken)
                if (h.bindGroup(GROUP_NAME, result.faceToken)) {
                    Log.d(TAG, "Face enrolled for $personId, token=$faceToken")
                    return@withContext faceToken
                } else {
                    Log.e(TAG, "bindGroup failed for $personId")
                }
            } else {
                Log.e(TAG, "addFace failed, result=${result?.result}")
            }
        } catch (e: FacePassException) {
            Log.e(TAG, "enrollFace error", e)
        }
        null
    }

    /**
     * Remove a face by its faceToken.
     */
    suspend fun removeFace(faceToken: String): Boolean = withContext(Dispatchers.IO) {
        val h = handler ?: return@withContext false
        try {
            h.unBindGroup(GROUP_NAME, faceToken.toByteArray())
            h.deleteFace(faceToken.toByteArray())
            Log.d(TAG, "Face removed: $faceToken")
            true
        } catch (e: FacePassException) {
            Log.e(TAG, "removeFace error", e)
            false
        }
    }

    /**
     * Process a camera frame for face detection and recognition.
     * Feed NV21 data from Camera1 API.
     *
     * @param nv21 Raw NV21 frame data
     * @param width Frame width (1280)
     * @param height Frame height (720)
     * @return FaceResult if a face was recognized, null if no face or not recognized
     */
    suspend fun processFrame(nv21: ByteArray, width: Int, height: Int): FaceResult? = withContext(Dispatchers.IO) {
        val h = handler ?: return@withContext null

        try {
            val image = FacePassImage(nv21, width, height, CAMERA_ROTATION, FacePassImageType.NV21)
            processFrameCount++
            val detectionResult = h.feedFrame(image)
            if (detectionResult == null) {
                if (processFrameCount % 30 == 0L) Log.d(TAG, "feedFrame null (frame #$processFrameCount)")
                return@withContext null
            }

            if (detectionResult.faceList.isEmpty()) {
                if (processFrameCount % 30 == 0L) Log.d(TAG, "No faces (frame #$processFrameCount)")
                return@withContext null
            }

            Log.d(TAG, "Face detected: ${detectionResult.faceList.size} face(s), messages=${detectionResult.message.size}")

            // If there are messages (faces ready for recognition)
            if (detectionResult.message.isNotEmpty()) {
                Log.d(TAG, "Recognition ready: ${detectionResult.message.size} message(s), ${detectionResult.images.size} image(s)")
                // Build track options for masked faces
                val trackOpts = Array(detectionResult.images.size) { i ->
                    val img = detectionResult.images[i]
                    if (img.rcAttr.respiratorType != FacePassRCAttribute.FacePassRespiratorType.INVALID
                        && img.rcAttr.respiratorType != FacePassRCAttribute.FacePassRespiratorType.NO_RESPIRATOR
                    ) {
                        FacePassTrackOptions(img.trackId, 60f, LIVENESS_THRESHOLD, LIVENESS_GA_THRESHOLD, -1.0f)
                    } else {
                        null
                    }
                }

                val recognizeResults = h.recognize(GROUP_NAME, detectionResult.message, 1, trackOpts)
                Log.d(TAG, "Recognize returned: ${recognizeResults?.size ?: "null"} result arrays")
                if (recognizeResults != null) {
                    for (results in recognizeResults) {
                        if (results != null) {
                            for (result in results) {
                                val faceToken = String(result.faceToken)
                                val isMatch = result.recognitionState == FacePassRecognitionState.RECOGNITION_PASS
                                Log.d(TAG, "Result: token=$faceToken, state=${result.recognitionState}, search=${result.detail.searchScore}, liveness=${result.detail.livenessScore}, match=$isMatch")
                                if (isMatch) {
                                    h.setMessage(result.trackId, 0)
                                }
                                return@withContext FaceResult(
                                    personId = faceToken,
                                    confidence = result.detail.searchScore,
                                    isLive = result.detail.livenessScore > LIVENESS_THRESHOLD,
                                    isMatch = isMatch,
                                    trackId = result.trackId,
                                )
                            }
                        }
                    }
                }
            }

            // Face detected but not yet ready for recognition
            null
        } catch (e: FacePassException) {
            Log.w(TAG, "processFrame error: ${e.message}")
            null
        }
    }

    /**
     * Get all face tokens in the current group.
     */
    fun getGroupFaceTokens(): List<String> {
        val h = handler ?: return emptyList()
        return try {
            val tokens = h.getLocalGroupInfo(GROUP_NAME)
            tokens?.map { String(it) } ?: emptyList()
        } catch (e: FacePassException) {
            Log.e(TAG, "getGroupFaceTokens error", e)
            emptyList()
        }
    }

    /**
     * Clear all faces from the group.
     */
    suspend fun clearGroup(): Boolean = withContext(Dispatchers.IO) {
        val h = handler ?: return@withContext false
        try {
            val tokens = h.getLocalGroupInfo(GROUP_NAME)
            tokens?.forEach { token ->
                h.unBindGroup(GROUP_NAME, token)
                h.deleteFace(token)
            }
            true
        } catch (e: FacePassException) {
            Log.e(TAG, "clearGroup error", e)
            false
        }
    }

    /**
     * Release the FacePass handler. Call when shutting down.
     */
    fun release() {
        handler?.release()
        handler = null
        Log.d(TAG, "FacePass released")
    }
}
