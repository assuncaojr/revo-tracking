package br.com.revomidia.tracking.engine

import br.com.revomidia.tracking.model.Questionnaire
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** Ação aplicada à entrevista, com o horário em que aconteceu. */
@Serializable
sealed interface Action {
    @Serializable @SerialName("answer")
    data class Answer(val input: AnswerInput, val at: String) : Action

    @Serializable @SerialName("back")
    data object Back : Action

    @Serializable @SerialName("skip")
    data object Skip : Action
}

/**
 * Entrevista com registro de ações. O app grava o registro a cada resposta; se o aparelho travar
 * ou a bateria acabar no meio, [restore] reconstrói a entrevista exatamente como estava
 * (mesma semente = mesma ordem embaralhada; horários vêm do próprio registro).
 */
class RecordedInterview private constructor(
    questionnaire: Questionnaire,
    val seed: Long,
    private val clock: () -> String,
) {
    private var actionTime = ""
    val engine = InterviewEngine(questionnaire, seed) { actionTime }

    private val _log = mutableListOf<Action>()
    val log: List<Action> get() = _log

    fun answer(input: AnswerInput): Step = apply(Action.Answer(input, clock()))
    fun back(): Step = apply(Action.Back)
    fun skip(): Step = apply(Action.Skip)

    /** Só ações aceitas entram no registro: uma resposta inválida não muda nada. */
    private fun apply(a: Action): Step {
        val step = when (a) {
            is Action.Answer -> {
                actionTime = a.at
                engine.answer(a.input)
            }
            Action.Back -> engine.back()
            Action.Skip -> engine.skip()
        }
        if (step !is Step.Invalid) _log += a
        return step
    }

    companion object {
        fun start(questionnaire: Questionnaire, seed: Long, clock: () -> String) =
            RecordedInterview(questionnaire, seed, clock)

        fun restore(questionnaire: Questionnaire, seed: Long, log: List<Action>, clock: () -> String): RecordedInterview {
            val r = RecordedInterview(questionnaire, seed, clock)
            for (a in log) {
                val step = r.apply(a)
                check(step !is Step.Invalid) { "Registro inconsistente com o questionário: $a → $step" }
            }
            return r
        }
    }
}
