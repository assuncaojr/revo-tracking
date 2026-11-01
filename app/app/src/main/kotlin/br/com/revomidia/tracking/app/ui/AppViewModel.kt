package br.com.revomidia.tracking.app.ui

import android.app.Application
import android.net.ConnectivityManager
import android.net.Network
import android.os.Build
import br.com.revomidia.tracking.app.data.SyncResult
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import br.com.revomidia.tracking.app.BuildConfig
import br.com.revomidia.tracking.app.TrackingApp
import br.com.revomidia.tracking.app.data.Clock
import br.com.revomidia.tracking.app.data.Draft
import br.com.revomidia.tracking.app.data.FieldSessionState
import br.com.revomidia.tracking.app.net.Bootstrap
import br.com.revomidia.tracking.app.net.InterviewerInfo
import br.com.revomidia.tracking.app.net.Unauthorized
import br.com.revomidia.tracking.app.sync.SyncWorker
import br.com.revomidia.tracking.engine.Action
import br.com.revomidia.tracking.engine.AnswerInput
import br.com.revomidia.tracking.engine.InterviewMeta
import br.com.revomidia.tracking.engine.Pin
import br.com.revomidia.tracking.engine.RecordedInterview
import br.com.revomidia.tracking.engine.Step
import br.com.revomidia.tracking.model.Approach
import br.com.revomidia.tracking.model.ClientInfo
import br.com.revomidia.tracking.model.ContractJson
import br.com.revomidia.tracking.model.InterviewStatus
import br.com.revomidia.tracking.model.Location
import br.com.revomidia.tracking.model.Questionnaire
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.IOException
import java.util.UUID
import kotlin.random.Random

sealed interface Screen {
    data object Loading : Screen
    /** [known]: aparelho já cadastrado antes (token recusado): o código novo é para o mesmo aparelho. */
    data class Enroll(val known: Boolean) : Screen
    data object Login : Screen
    data object Home : Screen
    data object Interview : Screen
    data class Done(val status: InterviewStatus) : Screen
}

/** Entrevista em andamento, gravada a cada resposta (sobrevive a travamento e bateria acabando). */
@Serializable
data class DraftState(
    val id: String,
    val seed: Long,
    /** O próprio questionário vai no rascunho: a entrevista termina na versão em que começou, mesmo que outra seja publicada. */
    val questionnaire: Questionnaire,
    val campaignId: String,
    val deviceId: String,
    val sessionId: String,
    val interviewerId: String,
    val pointId: String,
    val approach: Approach,
    val startedAt: String,
    val location: Location? = null,
    val log: List<Action> = emptyList(),
)

class AppViewModel(app: Application) : AndroidViewModel(app) {
    private val c = (app as TrackingApp).container
    private val draftJson = Json { ignoreUnknownKeys = true }

    var screen: Screen by mutableStateOf(Screen.Loading); private set
    var busy by mutableStateOf(false); private set
    var message by mutableStateOf<String?>(null); private set
    var bootstrap by mutableStateOf<Bootstrap?>(null); private set
    var questionnaire by mutableStateOf<Questionnaire?>(null); private set
    var session by mutableStateOf(c.store.session); private set
    var pending by mutableStateOf(0); private set
    var rejected by mutableStateOf(0); private set
    var lastSync by mutableStateOf<String?>(null); private set

    /** Entrevista atual; [revision] muda a cada ação para a tela se recompor. */
    var interview: RecordedInterview? = null; private set
    var revision by mutableStateOf(0); private set
    private var draft: DraftState? = null

    init {
        viewModelScope.launch {
            loadCachedBootstrap()
            refreshCounters()
            val saved = c.drafts.load()
            screen = when {
                !c.store.enrolled -> Screen.Enroll(known = c.store.known)
                saved != null && resume(saved) -> Screen.Interview
                session != null -> Screen.Home
                else -> Screen.Login
            }
            if (c.store.enrolled) refreshBootstrap(silent = true)
        }
    }

    fun clearMessage() { message = null }

    // --- cadastro e dados offline ---

    fun enroll(code: String) = launchBusy {
        try {
            val r = c.api.enroll(code.trim(), "${Build.MANUFACTURER} ${Build.MODEL}", BuildConfig.VERSION_NAME)
            c.store.saveEnrollment(r.deviceId, r.campaignId, r.label, r.token)
            refreshBootstrap(silent = false)
            screen = if (session != null) Screen.Home else Screen.Login
            syncIfPending() // fila que ficou de um token anterior
        } catch (e: IOException) {
            message = "Não foi possível cadastrar: ${e.message}"
        }
    }

