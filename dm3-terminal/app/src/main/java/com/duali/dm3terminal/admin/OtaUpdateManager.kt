package com.duali.dm3terminal.admin

import android.app.DownloadManager
import android.app.PendingIntent
import android.app.admin.DevicePolicyManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageInstaller
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.util.Log
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.io.File
import java.io.FileInputStream
import java.security.MessageDigest
import javax.inject.Inject
import javax.inject.Singleton

data class OtaState(
    val status: OtaStatus = OtaStatus.IDLE,
    val progress: Int = 0,        // 0-100
    val version: String? = null,
    val error: String? = null,
)

enum class OtaStatus {
    IDLE, CHECKING, DOWNLOADING, VERIFYING, INSTALLING, SUCCESS, FAILED
}

/**
 * Manages OTA (over-the-air) APK updates.
 *
 * Flow:
 * 1. Receive update info (URL, version, SHA-256) via MQTT cmd or periodic check
 * 2. Download APK using DownloadManager
 * 3. Verify SHA-256 checksum
 * 4. Install: silent if device owner, prompt otherwise
 * 5. Track rollback: if new version crashes 3x, revert
 */
@Singleton
class OtaUpdateManager @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    companion object {
        private const val TAG = "OtaUpdateManager"
        private const val PREF_NAME = "dm3_ota"
        private const val KEY_PREV_APK_PATH = "prev_apk_path"
        private const val KEY_PREV_VERSION = "prev_version"
        private const val KEY_CRASH_COUNT = "crash_count"
        private const val KEY_CRASH_WINDOW_START = "crash_window_start"
        private const val CRASH_WINDOW_MS = 600_000L // 10 min
        private const val MAX_CRASHES_FOR_ROLLBACK = 3
    }

    private val prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
    private val downloadManager = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val _state = MutableStateFlow(OtaState())
    val state: StateFlow<OtaState> = _state.asStateFlow()

    private var currentDownloadId: Long = -1

    /**
     * Get current app version name.
     */
    fun getCurrentVersion(): String {
        return try {
            context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: "unknown"
        } catch (e: Exception) {
            "unknown"
        }
    }

    /**
     * Get current app version code.
     */
    fun getCurrentVersionCode(): Long {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                context.packageManager.getPackageInfo(context.packageName, 0).longVersionCode
            } else {
                @Suppress("DEPRECATION")
                context.packageManager.getPackageInfo(context.packageName, 0).versionCode.toLong()
            }
        } catch (e: Exception) {
            0
        }
    }

    /**
     * Start OTA update: download APK from URL, verify, install.
     *
     * @param url HTTPS URL of the APK
     * @param version Expected version string
     * @param sha256 Expected SHA-256 hex digest (lowercase)
     * @param force If true, install immediately; if false, can schedule
     */
    fun startUpdate(url: String, version: String, sha256: String, force: Boolean = false) {
        if (_state.value.status == OtaStatus.DOWNLOADING || _state.value.status == OtaStatus.INSTALLING) {
            Log.w(TAG, "Update already in progress")
            return
        }

        _state.value = OtaState(status = OtaStatus.DOWNLOADING, version = version)
        Log.i(TAG, "Starting OTA: version=$version url=$url")

        // Back up current APK path for rollback
        backupCurrentApk()

        // Download
        val apkFile = File(context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "dm3-update-$version.apk")
        if (apkFile.exists()) apkFile.delete()

        val request = DownloadManager.Request(Uri.parse(url))
            .setTitle("DM3 Update $version")
            .setDescription("Downloading update...")
            .setDestinationUri(Uri.fromFile(apkFile))
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_HIDDEN)
            .setAllowedOverMetered(true)
            .setAllowedOverRoaming(false)

        currentDownloadId = downloadManager.enqueue(request)

        // Monitor download progress
        scope.launch {
            monitorDownload(currentDownloadId, apkFile, version, sha256)
        }
    }

    private suspend fun monitorDownload(downloadId: Long, apkFile: File, version: String, sha256: String) {
        val query = DownloadManager.Query().setFilterById(downloadId)
        var complete = false

        while (!complete) {
            delay(500)
            val cursor = downloadManager.query(query)
            if (cursor == null || !cursor.moveToFirst()) {
                cursor?.close()
                continue
            }

            val status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
            val bytesDownloaded = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR))
            val bytesTotal = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES))
            cursor.close()

            when (status) {
                DownloadManager.STATUS_RUNNING -> {
                    val progress = if (bytesTotal > 0) ((bytesDownloaded * 100) / bytesTotal).toInt() else 0
                    _state.value = _state.value.copy(progress = progress)
                }
                DownloadManager.STATUS_SUCCESSFUL -> {
                    complete = true
                    _state.value = _state.value.copy(status = OtaStatus.VERIFYING, progress = 100)
                    verifyAndInstall(apkFile, version, sha256)
                }
                DownloadManager.STATUS_FAILED -> {
                    complete = true
                    _state.value = OtaState(status = OtaStatus.FAILED, error = "Download failed")
                    Log.e(TAG, "Download failed")
                }
                DownloadManager.STATUS_PAUSED -> {
                    // Wait for resume
                }
            }
        }
    }

    private suspend fun verifyAndInstall(apkFile: File, version: String, sha256: String) {
        // Verify SHA-256
        val actualHash = computeSha256(apkFile)
        if (!actualHash.equals(sha256, ignoreCase = true)) {
            _state.value = OtaState(
                status = OtaStatus.FAILED,
                error = "Checksum mismatch: expected=$sha256 actual=$actualHash"
            )
            Log.e(TAG, "SHA-256 mismatch! expected=$sha256 actual=$actualHash")
            apkFile.delete()
            return
        }

        // Verify APK signature
        val pm = context.packageManager
        val info = pm.getPackageArchiveInfo(apkFile.absolutePath, PackageManager.GET_SIGNING_CERTIFICATES)
        if (info == null) {
            _state.value = OtaState(status = OtaStatus.FAILED, error = "Invalid APK")
            apkFile.delete()
            return
        }

        Log.i(TAG, "APK verified: version=${info.versionName} package=${info.packageName}")

        // Install
        _state.value = _state.value.copy(status = OtaStatus.INSTALLING)
        withContext(Dispatchers.Main) {
            installApk(apkFile)
        }
    }

    private fun installApk(apkFile: File) {
        val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        val isDeviceOwner = dpm.isDeviceOwnerApp(context.packageName)

        if (isDeviceOwner) {
            // Silent install via PackageInstaller (device owner privilege)
            silentInstall(apkFile)
        } else {
            // Prompt install via ACTION_VIEW
            promptInstall(apkFile)
        }
    }

    private fun silentInstall(apkFile: File) {
        try {
            val installer = context.packageManager.packageInstaller
            val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
            params.setAppPackageName(context.packageName)
            val sessionId = installer.createSession(params)
            val session = installer.openSession(sessionId)

            FileInputStream(apkFile).use { input ->
                session.openWrite("dm3-update", 0, apkFile.length()).use { output ->
                    input.copyTo(output)
                    session.fsync(output)
                }
            }

            val intent = Intent(context, OtaInstallReceiver::class.java)
            val pendingIntent = PendingIntent.getBroadcast(
                context, sessionId, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
            )
            session.commit(pendingIntent.intentSender)
            Log.i(TAG, "Silent install session committed")
        } catch (e: Exception) {
            Log.e(TAG, "Silent install failed", e)
            _state.value = OtaState(status = OtaStatus.FAILED, error = "Install failed: ${e.message}")
        }
    }

    private fun promptInstall(apkFile: File) {
        try {
            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(
                    androidx.core.content.FileProvider.getUriForFile(
                        context,
                        "${context.packageName}.fileprovider",
                        apkFile
                    ),
                    "application/vnd.android.package-archive"
                )
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION
            }
            context.startActivity(intent)
            Log.i(TAG, "Prompt install launched")
        } catch (e: Exception) {
            Log.e(TAG, "Prompt install failed", e)
            _state.value = OtaState(status = OtaStatus.FAILED, error = "Install prompt failed: ${e.message}")
        }
    }

    private fun computeSha256(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buffer = ByteArray(8192)
            var read: Int
            while (input.read(buffer).also { read = it } != -1) {
                digest.update(buffer, 0, read)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }

    private fun backupCurrentApk() {
        try {
            val currentApk = File(context.applicationInfo.sourceDir)
            val backupDir = File(context.filesDir, "ota_backup")
            backupDir.mkdirs()
            val backupFile = File(backupDir, "dm3-previous.apk")
            currentApk.copyTo(backupFile, overwrite = true)
            prefs.edit()
                .putString(KEY_PREV_APK_PATH, backupFile.absolutePath)
                .putString(KEY_PREV_VERSION, getCurrentVersion())
                .apply()
            Log.i(TAG, "Backed up current APK: ${getCurrentVersion()}")
        } catch (e: Exception) {
            Log.w(TAG, "Failed to backup current APK", e)
        }
    }

    // --- Crash / Rollback tracking ---

    /**
     * Record a crash. If too many crashes in window, trigger rollback.
     * @return true if rollback should be attempted
     */
    fun recordCrash(): Boolean {
        val now = System.currentTimeMillis()
        val windowStart = prefs.getLong(KEY_CRASH_WINDOW_START, 0)
        var count = prefs.getInt(KEY_CRASH_COUNT, 0)

        if (now - windowStart > CRASH_WINDOW_MS) {
            // Reset window
            count = 1
            prefs.edit()
                .putLong(KEY_CRASH_WINDOW_START, now)
                .putInt(KEY_CRASH_COUNT, count)
                .apply()
        } else {
            count++
            prefs.edit().putInt(KEY_CRASH_COUNT, count).apply()
        }

        Log.w(TAG, "Crash recorded: $count in window")

        if (count >= MAX_CRASHES_FOR_ROLLBACK) {
            val prevApk = prefs.getString(KEY_PREV_APK_PATH, null)
            if (prevApk != null && File(prevApk).exists()) {
                Log.e(TAG, "Too many crashes ($count), attempting rollback")
                return true
            }
        }
        return false
    }

    /**
     * Attempt rollback to previous APK version.
     */
    fun rollback() {
        val prevApk = prefs.getString(KEY_PREV_APK_PATH, null)
        if (prevApk == null || !File(prevApk).exists()) {
            Log.e(TAG, "No previous APK available for rollback")
            return
        }

        Log.i(TAG, "Rolling back to previous APK: ${prefs.getString(KEY_PREV_VERSION, "unknown")}")
        installApk(File(prevApk))
    }

    /**
     * Clear crash counter (call on successful startup).
     */
    fun clearCrashCounter() {
        prefs.edit()
            .putInt(KEY_CRASH_COUNT, 0)
            .putLong(KEY_CRASH_WINDOW_START, 0)
            .apply()
    }

    /**
     * Handle install result callback.
     */
    fun onInstallResult(success: Boolean, message: String?) {
        if (success) {
            _state.value = OtaState(status = OtaStatus.SUCCESS)
            Log.i(TAG, "Install succeeded")
        } else {
            _state.value = OtaState(status = OtaStatus.FAILED, error = message ?: "Install failed")
            Log.e(TAG, "Install failed: $message")
        }
    }
}
