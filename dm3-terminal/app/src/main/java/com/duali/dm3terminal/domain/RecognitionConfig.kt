package com.duali.dm3terminal.domain

import org.json.JSONObject

/**
 * Face recognition configuration, persisted in Room ConfigEntity.
 */
data class RecognitionConfig(
    val matchThreshold: Float = 65f,
    val livenessEnabled: Boolean = true,
    val livenessThreshold: Float = 80f,
    val cooldownMs: Long = 5000L,
    val maxDistance: Float = 1.5f,
) {
    fun toJson(): String = JSONObject().apply {
        put("matchThreshold", matchThreshold.toDouble())
        put("livenessEnabled", livenessEnabled)
        put("livenessThreshold", livenessThreshold.toDouble())
        put("cooldownMs", cooldownMs)
        put("maxDistance", maxDistance.toDouble())
    }.toString()

    companion object {
        const val CONFIG_KEY = "face_recognition"

        fun fromJson(json: String): RecognitionConfig {
            return try {
                val obj = JSONObject(json)
                RecognitionConfig(
                    matchThreshold = obj.optDouble("matchThreshold", 65.0).toFloat(),
                    livenessEnabled = obj.optBoolean("livenessEnabled", true),
                    livenessThreshold = obj.optDouble("livenessThreshold", 80.0).toFloat(),
                    cooldownMs = obj.optLong("cooldownMs", 5000L),
                    maxDistance = obj.optDouble("maxDistance", 1.5).toFloat(),
                )
            } catch (e: Exception) {
                RecognitionConfig()
            }
        }
    }
}
