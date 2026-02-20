package com.duali.dm3terminal

import android.app.Application
import androidx.hilt.work.HiltWorkerFactory
import androidx.work.Configuration
import com.duali.dm3terminal.mqtt.MqttForegroundService
import com.duali.dm3terminal.sync.EventUploadWorker
import com.duali.dm3terminal.sync.HeartbeatWorker
import com.duali.dm3terminal.sync.SyncWorker
import dagger.hilt.android.HiltAndroidApp
import javax.inject.Inject

@HiltAndroidApp
class DM3TerminalApp : Application(), Configuration.Provider {

    @Inject lateinit var workerFactory: HiltWorkerFactory

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setWorkerFactory(workerFactory)
            .build()

    override fun onCreate() {
        super.onCreate()

        // Start MQTT foreground service
        MqttForegroundService.start(this)

        // Enqueue periodic workers
        SyncWorker.enqueue(this)
        EventUploadWorker.enqueue(this)
        HeartbeatWorker.enqueue(this)
    }
}
