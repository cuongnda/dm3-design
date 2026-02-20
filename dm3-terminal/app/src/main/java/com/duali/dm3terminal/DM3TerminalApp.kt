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
import javax.inject.Inject

@HiltAndroidApp
class DM3TerminalApp : Application(), Configuration.Provider {

    @Inject lateinit var workerFactory: HiltWorkerFactory
    @Inject lateinit var crashWatchdog: CrashWatchdog
    @Inject lateinit var kioskManager: KioskManager

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setWorkerFactory(workerFactory)
            .build()

    override fun onCreate() {
        super.onCreate()

        // Install crash watchdog (must be first)
        crashWatchdog.install()

        // Enable kiosk policies if device owner
        if (kioskManager.isDeviceOwner) {
            kioskManager.enableKioskPolicies()
        }

        // Start MQTT foreground service
        MqttForegroundService.start(this)

        // Enqueue periodic workers
        SyncWorker.enqueue(this)
        EventUploadWorker.enqueue(this)
        HeartbeatWorker.enqueue(this)
    }
}
