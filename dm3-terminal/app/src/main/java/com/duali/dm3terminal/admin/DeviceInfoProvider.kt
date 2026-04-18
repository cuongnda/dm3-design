package com.duali.dm3terminal.admin

import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Build
import android.os.Environment
import android.os.StatFs
import android.os.SystemClock
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.wifi.WifiManager
import dagger.hilt.android.qualifiers.ApplicationContext
import org.json.JSONObject
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Provides device info for remote management MQTT commands.
 */
@Singleton
class DeviceInfoProvider @Inject constructor(
    @ApplicationContext private val context: Context,
    private val otaUpdateManager: OtaUpdateManager,
) {
    fun getDeviceInfo(): JSONObject = JSONObject().apply {
        // App info
        put("app_version", otaUpdateManager.getCurrentVersion())
        put("app_version_code", otaUpdateManager.getCurrentVersionCode())
        put("package", context.packageName)

        // Android info
        put("android_version", Build.VERSION.RELEASE)
        put("sdk_level", Build.VERSION.SDK_INT)
        put("device_model", Build.MODEL)
        put("manufacturer", Build.MANUFACTURER)
        put("board", Build.BOARD)

        // Uptime
        put("uptime_ms", SystemClock.elapsedRealtime())
        put("uptime_s", SystemClock.elapsedRealtime() / 1000)

        // Memory
        val activityManager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val memInfo = ActivityManager.MemoryInfo()
        activityManager.getMemoryInfo(memInfo)
        put("memory", JSONObject().apply {
            put("total_mb", memInfo.totalMem / (1024 * 1024))
            put("available_mb", memInfo.availMem / (1024 * 1024))
            put("used_pct", ((memInfo.totalMem - memInfo.availMem) * 100 / memInfo.totalMem).toInt())
        })

        // Storage
        val stat = StatFs(Environment.getDataDirectory().path)
        val totalBytes = stat.blockSizeLong * stat.blockCountLong
        val freeBytes = stat.blockSizeLong * stat.availableBlocksLong
        put("storage", JSONObject().apply {
            put("total_mb", totalBytes / (1024 * 1024))
            put("free_mb", freeBytes / (1024 * 1024))
            put("used_pct", ((totalBytes - freeBytes) * 100 / totalBytes).toInt())
        })

        // Battery
        val batteryIntent = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        if (batteryIntent != null) {
            val level = batteryIntent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
            val scale = batteryIntent.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
            val plugged = batteryIntent.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0)
            put("battery", JSONObject().apply {
                put("level", if (scale > 0) (level * 100 / scale) else -1)
                put("charging", plugged != 0)
            })
        }

        // Network
        put("network", getNetworkInfo())

        // Device owner status
        put("device_owner", DM3DeviceAdminReceiver.isDeviceOwner(context))
    }

    private fun getNetworkInfo(): JSONObject = JSONObject().apply {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = cm.activeNetwork
        val caps = if (network != null) cm.getNetworkCapabilities(network) else null

        put("connected", caps != null)

        if (caps != null) {
            when {
                caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> put("type", "ethernet")
                caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> {
                    put("type", "wifi")
                    try {
                        val wm = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
                        @Suppress("DEPRECATION")
                        val wifiInfo = wm.connectionInfo
                        put("ssid", wifiInfo.ssid?.removeSurrounding("\"") ?: "unknown")
                        put("signal_dbm", wifiInfo.rssi)
                        put("link_speed_mbps", wifiInfo.linkSpeed)
                    } catch (_: Exception) {}
                }
                caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> put("type", "cellular")
                else -> put("type", "unknown")
            }
        } else {
            put("type", "none")
        }
    }
}
