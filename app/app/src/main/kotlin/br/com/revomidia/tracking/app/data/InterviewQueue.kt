package br.com.revomidia.tracking.app.data

import br.com.revomidia.tracking.app.net.BatchResult
import br.com.revomidia.tracking.model.ContractJson
import br.com.revomidia.tracking.model.Interview

/** O que fazer com cada item de um lote, a partir da resposta do núcleo. */
data class BatchOutcome(
    val delete: List<String>,
    val rejected: Map<String, String>,
    /** Sem resposta para o id (resposta incompleta): continua pendente. */
    val retry: List<String>,
)

/**
 * Regra central de "nada se perde no campo": só `accepted` e `duplicate` apagam da fila.
 * Rejeitada fica guardada como rejeitada; ausente da resposta fica pendente.
 */
fun planOutcome(sentIds: List<String>, results: List<BatchResult>): BatchOutcome {
    val byId = results.filter { it.id != null }.associateBy { it.id!! }
    val delete = mutableListOf<String>()
    val rejected = mutableMapOf<String, String>()
    val retry = mutableListOf<String>()
    for (id in sentIds) {
        val r = byId[id]
        when (r?.status) {
            "accepted", "duplicate" -> delete += id
            "rejected" -> rejected[id] = r.errors.joinToString("; ").ifBlank { "rejeitada" }
            else -> retry += id
        }
    }
    return BatchOutcome(delete, rejected, retry)
}

class InterviewQueue(private val dao: QueueDao) {

    suspend fun enqueue(i: Interview) {
        dao.insert(QueuedInterview(id = i.id, json = ContractJson.encodeToString(Interview.serializer(), i)))
    }

    suspend fun pending(limit: Int = 50) = dao.pending(limit)

    suspend fun apply(sent: List<QueuedInterview>, results: List<BatchResult>) {
        val o = planOutcome(sent.map { it.id }, results)
        if (o.delete.isNotEmpty()) dao.delete(o.delete)
        o.rejected.forEach { (id, err) -> dao.markRejected(id, err) }
        if (o.retry.isNotEmpty()) dao.markAttempt(o.retry, "sem resposta do servidor para o item")
    }

    suspend fun failed(sent: List<QueuedInterview>, error: String) = dao.markAttempt(sent.map { it.id }, error)

    suspend fun pendingCount() = dao.count("pending")
    suspend fun rejectedCount() = dao.count("rejected")
}
