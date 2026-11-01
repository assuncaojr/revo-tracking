package br.com.revomidia.tracking.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import br.com.revomidia.tracking.engine.AnswerInput
import br.com.revomidia.tracking.engine.InterviewEngine
import br.com.revomidia.tracking.model.Option
import br.com.revomidia.tracking.model.Question
import br.com.revomidia.tracking.model.QuestionType
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonPrimitive

/** Uma pergunta por tela, botões grandes; não-respostas em cinza no rodapé (não são lidas ao entrevistado). */
@Composable
fun QuestionScreen(vm: AppViewModel) {
    val r = vm.interview ?: return
    @Suppress("UNUSED_VARIABLE") val rev = vm.revision // recompõe a cada ação
    val e = r.engine
    val q = e.current ?: return
    var confirmAbandon by remember { mutableStateOf(false) }

    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Text(q.key, style = MaterialTheme.typography.labelMedium)
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            q.readAloud?.let { Text("“$it”", fontStyle = FontStyle.Italic) }
            Text(q.text, style = MaterialTheme.typography.headlineSmall)
            q.hint?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.secondary) }
            // key: estado local de cada pergunta não vaza para a próxima
            androidx.compose.runtime.key(q.key) { QuestionBody(vm, e, q) }
            vm.invalidReason?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        }
        HorizontalDivider()
        val nonresp = e.questionnaire.nonresponseOf(q)
        if (nonresp.isNotEmpty()) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(vertical = 8.dp)) {
                nonresp.forEach { n ->
                    OutlinedButton({ vm.answer(AnswerInput.Nonresponse(n.value)) },
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.outline)) {
                        Text(n.label)
                    }
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            TextButton({ vm.back() }) { Text("Voltar") }
            if (!q.required) TextButton({ vm.skip() }) { Text("Pular") }
            Row(Modifier.weight(1f), horizontalArrangement = Arrangement.End) {
                TextButton({ confirmAbandon = true }) { Text("Encerrar", color = MaterialTheme.colorScheme.error) }
            }
        }
    }

    if (confirmAbandon) {
        AlertDialog(
            onDismissRequest = { confirmAbandon = false },
            title = { Text("Encerrar a entrevista?") },
            text = { Text("O que já foi respondido fica guardado como entrevista interrompida.") },
            confirmButton = { TextButton({ confirmAbandon = false; vm.abandon() }) { Text("Encerrar") } },
            dismissButton = { TextButton({ confirmAbandon = false }) { Text("Continuar") } },
        )
    }
}

@Composable
private fun QuestionBody(vm: AppViewModel, e: InterviewEngine, q: Question) {
    val prev = e.answerOf(q.key)?.value
    when (q.type) {
        QuestionType.SINGLE -> SingleChoice(vm, e, q, (prev as? JsonPrimitive)?.contentOrNull)
        QuestionType.MULTI -> MultiChoice(vm, e, q, (prev as? JsonArray)?.map { it.jsonPrimitive.content }.orEmpty())
        QuestionType.NUMBER -> NumberInput(vm, q, (prev as? JsonPrimitive)?.doubleOrNull)
        QuestionType.SCALE -> ScaleInput(vm, q, (prev as? JsonPrimitive)?.doubleOrNull)
        QuestionType.GRID -> GridInput(vm, e, q, (prev as? JsonObject)?.mapValues { it.value.jsonPrimitive.content }.orEmpty())
        QuestionType.TEXT -> TextInput(vm, (prev as? JsonPrimitive)?.contentOrNull.orEmpty())
        QuestionType.NAME -> NameInput(vm, e, q, e.answerOf(q.key)?.rawText.orEmpty())
        QuestionType.CONTACT -> ContactInput(vm)
    }
}

private fun optionsInOrder(e: InterviewEngine, q: Question): List<Option> {
    val byValue = e.questionnaire.optionsOf(q).associateBy { it.value }
    return e.shownOrder(q).mapNotNull(byValue::get)
}

@Composable
internal fun BigChoice(label: String, selected: Boolean, onClick: () -> Unit) {
    if (selected) {
        Button(onClick, Modifier.fillMaxWidth().heightIn(min = 56.dp)) { Text(label, style = MaterialTheme.typography.titleMedium) }
    } else {
        OutlinedButton(onClick, Modifier.fillMaxWidth().heightIn(min = 56.dp)) { Text(label, style = MaterialTheme.typography.titleMedium) }
    }
}

@Composable
private fun SingleChoice(vm: AppViewModel, e: InterviewEngine, q: Question, selected: String?) {
    var other by remember { mutableStateOf(selected == AnswerInput.OTHER) }
    var otherText by remember { mutableStateOf(e.answerOf(q.key)?.rawText.orEmpty()) }
    optionsInOrder(e, q).forEach { o -> BigChoice(o.label, o.value == selected) { vm.answer(AnswerInput.Choice(o.value)) } }
    if (q.allowOther) {
        BigChoice("Outro", other) { other = true }
        if (other) {
            OutlinedTextField(otherText, { otherText = it }, label = { Text("Qual?") }, modifier = Modifier.fillMaxWidth())
            Button({ vm.answer(AnswerInput.Choice(AnswerInput.OTHER, otherText)) }, enabled = otherText.isNotBlank()) {
                Text("Confirmar")
            }
        }
    }
}

