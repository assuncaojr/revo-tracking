package br.com.revomidia.tracking.model

import kotlinx.serialization.EncodeDefault
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/**
 * Entrevista enviada ao núcleo (contracts/interview.schema.json).
 * `location` e `contact` são obrigatórios no contrato, mesmo nulos: por isso não têm valor padrão.
 */
@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class Interview(
    /** Sempre gravado: o contrato exige `schema`, e [ContractJson] omite valores padrão. */
    @EncodeDefault val schema: String = SCHEMA,
    val id: String,
    val questionnaire: QuestionnaireRef,
    @SerialName("campaign_id") val campaignId: String,
    @SerialName("device_id") val deviceId: String,
    @SerialName("interviewer_id") val interviewerId: String,
    @SerialName("session_id") val sessionId: String,
    @SerialName("point_id") val pointId: String,
    val approach: Approach,
    val status: InterviewStatus,
    @SerialName("started_at") val startedAt: String,
    @SerialName("finished_at") val finishedAt: String,
    val location: Location?,
    val answers: Map<String, Answer>,
    val derived: Map<String, JsonElement>? = null,
    val contact: Contact? = null,
    val client: ClientInfo,
) {
    companion object {
        const val SCHEMA = "tracking.interview/1"
    }
}

@Serializable
data class QuestionnaireRef(val id: String, val version: Int)

@Serializable
enum class Approach {
    @SerialName("flow") FLOW,
    @SerialName("door") DOOR,
}

@Serializable
enum class InterviewStatus {
    @SerialName("complete") COMPLETE,
    @SerialName("refused") REFUSED,
    @SerialName("screened_out") SCREENED_OUT,
    @SerialName("abandoned") ABANDONED,
}

@Serializable
data class Location(
    val lat: Double,
    val lng: Double,
    @SerialName("accuracy_m") val accuracyM: Double,
    @SerialName("captured_at") val capturedAt: String,
)

/** Resposta: [value] ou [nonresponse], nunca os dois. */
@Serializable
data class Answer(
    val value: JsonElement? = null,
    val nonresponse: String? = null,
    @SerialName("raw_text") val rawText: String? = null,
    @SerialName("shown_order") val shownOrder: List<String>? = null,
    @SerialName("answered_at") val answeredAt: String? = null,
) {
    init {
        require((value == null) != (nonresponse == null)) { "Resposta precisa de 'value' ou 'nonresponse', não dos dois" }
    }
}

@Serializable
data class Contact(
    val name: String,
    val phone: String,
    @SerialName("consent_contact") val consentContact: Boolean,
    @SerialName("consent_text_version") val consentTextVersion: String,
    @SerialName("consented_at") val consentedAt: String,
)

@Serializable
data class ClientInfo(
    @SerialName("app_version") val appVersion: String,
    @SerialName("user_agent") val userAgent: String? = null,
)
