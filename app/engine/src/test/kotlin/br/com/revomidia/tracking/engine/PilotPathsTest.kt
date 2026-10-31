package br.com.revomidia.tracking.engine

import br.com.revomidia.tracking.engine.Fixtures.assertValidInterview
import br.com.revomidia.tracking.engine.Fixtures.engine
import br.com.revomidia.tracking.engine.Fixtures.meta
import br.com.revomidia.tracking.engine.Fixtures.pilot
import br.com.revomidia.tracking.engine.Fixtures.run
import br.com.revomidia.tracking.engine.Fixtures.typical
import br.com.revomidia.tracking.model.InterviewStatus
import kotlinx.serialization.json.JsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertInstanceOf
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** Caminhos completos pelo questionário aprovado do piloto (contracts/examples/questionnaire). */
class PilotPathsTest {

    @Test
    fun `recusa no aceite encerra e registra a recusa`() {
        val e = engine()
        assertEquals(InterviewStatus.REFUSED, run(e) { AnswerInput.Choice("nao") })
        val i = e.toInterview(meta())
        assertEquals(setOf("A0"), i.answers.keys)
        assertValidInterview(i)
    }

    @Test
    fun `contraprova - o validador do contrato barra entrevista com data sem fuso`() {
        val e = engine()
        run(e) { AnswerInput.Choice("nao") }
        val semFuso = e.toInterview(meta().copy(startedAt = "2027-01-12T09:14:00"))
        org.junit.jupiter.api.assertThrows<org.opentest4j.AssertionFailedError> { assertValidInterview(semFuso) }
    }

    @Test
    fun `aceite nao aceita nao-resposta`() {
        val step = engine().answer(AnswerInput.Nonresponse("_ns"))
        assertInstanceOf(Step.Invalid::class.java, step)
    }

    @Test
    fun `menor de 16 anos e filtrado`() {
        val e = engine()
        assertEquals(InterviewStatus.SCREENED_OUT, run(e, typical(mapOf("F2" to AnswerInput.Number(15.0)))))
        val i = e.toInterview(meta())
        assertEquals(listOf("A0", "F1", "F2"), i.answers.keys.toList())
        assertNull(i.derived, "15 anos não cai em nenhuma faixa")
        assertValidInterview(i)
    }

    @Test
    fun `quem nao mora em Caxias e filtrado`() {
        val e = engine()
        assertEquals(InterviewStatus.SCREENED_OUT, run(e, typical(mapOf("F1" to AnswerInput.Choice("nao")))))
        assertValidInterview(e.toInterview(meta()))
    }

    @Test
    fun `entrevista completa tipica`() {
        val e = engine()
        assertEquals(InterviewStatus.COMPLETE, run(e, typical()))
        val i = e.toInterview(meta())
        assertEquals(JsonPrimitive("25-34"), i.derived?.get("faixa_etaria"))
        assertTrue("G5a" in i.answers, "G5 = sim mostra G5a")
        assertFalse("C2" in i.answers, "C1 = não pula o contato")
        assertNull(i.contact)
        assertEquals("o gentil", i.answers.getValue("E2").rawText)
        assertValidInterview(i)
    }

    @Test
    fun `G5 nao pula G5a`() {
        val e = engine()
        run(e, typical(mapOf("G5" to AnswerInput.Choice("nao"))))
        assertFalse("G5a" in e.toInterview(meta()).answers)
    }

    @Test
    fun `voltar e mudar G5 para nao descarta a resposta de G5a`() {
        val e = engine()
        val script = typical()
        while (e.currentKey != "G6") e.answer(script(e.currentKey!!))
        assertEquals(Step.Ask("G5a"), e.back())
        assertEquals(Step.Ask("G5"), e.back())
        assertEquals(Step.Ask("G6"), e.answer(AnswerInput.Choice("nao")), "G5a some do caminho")
        run(e, script)
        val i = e.toInterview(meta())
        assertFalse("G5a" in i.answers)
        assertValidInterview(i)
    }

