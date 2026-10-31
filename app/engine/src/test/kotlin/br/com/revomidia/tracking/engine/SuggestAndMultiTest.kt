package br.com.revomidia.tracking.engine

import br.com.revomidia.tracking.engine.Fixtures.pilot
import br.com.revomidia.tracking.model.ContractJson
import br.com.revomidia.tracking.model.InterviewStatus
import br.com.revomidia.tracking.model.Questionnaire
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertInstanceOf
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class SuggestAndMultiTest {

    private val nomes = pilot.lists.getValue("nomes")

    @Test
    fun `sugestoes ignoram acento e caixa e usam apelidos`() {
        assertEquals("lycia_waquim", suggest(nomes, "lic").first().value, "apelido 'Lícia' sem acento")
        assertEquals("gentil_neto", suggest(nomes, "GENT").first().value)
        assertEquals("gentil_neto", suggest(nomes, "neto").first().value, "começo de outra palavra do nome")
        assertTrue(suggest(nomes, "").isEmpty())
        assertTrue(suggest(nomes, "zzz").isEmpty())
    }

    private val rejeicao: Questionnaire = ContractJson.decodeFromString(
        Questionnaire.serializer(),
        """
        {"schema":"tracking.questionnaire/1","id":"teste","version":1,"title":"t",
         "nonresponse":[{"value":"_ns","label":"Não sabe"}],
         "questions":[{"key":"R1","type":"multi","role":"vote","text":"Em quem não votaria?","max_choices":2,
           "options":[{"value":"a","label":"A"},{"value":"b","label":"B"},{"value":"c","label":"C"},
                      {"value":"ninguem","label":"Não rejeita ninguém","exclusive":true}]}]}
        """.trimIndent(),
    )

    @Test
    fun `multipla escolha respeita exclusiva e maximo`() {
        val e = InterviewEngine(rejeicao, 1, Fixtures.clock())
        assertInstanceOf(Step.Invalid::class.java, e.answer(AnswerInput.Choices(listOf("a", "ninguem"))))
        assertInstanceOf(Step.Invalid::class.java, e.answer(AnswerInput.Choices(listOf("a", "b", "c"))))
        assertInstanceOf(Step.Invalid::class.java, e.answer(AnswerInput.Choices(emptyList())))
        assertEquals(Step.Finished(InterviewStatus.COMPLETE), e.answer(AnswerInput.Choices(listOf("a", "b"))))
    }
}
