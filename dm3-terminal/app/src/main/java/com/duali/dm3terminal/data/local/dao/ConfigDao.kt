package com.duali.dm3terminal.data.local.dao

import androidx.room.*
import com.duali.dm3terminal.data.local.entities.ConfigEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface ConfigDao {
    @Query("SELECT * FROM config WHERE `key` = :key")
    suspend fun get(key: String): ConfigEntity?

    @Query("SELECT * FROM config WHERE `key` = :key")
    fun observe(key: String): Flow<ConfigEntity?>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun set(entity: ConfigEntity)

    @Query("DELETE FROM config WHERE `key` = :key")
    suspend fun delete(key: String)
}
