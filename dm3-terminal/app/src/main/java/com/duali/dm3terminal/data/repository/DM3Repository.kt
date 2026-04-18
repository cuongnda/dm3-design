package com.duali.dm3terminal.data.repository

import com.duali.dm3terminal.data.local.AppDatabase
import com.duali.dm3terminal.data.local.entities.*
import org.json.JSONArray
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class DM3Repository @Inject constructor(
    private val db: AppDatabase,
) {
    // Person
    suspend fun getPersonCount(): Int = db.personDao().count()
    suspend fun getRuleCount(): Int = db.accessRuleDao().count()

    // Credential lookup
    suspend fun lookupByCredential(type: String, value: String): PersonEntity? =
        db.credentialDao().lookupPerson(type, value)

    // Blacklist
    suspend fun isBlacklisted(personId: String): Boolean =
        db.blacklistDao().isBlacklisted(personId) > 0

    // Lockout
    suspend fun isLockedOut(personId: String): Boolean {
        val entry = db.failedAttemptsDao().get(personId) ?: return false
        val lockedUntil = entry.lockedUntil ?: return false
        return System.currentTimeMillis() < lockedUntil
    }

    // Access rules
    suspend fun getMatchingRules(doorId: String): List<AccessRuleEntity> {
        return db.accessRuleDao().getAllByPriority().filter { rule ->
            val doors = JSONArray(rule.doorIds)
            (0 until doors.length()).any { doors.getString(it) == doorId }
        }
    }

    // Person in groups
    suspend fun personInGroups(personId: String, groupIds: List<String>): Boolean {
        for (gid in groupIds) {
            val json = db.personGroupDao().getPersonIds(gid) ?: continue
            val arr = JSONArray(json)
            if ((0 until arr.length()).any { arr.getString(it) == personId }) return true
        }
        return false
    }

    // Seeding
    suspend fun upsertPersons(persons: List<PersonEntity>) = db.personDao().upsertAll(persons)
    suspend fun upsertCredentials(credentials: List<CredentialEntity>) = db.credentialDao().upsertAll(credentials)
    suspend fun upsertRules(rules: List<AccessRuleEntity>) = db.accessRuleDao().upsertAll(rules)
    suspend fun upsertGroups(groups: List<PersonGroupEntity>) = db.personGroupDao().upsertAll(groups)

    // Blacklist management
    suspend fun addToBlacklist(entry: BlacklistEntity) = db.blacklistDao().add(entry)
    suspend fun removeFromBlacklist(personId: String) = db.blacklistDao().remove(personId)

    suspend fun clearAll() {
        db.personDao().deleteAll()
        db.credentialDao().deleteAll()
        db.accessRuleDao().deleteAll()
        db.personGroupDao().deleteAll()
        db.blacklistDao().deleteAll()
        db.failedAttemptsDao().deleteAll()
        db.eventQueueDao().deleteAll()
        db.syncStateDao().deleteAll()
    }
}
