package br.com.revomidia.tracking.model

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.TestFactory
import java.io.File

/** Todo exemplo válido de contracts/examples é lido e regravado sem perda. */
class ContractExamplesTest {

    private val examples = File(System.getProperty("contracts.dir"), "examples")

    @TestFactory
    fun `exemplos validos sobrevivem a leitura e regravacao`(): List<DynamicTest> {
        val files = examples.walkTopDown()
            .filter { it.isFile && it.extension == "json" && "invalid" !in it.path.split(File.separator) }
            .toList()
        assertTrue(files.isNotEmpty(), "nenhum exemplo encontrado em $examples")
        return files.map { f ->
            DynamicTest.dynamicTest(f.relativeTo(examples).path) {
                val original = ContractJson.parseToJsonElement(f.readText())
                val reencoded = when (original.jsonObject["schema"]?.jsonPrimitive?.content) {
                    Questionnaire.SCHEMA -> ContractJson.encodeToJsonElement(
                        Questionnaire.serializer(), ContractJson.decodeFromJsonElement(Questionnaire.serializer(), original))
                    Interview.SCHEMA -> ContractJson.encodeToJsonElement(
                        Interview.serializer(), ContractJson.decodeFromJsonElement(Interview.serializer(), original))
                    else -> error("schema desconhecido em ${f.name}")
                }
                assertEquals(normalize(original), normalize(reencoded))
            }
        }
    }

    /** Números comparados pelo valor (-4.8590 == -4.859); chave ausente equivale a null. */
    private fun normalize(e: JsonElement): Any? = when (e) {
        is JsonNull -> null
        is JsonObject -> e.mapValues { normalize(it.value) }.filterValues { it != null }
        is JsonArray -> e.map(::normalize)
        is JsonPrimitive -> if (e.isString) e.content else e.doubleOrNull ?: e.content
    }
}
