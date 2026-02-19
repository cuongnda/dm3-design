package com.duali.dm3terminal.data.local.dao

import androidx.room.*
import com.duali.dm3terminal.data.local.entities.*

@Dao
interface PersonDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(person: PersonEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(persons: List<PersonEntity>)

    @Query("SELECT * FROM persons WHERE person_id = :id")
    suspend fun getById(id: String): PersonEntity?

    @Query("SELECT COUNT(*) FROM persons")
    suspend fun count(): Int

    @Query("DELETE FROM persons")
    suspend fun deleteAll()
}

@Dao
interface CredentialDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(credential: CredentialEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(credentials: List<CredentialEntity>)

    @Query("""
        SELECT p.* FROM persons p
        JOIN credentials c ON c.person_id = p.person_id
        WHERE c.type = :type AND c.value = :value AND c.status = 'active'
        LIMIT 1
    """)
    suspend fun lookupPerson(type: String, value: String): PersonEntity?

    @Query("DELETE FROM credentials")
    suspend fun deleteAll()
}

@Dao
interface AccessRuleDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(rule: AccessRuleEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(rules: List<AccessRuleEntity>)

    @Query("SELECT * FROM access_rules ORDER BY priority DESC")
    suspend fun getAllByPriority(): List<AccessRuleEntity>

    @Query("SELECT COUNT(*) FROM access_rules")
    suspend fun count(): Int

    @Query("DELETE FROM access_rules")
    suspend fun deleteAll()
}

@Dao
interface PersonGroupDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(group: PersonGroupEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(groups: List<PersonGroupEntity>)

    @Query("SELECT person_ids FROM person_groups WHERE group_id = :groupId")
    suspend fun getPersonIds(groupId: String): String?

    @Query("DELETE FROM person_groups")
    suspend fun deleteAll()
}

@Dao
interface BlacklistDao {
    @Query("SELECT COUNT(*) FROM blacklist WHERE person_id = :personId")
    suspend fun isBlacklisted(personId: String): Int

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun add(entry: BlacklistEntity)

    @Query("DELETE FROM blacklist")
    suspend fun deleteAll()
}

@Dao
interface FailedAttemptsDao {
    @Query("SELECT * FROM failed_attempts WHERE person_id = :personId")
    suspend fun get(personId: String): FailedAttemptsEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entry: FailedAttemptsEntity)

    @Query("DELETE FROM failed_attempts WHERE person_id = :personId")
    suspend fun reset(personId: String)

    @Query("DELETE FROM failed_attempts")
    suspend fun deleteAll()
}

@Dao
interface EventQueueDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(event: EventQueueEntity)

    @Query("SELECT * FROM event_queue ORDER BY created_at LIMIT :limit")
    suspend fun getPending(limit: Int = 100): List<EventQueueEntity>

    @Query("DELETE FROM event_queue WHERE message_id IN (:ids)")
    suspend fun deleteByIds(ids: List<String>)

    @Query("DELETE FROM event_queue")
    suspend fun deleteAll()
}

@Dao
interface SyncStateDao {
    @Query("SELECT value FROM sync_state WHERE `key` = :key")
    suspend fun get(key: String): String?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun set(entry: SyncStateEntity)

    @Query("DELETE FROM sync_state")
    suspend fun deleteAll()
}
