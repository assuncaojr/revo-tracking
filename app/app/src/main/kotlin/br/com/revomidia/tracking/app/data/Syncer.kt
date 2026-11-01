package br.com.revomidia.tracking.app.data

import br.com.revomidia.tracking.app.net.ApiClient
import br.com.revomidia.tracking.app.net.Unauthorized
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.io.IOException

sealed interface SyncResult {
    /** [sent] confirmadas pelo núcleo nesta rodada; [pending] que continuam na fila. */
    data class Done(val sent: Int, val pending: Int) : SyncResult
    data class Offline(val reason: String, val pending: Int) : SyncResult
    data object Unauthorized : SyncResult
}

/**
 * Envia a fila ao núcleo em lotes de até 50, até esvaziar. Usado pelo app aberto (logo ao terminar
 * a entrevista e quando a rede volta) e pelo WorkManager (segunda via, com o app fechado).
 * A trava evita dois envios simultâneos no mesmo processo; se ainda assim um lote for repetido,
 * o núcleo responde `duplicate` e nada se duplica.
 */
class Syncer(
    private val store: DeviceStore,
    private val queue: InterviewQueue,
    private val api: ApiClient,
    private val battery: () -> Int?,
    private val appVersion: String,
) {
    private val mutex = Mutex()

    suspend fun sync(): SyncResult = mutex.withLock {
        if (!store.enrolled) return SyncResult.Unauthorized
        var sent = 0
        try {
            for (round in 1..MAX_BATCHES) {
                val batch = queue.pending(50)
                if (batch.isEmpty()) break
                val outcome = try {
                    queue.apply(batch, api.sendBatch(batch.map { it.json }))
                } catch (e: IOException) {
                    queue.failed(batch, e.message ?: e.javaClass.simpleName)
                    throw e
                }
                sent += outcome.delete.size
                if (outcome.delete.isEmpty() && outcome.rejected.isEmpty()) break // nada avançou: evita repetir à toa
            }
            store.lastSyncAt = Clock.now()
            val pending = queue.pendingCount()
            runCatching { api.heartbeat(pending, battery(), appVersion) }
            SyncResult.Done(sent, pending)
        } catch (e: Unauthorized) {
            store.clearToken()
            SyncResult.Unauthorized
        } catch (e: IOException) {
            SyncResult.Offline(e.message ?: "sem conexão", queue.pendingCount())
        }
    }

    private companion object {
        const val MAX_BATCHES = 20
    }
}
