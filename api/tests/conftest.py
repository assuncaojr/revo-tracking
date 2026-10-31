import copy
import json
import os
import uuid
from datetime import datetime, timedelta
from pathlib import Path

# Antes de importar o pacote: settings() é lido uma vez.
os.environ.setdefault("TRK_DATABASE_URL", "postgresql+psycopg://tracking:tracking@localhost:5435/tracking_test")
os.environ.setdefault("TRK_CONTACT_KEY", "Zx3E1j0F3ow2T5d6tOJ1pq3kHOm1x2lqUuJt1d3YbT0=")
os.environ.setdefault("TRK_PHONE_HMAC_KEY", "chave-de-teste")

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import text

from tracking_api import admin
from tracking_api.config import settings
from tracking_api.db import engine, session_factory
from tracking_api.main import app

API_DIR = Path(__file__).resolve().parents[1]
EXAMPLE = json.loads((settings().contracts_dir / "examples/interview/complete.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="session", autouse=True)
def schema():
    """Banco de teste montado pela migração (testa a migração junto)."""
    with engine().begin() as c:
        c.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public"))
    cfg = Config(str(API_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(API_DIR / "migrations"))
    command.upgrade(cfg, "head")


@pytest.fixture(autouse=True)
def clean():
    yield
    with engine().begin() as c:
        tables = c.execute(text("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> 'alembic_version'"))
        c.execute(text("TRUNCATE " + ", ".join(t[0] for t in tables) + " CASCADE"))


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def pilot():
    """Campanha do piloto + 2 entrevistadores + 1 aparelho ainda não cadastrado."""
    with session_factory()() as s:
        c = admin.seed_pilot(s, settings().contracts_dir / "examples/questionnaire/caxias-piloto-2027.v1.json")
        ana = admin.add_interviewer(s, c.id, "Ana", "1234")
        beto = admin.add_interviewer(s, c.id, "Beto", "4321")
        device, code = admin.add_device(s, c.id, "A14-01")
        s.commit()
        point = s.execute(text("SELECT id FROM point WHERE name LIKE 'Salobro%'")).scalar_one()
        return {"campaign": c.id, "ana": ana.id, "beto": beto.id, "device": device.id, "code": code, "point": point}


@pytest.fixture
def token(client, pilot):
    r = client.post("/api/device/enroll", json={"code": pilot["code"], "model": "SM-A145M", "app_version": "0.1.0"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture
def auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def make_interview(pilot):
    """Entrevista do exemplo do contrato, com os ids do piloto semeado e um id novo."""

    def make(start: str = "2027-01-12T09:14:03-03:00", duration_s: int = 187, **overrides) -> dict:
        doc = copy.deepcopy(EXAMPLE)
        started = datetime.fromisoformat(start)
        doc.update(
            id=str(uuid.uuid4()),
            campaign_id=str(pilot["campaign"]),
            device_id=str(pilot["device"]),
            interviewer_id=str(pilot["ana"]),
            session_id=str(uuid.uuid5(uuid.NAMESPACE_URL, f"sessao-{pilot['ana']}")),
            point_id=str(pilot["point"]),
            started_at=started.isoformat(),
            finished_at=(started + timedelta(seconds=duration_s)).isoformat(),
        )
        doc.update(overrides)
        return doc

    return make
