"""Marcos, método da pesquisa e registro do boletim (D29)."""

from datetime import date, timedelta

from sqlalchemy import select

from tracking_api import demo, models
from tracking_api.db import session_factory
from test_panel import login, users  # noqa: F401  (fixture)


def _client(users, pilot):
    coord = login("client_coord", users["client_coord"])
    coord.post(f"/api/campaigns/{pilot['campaign']}/disclaimer/accept")
    return coord


def test_marco_da_equipe_aparece_para_o_cliente(users, pilot):
    cid = pilot["campaign"]
    with session_factory()() as s:
        demo.seed(s, cid, days=5, per_day=40, seed_value=1)
        s.commit()
    sup = login("supervisor", users["supervisor"])
    day = (date.today() - timedelta(days=2)).isoformat()
    r = sup.post(f"/api/campaigns/{cid}/manage/events", json={"day": day, "title": "Inauguração do hospital"})
    assert r.status_code == 200
    coord = _client(users, pilot)
    assert coord.post(f"/api/campaigns/{cid}/manage/events", json={"day": day, "title": "x" * 5}).status_code == 403
    ov = coord.get(f"/api/campaigns/{cid}/results/overview").json()
    assert [e["title"] for e in ov["events"]] == ["Inauguração do hospital"]
    assert sup.post(f"/api/campaigns/{cid}/manage/events/{r.json()['id']}/remove").status_code == 200
    assert coord.get(f"/api/campaigns/{cid}/results/overview").json()["events"] == []


def test_metodo_em_numeros_sem_dado_de_pessoa(users, pilot):
    cid = pilot["campaign"]
    with session_factory()() as s:
        demo.seed(s, cid, days=3, per_day=40, seed_value=2)
        s.commit()
    m = _client(users, pilot).get(f"/api/campaigns/{cid}/results/method").json()
    assert m["field_days"] == 3 and m["interviewers"] == 6
    assert m["approached"] == m["complete"] + m["refused"] + m["screened_out"] + m["abandoned"]
    assert m["questionnaire"]["version"] == 1 and m["weighted"] is False
    assert "Ana" not in str(m)


def test_boletim_fica_registrado(users, pilot):
    cid = pilot["campaign"]
    coord = _client(users, pilot)
    assert coord.post(f"/api/campaigns/{cid}/results/report?period=all").status_code == 200
    with session_factory()() as s:
        log = s.scalar(select(models.AuditLog).where(models.AuditLog.action == "report_generated"))
    assert log.details == {"period": "all"}
