package br.com.revomidia.tracking.engine

import br.com.revomidia.tracking.model.Answer
import br.com.revomidia.tracking.model.Contact
import br.com.revomidia.tracking.model.Interview
import br.com.revomidia.tracking.model.InterviewStatus
import br.com.revomidia.tracking.model.Option
import br.com.revomidia.tracking.model.Question
import br.com.revomidia.tracking.model.QuestionType
import br.com.revomidia.tracking.model.Questionnaire
import br.com.revomidia.tracking.model.TerminateStatus
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlin.random.Random

/**
 * Conduz uma entrevista sobre um questionário: qual a próxima pergunta, validação,
 * condições, encerramento, derivações e embaralhamento. Sem Android, sem rede, sem relógio próprio.
 *
 * @param seed semente do embaralhamento; a ordem mostrada é gravada na resposta, então a semente não precisa ser guardada.
 * @param now relógio injetado, devolve ISO-8601 com fuso.
 */
class InterviewEngine(
    val questionnaire: Questionnaire,
    private val seed: Long,
    private val now: () -> String,
) {
    private val answers = LinkedHashMap<String, Answer>()
    private var contact: Contact? = null
    private val history = ArrayDeque<String>()
    private val orders = HashMap<String, List<String>>()

    var status: InterviewStatus? = null
        private set

    /** Chave da pergunta atual; null quando a entrevista terminou. */
    var currentKey: String? = null
        private set

    init {
        val first = nextVisibleAfter(-1)
        requireNotNull(first) { "Questionário sem nenhuma pergunta visível no início" }
        currentKey = first.key
    }

    val current: Question? get() = currentKey?.let(questionnaire::question)

    /** Resposta já dada à pergunta (ao voltar, a interface mostra preenchida). */
    fun answerOf(key: String): Answer? = answers[key]

    /** Ordem de exibição das opções (ou das linhas, em grade), estável durante a entrevista. */
    fun shownOrder(q: Question): List<String> = orders.getOrPut(q.key) {
        val (items, shuffle) = when (q.type) {
            QuestionType.GRID -> questionnaire.rowsOf(q) to q.shuffleRows
            else -> questionnaire.optionsOf(q) to q.shuffle
        }
        if (shuffle) shuffled(items, Random(seed * 31 + q.key.hashCode())) else items.map { it.value }
    }

    /** Sugestões para o tipo `name` (só para o entrevistador, depois da resposta). */
    fun suggestions(q: Question, typed: String, limit: Int = 5): List<Option> =
        suggest(questionnaire.suggestionsOf(q), typed, limit)

    fun answer(input: AnswerInput): Step {
        val q = current ?: return Step.Invalid("Entrevista encerrada")
        val stored = when (val r = validate(q, input)) {
            is Validated.Error -> return Step.Invalid(r.reason)
            is Validated.Ok -> r
        }
        if (q.type == QuestionType.CONTACT) {
            contact = stored.contact
            answers.remove(q.key)
        } else {
            answers[q.key] = stored.answer!!
        }
        val term = q.terminateIf
        if (term != null && evaluate(term, ::lookup)) {
            return finish(
                when (q.terminateStatus) {
                    TerminateStatus.REFUSED -> InterviewStatus.REFUSED
                    TerminateStatus.SCREENED_OUT, null -> InterviewStatus.SCREENED_OUT
                }
            )
        }
        return advanceFrom(q)
    }

    /** Pula pergunta não obrigatória. */
    fun skip(): Step {
        val q = current ?: return Step.Invalid("Entrevista encerrada")
        if (q.required) return Step.Invalid("Pergunta obrigatória: responda ou use uma não-resposta")
        answers.remove(q.key)
        if (q.type == QuestionType.CONTACT) contact = null
        return advanceFrom(q)
    }

    /** Volta para a pergunta anterior; as respostas dadas continuam guardadas. */
    fun back(): Step {
        val prev = history.removeLastOrNull() ?: return Step.Invalid("Já está na primeira pergunta")
        status = null
        currentKey = prev
        return Step.Ask(prev)
    }

    fun abandon(): Step = finish(InterviewStatus.ABANDONED)

    /** Respostas válidas: só das perguntas que ficaram visíveis com as respostas finais. */
    fun finalAnswers(): Map<String, Answer> {
        val visible = visibleKeys()
        return answers.filterKeys { it in visible }
    }

    fun finalContact(): Contact? {
        val q = questionnaire.questions.firstOrNull { it.type == QuestionType.CONTACT } ?: return null
        return contact.takeIf { q.key in visibleKeys() }
    }

    /** Derivados (ex.: faixa etária), recalculados das respostas finais. */
    fun derived(): Map<String, JsonElement> = derivedFrom(finalAnswers())

    /**
     * Calcula derivados de um conjunto de respostas. As condições usam as respostas brutas
     * (não as finais), porque as finais dependem da visibilidade, que depende das condições.
     */
    private fun derivedFrom(src: Map<String, Answer>): Map<String, JsonElement> {
        val out = LinkedHashMap<String, JsonElement>()
        for (q in questionnaire.questions) {
            val d = q.derive ?: continue
            val v = (src[q.key]?.value as? JsonPrimitive)?.takeIf { !it.isString }?.doubleOrNull ?: continue
            val bin = d.bins.firstOrNull { b ->
                v >= b[0].jsonPrimitive.doubleOrNull!! && v <= b[1].jsonPrimitive.doubleOrNull!!
            }
            if (bin != null) out[d.key] = bin[2]
        }
        return out
    }

    /** Monta a entrevista final no formato do contrato. */
    fun toInterview(meta: InterviewMeta): Interview {
        val st = checkNotNull(status) { "Entrevista ainda em andamento" }
        return Interview(
            id = meta.id,
            questionnaire = br.com.revomidia.tracking.model.QuestionnaireRef(questionnaire.id, questionnaire.version),
            campaignId = meta.campaignId,
            deviceId = meta.deviceId,
            interviewerId = meta.interviewerId,
            sessionId = meta.sessionId,
            pointId = meta.pointId,
            approach = meta.approach,
            status = st,
            startedAt = meta.startedAt,
            finishedAt = meta.finishedAt,
            location = meta.location,
            answers = finalAnswers(),
            derived = derived().takeIf { it.isNotEmpty() },
            contact = finalContact(),
            client = meta.client,
        )
    }

    // --- navegação ---

    private fun advanceFrom(q: Question): Step {
        history.addLast(q.key)
        val idx = questionnaire.questions.indexOfFirst { it.key == q.key }
        val next = nextVisibleAfter(idx) ?: return finish(InterviewStatus.COMPLETE)
        currentKey = next.key
        return Step.Ask(next.key)
    }

    private fun finish(s: InterviewStatus): Step {
        status = s
        currentKey = null
        return Step.Finished(s)
    }

    private fun nextVisibleAfter(index: Int): Question? =
        questionnaire.questions.drop(index + 1).firstOrNull { isVisible(it) }

    private fun isVisible(q: Question): Boolean = q.showIf?.let { evaluate(it, ::lookup) } ?: true

    /** Visibilidade em ordem: uma pergunta escondida não conta para as condições das seguintes. */
    private fun visibleKeys(): Set<String> {
        val visible = LinkedHashSet<String>()
        for (q in questionnaire.questions) {
            val ok = q.showIf?.let { cond -> evaluate(cond) { k -> if (k in visible || isDerived(k)) lookup(k) else Known.Missing } } ?: true
            if (ok) visible += q.key
        }
        return visible
    }

    private fun isDerived(key: String) = questionnaire.questions.any { it.derive?.key == key }

    private fun lookup(key: String): Known {
        answers[key]?.let { a ->
            return if (a.nonresponse != null) Known.Nonresponse(a.nonresponse!!) else Known.Value(a.value!!)
        }
        if (key == questionnaire.questions.firstOrNull { it.type == QuestionType.CONTACT }?.key && contact != null) {
            return Known.Value(JsonPrimitive(true))
        }
        if (isDerived(key)) derivedFrom(answers)[key]?.let { return Known.Value(it) }
        return Known.Missing
    }

    // --- validação ---

    private sealed interface Validated {
        data class Ok(val answer: Answer?, val contact: Contact? = null) : Validated
        data class Error(val reason: String) : Validated
    }

    private fun validate(q: Question, input: AnswerInput): Validated {
        val at = now()
        if (input is AnswerInput.Nonresponse) {
            val allowed = questionnaire.nonresponseOf(q).map { it.value }
            return if (input.code in allowed) Validated.Ok(Answer(nonresponse = input.code, answeredAt = at))
            else Validated.Error("Não-resposta '${input.code}' não permitida em ${q.key}")
        }
        val order = if (q.shuffle || q.shuffleRows) shownOrder(q) else null
        return when (q.type) {
            QuestionType.SINGLE -> {
                val i = input as? AnswerInput.Choice ?: return wrongType(q)
                val options = questionnaire.optionsOf(q).map { it.value }
                when {
                    i.value in options -> Validated.Ok(Answer(JsonPrimitive(i.value), shownOrder = order, answeredAt = at))
                    q.allowOther && i.value == AnswerInput.OTHER && !i.rawText.isNullOrBlank() ->
                        Validated.Ok(Answer(JsonPrimitive(AnswerInput.OTHER), rawText = i.rawText.trim(), shownOrder = order, answeredAt = at))
                    else -> Validated.Error("'${i.value}' não é opção de ${q.key}")
                }
            }
            QuestionType.MULTI -> {
                val i = input as? AnswerInput.Choices ?: return wrongType(q)
                val opts = questionnaire.optionsOf(q).associateBy { it.value }
                val values = i.values.distinct()
                when {
                    values.isEmpty() -> Validated.Error("Escolha ao menos uma opção")
                    values.any { it !in opts } -> Validated.Error("Opção inválida em ${q.key}")
                    q.maxChoices != null && values.size > q.maxChoices!! -> Validated.Error("No máximo ${q.maxChoices} opções")
                    values.size > 1 && values.any { opts.getValue(it).exclusive } -> Validated.Error("Opção exclusiva não combina com outras")
                    else -> Validated.Ok(Answer(JsonArray(values.map(::JsonPrimitive)), shownOrder = order, answeredAt = at))
                }
            }
            QuestionType.NUMBER, QuestionType.SCALE -> {
                val i = input as? AnswerInput.Number ?: return wrongType(q)
                val v = i.value
                when {
                    v.isNaN() || v.isInfinite() -> Validated.Error("Número inválido")
                    q.min != null && v < q.min!! -> Validated.Error("Mínimo ${fmt(q.min!!)}")
                    q.max != null && v > q.max!! -> Validated.Error("Máximo ${fmt(q.max!!)}")
                    q.type == QuestionType.SCALE && v != Math.floor(v) -> Validated.Error("Use um número inteiro")
                    else -> Validated.Ok(Answer(numberJson(v), answeredAt = at))
                }
            }
            QuestionType.GRID -> {
                val i = input as? AnswerInput.Grid ?: return wrongType(q)
                val rows = questionnaire.rowsOf(q).map { it.value }
                val opts = questionnaire.optionsOf(q).map { it.value }.toSet()
                when {
                    i.values.keys.any { it !in rows } -> Validated.Error("Linha desconhecida em ${q.key}")
                    i.values.values.any { it !in opts } -> Validated.Error("Opção inválida em ${q.key}")
                    q.required && rows.any { it !in i.values } -> Validated.Error("Responda todas as linhas")
                    else -> Validated.Ok(
                        Answer(JsonObject(rows.filter { it in i.values }.associateWith { JsonPrimitive(i.values.getValue(it)) }),
                            shownOrder = order, answeredAt = at)
                    )
                }
            }
            QuestionType.TEXT -> {
                val i = input as? AnswerInput.Text ?: return wrongType(q)
                if (i.text.isBlank()) Validated.Error("Resposta vazia")
                else Validated.Ok(Answer(JsonPrimitive(i.text.trim()), answeredAt = at))
            }
            QuestionType.NAME -> {
                val i = input as? AnswerInput.Name ?: return wrongType(q)
                val raw = i.rawText.trim()
                val listValues = questionnaire.suggestionsOf(q).map { it.value }
                when {
                    i.value != null && i.value !in listValues -> Validated.Error("'${i.value}' não está na lista")
                    i.value != null -> Validated.Ok(Answer(JsonPrimitive(i.value), rawText = raw.ifBlank { null }, answeredAt = at))
                    raw.isBlank() -> Validated.Error("Resposta vazia")
                    !q.allowFreeText -> Validated.Error("Escolha um nome da lista")
                    else -> Validated.Ok(Answer(JsonPrimitive(raw), rawText = raw, answeredAt = at))
                }
            }
            QuestionType.CONTACT -> {
                val i = input as? AnswerInput.Contact ?: return wrongType(q)
                val phone = i.phone.filter { it.isDigit() }
                val version = q.consentTextVersion
                when {
                    i.name.isBlank() -> Validated.Error("Informe o nome")
                    phone.length !in 10..13 -> Validated.Error("Telefone deve ter DDD + número")
                    version == null -> Validated.Error("Questionário sem versão do texto de consentimento em ${q.key}")
                    else -> Validated.Ok(null, Contact(i.name.trim(), phone, true, version, at))
                }
            }
        }
    }

    private fun wrongType(q: Question) = Validated.Error("Tipo de resposta incompatível com ${q.key} (${q.type})")

    private fun numberJson(v: Double): JsonPrimitive =
        if (v == Math.floor(v) && kotlin.math.abs(v) < 1e15) JsonPrimitive(v.toLong()) else JsonPrimitive(v)

    private fun fmt(v: Double) = if (v == Math.floor(v)) v.toLong().toString() else v.toString()
}

/** Embaralha os itens não fixos; os marcados como `fixed` ficam na posição original. */
internal fun shuffled(items: List<Option>, random: Random): List<String> {
    val movable = items.filterNot { it.fixed }.map { it.value }.shuffled(random).iterator()
    return items.map { if (it.fixed) it.value else movable.next() }
}
