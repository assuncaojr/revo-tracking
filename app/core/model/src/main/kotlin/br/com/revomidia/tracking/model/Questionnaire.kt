package br.com.revomidia.tracking.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/** Uma versão de questionário (contracts/questionnaire.schema.json). Imutável depois de publicada. */
@Serializable
data class Questionnaire(
    val schema: String,
    val id: String,
    val version: Int,
    val title: String,
    val description: String? = null,
    val lists: Map<String, List<Option>> = emptyMap(),
    val nonresponse: List<NonresponseOption> = emptyList(),
    val questions: List<Question>,
) {
    fun question(key: String): Question? = questions.firstOrNull { it.key == key }

    /** Opções efetivas de uma pergunta: as próprias ou as da lista referenciada. */
    fun optionsOf(q: Question): List<Option> = q.options ?: q.optionsList?.let { lists[it] } ?: emptyList()

    /** Linhas efetivas de uma grade. */
    fun rowsOf(q: Question): List<Option> = q.rows ?: q.rowsList?.let { lists[it] } ?: emptyList()

    /** Sugestões do tipo `name`. */
    fun suggestionsOf(q: Question): List<Option> = q.list?.let { lists[it] } ?: emptyList()

    /** Não-respostas aceitas pela pergunta (`nonresponse` ausente ou true = todas as do topo). */
    fun nonresponseOf(q: Question): List<NonresponseOption> = when (val nr = q.nonresponse) {
        null, NonresponseRule.All -> nonresponse
        NonresponseRule.None -> emptyList()
        is NonresponseRule.Only -> nonresponse.filter { it.value in nr.values }
    }

    companion object {
        const val SCHEMA = "tracking.questionnaire/1"
    }
}

@Serializable
data class Option(
    val value: String,
    val label: String,
    val aliases: List<String> = emptyList(),
    val exclusive: Boolean = false,
    val fixed: Boolean = false,
)

@Serializable
data class NonresponseOption(val value: String, val label: String)

@Serializable
enum class QuestionType {
    @SerialName("single") SINGLE,
    @SerialName("multi") MULTI,
    @SerialName("number") NUMBER,
    @SerialName("scale") SCALE,
    @SerialName("grid") GRID,
    @SerialName("text") TEXT,
    @SerialName("name") NAME,
    @SerialName("contact") CONTACT,
}

@Serializable
enum class QuestionRole {
    @SerialName("consent") CONSENT,
    @SerialName("filter") FILTER,
    @SerialName("profile") PROFILE,
    @SerialName("quota") QUOTA,
    @SerialName("vote") VOTE,
    @SerialName("vote_past") VOTE_PAST,
    @SerialName("approval") APPROVAL,
    @SerialName("evaluation") EVALUATION,
    @SerialName("open") OPEN,
    @SerialName("contact") CONTACT,
}

@Serializable
enum class Display {
    @SerialName("list") LIST,
    @SerialName("buttons") BUTTONS,
    @SerialName("disc") DISC,
}

@Serializable
enum class TerminateStatus {
    @SerialName("refused") REFUSED,
    @SerialName("screened_out") SCREENED_OUT,
}

@Serializable
data class Derive(
    val key: String,
    /** [mínimo, máximo, rótulo], limites inclusivos. */
    val bins: List<List<JsonElement>>,
)

@Serializable
data class Question(
    val key: String,
    val type: QuestionType,
    val role: QuestionRole,
    val text: String,
    @SerialName("read_aloud") val readAloud: String? = null,
    val hint: String? = null,
    val options: List<Option>? = null,
    @SerialName("options_list") val optionsList: String? = null,
    val rows: List<Option>? = null,
    @SerialName("rows_list") val rowsList: String? = null,
    val list: String? = null,
    @SerialName("allow_free_text") val allowFreeText: Boolean = false,
    @SerialName("allow_other") val allowOther: Boolean = false,
    val min: Double? = null,
    val max: Double? = null,
    @SerialName("max_choices") val maxChoices: Int? = null,
    val display: Display? = null,
    val shuffle: Boolean = false,
    @SerialName("shuffle_rows") val shuffleRows: Boolean = false,
    @SerialName("scenario_group") val scenarioGroup: String? = null,
    @Serializable(with = NonresponseRuleSerializer::class) val nonresponse: NonresponseRule? = null,
    val required: Boolean = true,
    @SerialName("show_if") val showIf: Condition? = null,
    @SerialName("terminate_if") val terminateIf: Condition? = null,
    @SerialName("terminate_status") val terminateStatus: TerminateStatus? = null,
    val derive: Derive? = null,
    @SerialName("consent_text_version") val consentTextVersion: String? = null,
)

/** `nonresponse` por pergunta: true (todas), false (nenhuma) ou lista de valores aceitos. */
sealed interface NonresponseRule {
    data object All : NonresponseRule
    data object None : NonresponseRule
    data class Only(val values: List<String>) : NonresponseRule
}
