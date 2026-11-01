"""Ficha do bairro e resumo em frases (D28)."""

from tracking_api import demo
from tracking_api.db import session_factory
from test_overview import _send
from test_panel import login, users  # noqa: F401  (fixture)


def _seed(pilot, days=10):
    with session_factory()() as s:
        demo.seed(s, pilot["campaign"], days=days, per_day=70, seed_value=2027)
        s.commit()


def test_frases_do_resumo(users, pilot):
    _seed(pilot)
    coord = login("client_coord", users["client_coord"])
    cid = pilot["campaign"]
    coord.post(f"/api/campaigns/{cid}/disclaimer/accept")
    r = coord.get(f"/api/campaigns/{cid}/results/overview").json()
    lines = r["headlines"]
    assert 3 <= len(lines) <= 7
    assert all(h["tone"] in ("favorable", "unfavorable", "neutral") and h["text"].endswith(".") for h in lines)
    assert lines[0]["text"].startswith("Aprovação")
    assert any("área mais criticada" in h["text"] for h in lines)
    assert r["today_n"] >= 0 and r["last_at"]


def test_frase_nao_afirma_diferenca_dentro_da_margem(users, pilot, client, auth, make_interview):
    _send(client, auth, make_interview, 3, {"G1": {"value": "aprova"}})
    _send(client, auth, make_interview, 3, {"G1": {"value": "desaprova"}}, start_minute=30)
    adm = login("admin", users["admin"])
    r = adm.get(f"/api/campaigns/{pilot['campaign']}/results/overview").json()
    assert "empate técnico" in r["headlines"][0]["text"]


def test_lista_e_ficha_do_bairro(users, pilot):
    _seed(pilot)
    cid = pilot["campaign"]
    coord = login("client_coord", users["client_coord"])
    coord.post(f"/api/campaigns/{cid}/disclaimer/accept")
    lst = coord.get(f"/api/campaigns/{cid}/results/neighborhoods").json()
    assert len(lst["items"]) == 12 and sum(i["n"] for i in lst["items"]) == lst["n"]
    small = [i for i in lst["items"] if i["n"] < 30]
    assert all(i["indicators"]["approval"]["value"] is None for i in small)
    big = max(lst["items"], key=lambda i: i["n"])
    ficha = coord.get(f"/api/campaigns/{cid}/results/neighborhoods/{big['id']}").json()
    assert ficha["name"] == big["name"] and ficha["headlines"]
    assert {i["key"] for i in ficha["indicators"]} >= {"approval", "score"}
    assert ficha["balances"][0]["label"] == "Aprovação"
    assert ficha["grid"]["rows"] and all(r["n"] >= 30 for r in ficha["grid"]["rows"])
    assert coord.get(f"/api/campaigns/{cid}/results/neighborhoods/nao-existe").status_code == 404
