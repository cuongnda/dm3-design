package com.duali.dm3terminal.di

import android.content.Context
import androidx.room.Room
import com.duali.dm3terminal.data.local.AppDatabase
import com.duali.dm3terminal.data.local.dao.EventQueueDao
import com.duali.dm3terminal.data.local.dao.SyncStateDao
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
        ).build()
    }

    @Provides
    @Singleton
    fun provideEventQueueDao(db: AppDatabase): EventQueueDao = db.eventQueueDao()

    @Provides
    @Singleton
    fun provideSyncStateDao(db: AppDatabase): SyncStateDao = db.syncStateDao()
}
