package com.duali.dm3terminal.service

import android.app.Service
import android.content.Intent
import android.os.Binder
import android.os.IBinder
import android.util.Log
import com.duali.dm3terminal.hardware.AccessControlManager
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.*
import javax.inject.Inject

/**
 * Bound service that wraps AccessControlManager for continuous face recognition.
 * Activities bind to this to receive access events and control the recognition pipeline.
 */
@AndroidEntryPoint
class FaceRecognitionService : Service() {

    companion object {
        private const val TAG = "FaceRecognitionSvc"
    }

    @Inject lateinit var accessControlManager: AccessControlManager

    private val binder = LocalBinder()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var isInitialized = false

    inner class LocalBinder : Binder() {
        fun getService(): FaceRecognitionService = this@FaceRecognitionService
    }

    override fun onBind(intent: Intent?): IBinder = binder

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "Service created")
        scope.launch {
            try {
                accessControlManager.initialize()
                isInitialized = true
                Log.d(TAG, "Hardware initialized")
            } catch (e: Exception) {
                Log.e(TAG, "Hardware init failed", e)
            }
        }
    }

    fun startRecognition() {
        if (!isInitialized) {
            Log.w(TAG, "Not initialized yet, deferring start")
            scope.launch {
                // Wait for init
                while (!isInitialized) delay(100)
                accessControlManager.start()
                Log.d(TAG, "Recognition started (deferred)")
            }
            return
        }
        accessControlManager.start()
        Log.d(TAG, "Recognition started")
    }

    fun stopRecognition() {
        accessControlManager.stop()
        Log.d(TAG, "Recognition stopped")
    }

    fun getManager(): AccessControlManager = accessControlManager

    override fun onDestroy() {
        super.onDestroy()
        accessControlManager.shutdown()
        scope.cancel()
        Log.d(TAG, "Service destroyed")
    }
}
