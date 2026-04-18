package com.duali.dm3terminal.network

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import javax.inject.Inject
import javax.inject.Singleton

data class ActivationResponse(
    val deviceId: String,
    val companyId: String,
    val companyName: String,
    val companyCode: String,
    val mqttBroker: String,
    val mqttUsername: String,
    val mqttToken: String,
    val tokenExpiresAt: String,
    val refreshUrl: String,
)

data class TokenRefreshResponse(
    val mqttToken: String,
    val tokenExpiresAt: String,
)

sealed class ApiResult<out T> {
    data class Success<T>(val data: T) : ApiResult<T>()
    data class Error(val message: String, val code: Int = 0) : ApiResult<Nothing>()
}

@Singleton
class ProvisioningApi @Inject constructor() {

    suspend fun activate(
        serverBaseUrl: String,
        qrToken: String,
        hardwareFingerprint: JSONObject,
    ): ApiResult<ActivationResponse> = withContext(Dispatchers.IO) {
        try {
            val url = URL("$serverBaseUrl/api/v1/devices/activate")
            val body = JSONObject().apply {
                put("qr_token", qrToken)
                put("hardware_fingerprint", hardwareFingerprint)
            }
            val (code, responseBody) = httpPost(url, body)
            if (code in 200..299) {
                val json = JSONObject(responseBody)
                val company = json.getJSONObject("company")
                val mqtt = json.getJSONObject("mqtt")
                ApiResult.Success(
                    ActivationResponse(
                        deviceId = json.optString("device_id"),
                        companyId = company.optString("id"),
                        companyName = company.optString("name"),
                        companyCode = company.optString("code"),
                        mqttBroker = mqtt.optString("broker"),
                        mqttUsername = mqtt.optString("username"),
                        mqttToken = mqtt.optString("token"),
                        tokenExpiresAt = mqtt.optString("token_expires_at"),
                        refreshUrl = mqtt.optString("refresh_url"),
                    )
                )
            } else {
                val errMsg = try {
                    JSONObject(responseBody).optString("detail", responseBody)
                } catch (_: Exception) { responseBody }
                ApiResult.Error(errMsg, code)
            }
        } catch (e: Exception) {
            ApiResult.Error(e.message ?: "Network error")
        }
    }

    suspend fun refreshToken(
        refreshUrl: String,
        currentToken: String,
    ): ApiResult<TokenRefreshResponse> = withContext(Dispatchers.IO) {
        try {
            val url = URL(refreshUrl)
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "POST"
            conn.setRequestProperty("Content-Type", "application/json")
            conn.setRequestProperty("Authorization", "Bearer $currentToken")
            conn.connectTimeout = 10_000
            conn.readTimeout = 10_000

            val code = conn.responseCode
            val body = (if (code in 200..299) conn.inputStream else conn.errorStream)
                .bufferedReader().readText()
            conn.disconnect()

            if (code in 200..299) {
                val json = JSONObject(body)
                ApiResult.Success(
                    TokenRefreshResponse(
                        mqttToken = json.optString("token", json.optString("mqtt_token")),
                        tokenExpiresAt = json.optString("token_expires_at"),
                    )
                )
            } else {
                ApiResult.Error("Refresh failed: $code", code)
            }
        } catch (e: Exception) {
            ApiResult.Error(e.message ?: "Network error")
        }
    }

    private fun httpPost(url: URL, body: JSONObject): Pair<Int, String> {
        val conn = url.openConnection() as HttpURLConnection
        conn.requestMethod = "POST"
        conn.setRequestProperty("Content-Type", "application/json")
        conn.connectTimeout = 10_000
        conn.readTimeout = 10_000
        conn.doOutput = true

        OutputStreamWriter(conn.outputStream).use { it.write(body.toString()) }

        val code = conn.responseCode
        val responseBody = (if (code in 200..299) conn.inputStream else conn.errorStream)
            .bufferedReader().readText()
        conn.disconnect()
        return code to responseBody
    }
}