    fun refreshBootstrap() = launchBusy { refreshBootstrap(silent = false) }

    private suspend fun refreshBootstrap(silent: Boolean) {
        try {
            val raw = c.api.bootstrapRaw()
            applyBootstrap(raw)
            c.store.bootstrapRaw = raw
            if (!silent) message = "Dados atualizados"
        } catch (e: Unauthorized) {
            c.store.clearToken()
            screen = Screen.Enroll(known = true)
            message = "Aparelho não autorizado. Peça ao supervisor um novo código para este aparelho."
        } catch (e: IOException) {
            if (!silent) message = "Sem conexão: usando os dados guardados no aparelho"
        }
    }

    private fun loadCachedBootstrap() {
        c.store.bootstrapRaw?.let { runCatching { applyBootstrap(it) } }
    }

    private fun applyBootstrap(raw: String) {
        val b = c.api.parseBootstrap(raw)
        bootstrap = b
        questionnaire = b.questionnaire?.let { ContractJson.decodeFromJsonElement(Questionnaire.serializer(), it) }
    }

    // --- turno do entrevistador ---

    /** PIN conferido no próprio aparelho (funciona sem rede); a conta é pesada de propósito. */
    fun login(who: InterviewerInfo, pin: String) = launchBusy {
        val ok = withContext(Dispatchers.Default) { Pin.verify(pin, who.pinSalt, who.pinHash, who.pinIterations) }
        if (!ok) {
            message = "PIN incorreto"
            return@launchBusy
        }
        val s = FieldSessionState(UUID.randomUUID().toString(), who.id, who.name)
        c.store.session = s
        session = s
        screen = Screen.Home
    }

    fun logout() {
        c.store.session = null
        session = null
        screen = Screen.Login
    }

    fun choosePoint(pointId: String, approach: String) {
        val s = session?.copy(pointId = pointId, approach = approach) ?: return
        c.store.session = s
        session = s
    }

    fun sendNow() = launchBusy { sync(silent = false) }

    /** Ao abrir a tela inicial ou quando a rede volta: envia se houver algo na fila. */
    fun syncIfPending() {
        viewModelScope.launch { if (c.queue.pendingCount() > 0) sync(silent = true) }
    }

    /**
     * Envio feito pelo próprio app aberto, na hora. Se não der (sem rede), pede ao WorkManager
     * como segunda via: ele espera a rede e tenta de novo mesmo com o app fechado.
     */
    private suspend fun sync(silent: Boolean) {
        when (val r = c.syncer.sync()) {
            is SyncResult.Done -> if (!silent) message =
                if (r.sent > 0) "${r.sent} entrevista(s) enviada(s)" else "Nada a enviar"
            is SyncResult.Offline -> {
                SyncWorker.kick(getApplication())
                if (!silent) message = "Sem conexão. As entrevistas ficam guardadas e vão sozinhas quando a rede voltar."
            }
            // Nunca tira o entrevistador do meio de uma entrevista: o aviso aparece quando ela terminar.
            SyncResult.Unauthorized -> if (c.store.known && screen !is Screen.Interview) {
                screen = Screen.Enroll(known = true)
                message = "Aparelho não autorizado. Peça ao supervisor um novo código para este aparelho."
            }
        }
        refreshCounters()
    }

