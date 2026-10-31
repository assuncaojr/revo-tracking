package br.com.revomidia.tracking.model

import kotlinx.serialization.json.Json

/**
 * Configuração única de JSON para os contratos.
 * - Campos com valor padrão não são gravados (o contrato não aceita, por exemplo, `"raw_text": null`).
 * - Campos sem padrão e nulos são gravados como `null` (`location`, `contact`).
 * - Campo desconhecido é erro: o contrato é fechado (`additionalProperties: false`).
 */
val ContractJson: Json = Json {
    encodeDefaults = false
    explicitNulls = true
    ignoreUnknownKeys = false
}
