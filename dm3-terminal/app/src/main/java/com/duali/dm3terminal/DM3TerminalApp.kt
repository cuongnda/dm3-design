package com.duali.dm3terminal

import android.app.Application
import androidx.hilt.work.HiltWorkerFactory
import androidx.work.Configuration
import com.duali.dm3terminal.admin.CrashWatchdog
import com.duali.dm3terminal.admin.KioskManager
import com.duali.dm3terminal.mqtt.MqttForegroundService
import com.duali.dm3terminal.sync.EventUploadWorker
import com.duali.dm3terminal.sync.HeartbeatWorker
import com.duali.dm3terminal.sync.SyncWorker
import dagger.hilt.android.HiltAndroidApp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltAndroidApp
class DM3TerminalApp : Application(), Configuration.Provider {

    @Inject lateinit var workerFactory: HiltWorkerFactory
    @Inject lateinit var crashWatchdog: CrashWatchdog
    @Inject lateinit var kioskManager: KioskManager

    private val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setWorkerFactory(workerFactory)
            .build()

    override fun onCreate() {
        super.onCreate()

        // Install crash watchdog (must be first — lightweight, stays on main thread)
        crashWatchdog.install()

        // Move heavy init off main thread to avoid jank / ANR
        appScope.launch {
            // Enable kiosk policies if device owner
            if (kioskManager.isDeviceOwner) {
                kioskManager.enableKioskPolicies()
            }
        }

        // Delay MQTT + workers slightly to let UI render first
        appScope.launch {
            kotlinx.coroutines.delay(1000)
            MqttForegroundService.start(this@DM3TerminalApp)
            SyncWorker.enqueue(this@DM3TerminalApp)
            EventUploadWorker.enqueue(this@DM3TerminalApp)
            HeartbeatWorker.enqueue(this@DM3TerminalApp)
        }
    }
}
