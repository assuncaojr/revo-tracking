"""Cadastros pelo painel (D25): quem pode o quê, e o efeito no aparelho e no login."""

import json

import pyotp
from fastapi.testclient import TestClient
from sqlalchemy import select

from tracking_api import models, security
from tracking_api.config import settings
from tracking_api.db import session_factory
from tracking_api.main import app
from test_panel import login, users  # noqa: F401  (fixture)


def base(pilot) -> str:
    return f"/api/campaigns/{pilot['campaign']}/manage"


def test_cliente_nao_ve_cadastros_e_supervisao_so_ve_campo(users, pilot):
    b = base(pilot)
    coord = login("client_coord", users["client_coord"])
    for path in ("/interviewers", "/devices", "/places", "/members"):
        assert coord.get(b + path).status_code == 403
    sup = login("supervisor", users["supervisor"])
    assert sup.get(b + "/interviewers").status_code == 200
    assert sup.get(b + "/devices").status_code == 200
    assert sup.get(b + "/places").status_code == 403
    assert sup.get(b + "/members").status_code == 403
    fora = login("outsider", users["outsider"])
    assert fora.get(b + "/interviewers").status_code == 404


def test_entrevistador_desativado_e_pin_novo_chegam_ao_aparelho(users, pilot, client, auth):
    b = base(pilot)
    sup = login("supervisor", users["supervisor"])
    assert sup.post(b + "/interviewers", json={"name": "Carla", "pin": "12"}).status_code == 422
    assert sup.post(b + "/interviewers", json={"name": "Carla", "pin": "5678"}).status_code == 200
    assert sup.post(f"{b}/interviewers/{pilot['beto']}", json={"active": False}).status_code == 200
    assert sup.post(f"{b}/interviewers/{pilot['ana']}", json={"pin": "9999"}).status_code == 200

    boot = client.get("/api/device/bootstrap", headers=auth).json()
    names = {i["name"] for i in boot["interviewers"]}
    assert "Carla" in names and "Beto" not in names
    with session_factory()() as s:
        ana = s.get(models.Interviewer, pilot["ana"])
        audit = s.scalars(select(models.AuditLog.action).where(models.AuditLog.campaign_id == pilot["campaign"])).all()
    assert security.verify_pin("9999", ana.pin_salt, ana.pin_hash, ana.pin_iterations)
    assert audit.count("interviewer_updated") == 2 and "interviewer_added" in audit


def test_aparelho_novo_cadastra_com_o_codigo_e_revogado_perde_acesso(users, pilot, client):
    b = base(pilot)
    sup = login("supervisor", users["supervisor"])
    r = sup.post(b + "/devices", json={"label": "A14-02"}).json()
    enrolled = client.post("/api/device/enroll", json={"code": r["code"], "model": "SM-A145M", "app_version": "0.1.0"})
    assert enrolled.status_code == 200
    headers = {"Authorization": f"Bearer {enrolled.json()['token']}"}
    assert client.get("/api/device/bootstrap", headers=headers).status_code == 200
    listed = {d["label"]: d for d in sup.get(b + "/devices").json()}
    assert listed["A14-02"]["active"] and listed["A14-01"]["awaiting_enrollment"]

    assert sup.post(f"{b}/devices/{r['id']}/revoke").status_code == 200
    assert client.get("/api/device/bootstrap", headers=headers).status_code == 401
    code = sup.post(f"{b}/devices/{r['id']}/code").json()["code"]
    again = client.post("/api/device/enroll", json={"code": code, "model": "SM-A145M", "app_version": "0.1.0"})
    assert again.status_code == 200 and again.json()["device_id"] == r["id"]


