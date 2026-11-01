"""Panorama dos resultados: números conferidos à mão, margem de erro e o que o cliente não vê."""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from tracking_api import demo
from tracking_api.db import session_factory
from tracking_api.overview import wilson
from test_panel import login, users  # noqa: F401  (fixture)


def test_wilson_fica_dentro_de_0_a_100_e_encolhe_com_n():
    p, lo, hi = wilson(0, 10)
    assert p == 0 and lo == 0 and 0 < hi < 0.35
    _, lo100, hi100 = wilson(50, 100)
    _, lo1000, hi1000 = wilson(500, 1000)
    assert lo100 < lo1000 < 0.5 < hi1000 < hi100
    assert round(hi1000 - lo1000, 3) == 0.062  # ±3,1 pontos com 1.000 entrevistas


def _send(client, auth, make_interview, n: int, answers: dict, day_offset: int = 0, start_minute: int = 0):
    base = datetime.now(ZoneInfo("America/Fortaleza")).replace(hour=8, minute=0, second=0, microsecond=0)
    base -= timedelta(days=day_offset)
    docs = []
    for i in range(n):
        doc = make_interview(start=(base + timedelta(minutes=start_minute + 5 * i)).isoformat())
        doc["answers"].update(answers)
        docs.append(doc)
    r = client.post("/api/interviews/batch", json={"interviews": docs}, headers=auth)
    assert all(x["status"] == "accepted" for x in r.json()["results"]), r.text


def test_indicadores_conferem_com_as_respostas(users, pilot, client, auth, make_interview):
    # hoje: 3 aprovam com nota 8, 1 desaprova com nota 2 e 1 não sabe a nota
    _send(client, auth, make_interview, 3, {"G1": {"value": "aprova"}, "G3": {"value": 8}})
    _send(client, auth, make_interview, 1, {"G1": {"value": "desaprova"}, "G3": {"value": 2}}, start_minute=30)
    _send(client, auth, make_interview, 1, {"G1": {"value": "desaprova"}, "G3": {"nonresponse": "_ns"}}, start_minute=40)
    adm = login("admin", users["admin"])
    r = adm.get(f"/api/campaigns/{pilot['campaign']}/results/overview").json()
    ind = {i["key"]: i for i in r["indicators"]}
    assert r["n"] == 5 and r["weighted"] is False
    assert ind["approval"]["current"]["value"] == 60.0 and ind["approval"]["current"]["n"] == 5
    assert ind["approval"]["current"]["low"] < 60 < ind["approval"]["current"]["high"]
    assert ind["score"]["current"]["value"] == 6.5 and ind["score"]["current"]["n"] == 4  # NS fora da média
    assert ind["score"]["scale"] == [0, 10]
    today = ind["approval"]["series"][-1]
    assert today["partial"] and today["daily"]["n"] == 5
    assert r["grid"]["rows"][0]["n"] == 5


def test_cliente_nao_ve_grupos_pequenos_nem_dias_magros(users, pilot, client, auth, make_interview):
    _send(client, auth, make_interview, 5, {"G1": {"value": "aprova"}})
    coord = login("client_coord", users["client_coord"])
    cid = pilot["campaign"]
    coord.post(f"/api/campaigns/{cid}/disclaimer/accept")
    r = coord.get(f"/api/campaigns/{cid}/results/overview").json()
    approval = next(i for i in r["indicators"] if i["key"] == "approval")
    assert approval["current"] == {"n": 5, "value": None, "suppressed": True}
    assert all(d["daily"]["value"] is None for d in approval["series"])
    assert all(row.get("pct") is None for row in r["grid"]["rows"])
    assert r["min_cell"] == 30


def test_variacao_entre_semanas_marca_quando_passa_da_margem(users, pilot):
    with session_factory()() as s:
        demo.seed(s, pilot["campaign"], days=14, per_day=60, seed_value=3)
        s.commit()
    adm = login("admin", users["admin"])
    r = adm.get(f"/api/campaigns/{pilot['campaign']}/results/overview").json()
    for ind in r["indicators"]:
        assert ind["previous"]["value"] is not None
        ch = ind["change"]
        assert ch is not None and isinstance(ch["beyond_margin"], bool)
        # média móvel de 3 dias soma mais entrevistas que o dia sozinho
        mid = ind["series"][3]
        assert mid["rolling"]["n"] > mid["daily"]["n"]
    assert len(r["indicators"][0]["series"]) == 7
    everything = adm.get(f"/api/campaigns/{pilot['campaign']}/results/overview?period=all").json()
    assert everything["previous"] is None and everything["n"] == everything["n_total"]
    assert len(everything["indicators"][0]["series"]) == 14