@Composable
private fun MultiChoice(vm: AppViewModel, e: InterviewEngine, q: Question, initial: List<String>) {
    val chosen = remember { mutableStateMapOf<String, Boolean>().apply { initial.forEach { put(it, true) } } }
    optionsInOrder(e, q).forEach { o ->
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
            Checkbox(chosen[o.value] == true, { checked ->
                if (checked && o.exclusive) chosen.clear()
                if (checked) e.questionnaire.optionsOf(q).filter { it.exclusive }.forEach { chosen.remove(it.value) }
                chosen[o.value] = checked
            })
            Text(o.label, style = MaterialTheme.typography.titleMedium)
        }
    }
    Button({ vm.answer(AnswerInput.Choices(chosen.filterValues { it }.keys.toList())) },
        enabled = chosen.values.any { it }, modifier = Modifier.fillMaxWidth()) { Text("Confirmar") }
}

@Composable
private fun NumberInput(vm: AppViewModel, q: Question, initial: Double?) {
    var text by remember { mutableStateOf(initial?.let { if (it % 1.0 == 0.0) it.toLong().toString() else it.toString() }.orEmpty()) }
    OutlinedTextField(text, { text = it.filter { c -> c.isDigit() || c == ',' || c == '.' } },
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), singleLine = true,
        modifier = Modifier.fillMaxWidth())
    val value = text.replace(',', '.').toDoubleOrNull()
    Button({ value?.let { vm.answer(AnswerInput.Number(it)) } }, enabled = value != null, modifier = Modifier.fillMaxWidth()) {
        Text("Confirmar")
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ScaleInput(vm: AppViewModel, q: Question, selected: Double?) {
    val min = (q.min ?: 0.0).toInt()
    val max = (q.max ?: 10.0).toInt()
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        (min..max).forEach { n ->
            val sel = selected?.toInt() == n
            if (sel) Button({ vm.answer(AnswerInput.Number(n.toDouble())) }) { Text("$n") }
            else OutlinedButton({ vm.answer(AnswerInput.Number(n.toDouble())) }) { Text("$n") }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun GridInput(vm: AppViewModel, e: InterviewEngine, q: Question, initial: Map<String, String>) {
    val rows = e.questionnaire.rowsOf(q).associateBy { it.value }
    val values = remember { mutableStateMapOf<String, String>().apply { putAll(initial) } }
    e.shownOrder(q).mapNotNull(rows::get).forEach { row ->
        Text(row.label, fontWeight = FontWeight.Bold)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            e.questionnaire.optionsOf(q).forEach { o ->
                FilterChip(selected = values[row.value] == o.value, onClick = { values[row.value] = o.value },
                    label = { Text(o.label) })
            }
        }
    }
    Button({ vm.answer(AnswerInput.Grid(values.toMap())) }, enabled = values.size == rows.size,
        modifier = Modifier.fillMaxWidth()) { Text("Confirmar (${values.size}/${rows.size})") }
}

/** Abertas: o microfone do teclado (Gboard) faz o ditado, sem guardar áudio (D20). */
@Composable
private fun TextInput(vm: AppViewModel, initial: String) {
    var text by remember { mutableStateOf(initial) }
    OutlinedTextField(text, { text = it }, minLines = 3, modifier = Modifier.fillMaxWidth(),
        supportingText = { Text("Use o microfone do teclado para ditar") })
    Button({ vm.answer(AnswerInput.Text(text)) }, enabled = text.isNotBlank(), modifier = Modifier.fillMaxWidth()) {
        Text("Confirmar")
    }
}

/** Espontânea: o entrevistador digita o que ouviu; as sugestões aparecem só para ele, depois da resposta. */
@Composable
private fun NameInput(vm: AppViewModel, e: InterviewEngine, q: Question, initial: String) {
    var text by remember { mutableStateOf(initial) }
    OutlinedTextField(text, { text = it }, singleLine = true, label = { Text("O que a pessoa respondeu") },
        modifier = Modifier.fillMaxWidth())
    if (text.trim().length >= 2) {
        e.suggestions(q, text).forEach { s ->
            OutlinedButton({ vm.answer(AnswerInput.Name(s.value, text)) }, Modifier.fillMaxWidth()) { Text("É ${s.label}") }
        }
    }
    if (q.allowFreeText) {
        Button({ vm.answer(AnswerInput.Name(null, text)) }, enabled = text.isNotBlank(), modifier = Modifier.fillMaxWidth()) {
            Text("Gravar como está escrito")
        }
    }
}

@Composable
private fun ContactInput(vm: AppViewModel) {
    var name by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    OutlinedTextField(name, { name = it }, label = { Text("Nome") }, singleLine = true, modifier = Modifier.fillMaxWidth())
    OutlinedTextField(phone, { phone = it.filter { c -> c.isDigit() }.take(13) }, label = { Text("WhatsApp com DDD") },
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone), singleLine = true, modifier = Modifier.fillMaxWidth())
    Button({ vm.answer(AnswerInput.Contact(name, phone)) }, enabled = name.isNotBlank() && phone.length >= 10,
        modifier = Modifier.fillMaxWidth()) { Text("Confirmar") }
}
