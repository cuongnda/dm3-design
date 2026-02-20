package com.duali.dm3terminal.hardware

import android.util.Log
import javax.inject.Inject
import javax.inject.Singleton

data class PendingFactor(
    val personId: String,
    val credentialType: String,
    val credentialValue: String,
    val timestampMs: Long,
)

sealed class MultiFactorResult {
    /** First factor stored, waiting for second factor */
    data class PendingSecondFactor(
        val personId: String,
        val requiredMethods: List<String>,
        val completedMethod: String,
    ) : MultiFactorResult()

    /** Both factors satisfied */
    data class Satisfied(val personId: String) : MultiFactorResult()

    /** Same factor presented twice */
    data class SameFactorRejected(val personId: String) : MultiFactorResult()

    /** Timeout — first factor expired */
    data class Timeout(val personId: String) : MultiFactorResult()

    /** Second factor doesn't match same person */
    data class PersonMismatch(val factor1PersonId: String, val factor2PersonId: String) : MultiFactorResult()
}

/**
 * Manages multi-factor authentication state.
 * Stores pending first-factor and validates second-factor within a time window.
 */
@Singleton
class MultiFactorManager @Inject constructor() {

    companion object {
        private const val TAG = "MultiFactorMgr"
        private const val MFA_TIMEOUT_MS = 30_000L
    }

    private val pendingFactors = mutableMapOf<String, PendingFactor>()

    /**
     * Process a credential for multi-factor auth.
     * Returns null if multi-factor is not required for this rule.
     */
    fun processCredential(
        personId: String,
        credentialType: String,
        credentialValue: String,
        requiredMethods: List<String>,
    ): MultiFactorResult {
        val now = System.currentTimeMillis()

        // Check if there's a pending factor for this person
        val pending = pendingFactors[personId]

        if (pending == null) {
            // First factor — store it
            pendingFactors[personId] = PendingFactor(personId, credentialType, credentialValue, now)
            Log.d(TAG, "First factor stored: person=$personId type=$credentialType")
            return MultiFactorResult.PendingSecondFactor(
                personId = personId,
                requiredMethods = requiredMethods,
                completedMethod = credentialType,
            )
        }

        // There's a pending factor — check timeout
        if (now - pending.timestampMs > MFA_TIMEOUT_MS) {
            pendingFactors.remove(personId)
            Log.d(TAG, "MFA timeout for person=$personId")
            return MultiFactorResult.Timeout(personId)
        }

        // Same factor type?
        if (pending.credentialType == credentialType) {
            Log.d(TAG, "Same factor type presented: $credentialType for person=$personId")
            return MultiFactorResult.SameFactorRejected(personId)
        }

        // Second factor — clear pending and return satisfied
        pendingFactors.remove(personId)
        Log.d(TAG, "MFA satisfied: person=$personId factor1=${pending.credentialType} factor2=$credentialType")
        return MultiFactorResult.Satisfied(personId)
    }

    /**
     * Check if there's a pending factor for a different person (for cross-validation).
     */
    fun hasPendingForPerson(personId: String): PendingFactor? = pendingFactors[personId]

    /**
     * Clear pending factor for a person.
     */
    fun clearPending(personId: String) {
        pendingFactors.remove(personId)
    }

    /**
     * Clear all pending factors (e.g., on lockdown).
     */
    fun clearAll() {
        pendingFactors.clear()
    }
}
