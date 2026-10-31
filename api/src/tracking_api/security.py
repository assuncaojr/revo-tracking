"""Segredos: tokens de aparelho, PIN de entrevistador, cifragem do contato."""

import hashlib
import hmac
import secrets

from cryptography.fernet import Fernet

from tracking_api.config import settings

PIN_ITERATIONS = 120_000  # verificado offline num A14: precisa ser rápido lá e caro para força bruta aqui
_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # sem 0/O, 1/I/L: o código é digitado no aparelho


def sha256_hex(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()


def new_device_token() -> str:
    return secrets.token_urlsafe(32)


def new_enrollment_code() -> str:
    return "".join(secrets.choice(_CODE_ALPHABET) for _ in range(8))


def hash_pin(pin: str, salt: str | None = None, iterations: int = PIN_ITERATIONS) -> tuple[str, str, int]:
    """Devolve (sal, hash, iterações). O aparelho refaz a conta com os mesmos parâmetros."""
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", pin.encode(), bytes.fromhex(salt), iterations)
    return salt, digest.hex(), iterations


def verify_pin(pin: str, salt: str, expected_hex: str, iterations: int) -> bool:
    return hmac.compare_digest(hash_pin(pin, salt, iterations)[1], expected_hex)


def _fernet() -> Fernet:
    key = settings().contact_key
    if not key:
        raise RuntimeError("TRK_CONTACT_KEY não configurada: contatos não podem ser gravados sem cifragem")
    return Fernet(key.encode())


def encrypt(text: str) -> bytes:
    return _fernet().encrypt(text.encode())


def decrypt(blob: bytes) -> str:
    return _fernet().decrypt(blob).decode()


def phone_hash(phone: str) -> str:
    key = settings().phone_hmac_key
    if not key:
        raise RuntimeError("TRK_PHONE_HMAC_KEY não configurada")
    return hmac.new(key.encode(), phone.encode(), hashlib.sha256).hexdigest()
