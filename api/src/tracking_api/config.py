from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuração por variáveis de ambiente com prefixo TRK_ (segredos nunca no repositório)."""

    model_config = SettingsConfigDict(env_prefix="TRK_", env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://tracking:tracking@localhost:5435/tracking"
    contracts_dir: Path = Path(__file__).resolve().parents[3] / "contracts"
    # Chave Fernet para cifrar nome e telefone do contato (D6). Gere com: tracking-admin new-key
    contact_key: str = ""
    # Chave HMAC para detectar telefone repetido sem guardar o telefone em claro.
    phone_hmac_key: str = ""
    min_app_version: str = "0.1.0"
    batch_max: int = 50


@lru_cache
def settings() -> Settings:
    return Settings()
