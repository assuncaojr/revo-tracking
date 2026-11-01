from datetime import UTC, datetime, timedelta

from tracking_api import admin, models, security
from tracking_api.db import session_factory


def test_cadastro_com_codigo_de_uso_unico(client, pilot):
    r = client.post("/api/device/enroll", json={"code": pilot["code"].lower()})  # aceita minúsculas
    assert r.status_code == 200
    assert r.json()["label"] == "A14-01"
    again = client.post("/api/device/enroll", json={"code": pilot["code"]})
    assert again.status_code == 400, "código não pode ser usado duas vezes"


def test_codigo_expirado_e_recusado(client, pilot):
    with session_factory()() as s:
        ec = s.get(models.EnrollmentCode, security.sha256_hex(pilot["code"]))
        ec.expires_at = datetime.now(UTC) - timedelta(minutes=1)
        s.commit()
    assert client.post("/api/device/enroll", json={"code": pilot["code"]}).status_code == 400


def test_bootstrap_traz_tudo_para_trabalhar_offline(client, auth):
    r = client.get("/api/device/bootstrap", headers=auth)
    assert r.status_code == 200
    b = r.json()
    assert b["questionnaire"]["id"] == "caxias-piloto-2027"
    assert len(b["points"]) == 12
    assert {p["stratum"] for p in b["points"]} == {"Central", "Afastado"}
    ana = next(i for i in b["interviewers"] if i["name"] == "Ana")
    assert security.verify_pin("1234", ana["pin_salt"], ana["pin_hash"], ana["pin_iterations"])
    assert "pin" not in ana


def test_sem_token_ou_revogado_nao_entra(client, auth, pilot):
    assert client.get("/api/device/bootstrap").status_code == 401
    assert client.get("/api/device/bootstrap", headers={"Authorization": "Bearer xyz"}).status_code == 401
    with session_factory()() as s:
        admin.revoke_device(s, pilot["device"])
        s.commit()
    assert client.get("/api/device/bootstrap", headers=auth).status_code == 401


def test_aparelho_revogado_recebe_novo_codigo_e_mantem_o_id(client, auth, pilot):
    with session_factory()() as s:
        admin.revoke_device(s, pilot["device"])
        s.commit()
    assert client.get("/api/device/bootstrap", headers=auth).status_code == 401
    with session_factory()() as s:
        code = admin.reissue_device_code(s, pilot["device"])
        s.commit()
    r = client.post("/api/device/enroll", json={"code": code})
    assert r.status_code == 200
    assert r.json()["device_id"] == str(pilot["device"]), "mesmo id: a fila do aparelho continua válida"


def test_heartbeat_registra_pendencias_e_bateria(client, auth, pilot):
    r = client.post("/api/device/heartbeat", headers=auth, json={"pending_count": 7, "battery_pct": 41})
    assert r.status_code == 200
    with session_factory()() as s:
        d = s.get(models.Device, pilot["device"])
        assert (d.pending_count, d.battery_pct) == (7, 41)
        assert d.last_seen_at is not None
