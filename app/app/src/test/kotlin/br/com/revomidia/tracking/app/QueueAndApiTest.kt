package br.com.revomidia.tracking.app

import br.com.revomidia.tracking.app.data.planOutcome
import br.com.revomidia.tracking.app.net.ApiClient
import br.com.revomidia.tracking.app.net.BatchResult
import br.com.revomidia.tracking.app.net.HttpError
import br.com.revomidia.tracking.app.net.Unauthorized
import kotlinx.coroutines.test.runTest
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test
import java.io.IOException

/** "Nada se perde no campo": só accepted/duplicate apagam da fila. */
class PlanOutcomeTest {
    @Test
    fun `aceita e duplicata apagam, rejeitada fica guardada, ausente continua pendente`() {
        val o = planOutcome(
            listOf("a", "b", "c", "d"),
            listOf(
                BatchResult("a", "accepted"),
                BatchResult("b", "duplicate"),
                BatchResult("c", "rejected", listOf("opção inválida")),
                // "d" sem resposta
            ),
        )
        assertEquals(listOf("a", "b"), o.delete)
        assertEquals(mapOf("c" to "opção inválida"), o.rejected)
        assertEquals(listOf("d"), o.retry)
    }

    @Test
    fun `status desconhecido nunca apaga`() {
        val o = planOutcome(listOf("a"), listOf(BatchResult("a", "talvez")))
        assertTrue(o.delete.isEmpty())
        assertEquals(listOf("a"), o.retry)
    }
}

class ApiClientTest {
    private lateinit var server: MockWebServer
    private lateinit var api: ApiClient

    @Before fun setUp() {
        server = MockWebServer().apply { start() }
        api = ApiClient(server.url("/").toString(), token = { "tok" })
    }

    @After fun tearDown() = server.shutdown()

    @Test
    fun `envia o lote com o token e le os resultados`() = runTest {
        server.enqueue(MockResponse().setBody("""{"results":[{"id":"a","status":"accepted"}],"extra":1}"""))
        val r = api.sendBatch(listOf("""{"id":"a"}"""))
        assertEquals(listOf(BatchResult("a", "accepted")), r)
        val req = server.takeRequest()
        assertEquals("/api/interviews/batch", req.path)
        assertEquals("Bearer tok", req.getHeader("Authorization"))
        assertEquals("""{"interviews":[{"id":"a"}]}""", req.body.readUtf8())
    }

    @Test
    fun `401 vira Unauthorized e 500 vira HttpError`() = runTest {
        server.enqueue(MockResponse().setResponseCode(401))
        server.enqueue(MockResponse().setResponseCode(500).setBody("erro"))
        try { api.bootstrapRaw(); fail() } catch (e: Unauthorized) { }
        try { api.bootstrapRaw(); fail() } catch (e: HttpError) { assertEquals(500, e.code) }
    }

    @Test
    fun `servidor fora do ar vira IOException (o worker tenta de novo)`() = runTest {
        server.shutdown()
        try { api.sendBatch(listOf("{}")); fail() } catch (e: IOException) { }
    }
}
