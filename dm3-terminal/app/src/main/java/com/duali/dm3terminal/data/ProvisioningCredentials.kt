package com.duali.dm3terminal.data

import android.content.Context
import android.content.SharedPreferences
import android.util.Base64
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONObject
import javax.inject.Inject
import javax.inject.Singleton

data class DeviceCredentials(
    val mqttBrokerUrl: String = "",
    val mqttUsername: String = "",
    val mqttToken: String = "",
    val tokenExpiresAt: String = "",
    val refreshUrl: String = "",
    val companyId: String = "",
    val companyName: String = "",
    val companyCode: String = "",
    val isProvisioned: Boolean = false,
)

@Singleton
class ProvisioningCredentials @Inject constructor(
    @ApplicationContext context: Context,
) {
    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val prefs: SharedPreferences = EncryptedSharedPreferences.create(
        context,
        "dm3_provisioning_secure",
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )

    private val _credentials = MutableStateFlow(load())
    val credentials: StateFlow<DeviceCredentials> = _credentials.asStateFlow()

    private fun load(): DeviceCredentials = DeviceCredentials(
        mqttBrokerUrl = prefs.getString("mqtt_broker_url", "") ?: "",
        mqttUsername = prefs.getString("mqtt_username", "") ?: "",
        mqttToken = prefs.getString("mqtt_token", "") ?: "",
        tokenExpiresAt = prefs.getString("token_expires_at", "") ?: "",
        refreshUrl = prefs.getString("refresh_url", "") ?: "",
        companyId = prefs.getString("company_id", "") ?: "",
        companyName = prefs.getString("company_name", "") ?: "",
        companyCode = prefs.getString("company_code", "") ?: "",
        isProvisioned = prefs.getBoolean("is_provisioned", false),
    )

    fun save(creds: DeviceCredentials) {
        prefs.edit()
            .putString("mqtt_broker_url", creds.mqttBrokerUrl)
            .putString("mqtt_username", creds.mqttUsername)
            .putString("mqtt_token", creds.mqttToken)
            .putString("token_expires_at", creds.tokenExpiresAt)
            .putString("refresh_url", creds.refreshUrl)
            .putString("company_id", creds.companyId)
            .putString("company_name", creds.companyName)
            .putString("company_code", creds.companyCode)
            .putBoolean("is_provisioned", creds.isProvisioned)
            .apply()
        _credentials.value = creds
    }

    fun clear() {
        prefs.edit().clear().apply()
        _credentials.value = DeviceCredentials()
    }

    /** Parse JWT expiry (exp claim) and return epoch millis, or 0 if unparseable */
    fun getTokenExpiryMs(): Long {
        val token = _credentials.value.mqttToken
        if (token.isBlank()) return 0
        return try {
            val parts = token.split(".")
            if (parts.size < 2) return 0
            val payload = String(Base64.decode(parts[1], Base64.URL_SAFE or Base64.NO_PADDING))
            val json = JSONObject(payload)
            json.optLong("exp", 0) * 1000
        } catch (_: Exception) { 0 }
    }
}
