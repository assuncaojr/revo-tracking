package br.com.revomidia.tracking.engine

import java.security.MessageDigest
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

/**
 * Verifica o PIN do entrevistador offline, com os parâmetros que vêm no bootstrap.
 * Mesma conta da API (api/src/tracking_api/security.py: PBKDF2-SHA256, 32 bytes).
 */
object Pin {
    fun verify(pin: String, saltHex: String, expectedHex: String, iterations: Int): Boolean {
        val spec = PBEKeySpec(pin.toCharArray(), saltHex.hexToByteArray(), iterations, 256)
        val digest = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).encoded
        return MessageDigest.isEqual(digest, expectedHex.hexToByteArray())
    }

    private fun String.hexToByteArray(): ByteArray =
        ByteArray(length / 2) { i -> substring(2 * i, 2 * i + 2).toInt(16).toByte() }
}
