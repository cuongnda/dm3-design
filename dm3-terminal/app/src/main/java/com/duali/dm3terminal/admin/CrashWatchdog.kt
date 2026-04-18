package com.duali.dm3terminal.admin

import android.content.Context
import android.content.Intent
import android.util.Log
import com.duali.dm3terminal.MainActivity
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Crash watchdog: catches uncaught exceptions, auto-restarts app,
 * and enters safe mode if too many crashes in a short window.
 */
@Singleton
class CrashWatchdog @Inject constructor(
    @ApplicationContext private val context: Context,
    private val otaUpdateManager: OtaUpdateManager,
) {
    companion object {
        private const val TAG = "CrashWatchdog"
        private const val PREF_NAME = "dm3_watchdog"
        private const val KEY_SAFE_MODE = "safe_mode"
        private const val KEY_CRASH_TIMESTAMPS = "crash_timestamps"
        private const val CRASH_WINDOW_MS = 600_000L // 10 min
        private const val MAX_CRASHES_SAFE_MODE = 3
        private const val RESTART_DELAY_MS = 5000L
    }

    private val prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)

    private val _safeMode = MutableStateFlow(prefs.getBoolean(KEY_SAFE_MODE, false))
    val safeMode: StateFlow<Boolean> = _safeMode.asStateFlow()

    private var originalHandler: Thread.UncaughtExceptionHandler? = null

    /**
     * Install the crash handler. Call once in Application.onCreate().
     */
    fun install() {
        originalHandler = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            Log.e(TAG, "Uncaught exception on ${thread.name}", throwable)
            handleCrash(throwable)
        }
        Log.i(TAG, "Crash watchdog installed, safeMode=${_safeMode.value}")
    }

    private fun handleCrash(throwable: Throwable) {
        try {
            // Record crash timestamp
            val now = System.currentTimeMillis()
            val timestamps = getCrashTimestamps().toMutableList()
            timestamps.add(now)
            // Keep only recent crashes
            val recent = timestamps.filter { now - it < CRASH_WINDOW_MS }
            saveCrashTimestamps(recent)

            if (recent.size >= MAX_CRASHES_SAFE_MODE) {
                // Enter safe mode
                prefs.edit().putBoolean(KEY_SAFE_MODE, true).apply()
                _safeMode.value = true
                Log.e(TAG, "Entering safe mode after ${recent.size} crashes in ${CRASH_WINDOW_MS / 1000}s")

                // Check if OTA rollback is needed
                if (otaUpdateManager.recordCrash()) {
                    otaUpdateManager.rollback()
                    return // Don't restart, rollback will handle it
                }
            }

            // Schedule restart
            scheduleRestart()
        } catch (e: Exception) {
            Log.e(TAG, "Error in crash handler", e)
        } finally {
            // Let the original handler finish (kills process)
            originalHandler?.uncaughtException(Thread.currentThread(), throwable)
        }
    }

    private fun scheduleRestart() {
        try {
            val intent = Intent(context, MainActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
                putExtra("from_crash", true)
            }

            val pendingIntent = android.app.PendingIntent.getActivity(
                context, 0, intent,
                android.app.PendingIntent.FLAG_ONE_SHOT or android.app.PendingIntent.FLAG_IMMUTABLE
            )

            val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as android.app.AlarmManager
            alarmManager.setExact(
                android.app.AlarmManager.RTC,
                System.currentTimeMillis() + RESTART_DELAY_MS,
                pendingIntent
            )
            Log.i(TAG, "App restart scheduled in ${RESTART_DELAY_MS}ms")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to schedule restart", e)
        }
    }

    /**
     * Call on successful app start to clear crash state.
     */
    fun onSuccessfulStart() {
        otaUpdateManager.clearCrashCounter()
        Log.i(TAG, "Successful start recorded, safeMode=${_safeMode.value}")
    }

    /**
     * Exit safe mode (from admin menu).
     */
    fun exitSafeMode() {
        prefs.edit().putBoolean(KEY_SAFE_MODE, false).apply()
        _safeMode.value = false
        saveCrashTimestamps(emptyList())
        Log.i(TAG, "Safe mode exited")
    }

    private fun getCrashTimestamps(): List<Long> {
        val str = prefs.getString(KEY_CRASH_TIMESTAMPS, "") ?: ""
        if (str.isBlank()) return emptyList()
        return str.split(",").mapNotNull { it.toLongOrNull() }
    }

    private fun saveCrashTimestamps(timestamps: List<Long>) {
        prefs.edit().putString(KEY_CRASH_TIMESTAMPS, timestamps.joinToString(",")).apply()
    }
}
