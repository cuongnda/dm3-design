package com.duali.dm3terminal

import android.app.Application
import com.duali.dm3terminal.mqtt.MqttService
import dagger.hilt.android.HiltAndroidApp
import javax.inject.Inject

@HiltAndroidApp
class DM3TerminalApp : Application() {

    @Inject lateinit var mqttService: MqttService

    override fun onCreate() {
        super.onCreate()
        mqttService.start()
    }

    override fun onTerminate() {
        mqttService.stop()
        super.onTerminate()
    }
}
