package com.duali.dm3terminal.sync

import android.content.Context
import android.util.Log
import androidx.hilt.work.HiltWorker
import androidx.work.*
import com.duali.dm3terminal.data.local.dao.EventQueueDao
import com.duali.dm3terminal.mqtt.MqttConnectionState
import com.duali.dm3terminal.mqtt.MqttService
import com.hivemq.client.mqtt.datatypes.MqttQos
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Worker that drains the offline event queue when network is available.
 * Runs periodically and also on-demand when connectivity is restored.
 */
@HiltWorker
class EventUploadWorker @AssistedInject constructor(
    @Assisted context: Context,
    @Assisted params: WorkerParameters,
    private val mqttService: MqttService,
    private val eventQueueDao: EventQueueDao,
) : CoroutineWorker(context, params) {

    companion object {
        private const val TAG = "EventUploadWorker"
        private const val WORK_NAME = "dm3_event_upload_worker"
        private const val BATCH_SIZE = 100
        private const val MAX_RETRIES = 3

        fun enqueue(context: Context) {
            val request = PeriodicWorkRequestBuilder<EventUploadWorker>(1, TimeUnit.MINUTES)
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
            Log.i(TAG, "EventUploadWorker enqueued")
        }
    }

    override suspend fun doWork(): Result {
        if (mqttService.connectionState.value != MqttConnectionState.CONNECTED) {
            return Result.retry()
        }

        var totalSent = 0
        while (true) {
            val pending = eventQueueDao.getPending(BATCH_SIZE)
            if (pending.isEmpty()) break

            val sent = mutableListOf<String>()
            for (event in pending) {
                if (event.retryCount >= MAX_RETRIES) {
                    // Mark as failed by deleting (event is lost)
                    sent.add(event.messageId)
                    Log.w(TAG, "Dropping event ${event.messageId} after $MAX_RETRIES retries")
                    continue
                }

                val ok = mqttService.publishDirect(
                    event.topic,
                    JSONObject(event.payloadJson),
                    MqttQos.AT_LEAST_ONCE,
                )
                if (ok) {
                    sent.add(event.messageId)
                } else {
                    break // Connection may have dropped
                }
            }

            if (sent.isNotEmpty()) {
                eventQueueDao.deleteByIds(sent)
                totalSent += sent.size
            }

            if (sent.size < pending.size) break // Some failed, stop
        }

        if (totalSent > 0) {
            Log.i(TAG, "Uploaded $totalSent queued events")
        }
        return Result.success()
    }
}
