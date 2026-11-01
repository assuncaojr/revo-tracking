"""Bairros e resumo em frases (D28).

Bairro = onde a entrevista foi feita (o ponto de trabalho), não onde a pessoa diz morar. Ficha do bairro e
frases usam o mínimo de `min_cell` para todos, inclusive a equipe: com menos que isso o bairro só mostra ruído.

As frases são regras simples sobre os mesmos números do painel (sem LLM): só afirmam diferença quando ela passa
da margem de erro. Cada frase traz um tom (favorável, desfavorável ou neutro à gestão) para a cor do marcador.
"""

import uuid
from collections import defaultdict

from fastapi import APIRouter, HTTPException, status

from tracking_api.config import settings
from tracking_api.insights import _ranking
from tracking_api.overview import Context, Estimate, Period, _balance, _observe, load_context
from tracking_api.panel import DbSession
from tracking_api.web_auth import AuthUser

router = APIRouter(prefix="/api")


def _min_n() -> int:
    return settings().min_cell


def _differs(e: dict, ref: dict) -> bool:
    """O intervalo do grupo não contém o valor de referência."""
    return (e.get("value") is not None and ref.get("value") is not None
            and not (e["low"] <= ref["value"] <= e["high"]))


def _tone(diff: float, favorable: bool) -> str:
    return "favorable" if (diff > 0) == favorable else "unfavorable"


def _fmt(v: float, mean: bool) -> str:
    return f"{v:.1f}".replace(".", ",") if mean else f"{round(v)}%"


def _estimate(rows: list, ind: dict, hide: int) -> dict:
    e = Estimate(bool(ind.get("mean")))
    for r in rows:
        if (x := _observe(ind, r.answers)) is not None:
            e.add(x)
    return e.out(hide)


def _grid(c: Context, rows: list, hide: int) -> dict | None:
    q = next((q for q in (c.qv.definition["questions"] if c.qv else []) if q["type"] == "grid"), None)
    if q is None:
        return None
    lists = c.qv.definition.get("lists", {})
    row_defs = q.get("rows") or lists.get(q.get("rows_list", ""), [])
    opts = q.get("options") or lists.get(q.get("options_list", ""), [])
    first, last = opts[0]["value"], opts[-1]["value"]
    out = []
    for rd in row_defs:
        counts: dict[str, int] = defaultdict(int)
        for r in rows:
            v = ((r.answers.get(q["key"]) or {}).get("value") or {})
            if isinstance(v, dict) and rd["value"] in v:
                counts[v[rd["value"]]] += 1
        n = sum(counts.values())
        if n < hide or n == 0:
            continue
        pos, neg = 100 * counts[first] / n, 100 * counts[last] / n
        out.append({"value": rd["value"], "label": rd["label"], "n": n,
                    "positive": round(pos, 1), "negative": round(neg, 1), "balance": round(pos - neg, 1)})
    out.sort(key=lambda x: x["balance"])
    return {"text": q["text"], "positive_label": opts[0]["label"], "negative_label": opts[-1]["label"], "rows": out}


def _by_hood(c: Context, rows: list) -> dict[str, list]:
    groups: dict[str, list] = defaultdict(list)
    for r in rows:
        if r.point_id in c.point_hood:
            groups[c.point_hood[r.point_id][0]].append(r)
    return groups


def _hood_names(c: Context) -> dict[str, str]:
    return {nid: name for nid, name in c.point_hood.values()}


def _hood_stratum(c: Context) -> dict[str, str]:
    return {c.point_hood[p][0]: st for p, st in c.point_stratum.items() if p in c.point_hood}


# --- lista e ficha do bairro ---

