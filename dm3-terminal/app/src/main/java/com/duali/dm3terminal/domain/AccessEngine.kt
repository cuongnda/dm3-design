package com.duali.dm3terminal.domain

import com.duali.dm3terminal.data.local.entities.AccessRuleEntity
import com.duali.dm3terminal.data.repository.DM3Repository
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import javax.inject.Inject
import javax.inject.Singleton

data class AccessDecision(
    val granted: Boolean,
    val reason: String,
    val personId: String? = null,
    val personName: String? = null,
    val ruleId: String? = null,
    val decisionTimeMs: Double = 0.0,
    val requiresMultiFactor: Boolean = false,
    val multiFactorMethods: List<String>? = null,
    val matchedRule: AccessRuleEntity? = null,
)

@Singleton
class AccessEngine @Inject constructor(
    private val repository: DM3Repository,
) {
    suspend fun evaluate(
        credentialType: String,
        credentialValue: String,
        doorId: String,
        timestamp: Long? = null,
        skipMultiFactor: Boolean = false,
    ): AccessDecision {
        val startNs = System.nanoTime()
        val nowMs = timestamp ?: System.currentTimeMillis()

        // Step 1: Lookup credential
        val person = repository.lookupByCredential(credentialType, credentialValue)
            ?: return decision(false, "denied_unknown", startNs)

        // Step 2: Check blacklist
        if (repository.isBlacklisted(person.personId)) {
            return decision(false, "denied_blacklist", startNs, person.personId, person.name)
        }

        // Step 3: Check active status
        if (person.status != "active") {
            return decision(false, "denied_inactive", startNs, person.personId)
        }

        // Step 4: Check validity window
        if (person.validFrom != null && nowMs < person.validFrom) {
            return decision(false, "denied_expired", startNs, person.personId)
        }
        if (person.validUntil != null && nowMs > person.validUntil) {
            return decision(false, "denied_expired", startNs, person.personId)
        }

        // Step 5: Check lockout
        if (repository.isLockedOut(person.personId)) {
            return decision(false, "denied_lockout", startNs, person.personId)
        }

        // Step 6: Find matching rules
        val rules = repository.getMatchingRules(doorId)
        if (rules.isEmpty()) {
            return decision(false, "denied_zone", startNs, person.personId)
        }

        // Step 7: Evaluate rules
        for (rule in rules) {
            if (!rule.enabled) continue

            // Rule validity
            if (rule.validFrom != null && nowMs < rule.validFrom) continue
            if (rule.validUntil != null && nowMs > rule.validUntil) continue

            // Check person in groups
            val groupIds = JSONArray(rule.personGroupIds).let { arr ->
                (0 until arr.length()).map { arr.getString(it) }
            }
            if (!repository.personInGroups(person.personId, groupIds)) continue

            // Check schedule
            if (rule.scheduleJson != null) {
                if (!evaluateSchedule(JSONObject(rule.scheduleJson), nowMs)) continue
            }

            // Check multi-factor requirement
            if (rule.multiFactor && !skipMultiFactor) {
                val methods = rule.multiFactorMethods?.let { json ->
                    try {
                        val arr = JSONArray(json)
                        (0 until arr.length()).map { arr.getString(it) }
                    } catch (e: Exception) {
                        listOf("face", "card")
                    }
                } ?: listOf("face", "card")

                return decision(
                    granted = false,
                    reason = "pending_multi_factor",
                    startNs = startNs,
                    personId = person.personId,
                    personName = person.name,
                    ruleId = rule.ruleId,
                    requiresMultiFactor = true,
                    multiFactorMethods = methods,
                    matchedRule = rule,
                )
            }

            // GRANTED
            return decision(
                granted = true,
                reason = "authorized",
                startNs = startNs,
                personId = person.personId,
                personName = person.name,
                ruleId = rule.ruleId,
                matchedRule = rule,
            )
        }

        return decision(false, "denied_time", startNs, person.personId)
    }

    private fun evaluateSchedule(schedule: JSONObject, nowMs: Long): Boolean {
        val tz = ZoneId.of(schedule.optString("timezone", "UTC"))
        val nowLocal = Instant.ofEpochMilli(nowMs).atZone(tz)
        val weekday = nowLocal.dayOfWeek.value // 1=Mon, 7=Sun
        val currentTime = nowLocal.format(DateTimeFormatter.ofPattern("HH:mm"))

        val periods = schedule.optJSONArray("periods") ?: return false
        for (i in 0 until periods.length()) {
            val period = periods.getJSONObject(i)
            val days = period.optJSONArray("days") ?: continue
            val daysList = (0 until days.length()).map { days.getInt(it) }
            if (weekday in daysList) {
                val start = period.optString("start", "00:00")
                val end = period.optString("end", "23:59")
                if (currentTime in start..end) return true
            }
        }
        return false
    }

    private fun decision(
        granted: Boolean,
        reason: String,
        startNs: Long,
        personId: String? = null,
        personName: String? = null,
        ruleId: String? = null,
        requiresMultiFactor: Boolean = false,
        multiFactorMethods: List<String>? = null,
        matchedRule: AccessRuleEntity? = null,
    ): AccessDecision {
        val elapsedMs = (System.nanoTime() - startNs) / 1_000_000.0
        return AccessDecision(
            granted = granted,
            reason = reason,
            personId = personId,
            personName = personName,
            ruleId = ruleId,
            decisionTimeMs = elapsedMs,
            requiresMultiFactor = requiresMultiFactor,
            multiFactorMethods = multiFactorMethods,
            matchedRule = matchedRule,
        )
    }
}
