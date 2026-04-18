@file:Suppress("DEPRECATION")

package com.duali.dm3terminal.hardware

import android.content.Context
import android.graphics.ImageFormat
import android.hardware.Camera
import android.util.Log
import android.view.SurfaceHolder

/**
 * Camera1 API wrapper for FacePass face recognition on DF-970.
 *
 * Camera2 API causes frequent kernel panics on DF-970 (RK3568).
 * Camera1 is what the old Duall Master app uses successfully.
 *
 * DF-970 Camera1 config (from old app ConfigUtil.java):
 * - Camera ID: 1 (front face camera, maps to Camera2 ID "100")
 * - Resolution: 1280x720
 * - Format: NV21 (native, no conversion needed)
 * - Rotation: 270 (for FacePass feedFrame)
 */
class FaceCamera(private val context: Context) {

    companion object {
        private const val TAG = "FaceCamera"
        // DF-970 Camera1 ID: 1 = front face camera (same as Camera2 "100")
        private const val CAMERA_ID = 1
        // Use 640x480 to reduce CPU load (was 1280x720 — caused overheating)
        const val PREVIEW_WIDTH = 640
        const val PREVIEW_HEIGHT = 480
    }

    interface FrameCallback {
        fun onFrame(nv21Data: ByteArray, width: Int, height: Int)
    }

    private var camera: Camera? = null
    private var callback: FrameCallback? = null
    @Volatile
    private var isRunning = false
    private var frameBuffer: ByteArray? = null
    // Must keep a strong reference — GC kills the SurfaceTexture and camera stops
    private var dummyTexture: android.graphics.SurfaceTexture? = null

    fun setFrameCallback(cb: FrameCallback) {
        callback = cb
    }

    fun start(surfaceHolder: SurfaceHolder? = null) {
        if (isRunning) return

        try {
            val cam = Camera.open(CAMERA_ID)
            camera = cam

            val params = cam.parameters
            params.setPreviewSize(PREVIEW_WIDTH, PREVIEW_HEIGHT)
            params.previewFormat = ImageFormat.NV21

            // Log supported sizes for debugging
            val sizes = params.supportedPreviewSizes
            Log.d(TAG, "Supported preview sizes: ${sizes.joinToString { "${it.width}x${it.height}" }}")

            cam.parameters = params

            // Allocate buffers for callback (triple buffer)
            val bufSize = PREVIEW_WIDTH * PREVIEW_HEIGHT * 3 / 2
            frameBuffer = ByteArray(bufSize)

            // Use SurfaceTexture (dummy) since we don't need hardware preview
            // (SurfaceView causes kernel panic on DF-970)
            // detachFromGLContext() prevents GL thread from abandoning the BufferQueue
            val tex = android.graphics.SurfaceTexture(42)
            tex.detachFromGLContext()
            dummyTexture = tex
            cam.setPreviewTexture(tex)

            // Use setPreviewCallback (not buffer-based) — more reliable on DF-970
            // Camera allocates its own buffers internally
            cam.setPreviewCallback(object : Camera.PreviewCallback {
                override fun onPreviewFrame(data: ByteArray?, camera: Camera?) {
                    if (data != null && isRunning) {
                        callback?.onFrame(data, PREVIEW_WIDTH, PREVIEW_HEIGHT)
                    }
                }
            })

            cam.startPreview()
            isRunning = true
            Log.d(TAG, "Camera1 started (id=$CAMERA_ID, ${PREVIEW_WIDTH}x${PREVIEW_HEIGHT}, NV21)")

        } catch (e: Exception) {
            Log.e(TAG, "Failed to open Camera1: ${e.message}", e)
            cleanup()
        }
    }

    fun stop() {
        isRunning = false
        try {
            camera?.setPreviewCallbackWithBuffer(null)
            camera?.stopPreview()
            camera?.release()
            camera = null
            frameBuffer = null
            dummyTexture?.release()
            dummyTexture = null
            Log.d(TAG, "Camera1 stopped")
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping camera: ${e.message}", e)
        }
    }

    fun isRunning(): Boolean = isRunning

    private fun cleanup() {
        camera?.release()
        camera = null
        frameBuffer = null
    }
}