@router.get("/campaigns/{cid}/results/neighborhoods")
def neighborhoods(cid: uuid.UUID, user: AuthUser, s: DbSession, period: Period = "all") -> dict:
    c = load_context(cid, user, s, period)
    rows = [r for r in c.rows if c.in_window(r)]
    hide = _min_n()
    city = {i["key"]: _estimate(rows, i, 1) for i in c.indicators}
    names, strata = _hood_names(c), _hood_stratum(c)
    groups = _by_hood(c, rows)
    items = []
    for nid, name in sorted(names.items(), key=lambda x: x[1]):
        hrows = groups.get(nid, [])
        ests = {i["key"]: _estimate(hrows, i, hide) for i in c.indicators}
        items.append({
            "id": nid, "name": name, "stratum": strata.get(nid), "n": len(hrows),
            "indicators": {k: {**e, "differs": _differs(e, city[k])} for k, e in ests.items()},
        })
    return {"period": period, "n": len(rows), "min_cell": hide, "city": city,
            "indicators": [{"key": i["key"], "label": i["label"], "mean": bool(i.get("mean")),
                            "favorable": i.get("favorable", True)} for i in c.indicators],
            "items": items}


@router.get("/campaigns/{cid}/results/neighborhoods/{nid}")
def neighborhood(cid: uuid.UUID, nid: str, user: AuthUser, s: DbSession, period: Period = "all") -> dict:
    c = load_context(cid, user, s, period)
    names = _hood_names(c)
    if nid not in names:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "bairro não encontrado")
    rows = [r for r in c.rows if c.in_window(r)]
    hrows = _by_hood(c, rows).get(nid, [])
    hide = _min_n()
    base = {"id": nid, "name": names[nid], "stratum": _hood_stratum(c).get(nid), "n": len(hrows),
            "period": period, "min_cell": hide}
    if len(hrows) < hide:
        return {**base, "suppressed": True}
    indicators = []
    for i in c.indicators:
        e, city = _estimate(hrows, i, hide), _estimate(rows, i, 1)
        indicators.append({"key": i["key"], "label": i["label"], "mean": bool(i.get("mean")),
                           "favorable": i.get("favorable", True), "value": e, "city": city,
                           "differs": _differs(e, city)})
    sub = Context(**{**c.__dict__, "hide": hide})
    # O bairro já passou do mínimo; dentro dele, o percentual de cada item da lista é parte desse total
    # (como as fatias do balanço), então o item não é ocultado sozinho.
    whole = Context(**{**c.__dict__, "hide": 1})
    rankings = [r for k in (c.campaign.settings or {}).get("rankings", []) if (r := _ranking(whole, hrows, k))]
    return {
        **base,
        "headlines": _hood_headlines(names[nid], indicators),
        "indicators": indicators,
        "balances": [_balance(sub, hrows, b) for b in (c.campaign.settings or {}).get("balances", [])],
        "grid": _grid(c, hrows, hide),
        "rankings": [{**r, "items": [it for it in r["items"] if not it["nonresponse"]][:3]} for r in rankings],
    }


def _hood_headlines(name: str, indicators: list[dict]) -> list[dict]:
    out = []
    for i in indicators:
        if i["differs"]:
            diff = i["value"]["value"] - i["city"]["value"]
            word = "maior" if diff > 0 else "menor"
            out.append({"tone": _tone(diff, i["favorable"]),
                        "text": f"{i['label']}: {_fmt(i['value']['value'], i['mean'])} em {name}, {word} que na cidade "
                                f"({_fmt(i['city']['value'], i['mean'])})."})
    if not out:
        out.append({"tone": "neutral",
                    "text": f"{name} não se diferencia da cidade em nenhum indicador (as diferenças cabem na margem)."})
    return out


# --- resumo em frases para o panorama ---

