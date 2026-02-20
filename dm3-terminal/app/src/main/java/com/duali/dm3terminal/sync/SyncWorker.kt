package com.duali.dm3terminal.sync

import android.content.Context
import android.util.Log
import androidx.hilt.work.HiltWorker
import androidx.work.*
import com.duali.dm3terminal.data.DevicePreferences
import com.duali.dm3terminal.data.repository.DM3Repository
import com.duali.dm3terminal.mqtt.MqttConnectionState
import com.duali.dm3terminal.mqtt.MqttService
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.TimeUnit

/**
 * Periodic worker that triggers incremental sync every 5 minutes.
 * Publishes current DB versions in heartbeat so server can send deltas.
 */
@HiltWorker
class SyncWorker @AssistedInject constructor(
    @Assisted context: Context,
    @Assisted params: WorkerParameters,
    private val mqttService: MqttService,
    private val syncManager: SyncManager,
    private val repository: DM3Repository,
    private val devicePreferences: DevicePreferences,
) : CoroutineWorker(context, params) {

    companion object {
        private const val TAG = "SyncWorker"
        private const val WORK_NAME = "dm3_sync_worker"

        fun enqueue(context: Context) {
            val request = PeriodicWorkRequestBuilder<SyncWorker>(5, TimeUnit.MINUTES)
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
            Log.i(TAG, "SyncWorker enqueued (every 5 min)")
        }
    }

    override suspend fun doWork(): Result {
        if (mqttService.connectionState.value != MqttConnectionState.CONNECTED) {
            Log.d(TAG, "MQTT not connected, skipping sync trigger")
            return Result.retry()
        }

        val config = mqttService.getCurrentConfig() ?: return Result.retry()

        // Publish a sync-request heartbeat with current DB versions
        val personCount = repository.getPersonCount()
        val lastSyncTime = syncManager.getLastSyncTime()

        val envelope = JSONObject().apply {
            put("v", 1)
            put("id", UUID.randomUUID().toString())
            put("ts", System.currentTimeMillis())
            put("src", "device:${config.deviceId}")
            put("type", "status.sync_request")
            put("data", JSONObject().apply {
                put("person_count", personCount)
                put("last_sync_time", lastSyncTime)
                // Include versions so server can decide what to send
                put("person_db_version", syncManager.getVersion(SyncManager.KEY_PERSON_DB_VERSION))
                put("rules_version", syncManager.getVersion(SyncManager.KEY_RULES_VERSION))
                put("blacklist_version", syncManager.getVersion(SyncManager.KEY_BLACKLIST_VERSION))
            })
        }

        val topic = mqttService.topicFor(config, "sta")
        mqttService.publishDirect(topic, envelope)
        Log.i(TAG, "Sync request published (persons=$personCount, lastSync=$lastSyncTime)")

        return Result.success()
    }
}
