package com.duali.dm3terminal.admin

import android.app.admin.DeviceAdminReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Device Admin / Device Owner receiver for kiosk mode and silent OTA install.
 *
 * Set as device owner via:
 *   adb shell dpm set-device-owner com.duali.dm3terminal/.admin.DeviceAdminReceiver
 */
class DM3DeviceAdminReceiver : DeviceAdminReceiver() {

    companion object {
        private const val TAG = "DM3DeviceAdmin"

        fun getComponentName(context: Context): ComponentName =
            ComponentName(context, DM3DeviceAdminReceiver::class.java)

        fun isDeviceOwner(context: Context): Boolean {
            val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE)
                as android.app.admin.DevicePolicyManager
            return dpm.isDeviceOwnerApp(context.packageName)
        }
    }

    override fun onEnabled(context: Context, intent: Intent) {
        super.onEnabled(context, intent)
        Log.i(TAG, "Device admin enabled")
    }

    override fun onDisabled(context: Context, intent: Intent) {
        super.onDisabled(context, intent)
        Log.i(TAG, "Device admin disabled")
    }

    override fun onProfileProvisioningComplete(context: Context, intent: Intent) {
        super.onProfileProvisioningComplete(context, intent)
        Log.i(TAG, "Profile provisioning complete")
    }
}
