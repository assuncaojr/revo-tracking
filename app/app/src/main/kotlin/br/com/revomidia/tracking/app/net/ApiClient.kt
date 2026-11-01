package br.com.revomidia.tracking.app.net

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

/** Aparelho revogado ou token inválido: o app volta para a tela de cadastro. */
class Unauthorized : IOException("aparelho não autorizado")

class HttpError(val code: Int, body: String) : IOException("HTTP $code: ${body.take(300)}")

/** Cliente da API do núcleo (docs/14-especificacao-tecnica.md §6). */
class ApiClient(
    baseUrl: String,
    private val token: () -> String?,
    private val http: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build(),
) {
    private val base = baseUrl.trimEnd('/')
    private val json = Json { ignoreUnknownKeys = true } // o servidor pode acrescentar campos
    private val jsonType = "application/json".toMediaType()

    suspend fun enroll(code: String, model: String?, appVersion: String): EnrollResponse {
        val body = buildJsonObject {
            put("code", code)
            put("model", model)
            put("app_version", appVersion)
        }.toString()
        return json.decodeFromString(EnrollResponse.serializer(), call("POST", "/api/device/enroll", body, auth = false))
    }

    /** Devolve o JSON cru, para guardar em cache tal como veio. */
    suspend fun bootstrapRaw(): String = call("GET", "/api/device/bootstrap", null)

    fun parseBootstrap(raw: String): Bootstrap = json.decodeFromString(Bootstrap.serializer(), raw)

    suspend fun heartbeat(pendingCount: Int, batteryPct: Int?, appVersion: String) {
        val body = buildJsonObject {
            put("pending_count", pendingCount)
            put("battery_pct", batteryPct)
            put("app_version", appVersion)
        }.toString()
        call("POST", "/api/device/heartbeat", body)
    }

    /** Envia entrevistas já serializadas (JSON do contrato), sem reprocessar. */
    suspend fun sendBatch(interviewsJson: List<String>): List<BatchResult> {
        val body = interviewsJson.joinToString(",", prefix = "{\"interviews\":[", postfix = "]}")
        return json.decodeFromString(BatchResponse.serializer(), call("POST", "/api/interviews/batch", body)).results
    }

    private suspend fun call(method: String, path: String, body: String?, auth: Boolean = true): String =
        withContext(Dispatchers.IO) {
            val req = Request.Builder().url(base + path).apply {
                if (auth) token()?.let { header("Authorization", "Bearer $it") }
                method(method, body?.toRequestBody(jsonType))
            }.build()
            http.newCall(req).execute().use { resp ->
                val text = resp.body?.string().orEmpty()
                when {
                    resp.code == 401 -> throw Unauthorized()
                    !resp.isSuccessful -> throw HttpError(resp.code, text)
                    else -> text
                }
            }
        }
}
