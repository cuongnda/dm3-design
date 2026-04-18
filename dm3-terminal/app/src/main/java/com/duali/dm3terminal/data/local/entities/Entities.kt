package com.duali.dm3terminal.data.local.entities

import androidx.room.*

@Entity(tableName = "persons")
data class PersonEntity(
    @PrimaryKey @ColumnInfo(name = "person_id") val personId: String,
    val name: String,
    val status: String = "active",
    @ColumnInfo(name = "valid_from") val validFrom: Long? = null,
    @ColumnInfo(name = "valid_until") val validUntil: Long? = null,
    @ColumnInfo(name = "created_at") val createdAt: Long = System.currentTimeMillis(),
    @ColumnInfo(name = "updated_at") val updatedAt: Long = System.currentTimeMillis(),
)

@Entity(
    tableName = "credentials",
    indices = [
        Index(value = ["type", "value"], unique = true),
        Index(value = ["person_id"]),
    ],
)
data class CredentialEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "person_id") val personId: String,
    val type: String,
    val value: String,
    val status: String = "active",
    @ColumnInfo(name = "valid_from") val validFrom: Long? = null,
    @ColumnInfo(name = "valid_until") val validUntil: Long? = null,
)

@Entity(tableName = "access_rules")
data class AccessRuleEntity(
    @PrimaryKey @ColumnInfo(name = "rule_id") val ruleId: String,
    val name: String,
    @ColumnInfo(name = "door_ids") val doorIds: String, // JSON array
    @ColumnInfo(name = "person_group_ids") val personGroupIds: String, // JSON array
    @ColumnInfo(name = "schedule_json") val scheduleJson: String? = null,
    @ColumnInfo(name = "anti_passback") val antiPassback: Boolean = false,
    @ColumnInfo(name = "multi_factor") val multiFactor: Boolean = false,
    @ColumnInfo(name = "multi_factor_methods") val multiFactorMethods: String? = null, // JSON array: ["face","card","pin"]
    val priority: Int = 0,
    val enabled: Boolean = true,
    @ColumnInfo(name = "valid_from") val validFrom: Long? = null,
    @ColumnInfo(name = "valid_until") val validUntil: Long? = null,
)

@Entity(tableName = "person_groups")
data class PersonGroupEntity(
    @PrimaryKey @ColumnInfo(name = "group_id") val groupId: String,
    @ColumnInfo(name = "person_ids") val personIds: String, // JSON array
)

@Entity(tableName = "event_queue")
data class EventQueueEntity(
    @PrimaryKey @ColumnInfo(name = "message_id") val messageId: String,
    val topic: String,
    @ColumnInfo(name = "payload_json") val payloadJson: String,
    @ColumnInfo(name = "created_at") val createdAt: Long = System.currentTimeMillis(),
    @ColumnInfo(name = "retry_count") val retryCount: Int = 0,
)

@Entity(tableName = "sync_state")
data class SyncStateEntity(
    @PrimaryKey val key: String,
    val value: String,
)

@Entity(tableName = "blacklist")
data class BlacklistEntity(
    @PrimaryKey @ColumnInfo(name = "person_id") val personId: String,
    val reason: String? = null,
    @ColumnInfo(name = "added_at") val addedAt: Long = System.currentTimeMillis(),
)

@Entity(tableName = "failed_attempts")
data class FailedAttemptsEntity(
    @PrimaryKey @ColumnInfo(name = "person_id") val personId: String,
    val count: Int = 0,
    @ColumnInfo(name = "last_attempt_at") val lastAttemptAt: Long? = null,
    @ColumnInfo(name = "locked_until") val lockedUntil: Long? = null,
)

@Entity(tableName = "config")
data class ConfigEntity(
    @PrimaryKey val key: String,
    @ColumnInfo(name = "value_json") val valueJson: String,
)

@Entity(
    tableName = "face_templates",
    indices = [Index(value = ["person_id"])],
)
data class FaceTemplateEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "person_id") val personId: String,
    @ColumnInfo(name = "face_token") val faceToken: String,
    val quality: Float = 0f,
    @ColumnInfo(name = "created_at") val createdAt: Long = System.currentTimeMillis(),
)
