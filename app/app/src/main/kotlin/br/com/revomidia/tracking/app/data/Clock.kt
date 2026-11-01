package br.com.revomidia.tracking.app.data

import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter

/**
 * Horário no formato do contrato: ISO-8601 com segundos e fuso (`2027-01-12T09:14:03-03:00`).
 * `OffsetDateTime.toString()` omite os segundos quando são zero e quebraria o contrato.
 */
object Clock {
    private val iso = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ssXXX")
    fun now(): String = OffsetDateTime.now().format(iso)
}
