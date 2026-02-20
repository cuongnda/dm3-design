package com.duali.dm3terminal.hardware

import android.content.Context
import android.graphics.ImageFormat
import android.hardware.camera2.*
import android.media.ImageReader
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import android.view.Surface
import android.view.SurfaceHolder

/**
 * Camera2 API wrapper for FacePass face recognition.
 * Replaces Camera1 to avoid kernel panic on DF-970 (RK3568).
 *
 * DF970 camera config:
 * - Camera ID: "1" (front IR camera)
 * - Resolution: 1280x720
 * - Format: YUV_420_888 → converted to NV21
 */
class FaceCamera(private val context: Context) {

    companion object {
        private const val TAG = "FaceCamera"
        // DF-970 Camera2 IDs: "100" (main/face camera), "102" (IR — buggy driver, kernel panic)
        // Old SDK app uses camera "100" for face recognition
        private const val CAMERA_ID = "100"
        const val PREVIEW_WIDTH = 1280
        const val PREVIEW_HEIGHT = 720
        private const val TARGET_FPS = 15
        private const val REOPEN_DELAY_MS = 2000L
    }

    interface FrameCallback {
        fun onFrame(nv21Data: ByteArray, width: Int, height: Int)
    }

    private var cameraDevice: CameraDevice? = null
    private var captureSession: CameraCaptureSession? = null
    private var imageReader: ImageReader? = null
    private var cameraThread: HandlerThread? = null
    private var cameraHandler: Handler? = null
    private var callback: FrameCallback? = null
    @Volatile
    private var isRunning = false
    private var pendingSurfaceHolder: SurfaceHolder? = null

    // Pre-allocated NV21 buffer to reduce GC pressure
    private var nv21Buffer: ByteArray? = null

    fun setFrameCallback(cb: FrameCallback) {
        callback = cb
    }

    /** Attach a preview surface while camera is running — restarts capture session. */
    fun attachPreviewSurface(holder: SurfaceHolder) {
        pendingSurfaceHolder = holder
        if (isRunning) {
            Log.d(TAG, "Attaching preview surface, restarting capture session")
            try { captureSession?.stopRepeating() } catch (_: Exception) {}
            captureSession?.close()
            captureSession = null
            createCaptureSession()
        }
    }

    /** Detach the preview surface — restarts capture session without it. */
    fun detachPreviewSurface() {
        pendingSurfaceHolder = null
        if (isRunning) {
            Log.d(TAG, "Detaching preview surface, restarting capture session")
            try { captureSession?.stopRepeating() } catch (_: Exception) {}
            captureSession?.close()
            captureSession = null
            createCaptureSession()
        }
    }

    fun start(surfaceHolder: SurfaceHolder? = null) {
        if (isRunning) return

        pendingSurfaceHolder = surfaceHolder

        // Start background thread
        val thread = HandlerThread("FaceCamera").apply { start() }
        cameraThread = thread
        cameraHandler = Handler(thread.looper)

        // Create ImageReader
        val reader = ImageReader.newInstance(
            PREVIEW_WIDTH, PREVIEW_HEIGHT,
            ImageFormat.YUV_420_888, 3
        )
        imageReader = reader

        val bufferSize = PREVIEW_WIDTH * PREVIEW_HEIGHT * 3 / 2
        nv21Buffer = ByteArray(bufferSize)

        reader.setOnImageAvailableListener({ ir ->
            val image = ir.acquireLatestImage() ?: return@setOnImageAvailableListener
            try {
                val nv21 = nv21Buffer ?: return@setOnImageAvailableListener
                yuv420888ToNv21(image, nv21)
                callback?.onFrame(nv21, PREVIEW_WIDTH, PREVIEW_HEIGHT)
            } finally {
                image.close()
            }
        }, cameraHandler)

        // Open camera
        try {
            val manager = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
            manager.openCamera(CAMERA_ID, stateCallback, cameraHandler)
        } catch (e: SecurityException) {
            Log.e(TAG, "Camera permission denied", e)
            cleanup()
        } catch (e: CameraAccessException) {
            Log.e(TAG, "Failed to open camera", e)
            cleanup()
        }
    }

    private val stateCallback = object : CameraDevice.StateCallback() {
        override fun onOpened(camera: CameraDevice) {
            Log.d(TAG, "Camera opened")
            cameraDevice = camera
            createCaptureSession()
        }

        override fun onDisconnected(camera: CameraDevice) {
            Log.w(TAG, "Camera disconnected")
            camera.close()
            cameraDevice = null
            isRunning = false
        }

        override fun onError(camera: CameraDevice, error: Int) {
            Log.e(TAG, "Camera error: $error")
            camera.close()
            cameraDevice = null
            isRunning = false
            // Attempt reopen
            cameraHandler?.postDelayed({
                if (!isRunning) {
                    Log.d(TAG, "Attempting camera reopen...")
                    start(pendingSurfaceHolder)
                }
            }, REOPEN_DELAY_MS)
        }
    }

