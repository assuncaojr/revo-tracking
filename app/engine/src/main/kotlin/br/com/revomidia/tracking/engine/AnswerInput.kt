package br.com.revomidia.tracking.engine

/** O que a interface entrega ao motor como resposta da pergunta atual. */
sealed interface AnswerInput {
    /** `single`. Para "Outro" (pergunta com `allow_other`), use [OTHER] e informe [rawText]. */
    data class Choice(val value: String, val rawText: String? = null) : AnswerInput

    /** `multi`. */
    data class Choices(val values: List<String>) : AnswerInput

    /** `number` e `scale`. */
    data class Number(val value: Double) : AnswerInput

    /** `grid`: linha → opção. */
    data class Grid(val values: Map<String, String>) : AnswerInput

    /** `text`. */
    data class Text(val text: String) : AnswerInput

    /** `name`: item escolhido da lista (ou null, se texto livre) e o texto digitado. */
    data class Name(val value: String?, val rawText: String) : AnswerInput

    /** `contact`: vai para o bloco de contato da entrevista, nunca para `answers`. */
    data class Contact(val name: String, val phone: String) : AnswerInput

    /** Botão de não-resposta (`_ns`, `_nr`…). */
    data class Nonresponse(val code: String) : AnswerInput

    companion object {
        const val OTHER = "other"
    }
}

/** Resultado de responder, voltar ou pular. */
sealed interface Step {
    /** Próxima pergunta a mostrar. */
    data class Ask(val key: String) : Step

    /** Entrevista terminou (completa, recusa ou filtro). */
    data class Finished(val status: br.com.revomidia.tracking.model.InterviewStatus) : Step

    /** Resposta recusada pelo motor; a pergunta atual continua. */
    data class Invalid(val reason: String) : Step
}
