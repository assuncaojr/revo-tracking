package br.com.revomidia.tracking.engine

import br.com.revomidia.tracking.engine.Fixtures.pilot
import br.com.revomidia.tracking.engine.Fixtures.typical
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertInstanceOf
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class RecordedInterviewTest {

    private val logJson = Json { classDiscriminator = "type" }

    @Test
    fun `entrevista interrompida no meio volta exatamente como estava`() {
        val clock = Fixtures.clock()
        val live = RecordedInterview.start(pilot, seed = 99, clock = clock)
        val script = typical(mapOf("G5" to AnswerInput.Choice("sim")))
        while (live.engine.currentKey != "G7") live.answer(script(live.engine.currentKey!!))
        repeat(3) { live.back() } // G7 → G6 → G5a → G5
        assertEquals("G5", live.engine.currentKey)
        live.answer(AnswerInput.Choice("nao")) // corrige G5 para "não"
        assertInstanceOf(Step.Invalid::class.java, live.answer(AnswerInput.Number(99.0)), "inválida não entra no registro")

        // grava e lê o registro como o app faz (JSON no SQLite)
        val stored = logJson.encodeToString(ListSerializer(Action.serializer()), live.log)
        val restored = RecordedInterview.restore(
            pilot, 99, logJson.decodeFromString(ListSerializer(Action.serializer()), stored), Fixtures.clock(),
        )

        assertEquals(live.engine.currentKey, restored.engine.currentKey)
        assertEquals(live.engine.finalAnswers(), restored.engine.finalAnswers(), "inclusive horários e ordem mostrada")
        assertEquals(live.engine.shownOrder(pilot.question("G7")!!), restored.engine.shownOrder(pilot.question("G7")!!))
        assertFalse("G5a" in restored.engine.finalAnswers())
    }

    @Test
    fun `registro de entrevista completa reconstroi a mesma entrevista final`() {
        val live = RecordedInterview.start(pilot, seed = 5, clock = Fixtures.clock())
        val script = typical()
        while (live.engine.currentKey != null) live.answer(script(live.engine.currentKey!!))
        val restored = RecordedInterview.restore(pilot, 5, live.log, Fixtures.clock())
        assertEquals(live.engine.status, restored.engine.status)
        assertEquals(live.engine.toInterview(Fixtures.meta()), restored.engine.toInterview(Fixtures.meta()))
    }
}

class PinTest {
    // Vetor gerado pela API: hash_pin("1234", salt="0011…eeff", iterations=120000)
    private val salt = "00112233445566778899aabbccddeeff"
    private val hash = "4e94476e7793ccf66fddcbc373716c3559e5c1ea0126ca6d916378efe3a4dc80"

    @Test
    fun `PIN confere com o hash gerado pela API`() {
        assertTrue(Pin.verify("1234", salt, hash, 120_000))
        assertFalse(Pin.verify("1235", salt, hash, 120_000))
        assertFalse(Pin.verify("1234", salt, hash, 119_999))
    }
}
