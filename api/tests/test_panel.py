import json
from datetime import datetime
from zoneinfo import ZoneInfo

import pyotp
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from tracking_api import admin, models
from tracking_api.config import settings
from tracking_api.db import session_factory
from tracking_api.main import app

PASSWORD = "senha-forte-123"


@pytest.fixture
def users(pilot):
    """Um usuário de cada papel na campanha do piloto, e um de fora."""
    out = {}
    with session_factory()() as s:
        for role in ("admin", "supervisor", "client_coord", "client_reader"):
            _, secret = admin.add_user(s, f"{role}@teste.br", role.title(), PASSWORD, pilot["campaign"], role)
            out[role] = secret
        other = admin.create_campaign(s, "Outra campanha")
        _, out["outsider"] = admin.add_user(s, "fora@teste.br", "Fora", PASSWORD, other.id, "admin")
        s.commit()
    return out


def login(role: str, secret: str) -> TestClient:
    c = TestClient(app)
    email = "fora@teste.br" if role == "outsider" else f"{role}@teste.br"
    assert c.post("/api/auth/login", json={"email": email, "password": PASSWORD}).status_code == 200
    assert c.post("/api/auth/totp", json={"code": pyotp.TOTP(secret).now()}).status_code == 200
    return c


def now_br() -> str:
    return datetime.now(ZoneInfo("America/Fortaleza")).replace(microsecond=0).isoformat()


def test_senha_sozinha_nao_entra_precisa_do_codigo(users):
    c = TestClient(app)
    assert c.post("/api/auth/login", json={"email": "admin@teste.br", "password": "errada-123456"}).status_code == 401
    assert c.post("/api/auth/login", json={"email": "admin@teste.br", "password": PASSWORD}).status_code == 200
    assert c.get("/api/auth/me").status_code == 401, "sem TOTP não há sessão"
    assert c.post("/api/auth/totp", json={"code": "000000"}).status_code == 401
    assert c.post("/api/auth/totp", json={"code": pyotp.TOTP(users["admin"]).now()}).status_code == 200
    me = c.get("/api/auth/me").json()
    assert me["campaigns"][0]["role"] == "admin" and me["campaigns"][0]["staff"] is True


def test_tentativas_de_codigo_tem_limite(users):
    c = TestClient(app)
    c.post("/api/auth/login", json={"email": "admin@teste.br", "password": PASSWORD})
    for _ in range(5):
        c.post("/api/auth/totp", json={"code": "000000"})
    r = c.post("/api/auth/totp", json={"code": pyotp.TOTP(users["admin"]).now()})
    assert r.status_code == 401, "depois de 5 erros, nem o código certo vale: precisa de novo login"


def test_logout_encerra_a_sessao(users):
    c = login("admin", users["admin"])
    c.post("/api/auth/logout")
    assert c.get("/api/auth/me").status_code == 401


def test_cliente_nao_ve_campo_agora_nem_alertas(users, pilot):
    cid = pilot["campaign"]
    cli = login("client_coord", users["client_coord"])
    assert cli.get(f"/api/campaigns/{cid}/field/now").status_code == 403
    assert cli.get(f"/api/campaigns/{cid}/flags").status_code == 403
    sup = login("supervisor", users["supervisor"])
    assert sup.get(f"/api/campaigns/{cid}/field/now").status_code == 200


def test_quem_nao_e_da_campanha_nem_sabe_que_ela_existe(users, pilot):
    fora = login("outsider", users["outsider"])
    assert fora.get(f"/api/campaigns/{pilot['campaign']}/results").status_code == 404


