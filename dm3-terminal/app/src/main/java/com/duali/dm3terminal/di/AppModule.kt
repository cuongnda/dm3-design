package com.duali.dm3terminal.di

import android.content.Context
import androidx.room.Room
import androidx.work.WorkManager
import com.duali.dm3terminal.data.local.AppDatabase
import com.duali.dm3terminal.data.local.dao.*
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    @Provides
    @Singleton
    fun provideDatabase(@ApplicationContext context: Context): AppDatabase {
        return Room.databaseBuilder(
            context,
            AppDatabase::class.java,
            "dm3_terminal.db",
        ).fallbackToDestructiveMigration().build()
    }

    @Provides
    @Singleton
    fun providePersonDao(db: AppDatabase): PersonDao = db.personDao()

    @Provides
    @Singleton
    fun provideCredentialDao(db: AppDatabase): CredentialDao = db.credentialDao()

    @Provides
    @Singleton
    fun provideAccessRuleDao(db: AppDatabase): AccessRuleDao = db.accessRuleDao()

    @Provides
    @Singleton
    fun providePersonGroupDao(db: AppDatabase): PersonGroupDao = db.personGroupDao()

    @Provides
    @Singleton
    fun provideBlacklistDao(db: AppDatabase): BlacklistDao = db.blacklistDao()

    @Provides
    @Singleton
    fun provideFailedAttemptsDao(db: AppDatabase): FailedAttemptsDao = db.failedAttemptsDao()

    @Provides
    @Singleton
    fun provideEventQueueDao(db: AppDatabase): EventQueueDao = db.eventQueueDao()

    @Provides
    @Singleton
    fun provideSyncStateDao(db: AppDatabase): SyncStateDao = db.syncStateDao()

    @Provides
    @Singleton
    fun provideConfigDao(db: AppDatabase): ConfigDao = db.configDao()

    @Provides
    @Singleton
    fun provideFaceTemplateDao(db: AppDatabase): FaceTemplateDao = db.faceTemplateDao()

    @Provides
    @Singleton
    fun provideWorkManager(@ApplicationContext context: Context): WorkManager =
        WorkManager.getInstance(context)
}