    @Test
    fun `contato aceito vai para o bloco de contato, nao para as respostas`() {
        val e = engine()
        val script = typical(mapOf("C1" to AnswerInput.Choice("sim")))
        while (e.currentKey != "C2") e.answer(script(e.currentKey!!))
        assertInstanceOf(Step.Invalid::class.java, e.answer(AnswerInput.Contact("Maria", "123")), "telefone curto")
        assertEquals(Step.Finished(InterviewStatus.COMPLETE), e.answer(AnswerInput.Contact("Maria", "(99) 98888-7777")))
        val i = e.toInterview(meta())
        assertFalse("C2" in i.answers)
        assertEquals("99988887777", i.contact?.phone)
        assertEquals("c1-v1", i.contact?.consentTextVersion)
        assertValidInterview(i)
    }

    @Test
    fun `grade exige todas as linhas`() {
        val e = engine()
        val script = typical()
        while (e.currentKey != "G4") e.answer(script(e.currentKey!!))
        val step = e.answer(AnswerInput.Grid(mapOf("saude" to "piorou")))
        assertInstanceOf(Step.Invalid::class.java, step)
    }

    @Test
    fun `grade e G7 gravam a ordem mostrada e voto passado mantem as opcoes fixas no fim`() {
        val e = engine()
        run(e, typical())
        val i = e.toInterview(meta())
        val areas = pilot.lists.getValue("areas").map { it.value }
        assertEquals(areas.toSet(), i.answers.getValue("G4").shownOrder!!.toSet())
        assertEquals(areas.toSet(), i.answers.getValue("G7").shownOrder!!.toSet())
        val v1 = i.answers.getValue("V1").shownOrder!!
        assertEquals(listOf("branco_nulo", "nao_votou", "nao_lembra", "prefere_nao_dizer"), v1.takeLast(4))
        assertEquals(setOf("gentil_neto", "paulinho", "lycia_waquim", "edmilson_sanches"), v1.take(4).toSet())
    }

    @Test
    fun `embaralhamento e estavel na mesma entrevista e varia entre entrevistas`() {
        val g4 = pilot.question("G4")!!
        val e = engine(seed = 7)
        assertEquals(e.shownOrder(g4), e.shownOrder(g4))
        val orders = (1L..20L).map { engine(seed = it).shownOrder(g4) }.toSet()
        assertTrue(orders.size > 1, "20 entrevistas com a mesma ordem: embaralhamento não está funcionando")
    }

    @Test
    fun `idade fora do intervalo e nota quebrada sao recusadas`() {
        val e = engine()
        val script = typical()
        while (e.currentKey != "F2") e.answer(script(e.currentKey!!))
        assertInstanceOf(Step.Invalid::class.java, e.answer(AnswerInput.Number(130.0)))
        e.answer(AnswerInput.Number(34.0))
        while (e.currentKey != "G3") e.answer(script(e.currentKey!!))
        assertInstanceOf(Step.Invalid::class.java, e.answer(AnswerInput.Number(6.5)))
        assertInstanceOf(Step.Invalid::class.java, e.answer(AnswerInput.Number(11.0)))
        assertNotNull(e.current)
    }

    @Test
    fun `bairro fora da lista so entra como Outro com texto`() {
        val e = engine()
        val script = typical()
        while (e.currentKey != "P3") e.answer(script(e.currentKey!!))
        assertInstanceOf(Step.Invalid::class.java, e.answer(AnswerInput.Choice("bacuri")))
        assertInstanceOf(Step.Invalid::class.java, e.answer(AnswerInput.Choice(AnswerInput.OTHER, " ")))
        assertEquals(Step.Ask("P4"), e.answer(AnswerInput.Choice(AnswerInput.OTHER, "Bacuri")))
        run(e, script)
        val i = e.toInterview(meta())
        assertEquals("Bacuri", i.answers.getValue("P3").rawText)
        assertValidInterview(i)
    }

    @Test
    fun `abandono no meio guarda o que foi respondido`() {
        val e = engine()
        val script = typical()
        while (e.currentKey != "G1") e.answer(script(e.currentKey!!))
        assertEquals(Step.Finished(InterviewStatus.ABANDONED), e.abandon())
        val i = e.toInterview(meta())
        assertEquals(InterviewStatus.ABANDONED, i.status)
        assertTrue("P4" in i.answers && "G1" !in i.answers)
        assertValidInterview(i)
    }
}
