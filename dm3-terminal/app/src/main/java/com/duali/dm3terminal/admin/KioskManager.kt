package com.duali.dm3terminal.admin

import android.app.Activity
import android.app.ActivityManager
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.IntentFilter
import android.os.UserManager
import android.util.Log
import com.duali.dm3terminal.data.DevicePreferences
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Manages kiosk / lock-task mode for the DM3 terminal.
 *
 * When device owner: uses Lock Task Mode (proper kiosk).
 * Fallback: immersive sticky mode only (already in MainActivity).
 */
@Singleton
class KioskManager @Inject constructor(
    @ApplicationContext private val context: Context,
    private val devicePreferences: DevicePreferences,
) {
    companion object {
        private const val TAG = "KioskManager"
        private const val PREF_KIOSK_ENABLED = "kiosk_enabled"
    }

    private val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
    private val adminComponent = DM3DeviceAdminReceiver.getComponentName(context)
    private val prefs = context.getSharedPreferences("dm3_kiosk", Context.MODE_PRIVATE)

    private val _kioskActive = MutableStateFlow(false)
    val kioskActive: StateFlow<Boolean> = _kioskActive.asStateFlow()

    val isDeviceOwner: Boolean
        get() = dpm.isDeviceOwnerApp(context.packageName)

    val isKioskEnabled: Boolean
        get() = prefs.getBoolean(PREF_KIOSK_ENABLED, false)

    /**
     * Enable kiosk mode policies (call once on setup or boot).
     * Must be device owner for full kiosk.
     */
    fun enableKioskPolicies() {
        if (!isDeviceOwner) {
            Log.w(TAG, "Not device owner — kiosk limited to immersive mode only")
            return
        }

        try {
            // Allow this package to enter lock task mode
            dpm.setLockTaskPackages(adminComponent, arrayOf(context.packageName))

            // Set lock task features: disable all system UI
            dpm.setLockTaskFeatures(
                adminComponent,
                DevicePolicyManager.LOCK_TASK_FEATURE_NONE
            )

            // Prevent uninstall
            dpm.setUninstallBlocked(adminComponent, context.packageName, true)

            // Disable keyguard (lock screen)
            dpm.setKeyguardDisabled(adminComponent, true)

            // Disable status bar
            dpm.setStatusBarDisabled(adminComponent, true)

            // Set as preferred home activity so it launches on boot
            val filter = IntentFilter(android.content.Intent.ACTION_MAIN)
            filter.addCategory(android.content.Intent.CATEGORY_HOME)
            filter.addCategory(android.content.Intent.CATEGORY_DEFAULT)
            dpm.addPersistentPreferredActivity(
                adminComponent,
                filter,
                ComponentName(context, "com.duali.dm3terminal.MainActivity")
            )

            // Restrict user actions
            dpm.addUserRestriction(adminComponent, UserManager.DISALLOW_SAFE_BOOT)
            dpm.addUserRestriction(adminComponent, UserManager.DISALLOW_FACTORY_RESET)
            dpm.addUserRestriction(adminComponent, UserManager.DISALLOW_ADD_USER)
            dpm.addUserRestriction(adminComponent, UserManager.DISALLOW_MOUNT_PHYSICAL_MEDIA)
            dpm.addUserRestriction(adminComponent, UserManager.DISALLOW_ADJUST_VOLUME)

            prefs.edit().putBoolean(PREF_KIOSK_ENABLED, true).apply()
            Log.i(TAG, "Kiosk policies enabled (device owner)")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to enable kiosk policies", e)
        }
    }

    /**
     * Start lock task mode on the given activity.
     */
    fun startLockTask(activity: Activity) {
        if (!isKioskEnabled && !isDeviceOwner) {
            Log.d(TAG, "Kiosk not enabled, skipping lock task")
            return
        }

        try {
            if (isDeviceOwner) {
                // Ensure package is whitelisted
                val packages = dpm.getLockTaskPackages(adminComponent)
                if (!packages.contains(context.packageName)) {
                    dpm.setLockTaskPackages(adminComponent, arrayOf(context.packageName))
                }
                activity.startLockTask()
                _kioskActive.value = true
                Log.i(TAG, "Lock task started (device owner)")
            } else {
                // Fallback: just request lock task (will show confirmation dialog)
                activity.startLockTask()
                _kioskActive.value = true
                Log.i(TAG, "Lock task started (admin mode)")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start lock task", e)
        }
    }

    /**
     * Exit kiosk / lock task mode. Requires admin PIN verification first.
     */
    fun stopLockTask(activity: Activity) {
        try {
            activity.stopLockTask()
            _kioskActive.value = false
            Log.i(TAG, "Lock task stopped")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to stop lock task", e)
        }
    }

    /**
     * Disable all kiosk policies (for development/debugging).
     */
    fun disableKioskPolicies() {
        if (!isDeviceOwner) return

        try {
            dpm.setLockTaskPackages(adminComponent, emptyArray())
            dpm.setKeyguardDisabled(adminComponent, false)
            dpm.setStatusBarDisabled(adminComponent, false)
            dpm.setUninstallBlocked(adminComponent, context.packageName, false)
            dpm.clearPackagePersistentPreferredActivities(adminComponent, context.packageName)

            dpm.clearUserRestriction(adminComponent, UserManager.DISALLOW_SAFE_BOOT)
            dpm.clearUserRestriction(adminComponent, UserManager.DISALLOW_FACTORY_RESET)
            dpm.clearUserRestriction(adminComponent, UserManager.DISALLOW_ADD_USER)
            dpm.clearUserRestriction(adminComponent, UserManager.DISALLOW_MOUNT_PHYSICAL_MEDIA)
            dpm.clearUserRestriction(adminComponent, UserManager.DISALLOW_ADJUST_VOLUME)

            prefs.edit().putBoolean(PREF_KIOSK_ENABLED, false).apply()
            _kioskActive.value = false
            Log.i(TAG, "Kiosk policies disabled")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to disable kiosk policies", e)
        }
    }

    /**
     * Check if lock task is currently active.
     */
    fun isInLockTaskMode(): Boolean {
        val am = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        return am.lockTaskModeState != ActivityManager.LOCK_TASK_MODE_NONE
    }
}
