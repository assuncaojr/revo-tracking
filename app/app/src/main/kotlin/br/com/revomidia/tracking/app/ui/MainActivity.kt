package br.com.revomidia.tracking.app.ui

import android.Manifest
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import br.com.revomidia.tracking.app.net.InterviewerInfo
import br.com.revomidia.tracking.model.InterviewStatus

class MainActivity : ComponentActivity() {
    private val vm: AppViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {}
            .launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
        setContent { MaterialTheme { Surface { App(vm) } } }
    }
}

@Composable
fun App(vm: AppViewModel) {
    val snackbar = remember { SnackbarHostState() }
    LaunchedEffect(vm.message) {
        vm.message?.let { snackbar.showSnackbar(it); vm.clearMessage() }
    }
    Scaffold(snackbarHost = { SnackbarHost(snackbar) }, modifier = Modifier.safeDrawingPadding()) { pad ->
        Column(Modifier.padding(pad).fillMaxSize()) {
            when (val s = vm.screen) {
                Screen.Loading -> Text("Carregando…", Modifier.padding(24.dp))
                is Screen.Enroll -> EnrollScreen(vm, s.known)
                Screen.Login -> LoginScreen(vm)
                Screen.Home -> HomeScreen(vm)
                Screen.Interview -> {
                    BackHandler { vm.back() } // botão "voltar" do Android = pergunta anterior, nunca sai da entrevista
                    QuestionScreen(vm)
                }
                is Screen.Done -> DoneScreen(vm, s.status)
            }
        }
    }
}

@Composable
private fun EnrollScreen(vm: AppViewModel, known: Boolean) {
    var code by remember { mutableStateOf("") }
    Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text("Cadastro do aparelho", style = MaterialTheme.typography.headlineSmall)
        Text(
            if (known) "Este aparelho perdeu a autorização. Digite o novo código que o supervisor gerou para ele. As entrevistas guardadas continuam no aparelho."
            else "Digite o código de cadastro entregue pelo supervisor."
        )
        OutlinedTextField(code, { code = it.uppercase() }, label = { Text("Código") }, singleLine = true,
            modifier = Modifier.fillMaxWidth())
        Button({ vm.enroll(code) }, enabled = code.length >= 6 && !vm.busy, modifier = Modifier.fillMaxWidth()) {
            Text(if (vm.busy) "Cadastrando…" else "Cadastrar")
        }
    }
}

@Composable
private fun LoginScreen(vm: AppViewModel) {
    val b = vm.bootstrap
    var who by remember { mutableStateOf<InterviewerInfo?>(null) }
    var pin by remember { mutableStateOf("") }
    Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Início do turno", style = MaterialTheme.typography.headlineSmall)
        Text("Aparelho ${b?.device?.label ?: "—"}", style = MaterialTheme.typography.bodySmall)
        if (b == null) {
            Text("Sem dados no aparelho. Conecte à internet e toque em Atualizar.")
            OutlinedButton({ vm.refreshBootstrap() }) { Text("Atualizar") }
            return
        }
        Text("Quem é você?")
        b.interviewers.forEach { i ->
            FilterChip(selected = who?.id == i.id, onClick = { who = i }, label = { Text(i.name) },
                modifier = Modifier.fillMaxWidth())
        }
        OutlinedTextField(pin, { pin = it.filter(Char::isDigit).take(8) }, label = { Text("PIN") }, singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
            modifier = Modifier.fillMaxWidth())
        Button({ who?.let { vm.login(it, pin) } }, enabled = who != null && pin.length >= 4 && !vm.busy,
            modifier = Modifier.fillMaxWidth()) {
            Text(if (vm.busy) "Conferindo…" else "Entrar")
        }
        OutlinedButton({ vm.refreshBootstrap() }) { Text("Atualizar dados") }
    }
}

@Composable
private fun HomeScreen(vm: AppViewModel) {
    val b = vm.bootstrap
    val s = vm.session
    LaunchedEffect(Unit) { vm.refreshCounters() }
    Column(Modifier.padding(16.dp).fillMaxSize(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Olá, ${s?.interviewerName ?: ""}", style = MaterialTheme.typography.headlineSmall)
        StatusBar(vm)
        Text("Abordagem")
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("door" to "Domicílio", "flow" to "Ponto de fluxo").forEach { (v, label) ->
                FilterChip(selected = s?.approach == v, label = { Text(label) },
                    onClick = { s?.pointId?.let { vm.choosePoint(it, v) } ?: vm.choosePoint("", v) })
            }
        }
        Text("Ponto de hoje")
        LazyColumn(Modifier.weight(1f)) {
            val groups = b?.points.orEmpty().groupBy { it.stratum ?: "—" }
            groups.forEach { (stratum, points) ->
                item { Text(stratum, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 8.dp)) }
                items(points, key = { it.id }) { p ->
                    FilterChip(selected = s?.pointId == p.id, onClick = { vm.choosePoint(p.id, s?.approach ?: "door") },
                        label = { Text(if (p.name.startsWith(p.neighborhood)) p.name else "${p.neighborhood} — ${p.name}") },
                        modifier = Modifier.fillMaxWidth())
                }
            }
        }
        Button({ vm.startInterview() }, enabled = !s?.pointId.isNullOrEmpty() && vm.questionnaire != null,
            modifier = Modifier.fillMaxWidth().height(56.dp)) {
            Text("Iniciar entrevista", style = MaterialTheme.typography.titleMedium)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton({ vm.sendNow() }) { Text("Enviar agora") }
            OutlinedButton({ vm.logout() }) { Text("Trocar entrevistador") }
        }
    }
}

@Composable
fun StatusBar(vm: AppViewModel) {
    Column {
        Text("Aguardando envio: ${vm.pending}" + if (vm.rejected > 0) "  ·  Recusadas pelo servidor: ${vm.rejected}" else "")
        Text("Último envio: ${vm.lastSync ?: "nenhum"}", style = MaterialTheme.typography.bodySmall)
        HorizontalDivider(Modifier.padding(top = 8.dp))
    }
}

@Composable
private fun DoneScreen(vm: AppViewModel, status: InterviewStatus) {
    Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text(
            when (status) {
                InterviewStatus.COMPLETE -> "Entrevista concluída. Obrigado!"
                InterviewStatus.REFUSED -> "Recusa registrada."
                InterviewStatus.SCREENED_OUT -> "Entrevista encerrada pelo filtro."
                InterviewStatus.ABANDONED -> "Entrevista interrompida e guardada."
            },
            style = MaterialTheme.typography.headlineSmall,
        )
        StatusBar(vm)
        Spacer(Modifier.height(8.dp))
        Button({ vm.nextInterview() }, modifier = Modifier.fillMaxWidth().height(56.dp)) { Text("Próxima entrevista") }
    }
}
