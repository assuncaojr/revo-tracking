package br.com.revomidia.tracking.engine

import br.com.revomidia.tracking.model.Condition
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull

/** O que se sabe sobre uma chave (pergunta ou derivado) no momento da avaliação. */
sealed interface Known {
    data class Value(val value: JsonElement) : Known
    data class Nonresponse(val code: String) : Known
    data object Missing : Known
}

/**
 * Avalia uma condição. Valores são comparados com tipo: número com número, texto com texto.
 * Sem resposta, todo operador é falso, exceto `answered: false` e `nonresponse: false`.
 */
fun evaluate(c: Condition, lookup: (String) -> Known): Boolean = when (c) {
    is Condition.All -> c.conditions.all { evaluate(it, lookup) }
    is Condition.AnyOf -> c.conditions.any { evaluate(it, lookup) }
    is Condition.Rule -> evaluateRule(c, lookup(c.key))
}

private fun evaluateRule(r: Condition.Rule, known: Known): Boolean {
    when (val op = r.op) {
        is Condition.Op.Answered -> return (known !is Known.Missing) == op.expected
        is Condition.Op.Nonresponse -> return (known is Known.Nonresponse) == op.expected
        else -> Unit
    }
    if (known !is Known.Value) return false
    val target: JsonElement = if (r.item != null) {
        (known.value as? JsonObject)?.get(r.item) ?: return false
    } else known.value
    val scalars: List<JsonPrimitive> = when (target) {
        is JsonArray -> target.filterIsInstance<JsonPrimitive>()
        is JsonPrimitive -> listOf(target)
        else -> return false
    }
    return when (val op = r.op) {
        is Condition.Op.In -> scalars.any { s -> op.values.any { sameScalar(s, it) } }
        is Condition.Op.NotIn -> scalars.isNotEmpty() && scalars.none { s -> op.values.any { sameScalar(s, it) } }
        is Condition.Op.Lt -> number(target)?.let { it < op.n } ?: false
        is Condition.Op.Lte -> number(target)?.let { it <= op.n } ?: false
        is Condition.Op.Gt -> number(target)?.let { it > op.n } ?: false
        is Condition.Op.Gte -> number(target)?.let { it >= op.n } ?: false
        is Condition.Op.Answered, is Condition.Op.Nonresponse -> error("tratado acima")
    }
}

internal fun sameScalar(a: JsonPrimitive, b: JsonPrimitive): Boolean = when {
    a.isString || b.isString -> a.isString && b.isString && a.content == b.content
    a.booleanOrNull != null || b.booleanOrNull != null -> a.booleanOrNull == b.booleanOrNull
    else -> a.doubleOrNull != null && a.doubleOrNull == b.doubleOrNull
}

private fun number(e: JsonElement): Double? = (e as? JsonPrimitive)?.takeIf { !it.isString }?.doubleOrNull