def headlines(c: Context, ov: dict) -> list[dict]:
    """Até seis frases do que importa no período, a partir do que o panorama já calculou."""
    out: list[dict] = []
    rows = [r for r in c.rows if c.in_window(r)]

    # 1. o balanço principal: quem está à frente
    for b in ov["balances"][:1]:
        if b.get("favorable"):
            f, u = b["favorable"], b["unfavorable"]
            lf, lu = b["labels"]["favorable"].lower(), b["labels"]["unfavorable"].lower()
            if f["low"] <= u["high"] and u["low"] <= f["high"]:
                out.append({"tone": "neutral", "text": f"{b['label']}: empate técnico. {round(f['value'])}% {lf} e "
                                                       f"{round(u['value'])}% {lu}; a diferença cabe na margem."})
            else:
                ahead = f["value"] > u["value"]
                out.append({"tone": "favorable" if ahead else "unfavorable",
                            "text": f"{b['label']}: {round(max(f['value'], u['value']))}% "
                                    f"{lf if ahead else lu}, contra {round(min(f['value'], u['value']))}% "
                                    f"{lu if ahead else lf}."})

    # 2. o que mudou na semana (só o que passa da margem)
    if ov.get("previous"):
        moved = [i for i in ov["indicators"] if i["change"] and i["change"]["beyond_margin"]]
        for i in moved[:2]:
            d = i["change"]["diff"]
            unit = "" if i["mean"] else " pontos"
            amount = f"{abs(d):.1f}".replace(".", ",") if i["mean"] else round(abs(d))
            out.append({"tone": _tone(d, i["favorable"]),
                        "text": f"{i['label']} {'subiu' if d > 0 else 'caiu'} {amount}{unit} em relação à "
                                f"semana anterior."})
        if not moved:
            out.append({"tone": "neutral", "text": "Cenário estável: nenhum indicador mudou além da margem em "
                                                   "relação à semana anterior."})

    # 3. estrato e bairros que se destacam no indicador principal
    main = ov["indicators"][0] if ov["indicators"] else None
    if main and main["current"].get("value") is not None:
        for st, e in main["by_stratum"].items():
            if _differs(e, main["current"]):
                d = e["value"] - main["current"]["value"]
                out.append({"tone": _tone(d, main["favorable"]),
                            "text": f"{main['label']} no estrato {st}: {_fmt(e['value'], main['mean'])}, "
                                    f"{'acima' if d > 0 else 'abaixo'} da cidade ({_fmt(main['current']['value'], main['mean'])})."})
        ind = next(i for i in c.indicators if i["key"] == main["key"])
        names = _hood_names(c)
        diffs = []
        for nid, hrows in _by_hood(c, rows).items():
            e = _estimate(hrows, ind, _min_n())
            if _differs(e, main["current"]):
                diffs.append((e["value"] - main["current"]["value"], names[nid], e["value"]))
        good = sorted([d for d in diffs if _tone(d[0], main["favorable"]) == "favorable"], key=lambda d: -abs(d[0]))
        bad = sorted([d for d in diffs if _tone(d[0], main["favorable"]) == "unfavorable"], key=lambda d: -abs(d[0]))
        if good:
            out.append({"tone": "favorable", "text": "Bairros mais favoráveis à gestão: " + ", ".join(
                f"{n} ({_fmt(v, main['mean'])})" for _, n, v in good[:3]) + "."})
        if bad:
            out.append({"tone": "unfavorable", "text": "Bairros menos favoráveis à gestão: " + ", ".join(
                f"{n} ({_fmt(v, main['mean'])})" for _, n, v in bad[:3]) + "."})

    # 4. a área mais criticada e a prioridade nº 1
    grid = ov.get("grid")
    if grid:
        rated = [r for r in grid["rows"] if r.get("pct")]
        if rated:
            worst = min(rated, key=lambda r: r["balance"])
            neg = grid["options"][2]["value"] if len(grid["options"]) > 2 else None
            if worst["balance"] < 0 and neg:
                out.append({"tone": "unfavorable", "text": f"{worst['label']} é a área mais criticada: "
                                                           f"{round(worst['pct'].get(neg, 0))}% dizem que piorou."})
            best = max(rated, key=lambda r: r["balance"])
            if best["balance"] > 0:
                out.append({"tone": "favorable", "text": f"{best['label']} é a área mais bem avaliada: saldo de "
                                                         f"+{round(best['balance'])} pontos entre melhorou e piorou."})
    for key in (c.campaign.settings or {}).get("rankings", [])[:1]:
        rk = _ranking(c, rows, key)
        top = next((i for i in (rk or {}).get("items", []) if not i["nonresponse"] and i["pct"] is not None), None)
        if top and rk["type"] != "name":
            out.append({"tone": "neutral", "text": f"Prioridade nº 1 apontada pela população: {top['label'].lower()} "
                                                   f"({round(top['pct'])}%)."})
    return out[:7]
