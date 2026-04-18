package com.duali.dm3terminal.mqtt

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import com.duali.dm3terminal.R
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

/**
 * Persistent foreground service that keeps the MQTT connection alive.
 * Started on boot and app launch.
 */
@AndroidEntryPoint
class MqttForegroundService : Service() {

    companion object {
        private const val TAG = "MqttFgService"
        private const val CHANNEL_ID = "dm3_mqtt_service"
        private const val NOTIFICATION_ID = 1001

        fun start(context: Context) {
            val intent = Intent(context, MqttForegroundService::class.java)
            context.startForegroundService(intent)
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, MqttForegroundService::class.java))
        }
    }

    @Inject lateinit var mqttService: MqttService
    @Inject lateinit var commandHandler: CommandHandler

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, buildNotification("Connecting..."))
        Log.i(TAG, "MQTT foreground service created")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Wire command handler
        mqttService.onCommandReceived = { type, data ->
            commandHandler.handleCommand(type, data)
        }
        mqttService.onConfigReceived = { type, data ->
            commandHandler.handleConfig(type, data)
        }

        mqttService.start()
        Log.i(TAG, "MQTT service started")

        return START_STICKY
    }

    override fun onDestroy() {
        mqttService.stop()
        Log.i(TAG, "MQTT foreground service destroyed")
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            "DM3 MQTT Service",
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = "Maintains connection to DM3 server"
            setShowBadge(false)
        }
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(channel)
    }

    private fun buildNotification(status: String): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("DM3 Terminal")
            .setContentText(status)
            .setSmallIcon(R.drawable.ic_launcher)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }
}
