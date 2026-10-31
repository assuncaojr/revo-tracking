from collections.abc import Iterator
from functools import lru_cache

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from tracking_api.config import settings


@lru_cache
def engine() -> Engine:
    return create_engine(settings().database_url, pool_pre_ping=True)


@lru_cache
def session_factory() -> sessionmaker[Session]:
    return sessionmaker(engine(), expire_on_commit=False)


def get_session() -> Iterator[Session]:
    """Dependência do FastAPI: uma sessão por requisição."""
    with session_factory()() as s:
        yield s
