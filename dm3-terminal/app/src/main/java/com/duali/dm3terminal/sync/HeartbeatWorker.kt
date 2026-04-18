package com.duali.dm3terminal.sync

import android.content.Context
import android.util.Log
import androidx.hilt.work.HiltWorker
import androidx.work.*
import com.duali.dm3terminal.data.repository.DM3Repository
import com.duali.dm3terminal.mqtt.MqttConnectionState
import com.duali.dm3terminal.mqtt.MqttService
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import java.util.concurrent.TimeUnit

/**
 * Worker that sends device heartbeat every 30 seconds via MQTT.
 * Includes: device status, firmware version, uptime, last sync time, person count.
 *
 * Note: WorkManager has a minimum interval of 15 minutes for periodic work.
 * The actual 30s heartbeat is handled by MqttService's internal coroutine loop.
 * This worker serves as a backup and also triggers on-reconnect heartbeats.
 */
@HiltWorker
class HeartbeatWorker @AssistedInject constructor(
    @Assisted context: Context,
    @Assisted params: WorkerParameters,
    private val mqttService: MqttService,
    private val repository: DM3Repository,
    private val syncManager: SyncManager,
) : CoroutineWorker(context, params) {

    companion object {
        private const val TAG = "HeartbeatWorker"
        private const val WORK_NAME = "dm3_heartbeat_worker"

        fun enqueue(context: Context) {
            // WorkManager minimum is 15 min; the real 30s heartbeat runs in MqttService coroutine.
            // This is a fallback to ensure heartbeats resume if the service restarts.
            val request = PeriodicWorkRequestBuilder<HeartbeatWorker>(15, TimeUnit.MINUTES)
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build()
                )
                .build()

            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                WORK_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                request,
            )
            Log.i(TAG, "HeartbeatWorker enqueued (15 min fallback)")
        }
    }

    override suspend fun doWork(): Result {
        if (mqttService.connectionState.value != MqttConnectionState.CONNECTED) {
            return Result.retry()
        }

        val config = mqttService.getCurrentConfig() ?: return Result.retry()
        val personCount = repository.getPersonCount()
        val lastSyncTime = syncManager.getLastSyncTime()

        mqttService.publishHeartbeat(config, personCount, lastSyncTime)
        Log.d(TAG, "Heartbeat sent (persons=$personCount)")

        return Result.success()
    }
}
