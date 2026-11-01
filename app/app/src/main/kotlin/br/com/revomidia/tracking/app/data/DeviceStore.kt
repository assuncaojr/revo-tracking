package br.com.revomidia.tracking.app.data

import android.content.Context
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.File

/** Turno do entrevistador no aparelho (sobrevive a reinício do app). */
@Serializable
data class FieldSessionState(
    val sessionId: String,
    val interviewerId: String,
    val interviewerName: String,
    val pointId: String? = null,
    val approach: String = "door",
)

/** Identidade do aparelho, token (cifrado no Keystore), cache do bootstrap e turno atual. */
class DeviceStore(context: Context) {
    private val prefs = context.getSharedPreferences("device", Context.MODE_PRIVATE)
    private val bootstrapFile = File(context.filesDir, "bootstrap.json")
    private val json = Json { ignoreUnknownKeys = true }

    val enrolled: Boolean get() = prefs.contains("token")
    /** Já foi cadastrado alguma vez (tem identidade), mesmo que o token tenha sido recusado. */
    val known: Boolean get() = prefs.contains("device_id")
    val deviceId: String? get() = prefs.getString("device_id", null)
    val campaignId: String? get() = prefs.getString("campaign_id", null)
    val label: String? get() = prefs.getString("label", null)

    fun token(): String? = prefs.getString("token", null)?.let(KeystoreCipher::decrypt)

    fun saveEnrollment(deviceId: String, campaignId: String, label: String, token: String) {
        prefs.edit()
            .putString("device_id", deviceId)
            .putString("campaign_id", campaignId)
            .putString("label", label)
            .putString("token", KeystoreCipher.encrypt(token))
            .apply()
    }

    /**
     * Token recusado pelo núcleo: esquece só o token. Identidade, cache e fila ficam: as entrevistas
     * pendentes levam este device_id, então o supervisor gera um novo código **para o mesmo aparelho**.
     */
    fun clearToken() {
        prefs.edit().remove("token").apply()
    }

    var bootstrapRaw: String?
        get() = bootstrapFile.takeIf { it.exists() }?.readText()
        set(v) {
            if (v == null) bootstrapFile.delete() else bootstrapFile.writeText(v)
        }

    var lastSyncAt: String?
        get() = prefs.getString("last_sync_at", null)
        set(v) = prefs.edit().putString("last_sync_at", v).apply()

    var session: FieldSessionState?
        get() = prefs.getString("session", null)?.let { json.decodeFromString(FieldSessionState.serializer(), it) }
        set(v) = prefs.edit().apply {
            if (v == null) remove("session") else putString("session", json.encodeToString(FieldSessionState.serializer(), v))
        }.apply()
}
