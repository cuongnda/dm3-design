package com.duali.dm3terminal.provisioning

import android.util.Log
import com.duali.dm3terminal.data.ProvisioningCredentials
import com.duali.dm3terminal.network.ApiResult
import com.duali.dm3terminal.network.ProvisioningApi
import kotlinx.coroutines.*
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class TokenRefreshManager @Inject constructor(
    private val provisioningCredentials: ProvisioningCredentials,
    private val api: ProvisioningApi,
) {
    companion object {
        private const val TAG = "TokenRefresh"
        private const val CHECK_INTERVAL_MS = 5 * 60 * 1000L // check every 5 min
        private const val REFRESH_BEFORE_EXPIRY_MS = 60 * 60 * 1000L // 1 hour before
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var job: Job? = null

    fun start() {
        job?.cancel()
        job = scope.launch {
            while (isActive) {
                delay(CHECK_INTERVAL_MS)
                checkAndRefresh()
            }
        }
    }

    fun stop() {
        job?.cancel()
    }

    private suspend fun checkAndRefresh() {
        val creds = provisioningCredentials.credentials.value
        if (!creds.isProvisioned || creds.mqttToken.isBlank() || creds.refreshUrl.isBlank()) return

        val expiryMs = provisioningCredentials.getTokenExpiryMs()
        if (expiryMs == 0L) return

        val now = System.currentTimeMillis()
        val timeUntilExpiry = expiryMs - now

        if (timeUntilExpiry > REFRESH_BEFORE_EXPIRY_MS) return

        Log.i(TAG, "Token expires in ${timeUntilExpiry / 1000}s, refreshing...")
        when (val result = api.refreshToken(creds.refreshUrl, creds.mqttToken)) {
            is ApiResult.Success -> {
                provisioningCredentials.save(
                    creds.copy(
                        mqttToken = result.data.mqttToken,
                        tokenExpiresAt = result.data.tokenExpiresAt,
                    )
                )
                Log.i(TAG, "Token refreshed successfully")
            }
            is ApiResult.Error -> {
                Log.w(TAG, "Token refresh failed: ${result.message}")
            }
        }
    }
}