    private fun createCaptureSession() {
        val device = cameraDevice ?: return
        val reader = imageReader ?: return

        val surfaces = mutableListOf<Surface>(reader.surface)
        pendingSurfaceHolder?.let { surfaces.add(it.surface) }

        try {
            device.createCaptureSession(surfaces, object : CameraCaptureSession.StateCallback() {
                override fun onConfigured(session: CameraCaptureSession) {
                    captureSession = session
                    try {
                        val request = device.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW).apply {
                            addTarget(reader.surface)
                            pendingSurfaceHolder?.let { addTarget(it.surface) }
                            // Limit FPS
                            set(
                                CaptureRequest.CONTROL_AE_TARGET_FPS_RANGE,
                                android.util.Range(TARGET_FPS, TARGET_FPS)
                            )
                        }
                        session.setRepeatingRequest(request.build(), null, cameraHandler)
                        isRunning = true
                        Log.d(TAG, "Camera started")
                    } catch (e: CameraAccessException) {
                        Log.e(TAG, "Failed to start capture", e)
                    }
                }

                override fun onConfigureFailed(session: CameraCaptureSession) {
                    Log.e(TAG, "Capture session configuration failed")
                }
            }, cameraHandler)
        } catch (e: CameraAccessException) {
            Log.e(TAG, "Failed to create capture session", e)
        }
    }

    fun stop() {
        isRunning = false
        try {
            captureSession?.close()
            captureSession = null
            cameraDevice?.close()
            cameraDevice = null
            imageReader?.close()
            imageReader = null
            cameraThread?.quitSafely()
            cameraThread = null
            cameraHandler = null
            nv21Buffer = null
            Log.d(TAG, "Camera stopped")
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping camera", e)
        }
    }

    fun isRunning(): Boolean = isRunning

    private fun cleanup() {
        imageReader?.close()
        imageReader = null
        cameraThread?.quitSafely()
        cameraThread = null
        cameraHandler = null
        nv21Buffer = null
    }

    /**
     * Convert YUV_420_888 Image to NV21 byte array.
     * NV21 layout: Y plane followed by interleaved VU.
     *
     * Optimisation: on many devices (including RK3568), the UV plane is already
     * interleaved as VU with pixelStride=2, meaning it's native NV21. We detect
     * this and do a direct copy.
     */
    private fun yuv420888ToNv21(image: android.media.Image, nv21: ByteArray) {
        val yPlane = image.planes[0]
        val uPlane = image.planes[1]
        val vPlane = image.planes[2]

        val yBuffer = yPlane.buffer.rewind() as java.nio.ByteBuffer
        val uBuffer = uPlane.buffer.rewind() as java.nio.ByteBuffer
        val vBuffer = vPlane.buffer.rewind() as java.nio.ByteBuffer

        val yRowStride = yPlane.rowStride
        val uvRowStride = uPlane.rowStride
        val uvPixelStride = uPlane.pixelStride

        val width = image.width
        val height = image.height

        // Validate buffer fits
        val expectedSize = width * height * 3 / 2
        if (nv21.size < expectedSize) return

        // Copy Y plane
        if (yRowStride == width) {
            val ySize = minOf(yBuffer.remaining(), width * height)
            yBuffer.get(nv21, 0, ySize)
        } else {
            for (row in 0 until height) {
                val pos = row * yRowStride
                if (pos + width > yBuffer.capacity()) break
                yBuffer.position(pos)
                yBuffer.get(nv21, row * width, width)
            }
        }

        val uvOffset = width * height
        val uvHeight = height / 2
        val uvWidth = width / 2

        // Fast path: native NV21 (VU interleaved with pixelStride=2)
        if (uvPixelStride == 2 && uvRowStride == width) {
            val uvSize = minOf(vBuffer.remaining(), width * height / 2)
            if (uvSize > 0) {
                vBuffer.get(nv21, uvOffset, uvSize)
            }
            return
        }

        // Slow path: manual interleave
        for (row in 0 until uvHeight) {
            for (col in 0 until uvWidth) {
                val uvIndex = row * uvRowStride + col * uvPixelStride
                if (uvIndex >= vBuffer.capacity() || uvIndex >= uBuffer.capacity()) continue
                val nv21Index = uvOffset + row * width + col * 2
                if (nv21Index + 1 >= nv21.size) continue
                nv21[nv21Index] = vBuffer.get(uvIndex)      // V
                nv21[nv21Index + 1] = uBuffer.get(uvIndex)  // U
            }
        }
    }
}
