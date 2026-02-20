package com.duali.dm3terminal.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import com.duali.dm3terminal.data.local.dao.*
import com.duali.dm3terminal.data.local.entities.*

@Database(
    entities = [
        PersonEntity::class,
        CredentialEntity::class,
        AccessRuleEntity::class,
        PersonGroupEntity::class,
        EventQueueEntity::class,
        SyncStateEntity::class,
        BlacklistEntity::class,
        FailedAttemptsEntity::class,
        ConfigEntity::class,
        FaceTemplateEntity::class,
    ],
    version = 2,
    exportSchema = false,
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun personDao(): PersonDao
    abstract fun credentialDao(): CredentialDao
    abstract fun accessRuleDao(): AccessRuleDao
    abstract fun personGroupDao(): PersonGroupDao
    abstract fun eventQueueDao(): EventQueueDao
    abstract fun syncStateDao(): SyncStateDao
    abstract fun blacklistDao(): BlacklistDao
    abstract fun failedAttemptsDao(): FailedAttemptsDao
    abstract fun configDao(): ConfigDao
    abstract fun faceTemplateDao(): FaceTemplateDao
}
