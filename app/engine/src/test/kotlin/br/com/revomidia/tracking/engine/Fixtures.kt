package br.com.revomidia.tracking.engine

import br.com.revomidia.tracking.model.Approach
import br.com.revomidia.tracking.model.ClientInfo
import br.com.revomidia.tracking.model.ContractJson
import br.com.revomidia.tracking.model.Interview
import br.com.revomidia.tracking.model.InterviewStatus
import br.com.revomidia.tracking.model.Location
import br.com.revomidia.tracking.model.Questionnaire
import com.fasterxml.jackson.databind.ObjectMapper
import com.networknt.schema.JsonSchemaFactory
import com.networknt.schema.SpecVersion
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Assertions.fail
import java.io.File

object Fixtures {
    private val contracts = File(System.getProperty("contracts.dir"))

    val pilot: Questionnaire by lazy {
        ContractJson.decodeFromString(
            Questionnaire.serializer(),
            File(contracts, "examples/questionnaire/caxias-piloto-2027.v1.json").readText(),
        )
    }

    private val interviewSchema by lazy {
        JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V202012)
            .getSchema(File(contracts, "interview.schema.json").readText())
    }

    fun clock(): () -> String {
        var s = 0
        return { "2027-01-12T09:%02d:%02d-03:00".format(14 + s / 60, (s++) % 60) }
    }

    fun engine(seed: Long = 42) = InterviewEngine(pilot, seed, clock())

    fun meta() = InterviewMeta(
        id = "6f1d2c3a-8b7e-4c1d-9a2b-3c4d5e6f7a8b",
        campaignId = "0b5e8c1a-1111-4a2b-8c3d-000000000001",
        deviceId = "0b5e8c1a-2222-4a2b-8c3d-000000000002",
        interviewerId = "0b5e8c1a-3333-4a2b-8c3d-000000000003",
        sessionId = "0b5e8c1a-4444-4a2b-8c3d-000000000004",
        pointId = "0b5e8c1a-5555-4a2b-8c3d-000000000005",
        approach = Approach.DOOR,
        startedAt = "2027-01-12T09:14:00-03:00",
        finishedAt = "2027-01-12T09:17:10-03:00",
        location = Location(-4.859, -43.356, 12.0, "2027-01-12T09:14:05-03:00"),
        client = ClientInfo("0.1.0-test"),
    )

    /** A entrevista produzida pelo motor precisa passar no JSON Schema do contrato. */
    fun assertValidInterview(i: Interview) {
        val json = ContractJson.encodeToString(Interview.serializer(), i)
        val errors = interviewSchema.validate(ObjectMapper().readTree(json))
        assertTrue(errors.isEmpty(), "Entrevista fora do contrato: $errors\n$json")
        System.getProperty("produced.dir")?.let { dir ->
            File(dir, "${i.status.name.lowercase()}-${json.hashCode().toUInt()}.json").writeText(json)
        }
    }

    /** Responde a pergunta atual com o que [script] mandar, até a entrevista terminar. */
    fun run(engine: InterviewEngine, script: (key: String) -> AnswerInput): InterviewStatus {
        repeat(200) {
            val key = engine.currentKey ?: return engine.status!!
            when (val step = engine.answer(script(key))) {
                is Step.Invalid -> fail<Unit>("$key recusou a resposta: ${step.reason}")
                is Step.Finished -> return step.status
                is Step.Ask -> Unit
            }
        }
        fail<Unit>("Entrevista não terminou")
        error("inalcançável")
    }

    /** Respostas de uma entrevista completa e típica do piloto. */
    fun typical(overrides: Map<String, AnswerInput> = emptyMap()): (String) -> AnswerInput = { key ->
        overrides[key] ?: when (key) {
            "A0", "F1", "F3" -> AnswerInput.Choice("sim")
            "F2" -> AnswerInput.Number(34.0)
            "P1" -> AnswerInput.Choice("feminino")
            "P2" -> AnswerInput.Choice("medio")
            "P3" -> AnswerInput.Choice("salobro")
            "P4" -> AnswerInput.Nonresponse("_nr")
            "G1" -> AnswerInput.Choice("aprova")
            "G2" -> AnswerInput.Choice("regular")
            "G3" -> AnswerInput.Number(6.0)
            "G4" -> AnswerInput.Grid(pilot.lists.getValue("areas").associate { it.value to "igual" })
            "G5" -> AnswerInput.Choice("sim")
            "G5a" -> AnswerInput.Text("asfalto na rua principal")
            "G6" -> AnswerInput.Text("falta de posto de saúde")
            "G7" -> AnswerInput.Choice("saude")
            "V1" -> AnswerInput.Choice("gentil_neto")
            "E1" -> AnswerInput.Choice("continuar")
            "E2" -> AnswerInput.Name("gentil_neto", "o gentil")
            "C1" -> AnswerInput.Choice("nao")
            else -> error("sem resposta de teste para $key")
        }
    }
}
