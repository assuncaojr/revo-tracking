package br.com.revomidia.tracking.app.data

import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.RoomDatabase
import androidx.room.Upsert

/** Entrevista terminada, aguardando confirmação do núcleo. Só sai daqui com `accepted` ou `duplicate`. */
@Entity(tableName = "queued_interview")
data class QueuedInterview(
    @PrimaryKey val id: String,
    val json: String,
    /** pending | rejected (rejeitada pelo núcleo: fica guardada para a equipe ver, nunca é apagada em silêncio) */
    val status: String = "pending",
    val createdAt: Long = System.currentTimeMillis(),
    val attempts: Int = 0,
    val lastError: String? = null,
)

/** Entrevista em andamento (registro de ações), gravada a cada resposta. Uma por aparelho. */
@Entity(tableName = "draft")
data class Draft(@PrimaryKey val slot: Int = 0, val json: String)

@Dao
interface QueueDao {
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insert(item: QueuedInterview)

    @Query("SELECT * FROM queued_interview WHERE status = 'pending' ORDER BY createdAt LIMIT :limit")
    suspend fun pending(limit: Int): List<QueuedInterview>

    @Query("DELETE FROM queued_interview WHERE id IN (:ids)")
    suspend fun delete(ids: List<String>)

    @Query("UPDATE queued_interview SET status = 'rejected', lastError = :error WHERE id = :id")
    suspend fun markRejected(id: String, error: String)

    @Query("UPDATE queued_interview SET attempts = attempts + 1, lastError = :error WHERE id IN (:ids)")
    suspend fun markAttempt(ids: List<String>, error: String?)

    @Query("SELECT COUNT(*) FROM queued_interview WHERE status = :status")
    suspend fun count(status: String): Int
}

@Dao
interface DraftDao {
    @Upsert
    suspend fun save(d: Draft)

    @Query("SELECT * FROM draft WHERE slot = 0")
    suspend fun load(): Draft?

    @Query("DELETE FROM draft")
    suspend fun clear()
}

@Database(entities = [QueuedInterview::class, Draft::class], version = 1)
abstract class AppDb : RoomDatabase() {
    abstract fun queue(): QueueDao
    abstract fun drafts(): DraftDao
}
