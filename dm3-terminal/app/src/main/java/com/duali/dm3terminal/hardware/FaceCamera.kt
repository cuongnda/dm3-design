@file:Suppress("DEPRECATION")

package com.duali.dm3terminal.hardware

import android.hardware.Camera
import android.util.Log
import android.view.SurfaceHolder

/**
 * Camera1 API wrapper for FacePass face recognition.
 * FacePass requires NV21 frame data from Camera1 API.
 *
 * DF970 camera config:
 * - Camera ID: 1 (front camera)
 * - Resolution: 1280x720
 * - Rotation: 270
 * - Format: NV21
 */
class FaceCamera {

    companion object {
        private const val TAG = "FaceCamera"
        private const val CAMERA_ID = 1
        const val PREVIEW_WIDTH = 1280
        const val PREVIEW_HEIGHT = 720
    }

    interface FrameCallback {
        fun onFrame(nv21Data: ByteArray, width: Int, height: Int)
    }

    private var camera: Camera? = null
    private var callback: FrameCallback? = null
    private var isRunning = false

    fun setFrameCallback(cb: FrameCallback) {
        callback = cb
    }

    /**
     * Open and start the camera preview.
     * @param surfaceHolder Optional SurfaceHolder for display. Pass null for headless processing.
     */
    fun start(surfaceHolder: SurfaceHolder? = null) {
        if (isRunning) return

        try {
            camera = Camera.open(CAMERA_ID).apply {
                val params = parameters
                params.setPreviewSize(PREVIEW_WIDTH, PREVIEW_HEIGHT)
                params.previewFormat = android.graphics.ImageFormat.NV21
                parameters = params

                // Set display orientation for DF970
                setDisplayOrientation(90)

                if (surfaceHolder != null) {
                    setPreviewDisplay(surfaceHolder)
                } else {
                    // Headless — use a SurfaceTexture
                    setPreviewTexture(android.graphics.SurfaceTexture(0))
                }

                // Pre-allocate buffers
                val bufferSize = PREVIEW_WIDTH * PREVIEW_HEIGHT * 3 / 2
                addCallbackBuffer(ByteArray(bufferSize))
                addCallbackBuffer(ByteArray(bufferSize))
                addCallbackBuffer(ByteArray(bufferSize))

                setPreviewCallbackWithBuffer { data, cam ->
                    if (data != null) {
                        callback?.onFrame(data, PREVIEW_WIDTH, PREVIEW_HEIGHT)
                    }
                    cam?.addCallbackBuffer(data)
                }

                startPreview()
            }
            isRunning = true
            Log.d(TAG, "Camera started")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start camera", e)
            camera?.release()
            camera = null
        }
    }

    fun stop() {
        try {
            camera?.apply {
                setPreviewCallbackWithBuffer(null)
                stopPreview()
                release()
            }
            camera = null
            isRunning = false
            Log.d(TAG, "Camera stopped")
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping camera", e)
        }
    }

    fun isRunning(): Boolean = isRunning
}
