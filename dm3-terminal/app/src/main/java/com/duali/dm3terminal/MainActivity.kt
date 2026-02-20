package com.duali.dm3terminal

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

    private val recognitionViewModel: RecognitionViewModel by viewModels()

    private var faceService: FaceRecognitionService? = null
    private var bound = false

    private val connection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
            val binder = service as FaceRecognitionService.LocalBinder
            faceService = binder.getService()
            bound = true
            faceService?.startRecognition()
        }

        override fun onServiceDisconnected(name: ComponentName?) {
            faceService = null
            bound = false
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

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

        // Bind to FaceRecognitionService
        Intent(this, FaceRecognitionService::class.java).also { intent ->
            bindService(intent, connection, Context.BIND_AUTO_CREATE)
        }

        setContent {
            DM3Theme {
                DM3NavHost(
                    mqttService = mqttService,
                    recognitionViewModel = recognitionViewModel,
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
}
