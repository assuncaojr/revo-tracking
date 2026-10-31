package br.com.revomidia.tracking.engine

import br.com.revomidia.tracking.model.Approach
import br.com.revomidia.tracking.model.ClientInfo
import br.com.revomidia.tracking.model.Location

/** Dados da entrevista que não vêm das respostas: preenchidos pelo app. */
data class InterviewMeta(
    val id: String,
    val campaignId: String,
    val deviceId: String,
    val interviewerId: String,
    val sessionId: String,
    val pointId: String,
    val approach: Approach,
    val startedAt: String,
    val finishedAt: String,
    val location: Location?,
    val client: ClientInfo,
)
