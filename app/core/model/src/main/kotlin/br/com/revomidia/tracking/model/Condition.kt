package br.com.revomidia.tracking.model

import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.descriptors.buildClassSerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonEncoder
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

/** Condição de `show_if` / `terminate_if` (questionnaire.schema.json, `$defs/condition`). */
@Serializable(with = ConditionSerializer::class)
sealed interface Condition {
    data class All(val conditions: List<Condition>) : Condition
    data class AnyOf(val conditions: List<Condition>) : Condition

    /** Regra sobre a resposta de [key] (ou sobre a linha [item] de uma grade). */
    data class Rule(val key: String, val item: String?, val op: Op) : Condition

    sealed interface Op {
        data class In(val values: List<JsonPrimitive>) : Op
        data class NotIn(val values: List<JsonPrimitive>) : Op
        data class Lt(val n: Double) : Op
        data class Lte(val n: Double) : Op
        data class Gt(val n: Double) : Op
        data class Gte(val n: Double) : Op
        data class Answered(val expected: Boolean) : Op
        data class Nonresponse(val expected: Boolean) : Op
    }

    /** Chaves de que a condição depende. */
    fun keys(): List<String> = when (this) {
        is All -> conditions.flatMap { it.keys() }
        is AnyOf -> conditions.flatMap { it.keys() }
        is Rule -> listOf(key)
    }
}

object ConditionSerializer : KSerializer<Condition> {
    override val descriptor: SerialDescriptor = buildClassSerialDescriptor("Condition")

    override fun deserialize(decoder: Decoder): Condition {
        val input = decoder as? JsonDecoder ?: throw SerializationException("Condição só é lida de JSON")
        return fromJson(input.decodeJsonElement())
    }

    override fun serialize(encoder: Encoder, value: Condition) {
        val output = encoder as? JsonEncoder ?: throw SerializationException("Condição só é gravada em JSON")
        output.encodeJsonElement(toJson(value))
    }

    fun fromJson(e: JsonElement): Condition {
        val o = e.jsonObject
        o["all"]?.let { return Condition.All(it.jsonArray.map(::fromJson)) }
        o["any"]?.let { return Condition.AnyOf(it.jsonArray.map(::fromJson)) }
        val key = o["key"]?.jsonPrimitive?.content ?: throw SerializationException("Condição sem 'key': $o")
        val item = o["item"]?.jsonPrimitive?.content
        val ops = o.keys - setOf("key", "item")
        if (ops.size != 1) throw SerializationException("Condição precisa de exatamente um operador: $o")
        val name = ops.single()
        val arg = o.getValue(name)
        val op = when (name) {
            "in" -> Condition.Op.In(arg.jsonArray.map { it.jsonPrimitive })
            "not_in" -> Condition.Op.NotIn(arg.jsonArray.map { it.jsonPrimitive })
            "lt" -> Condition.Op.Lt(arg.number(name))
            "lte" -> Condition.Op.Lte(arg.number(name))
            "gt" -> Condition.Op.Gt(arg.number(name))
            "gte" -> Condition.Op.Gte(arg.number(name))
            "answered" -> Condition.Op.Answered(arg.bool(name))
            "nonresponse" -> Condition.Op.Nonresponse(arg.bool(name))
            else -> throw SerializationException("Operador desconhecido '$name'")
        }
        return Condition.Rule(key, item, op)
    }

    fun toJson(c: Condition): JsonElement = when (c) {
        is Condition.All -> JsonObject(mapOf("all" to JsonArray(c.conditions.map(::toJson))))
        is Condition.AnyOf -> JsonObject(mapOf("any" to JsonArray(c.conditions.map(::toJson))))
        is Condition.Rule -> buildJsonObject {
            put("key", c.key)
            c.item?.let { put("item", it) }
            when (val op = c.op) {
                is Condition.Op.In -> put("in", JsonArray(op.values))
                is Condition.Op.NotIn -> put("not_in", JsonArray(op.values))
                is Condition.Op.Lt -> put("lt", op.n)
                is Condition.Op.Lte -> put("lte", op.n)
                is Condition.Op.Gt -> put("gt", op.n)
                is Condition.Op.Gte -> put("gte", op.n)
                is Condition.Op.Answered -> put("answered", op.expected)
                is Condition.Op.Nonresponse -> put("nonresponse", op.expected)
            }
        }
    }

    private fun JsonElement.number(op: String) =
        (this as? JsonPrimitive)?.takeIf { !it.isString }?.doubleOrNull
            ?: throw SerializationException("'$op' espera número")

    private fun JsonElement.bool(op: String) =
        (this as? JsonPrimitive)?.booleanOrNull ?: throw SerializationException("'$op' espera booleano")
}

object NonresponseRuleSerializer : KSerializer<NonresponseRule> {
    override val descriptor: SerialDescriptor = buildClassSerialDescriptor("NonresponseRule")

    override fun deserialize(decoder: Decoder): NonresponseRule {
        val e = (decoder as JsonDecoder).decodeJsonElement()
        return when {
            e is JsonArray -> NonresponseRule.Only(e.map { it.jsonPrimitive.content })
            e is JsonPrimitive && e.booleanOrNull == true -> NonresponseRule.All
            e is JsonPrimitive && e.booleanOrNull == false -> NonresponseRule.None
            else -> throw SerializationException("'nonresponse' espera booleano ou lista")
        }
    }

    override fun serialize(encoder: Encoder, value: NonresponseRule) {
        val e: JsonElement = when (value) {
            NonresponseRule.All -> JsonPrimitive(true)
            NonresponseRule.None -> JsonPrimitive(false)
            is NonresponseRule.Only -> JsonArray(value.values.map(::JsonPrimitive))
        }
        (encoder as JsonEncoder).encodeJsonElement(e)
    }
}
