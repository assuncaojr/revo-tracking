"""Cruzamentos, segmentos, rankings e mapas (D26, D27)."""

import json

from tracking_api import demo
from tracking_api.db import session_factory
from tracking_api.geo import HexGrid
from test_overview import _send
from test_panel import login, users  # noqa: F401  (fixture)


def _client(users, pilot):
    coord = login("client_coord", users["client_coord"])
    coord.post(f"/api/campaigns/{pilot['campaign']}/disclaimer/accept")
    return coord


def test_hexagono_e_estavel_e_vizinhos_nao_se_sobrepoem():
    g = HexGrid(-4.9, -43.4, 500)
    a = g.cell(-4.8590, -43.3560)
    assert g.cell(-4.8590 + 0.0005, -43.3560) == a  # ~55 m adiante, mesmo hexágono
    assert g.cell(-4.8590 + 0.02, -43.3560) != a  # ~2 km adiante, outro
    poly = g.polygon(*a)
    assert len(poly) == 6
    lat = sum(p[0] for p in poly) / 6
    lng = sum(p[1] for p in poly) / 6
    assert g.cell(lat, lng) == a  # o centro do polígono cai no próprio hexágono


def test_cruzamento_por_voto_passado_confere(users, pilot, client, auth, make_interview):
    _send(client, auth, make_interview, 4, {"G1": {"value": "aprova"}, "V1": {"value": "gentil_neto"}})
    _send(client, auth, make_interview, 2, {"G1": {"value": "desaprova"}, "V1": {"value": "gentil_neto"}}, start_minute=30)
    _send(client, auth, make_interview, 2, {"G1": {"value": "desaprova"}, "V1": {"value": "paulinho"}}, start_minute=50)
    adm = login("admin", users["admin"])
    r = adm.get(f"/api/campaigns/{pilot['campaign']}/results/insights?indicator=approval").json()
    ct = r["crosstab"]
    assert ct["total"]["value"] == 50.0
    vote = ct["dimensions"][0]
    assert vote["key"] == "V1"
    groups = {g["group"]: g for g in vote["groups"]}
    assert groups["gentil_neto"]["value"] == round(100 * 4 / 6, 1) and groups["gentil_neto"]["label"] == "Gentil Neto"
    assert groups["paulinho"]["value"] == 0.0
    assert {d["key"] for d in ct["dimensions"]} >= {"V1", "stratum", "P1", "P2", "faixa_etaria"}
    seg = r["segments"]
    assert seg["n"] == 8 and seg["cells"]["aprova|continuar"]["n"] == 4
    ranks = {x["key"]: x for x in r["rankings"]}
    assert ranks["G7"]["items"][0]["value"] == "saude"
    # nome digitado fora da lista não aparece como texto
    assert all(i["label"] != "Zé do posto" for i in ranks["E2"]["items"])


def test_cliente_nao_ve_grupo_pequeno_nem_texto_livre(users, pilot, client, auth, make_interview):
    _send(client, auth, make_interview, 3, {"E2": {"value": "Zé do posto", "raw_text": "Zé do posto"}})
    coord = _client(users, pilot)
    r = coord.get(f"/api/campaigns/{pilot['campaign']}/results/insights").json()
    assert r["crosstab"]["total"]["suppressed"]
    assert all(g["value"] is None for d in r["crosstab"]["dimensions"] for g in d["groups"])
    assert all(c["pct"] is None for c in r["segments"]["cells"].values())
    e2 = next(x for x in r["rankings"] if x["key"] == "E2")
    assert "Zé do posto" not in json.dumps(e2)
    assert all(i["pct"] is None for i in e2["items"])


def test_mapa_do_cliente_so_tem_hexagonos(users, pilot):
    with session_factory()() as s:
        demo.seed(s, pilot["campaign"], days=7, per_day=70, seed_value=11)
        s.commit()
    cid = pilot["campaign"]
    coord = _client(users, pilot)
    r = coord.get(f"/api/campaigns/{cid}/results/map?indicator=approval&period=all")
    body = r.json()
    assert r.status_code == 200 and body["cells"]
    assert body["n_located"] <= body["n"]
    shown = [c for c in body["cells"] if c.get("value") is not None]
    hidden = [c for c in body["cells"] if c.get("suppressed")]
    assert shown and all(c["n"] >= 30 for c in shown)
    assert all(c["interviews"] < 30 for c in hidden)
    # nada de coordenada individual: só os vértices dos hexágonos
    assert set(body["cells"][0]) <= {"id", "polygon", "interviews", "n", "value", "low", "high", "suppressed"}
    assert coord.get(f"/api/campaigns/{cid}/field/map").status_code == 403
    assert coord.get(f"/api/campaigns/{cid}/results/map?size=37").status_code == 422


def test_mapa_de_cobertura_da_equipe(users, pilot, client, auth, make_interview):
    _send(client, auth, make_interview, 2, {})
    sup = login("supervisor", users["supervisor"])
    r = sup.get(f"/api/campaigns/{pilot['campaign']}/field/map").json()
    assert r["total"] == 2 and len(r["interviews"]) == 2
    assert r["interviews"][0]["interviewer"] == "Ana" and r["interviews"][0]["lat"] is not None


def test_gps_absurdo_nao_entra_no_mapa(users, pilot, client, auth, make_interview):
    _send(client, auth, make_interview, 3, {})
    far = make_interview()
    far["location"] = {**far["location"], "lat": 37.42, "lng": -122.08}  # GPS padrão do emulador
    client.post("/api/interviews/batch", json={"interviews": [far]}, headers=auth)
    adm = login("admin", users["admin"])
    body = adm.get(f"/api/campaigns/{pilot['campaign']}/results/map?period=all").json()
    assert body["n"] == 4 and body["n_located"] == 3
    assert body["bounds"][1][0] < 0  # o enquadramento continua no Maranhão
