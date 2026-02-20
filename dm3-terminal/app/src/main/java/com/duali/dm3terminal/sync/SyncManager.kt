package com.duali.dm3terminal.sync

import android.util.Log
import com.duali.dm3terminal.data.local.dao.*
import com.duali.dm3terminal.data.local.entities.*
import com.duali.dm3terminal.data.repository.DM3Repository
import org.json.JSONArray
import org.json.JSONObject
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Manages person database sync from server MQTT cfg messages.
 * Handles full sync, incremental sync, and blacklist priority updates.
 */
@Singleton
class SyncManager @Inject constructor(
    private val repository: DM3Repository,
    private val syncStateDao: SyncStateDao,
) {
    companion object {
        private const val TAG = "SyncManager"
        const val KEY_PERSON_DB_VERSION = "person_db_version"
        const val KEY_RULES_VERSION = "rules_version"
        const val KEY_BLACKLIST_VERSION = "blacklist_version"
        const val KEY_LAST_SYNC_TIME = "last_sync_time"
    }

    suspend fun getLastSyncTime(): Long {
        return syncStateDao.get(KEY_LAST_SYNC_TIME)?.toLongOrNull() ?: 0L
    }

    suspend fun getVersion(key: String): String {
        return syncStateDao.get(key) ?: "0"
    }

    suspend fun handleFullConfig(data: JSONObject) {
        Log.i(TAG, "Processing full config")
        // Full config contains device settings — store as needed
        // For now, just update sync state
        syncStateDao.set(SyncStateEntity(KEY_LAST_SYNC_TIME, System.currentTimeMillis().toString()))
    }

    suspend fun handlePersonSync(data: JSONObject) {
        val action = data.optString("action", "full_sync")
        Log.i(TAG, "Person sync: action=$action")

        when (action) {
            "full_sync" -> handleFullPersonSync(data)
            "upsert" -> handleUpsertPersons(data)
            "delete" -> handleDeletePersons(data)
        }

        // Update version and last sync time
        val version = data.optString("version", "")
        if (version.isNotEmpty()) {
            syncStateDao.set(SyncStateEntity(KEY_PERSON_DB_VERSION, version))
        }
        syncStateDao.set(SyncStateEntity(KEY_LAST_SYNC_TIME, System.currentTimeMillis().toString()))
    }

    suspend fun handleAccessRulesSync(data: JSONObject) {
        val action = data.optString("action", "full_sync")
        Log.i(TAG, "Access rules sync: action=$action")

        val rulesArr = data.optJSONArray("rules") ?: return
        val rules = (0 until rulesArr.length()).map { i ->
            val r = rulesArr.getJSONObject(i)
            AccessRuleEntity(
                ruleId = r.getString("rule_id"),
                name = r.optString("name", ""),
                doorIds = r.optJSONArray("door_ids")?.toString() ?: "[]",
                personGroupIds = r.optJSONArray("person_group_ids")?.toString() ?: "[]",
                scheduleJson = r.optJSONObject("schedule")?.toString(),
                antiPassback = r.optBoolean("anti_passback", false),
                multiFactor = r.optBoolean("multi_factor", false),
                priority = r.optInt("priority", 0),
                enabled = r.optBoolean("enabled", true),
                validFrom = r.optLong("valid_from", 0).takeIf { it > 0 },
                validUntil = r.optLong("valid_until", 0).takeIf { it > 0 },
            )
        }

        if (action == "full_sync") {
            // Replace all rules
            repository.upsertRules(rules)
        } else {
            repository.upsertRules(rules)
        }

        val version = data.optString("version", "")
        if (version.isNotEmpty()) {
            syncStateDao.set(SyncStateEntity(KEY_RULES_VERSION, version))
        }
        syncStateDao.set(SyncStateEntity(KEY_LAST_SYNC_TIME, System.currentTimeMillis().toString()))
        Log.i(TAG, "Synced ${rules.size} access rules")
    }

    suspend fun handleBlacklistSync(data: JSONObject) {
        val action = data.optString("action", "full_sync")
        Log.i(TAG, "Blacklist sync: action=$action (PRIORITY)")

        val entries = data.optJSONArray("entries") ?: return
        for (i in 0 until entries.length()) {
            val entry = entries.getJSONObject(i)
            val personId = entry.getString("person_id")
            when (action) {
                "add", "full_sync" -> {
                    repository.addToBlacklist(BlacklistEntity(
                        personId = personId,
                        reason = entry.optString("reason", null),
                    ))
                }
                "remove" -> {
                    repository.removeFromBlacklist(personId)
                }
            }
        }

        val version = data.optString("version", "")
        if (version.isNotEmpty()) {
            syncStateDao.set(SyncStateEntity(KEY_BLACKLIST_VERSION, version))
        }
        syncStateDao.set(SyncStateEntity(KEY_LAST_SYNC_TIME, System.currentTimeMillis().toString()))
        Log.i(TAG, "Blacklist sync complete: ${entries.length()} entries")
    }

    suspend fun handleConfigPatch(data: JSONObject) {
        Log.i(TAG, "Config patch received")
        // TODO: Apply partial config changes
        syncStateDao.set(SyncStateEntity(KEY_LAST_SYNC_TIME, System.currentTimeMillis().toString()))
    }

    private suspend fun handleFullPersonSync(data: JSONObject) {
        val personsArr = data.optJSONArray("persons") ?: return
        val credentialsArr = data.optJSONArray("credentials") ?: JSONArray()
        val groupsArr = data.optJSONArray("groups") ?: JSONArray()

        val persons = (0 until personsArr.length()).map { i ->
            val p = personsArr.getJSONObject(i)
            PersonEntity(
                personId = p.getString("person_id"),
                name = p.optString("name", ""),
                status = p.optString("status", "active"),
                validFrom = p.optLong("valid_from", 0).takeIf { it > 0 },
                validUntil = p.optLong("valid_until", 0).takeIf { it > 0 },
            )
        }

        val credentials = (0 until credentialsArr.length()).map { i ->
            val c = credentialsArr.getJSONObject(i)
            CredentialEntity(
                id = c.getString("id"),
                personId = c.getString("person_id"),
                type = c.getString("type"),
                value = c.getString("value"),
                status = c.optString("status", "active"),
                validFrom = c.optLong("valid_from", 0).takeIf { it > 0 },
                validUntil = c.optLong("valid_until", 0).takeIf { it > 0 },
            )
        }

        val groups = (0 until groupsArr.length()).map { i ->
            val g = groupsArr.getJSONObject(i)
            PersonGroupEntity(
                groupId = g.getString("group_id"),
                personIds = g.optJSONArray("person_ids")?.toString() ?: "[]",
            )
        }

        repository.upsertPersons(persons)
        repository.upsertCredentials(credentials)
        repository.upsertGroups(groups)

        Log.i(TAG, "Full sync: ${persons.size} persons, ${credentials.size} credentials, ${groups.size} groups")
    }

    private suspend fun handleUpsertPersons(data: JSONObject) {
        val personsArr = data.optJSONArray("persons") ?: return
        val credentialsArr = data.optJSONArray("credentials") ?: JSONArray()

        val persons = (0 until personsArr.length()).map { i ->
            val p = personsArr.getJSONObject(i)
            PersonEntity(
                personId = p.getString("person_id"),
                name = p.optString("name", ""),
                status = p.optString("status", "active"),
                validFrom = p.optLong("valid_from", 0).takeIf { it > 0 },
                validUntil = p.optLong("valid_until", 0).takeIf { it > 0 },
            )
        }

        val credentials = (0 until credentialsArr.length()).map { i ->
            val c = credentialsArr.getJSONObject(i)
            CredentialEntity(
                id = c.getString("id"),
                personId = c.getString("person_id"),
                type = c.getString("type"),
                value = c.getString("value"),
                status = c.optString("status", "active"),
            )
        }

        repository.upsertPersons(persons)
        if (credentials.isNotEmpty()) repository.upsertCredentials(credentials)
        Log.i(TAG, "Upsert: ${persons.size} persons, ${credentials.size} credentials")
    }

    private suspend fun handleDeletePersons(data: JSONObject) {
        val personIds = data.optJSONArray("person_ids") ?: return
        // TODO: Add delete by IDs to repository
        Log.i(TAG, "Delete: ${personIds.length()} persons (not yet implemented)")
    }
}
