"""Prova ponta a ponta: o que o motor do app produz, a API aceita.

Os testes do app (`cd app && ./gradlew :engine:test`) gravam as entrevistas produzidas em
app/engine/build/produced/. Aqui elas são enviadas à API com os ids do piloto semeado.
"""

import json
import uuid
from pathlib import Path

import pytest

PRODUCED = Path(__file__).resolve().parents[2] / "app" / "engine" / "build" / "produced"


def produced_files():
    return sorted(PRODUCED.glob("*.json")) if PRODUCED.exists() else []


@pytest.mark.skipif(not produced_files(), reason="rode antes os testes do app: cd app && ./gradlew :engine:test")
def test_entrevistas_produzidas_pelo_motor_do_app_sao_aceitas(client, auth, pilot):
    docs = []
    for f in produced_files():
        doc = json.loads(f.read_text(encoding="utf-8"))
        doc.update(
            id=str(uuid.uuid4()),
            campaign_id=str(pilot["campaign"]),
            device_id=str(pilot["device"]),
            interviewer_id=str(pilot["ana"]),
            session_id=str(uuid.uuid4()),
            point_id=str(pilot["point"]),
        )
        docs.append((f.name, doc))
    r = client.post("/api/interviews/batch", headers=auth, json={"interviews": [d for _, d in docs]})
    assert r.status_code == 200, r.text
    recusadas = [(name, res) for (name, _), res in zip(docs, r.json()["results"]) if res["status"] != "accepted"]
    assert not recusadas, recusadas