def test_cliente_precisa_aceitar_o_aviso_e_ve_grupos_pequenos_ocultos(users, pilot, client, auth, make_interview):
    for _ in range(3):
        client.post("/api/interviews/batch", headers=auth, json={"interviews": [make_interview()]})
    cid = pilot["campaign"]
    cli = login("client_reader", users["client_reader"])
    assert cli.get(f"/api/campaigns/{cid}/results").status_code == 403, "aviso de não garantia primeiro (D16)"
    cli.post(f"/api/campaigns/{cid}/disclaimer/accept")
    r = cli.get(f"/api/campaigns/{cid}/results").json()
    g1 = next(q for q in r["questions"] if q["key"] == "G1")
    assert r["n"] == 3 and g1["total"] == {"n": 3, "suppressed": True}, "3 < 30: oculto para o cliente"
    assert r["weighted"] is False

    adm = login("admin", users["admin"])
    g1 = next(q for q in adm.get(f"/api/campaigns/{cid}/results").json()["questions"] if q["key"] == "G1")
    assert g1["total"]["counts"] == {"aprova": 3}, "a equipe vê os números"
    grid = [q for q in adm.get(f"/api/campaigns/{cid}/results").json()["questions"] if q["key"] == "G4"]
    assert len(grid) == 8, "uma linha de resultado por área da grade"


def test_campo_agora_mostra_producao_do_dia(users, pilot, client, auth, make_interview):
    client.post("/api/interviews/batch", headers=auth, json={"interviews": [
        make_interview(start=now_br()), make_interview(start=now_br(), duration_s=20, location=None)]})
    sup = login("supervisor", users["supervisor"])
    r = sup.get(f"/api/campaigns/{pilot['campaign']}/field/now").json()
    ana = r["interviewers"][0]
    assert (ana["name"], ana["complete"], ana["open_flags"]) == ("Ana", 2, 2)  # too_fast + no_gps na segunda
    assert r["devices"][0]["label"] == "A14-01" and r["devices"][0]["today"] == 2
    afastado = next(st for st in r["strata"] if st["name"] == "Afastado")  # Salobro é afastado
    assert afastado["complete"] == 2 and afastado["target"] == 30


def test_excluir_pelo_alerta_tira_a_entrevista_do_resultado(users, pilot, client, auth, make_interview):
    doc = make_interview(duration_s=20)  # too_fast
    client.post("/api/interviews/batch", headers=auth, json={"interviews": [doc, make_interview()]})
    sup = login("supervisor", users["supervisor"])
    cid = pilot["campaign"]
    flag = next(f for f in sup.get(f"/api/campaigns/{cid}/flags").json() if f["interview_id"] == doc["id"])
    assert sup.post(f"/api/flags/{flag['id']}/resolve", json={"resolution": "excluded", "note": "rápida demais"}).status_code == 200
    assert sup.get(f"/api/campaigns/{cid}/results").json()["n"] == 1
    assert all(f["interview_id"] != doc["id"] for f in sup.get(f"/api/campaigns/{cid}/flags").json()), "resolvido sai da lista"
    with session_factory()() as s:
        assert s.scalar(select(models.AuditLog.action).where(models.AuditLog.action == "flag_resolved"))


def test_cliente_leitor_nao_resolve_alerta_nem_aprova(users, pilot):
    cid = pilot["campaign"]
    leitor = login("client_reader", users["client_reader"])
    qv = leitor.get(f"/api/campaigns/{cid}/questionnaires").json()[0]
    assert leitor.post(f"/api/campaigns/{cid}/questionnaires/{qv['id']}/approve").status_code == 403


def test_coordenacao_do_cliente_aprova_e_so_admin_publica(users, pilot):
    cid = pilot["campaign"]
    with session_factory()() as s:
        definition = json.loads(
            (settings().contracts_dir / "examples/questionnaire/caxias-piloto-2027.v1.json").read_text())
        definition["version"] = 2
        qv2 = admin.load_questionnaire(s, cid, definition)
        s.commit()
    adm = login("admin", users["admin"])
    assert adm.post(f"/api/campaigns/{cid}/questionnaires/{qv2.id}/publish").status_code == 409, "sem aprovação"
    coord = login("client_coord", users["client_coord"])
    assert coord.post(f"/api/campaigns/{cid}/questionnaires/{qv2.id}/approve").status_code == 200
    assert coord.post(f"/api/campaigns/{cid}/questionnaires/{qv2.id}/publish").status_code == 403
    assert adm.post(f"/api/campaigns/{cid}/questionnaires/{qv2.id}/publish").status_code == 200