def test_locais_estrato_bairro_ponto(users, pilot):
    b = base(pilot)
    adm = login("admin", users["admin"])
    st = adm.post(b + "/strata", json={"name": "Rural", "daily_target": 10}).json()["id"]
    nb = adm.post(b + "/neighborhoods", json={"name": "Baú", "stratum_id": st}).json()["id"]
    pt = adm.post(b + "/points", json={"neighborhood_id": nb, "name": "Baú — feira", "kind": "flow",
                                       "lat": -4.9, "lng": -43.4}).json()["id"]
    places = adm.get(b + "/places").json()
    assert any(s["name"] == "Rural" and s["daily_target"] == 10 for s in places["strata"])
    assert adm.post(f"{b}/points/{pt}", json={"neighborhood_id": nb, "name": "Baú — feira", "active": False}).status_code == 200
    point = next(p for p in adm.get(b + "/places").json()["points"] if p["id"] == pt)
    assert point["active"] is False and point["lat"] is None
    # bairro de outra campanha não serve
    with session_factory()() as s:
        other = s.scalar(select(models.Campaign).where(models.Campaign.name == "Outra campanha"))
        foreign = models.Neighborhood(campaign_id=other.id, name="X")
        s.add(foreign)
        s.commit()
        foreign_id = str(foreign.id)
    assert adm.post(b + "/points", json={"neighborhood_id": foreign_id, "name": "X"}).status_code == 404


def test_usuario_novo_recebe_senha_e_autenticador_e_entra(users, pilot):
    b = base(pilot)
    adm = login("admin", users["admin"])
    r = adm.post(b + "/members", json={"email": "Nova@Teste.br", "name": "Nova", "role": "analyst"}).json()
    cred = r["credentials"]
    c = TestClient(app)
    assert c.post("/api/auth/login", json={"email": cred["email"], "password": cred["password"]}).status_code == 200
    assert c.post("/api/auth/totp", json={"code": pyotp.TOTP(cred["totp_secret"]).now()}).status_code == 200
    assert c.get(f"{b}/interviewers").status_code == 403  # analista não cadastra

    # quem já tem conta em outra campanha só ganha o papel: senha continua a dele
    r = adm.post(b + "/members", json={"email": "fora@teste.br", "name": "Fora", "role": "client_reader"}).json()
    assert r["credentials"] is None
    member = next(m for m in adm.get(b + "/members").json() if m["email"] == "fora@teste.br")
    assert adm.post(f"{b}/members/{member['id']}/reset").status_code == 409


def test_reset_derruba_sessao_e_remocao_tira_acesso(users, pilot):
    b = base(pilot)
    adm = login("admin", users["admin"])
    leitor = login("client_reader", users["client_reader"])
    mid = next(m["id"] for m in adm.get(b + "/members").json() if m["role"] == "client_reader")
    cred = adm.post(f"{b}/members/{mid}/reset").json()["credentials"]
    assert leitor.get("/api/auth/me").status_code == 401
    novo = TestClient(app)
    novo.post("/api/auth/login", json={"email": cred["email"], "password": cred["password"]})
    assert novo.post("/api/auth/totp", json={"code": pyotp.TOTP(cred["totp_secret"]).now()}).status_code == 200
    assert adm.post(f"{b}/members/{mid}/remove").status_code == 200
    assert novo.get("/api/auth/me").status_code == 401


def test_campanha_nao_fica_sem_admin(users, pilot):
    b = base(pilot)
    adm = login("admin", users["admin"])
    me = next(m for m in adm.get(b + "/members").json() if m["is_me"])
    assert adm.post(f"{b}/members/{me['id']}/role", json={"role": "analyst"}).status_code == 409
    assert adm.post(f"{b}/members/{me['id']}/remove").status_code == 409


def test_nova_versao_do_questionario_e_validada(users, pilot):
    b = base(pilot)
    adm = login("admin", users["admin"])
    definition = json.loads((settings().contracts_dir / "examples/questionnaire/caxias-piloto-2027.v1.json").read_text())
    assert adm.post(b + "/questionnaires", json=definition).status_code == 422, "versão 1 já existe"
    definition["version"] = 2
    assert adm.post(b + "/questionnaires", json=definition).status_code == 200
    definition["version"] = 3
    definition["questions"][0]["type"] = "inexistente"
    r = adm.post(b + "/questionnaires", json=definition)
    assert r.status_code == 422 and "inválido" in r.json()["detail"]
