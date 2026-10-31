package br.com.revomidia.tracking.engine

import br.com.revomidia.tracking.model.Condition
import br.com.revomidia.tracking.model.ConditionSerializer
import br.com.revomidia.tracking.model.ContractJson
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.add
import kotlinx.serialization.json.put
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class ConditionsTest {

    private fun cond(json: String): Condition = ConditionSerializer.fromJson(ContractJson.parseToJsonElement(json))

    private val known = mapOf(
        "idade" to Known.Value(JsonPrimitive(34)),
        "g5" to Known.Value(JsonPrimitive("sim")),
        "rej" to Known.Value(buildJsonArray { add("paulinho"); add("lycia_waquim") }),
        "g4" to Known.Value(buildJsonObject { put("saude", "piorou"); put("educacao", "igual") }),
        "g1" to Known.Nonresponse("_ns"),
    )

    private fun eval(json: String) = evaluate(cond(json)) { known[it] ?: Known.Missing }

    @Test
    fun `in e not_in comparam com tipo`() {
        assertTrue(eval("""{"key":"g5","in":["sim"]}"""))
        assertFalse(eval("""{"key":"idade","in":["34"]}"""), "texto '34' não é o número 34")
        assertTrue(eval("""{"key":"idade","in":[34]}"""))
        assertTrue(eval("""{"key":"g5","not_in":["nao"]}"""))
    }

    @Test
    fun `sem resposta, so answered false e nonresponse false sao verdadeiros`() {
        assertFalse(eval("""{"key":"x","in":["sim"]}"""))
        assertFalse(eval("""{"key":"x","not_in":["sim"]}"""))
        assertFalse(eval("""{"key":"x","lt":10}"""))
        assertTrue(eval("""{"key":"x","answered":false}"""))
        assertTrue(eval("""{"key":"x","nonresponse":false}"""))
    }

    @Test
    fun `nao-resposta conta como respondida, mas nao como valor`() {
        assertTrue(eval("""{"key":"g1","answered":true}"""))
        assertTrue(eval("""{"key":"g1","nonresponse":true}"""))
        assertFalse(eval("""{"key":"g1","in":["aprova"]}"""))
    }

    @Test
    fun `numeros`() {
        assertTrue(eval("""{"key":"idade","gte":34}"""))
        assertFalse(eval("""{"key":"idade","lt":34}"""))
        assertFalse(eval("""{"key":"g5","lt":34}"""), "texto não é comparado como número")
    }

    @Test
    fun `multipla escolha e linha de grade`() {
        assertTrue(eval("""{"key":"rej","in":["lycia_waquim"]}"""))
        assertFalse(eval("""{"key":"rej","not_in":["paulinho"]}"""))
        assertTrue(eval("""{"key":"g4","item":"saude","in":["piorou"]}"""))
        assertFalse(eval("""{"key":"g4","item":"seguranca","in":["piorou"]}"""))
    }

    @Test
    fun `all e any`() {
        assertTrue(eval("""{"all":[{"key":"g5","in":["sim"]},{"key":"idade","gt":30}]}"""))
        assertFalse(eval("""{"all":[{"key":"g5","in":["sim"]},{"key":"idade","gt":40}]}"""))
        assertTrue(eval("""{"any":[{"key":"g5","in":["nao"]},{"key":"idade","gt":30}]}"""))
    }
}
