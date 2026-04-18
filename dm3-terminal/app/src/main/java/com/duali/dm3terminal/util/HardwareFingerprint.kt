package com.duali.dm3terminal.util

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import org.json.JSONObject
import java.net.NetworkInterface
import java.security.MessageDigest

object HardwareFingerprint {

    fun getAndroidId(context: Context): String =
        Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID) ?: "unknown"

    fun getMacAddress(): String {
        return try {
            NetworkInterface.getNetworkInterfaces()?.toList()
                ?.firstOrNull { it.name.equals("wlan0", ignoreCase = true) || it.name.equals("eth0", ignoreCase = true) }
                ?.hardwareAddress
                ?.joinToString(":") { String.format("%02X", it) }
                ?: "00:00:00:00:00:00"
        } catch (_: Exception) {
            "00:00:00:00:00:00"
        }
    }

    fun getModel(): String = Build.MODEL

    fun getAppSignatureHash(context: Context): String {
        return try {
            val signingInfo = context.packageManager
                .getPackageInfo(context.packageName, PackageManager.GET_SIGNING_CERTIFICATES)
                .signingInfo ?: return "sha256:unknown"
            val cert = if (signingInfo.hasMultipleSigners()) {
                signingInfo.apkContentsSigners[0]
            } else {
                signingInfo.signingCertificateHistory[0]
            }
            val digest = MessageDigest.getInstance("SHA-256").digest(cert.toByteArray())
            "sha256:" + digest.joinToString("") { String.format("%02x", it) }
        } catch (_: Exception) {
            "sha256:unknown"
        }
    }

    fun getFirmwareVersion(context: Context): String {
        return try {
            context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: "1.0.0"
        } catch (_: Exception) {
            "1.0.0"
        }
    }

    fun toJson(context: Context): JSONObject = JSONObject().apply {
        put("android_id", getAndroidId(context))
        put("mac_address", getMacAddress())
        put("model", getModel())
        put("firmware_version", getFirmwareVersion(context))
        put("app_signature_hash", getAppSignatureHash(context))
    }
}