    /** Rede voltou com o app aberto: envia sem esperar o agendador do sistema. */
    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) = syncIfPending()
    }

    init {
        app.getSystemService(ConnectivityManager::class.java)?.registerDefaultNetworkCallback(networkCallback)
    }

    override fun onCleared() {
        getApplication<Application>().getSystemService(ConnectivityManager::class.java)
            ?.unregisterNetworkCallback(networkCallback)
    }

    suspend fun refreshCounters() {
        pending = c.queue.pendingCount()
        rejected = c.queue.rejectedCount()
        lastSync = c.store.lastSyncAt
    }

    // --- entrevista ---

    fun startInterview() {
        val q = questionnaire ?: run { message = "Sem questionário: atualize os dados com internet"; return }
        val s = session ?: return
        val pointId = s.pointId ?: run { message = "Escolha o ponto"; return }
        val campaignId = c.store.campaignId ?: run { message = "Aparelho sem campanha: refaça o cadastro"; return }
        val deviceId = c.store.deviceId ?: run { message = "Aparelho sem identidade: refaça o cadastro"; return }
        val d = DraftState(
            id = UUID.randomUUID().toString(),
            seed = Random.nextLong(),
            questionnaire = q,
            campaignId = campaignId,
            deviceId = deviceId,
            sessionId = s.sessionId,
            interviewerId = s.interviewerId,
            pointId = pointId,
            approach = if (s.approach == "flow") Approach.FLOW else Approach.DOOR,
            startedAt = Clock.now(),
        )
        draft = d
        interview = RecordedInterview.start(q, d.seed, Clock::now)
        revision++
        screen = Screen.Interview
        viewModelScope.launch {
            saveDraft()
            // GPS em paralelo: a entrevista não espera
            c.locator.current()?.let { loc ->
                draft = draft?.takeIf { it.id == d.id }?.copy(location = loc)
                saveDraft()
            }
        }
    }

    fun answer(input: AnswerInput) = act { it.answer(input) }
    fun back() = act { it.back() }
    fun skip() = act { it.skip() }

    fun abandon() {
        val r = interview ?: return
        r.engine.abandon()
        viewModelScope.launch { finish(InterviewStatus.ABANDONED) }
    }

    /** Último motivo de recusa de uma resposta (mostrado sob a pergunta). */
    var invalidReason by mutableStateOf<String?>(null); private set

    private fun act(f: (RecordedInterview) -> Step) {
        val r = interview ?: return
        when (val step = f(r)) {
            is Step.Invalid -> invalidReason = step.reason
            is Step.Ask -> {
                invalidReason = null
                revision++
                viewModelScope.launch { saveDraft() }
            }
            is Step.Finished -> {
                invalidReason = null
                viewModelScope.launch { finish(step.status) }
            }
        }
    }

    private suspend fun saveDraft() {
        val d = draft ?: return
        val r = interview ?: return
        val state = d.copy(log = r.log)
        draft = state
        c.drafts.save(Draft(json = draftJson.encodeToString(DraftState.serializer(), state)))
    }

    /** Fecha a entrevista: monta no formato do contrato, põe na fila, apaga o rascunho e dispara o envio. */
    private suspend fun finish(status: InterviewStatus) {
        val d = draft ?: return
        val r = interview ?: return
        val meta = InterviewMeta(
            id = d.id,
            campaignId = d.campaignId,
            deviceId = d.deviceId,
            interviewerId = d.interviewerId,
            sessionId = d.sessionId,
            pointId = d.pointId,
            approach = d.approach,
            startedAt = d.startedAt,
            finishedAt = Clock.now(),
            location = d.location,
            client = ClientInfo(BuildConfig.VERSION_NAME, "Android ${Build.VERSION.RELEASE}; ${Build.MODEL}"),
        )
        c.queue.enqueue(r.engine.toInterview(meta))
        c.drafts.clear()
        interview = null
        draft = null
        refreshCounters()
        screen = Screen.Done(status)
        sync(silent = true) // envia na hora; sem rede, fica na fila e o WorkManager assume
    }

    /**
     * Retoma a entrevista gravada, com o questionário guardado no próprio rascunho.
     * Rascunho ilegível (não deveria acontecer): o app avisa e segue; o próximo rascunho o substitui.
     */
    private suspend fun resume(saved: Draft): Boolean {
        val d = runCatching { draftJson.decodeFromString(DraftState.serializer(), saved.json) }.getOrNull()
            ?: return false.also { message = "Rascunho anterior ilegível: avise o supervisor" }
        val r = runCatching { RecordedInterview.restore(d.questionnaire, d.seed, d.log, Clock::now) }.getOrNull()
            ?: return false.also { message = "Não foi possível retomar a entrevista anterior: avise o supervisor" }
        draft = d
        interview = r
        revision++
        message = "Entrevista retomada de onde parou"
        return true
    }

    fun nextInterview() {
        screen = Screen.Home
        viewModelScope.launch { refreshCounters() }
    }

    private fun launchBusy(block: suspend () -> Unit) {
        viewModelScope.launch {
            busy = true
            try { block() } finally { busy = false }
        }
    }
}
