package com.duali.dm3terminal.data.local.dao

import androidx.room.*
import com.duali.dm3terminal.data.local.entities.FaceTemplateEntity

@Dao
interface FaceTemplateDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(template: FaceTemplateEntity)

    @Query("SELECT * FROM face_templates WHERE person_id = :personId")
    suspend fun getByPersonId(personId: String): List<FaceTemplateEntity>

    @Query("SELECT * FROM face_templates WHERE face_token = :faceToken LIMIT 1")
    suspend fun getByFaceToken(faceToken: String): FaceTemplateEntity?

    @Query("SELECT ft.person_id FROM face_templates ft WHERE ft.face_token = :faceToken LIMIT 1")
    suspend fun getPersonIdByFaceToken(faceToken: String): String?

    @Query("DELETE FROM face_templates WHERE person_id = :personId")
    suspend fun deleteByPersonId(personId: String)

    @Query("DELETE FROM face_templates WHERE face_token = :faceToken")
    suspend fun deleteByFaceToken(faceToken: String)

    @Query("SELECT COUNT(*) FROM face_templates")
    suspend fun count(): Int
}
