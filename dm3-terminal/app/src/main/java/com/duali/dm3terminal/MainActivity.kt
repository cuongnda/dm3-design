package com.duali.dm3terminal

import com.duali.dm3terminal.BuildConfig
import com.duali.dm3terminal.hardware.AccessControlManager
import kotlinx.coroutines.launch
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.os.Bundle
import android.os.IBinder
import android.view.View
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import com.duali.dm3terminal.admin.CrashWatchdog
import com.duali.dm3terminal.admin.KioskManager
import com.duali.dm3terminal.mqtt.MqttService
import com.duali.dm3terminal.service.FaceRecognitionService
import com.duali.dm3terminal.ui.navigation.DM3NavHost
import com.duali.dm3terminal.ui.screens.RecognitionViewModel
import com.duali.dm3terminal.ui.theme.DM3Theme
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject lateinit var mqttService: MqttService
    @Inject lateinit var kioskManager: KioskManager
    @Inject lateinit var crashWatchdog: CrashWatchdog
    @Inject lateinit var accessControlManager: AccessControlManager

    private val recognitionViewModel: RecognitionViewModel by viewModels()

    private var faceService: FaceRecognitionService? = null
    private var bound = false

    private val connection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
            val binder = service as FaceRecognitionService.LocalBinder
            faceService = binder.getService()
            bound = true
            // Don't start face recognition in safe mode
            if (!crashWatchdog.safeMode.value) {
                faceService?.startRecognition()
            }
        }

        override fun onServiceDisconnected(name: ComponentName?) {
            faceService = null
            bound = false
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Record successful start (clears crash counters)
        crashWatchdog.onSuccessfulStart()

        // Keep screen on
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        // Immersive sticky fullscreen
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            or View.SYSTEM_UI_FLAG_FULLSCREEN
            or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
        )

        // Start kiosk / lock task mode if enabled
        if (kioskManager.isKioskEnabled || kioskManager.isDeviceOwner) {
            kioskManager.startLockTask(this)
        }

        // Bind to FaceRecognitionService (skip in safe modes — camera causes kernel panic)
        if (!crashWatchdog.safeMode.value && !BuildConfig.HARDWARE_SAFE_MODE) {
            Intent(this, FaceRecognitionService::class.java).also { intent ->
                bindService(intent, connection, Context.BIND_AUTO_CREATE)
            }
        } else if (BuildConfig.HARDWARE_SAFE_MODE) {
            // Init hardware (NFC, Wiegand, Door) without camera
            kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.IO).launch {
                accessControlManager.initialize()
            }
        }

        setContent {
            DM3Theme {
                DM3NavHost(
                    mqttService = mqttService,
                    recognitionViewModel = recognitionViewModel,
                    accessControlManager = accessControlManager,
                )
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        if (bound) {
            faceService?.stopRecognition()
            unbindService(connection)
            bound = false
        }
    }

    /**
     * Called from admin menu to exit kiosk mode after PIN verification.
     */
    fun exitKioskMode() {
        kioskManager.stopLockTask(this)
    }
}
