"""Cruzamentos, segmentos e rankings (D27). Mesmas regras do panorama: bruto, com margem, e o cliente
não vê grupo com menos de `min_cell` entrevistas (docs/10-seguranca.md: nada de identificar por eliminação).

Configuração da campanha (`settings`), além de `indicators`:
  "segments": {"rows": "G1", "cols": "E1"}          → matriz de segmentos (ex.: aprovação × continuidade)
  "rankings": ["G7", "E2"]                            → listas ordenadas (prioridade, lembrança espontânea)
As dimensões dos cruzamentos saem do questionário: perguntas de perfil, cota e voto passado, a faixa
etária derivada e o estrato.
"""

import uuid
from collections import Counter, defaultdict

from fastapi import APIRouter, Query

from tracking_api.overview import Context, Estimate, Period, _observe, load_context, wilson
from tracking_api.panel import DbSession
from tracking_api.web_auth import AuthUser

router = APIRouter(prefix="/api")

DIMENSION_ROLES = ("vote_past", "quota", "profile")
OTHER = "_other"


def _labels(c: Context, q: dict) -> dict[str, str]:
    lists = c.qv.definition.get("lists", {}) if c.qv else {}
    opts = q.get("options") or lists.get(q.get("options_list") or q.get("list") or "", [])
    nonresp = {n["value"]: n["label"] for n in (c.qv.definition.get("nonresponse", []) if c.qv else [])}
    return {o["value"]: o["label"] for o in opts} | nonresp


def _nonresponse(c: Context) -> set[str]:
    return {n["value"] for n in (c.qv.definition.get("nonresponse", []) if c.qv else [])}


def _value(a: dict | None) -> str | None:
    if a is None:
        return None
    if "nonresponse" in a:
        return a["nonresponse"]
    v = a.get("value")
    return None if isinstance(v, (list, dict)) else str(v)


def dimensions(c: Context) -> list[dict]:
    """Dimensões de cruzamento: [{key, label, labels, of(row) → valor}] na ordem de leitura (voto passado primeiro)."""
    out = []
    questions = c.qv.definition["questions"] if c.qv else []
    vote = [q for q in questions if q["role"] == "vote_past" and q["type"] == "single"]
    for q in vote:
        out.append({"key": q["key"], "label": "Voto na última eleição", "labels": _labels(c, q),
                    "of": lambda r, k=q["key"]: _value(r.answers.get(k))})
    out.append({"key": "stratum", "label": "Estrato", "labels": {},
                "of": lambda r: c.point_stratum.get(r.point_id, "—")})
    for q in questions:
        if q["role"] in ("quota", "profile") and q["type"] == "single":
            labels = _labels(c, q)
            out.append({"key": q["key"], "label": q["text"], "labels": labels,
                        "of": lambda r, k=q["key"], ok=set(labels): (v if (v := _value(r.answers.get(k))) in ok else OTHER)
                        if r.answers.get(k) is not None else None})
        if q.get("derive"):
            d = q["derive"]
            out.append({"key": d["key"], "label": "Faixa etária", "labels": {b[2]: b[2] for b in d["bins"]},
                        "of": lambda r, k=d["key"]: (r.derived or {}).get(k)})
    return out


def _ordered(groups: dict[str, Estimate], labels: dict[str, str]) -> list[str]:
    known = [v for v in labels if v in groups]
    rest = sorted(v for v in groups if v not in labels)
    return known + rest


@router.get("/campaigns/{cid}/results/insights")
def insights(cid: uuid.UUID, user: AuthUser, s: DbSession, period: Period = "7d",
             indicator: str = Query("approval")) -> dict:
    c = load_context(cid, user, s, period)
    rows = [r for r in c.rows if c.in_window(r)]
    cfg = c.campaign.settings or {}
    return {
        "period": period, "start": c.start.isoformat(), "n": len(rows), "weighted": False,
        "min_cell": c.hide if c.client else None,
        "indicators": [{"key": i["key"], "label": i["label"]} for i in c.indicators],
        "crosstab": _crosstab(c, rows, c.indicator(indicator)) if c.indicators else None,
        "segments": _segments(c, rows, cfg["segments"]) if cfg.get("segments") else None,
        "rankings": [r for k in cfg.get("rankings", []) if (r := _ranking(c, rows, k))],
    }


def _crosstab(c: Context, rows: list, ind: dict) -> dict:
    mean = bool(ind.get("mean"))
    total = Estimate(mean)
    for r in rows:
        if (x := _observe(ind, r.answers)) is not None:
            total.add(x)
    dims = []
    for d in dimensions(c):
        groups: dict[str, Estimate] = defaultdict(lambda: Estimate(mean))
        for r in rows:
            g = d["of"](r)
            if g is None or (x := _observe(ind, r.answers)) is None:
                continue
            groups[g].add(x)
        labels = d["labels"] | {OTHER: "Outro"}
        dims.append({"key": d["key"], "label": d["label"], "groups": [
            {"group": g, "label": labels.get(g, g), **groups[g].out(c.hide)} for g in _ordered(groups, labels)]})
    return {"indicator": {"key": ind["key"], "label": ind["label"], "mean": mean,
                          "favorable": ind.get("favorable", True)},
            "total": total.out(c.hide), "dimensions": dims}


def _segments(c: Context, rows: list, cfg: dict) -> dict | None:
    qr, qc = c.question(cfg["rows"]), c.question(cfg["cols"])
    if qr is None or qc is None:
        return None
    # Só quem respondeu as duas com uma opção: não-resposta fica fora da matriz (e é contada à parte)
    lr, lc = _labels(c, qr), _labels(c, qc)
    nonresp = _nonresponse(c)
    counts: Counter = Counter()
    left_out = 0
    for r in rows:
        a, b = _value(r.answers.get(qr["key"])), _value(r.answers.get(qc["key"]))
        if a is None or b is None:
            continue
        if a in nonresp or b in nonresp:
            left_out += 1
        else:
            counts[(a, b)] += 1
    n = sum(counts.values())
    rvals = [v for v in lr if any(k[0] == v for k in counts)]
    cvals = [v for v in lc if any(k[1] == v for k in counts)]

    def cell(k: int) -> dict:
        if k < c.hide:
            return {"n": k, "pct": None, "suppressed": k > 0}
        return {"n": k, "pct": round(100 * k / n, 1)}

    return {
        "n": n, "left_out": left_out, "names": cfg.get("names", {}), "tones": cfg.get("tones", {}), "rows": {"key": qr["key"], "text": qr["text"], "values": [{"value": v, "label": lr[v]} for v in rvals]},
        "cols": {"key": qc["key"], "text": qc["text"], "values": [{"value": v, "label": lc[v]} for v in cvals]},
        "cells": {f"{a}|{b}": cell(counts[(a, b)]) for a in rvals for b in cvals},
        "row_totals": {a: cell(sum(counts[(a, b)] for b in cvals)) for a in rvals},
        "col_totals": {b: cell(sum(counts[(a, b)] for a in rvals)) for b in cvals},
    }


def _ranking(c: Context, rows: list, key: str) -> dict | None:
    """Lista ordenada de uma pergunta de escolha ou de nome. Nome digitado fora da lista vira "outros nomes":
    texto livre não sai para o cliente (pode carregar identificação)."""
    q = c.question(key)
    if q is None:
        return None
    labels = _labels(c, q)
    nonresp = _nonresponse(c)
    counts: Counter = Counter()
    by_stratum: dict[str, Counter] = defaultdict(Counter)
    for r in rows:
        v = _value(r.answers.get(key))
        if v is None:
            continue
        if v not in labels:
            v = OTHER
        counts[v] += 1
        by_stratum[c.point_stratum.get(r.point_id, "—")][v] += 1
    n = sum(counts.values())
    if n == 0:
        return {"key": key, "text": q["text"], "type": q["type"], "n": 0, "items": []}
    other_label = "Outros nomes" if q["type"] == "name" else "Outro"
    items = []
    for v, k in counts.most_common():
        hidden = k < c.hide
        p, lo, hi = wilson(k, n)
        items.append({
            "value": v, "label": labels.get(v, other_label), "n": k, "nonresponse": v in nonresp,
            **({"pct": None, "suppressed": True} if hidden else
               {"pct": round(100 * p, 1), "low": round(100 * lo, 1), "high": round(100 * hi, 1)}),
            "by_stratum": {st: (None if (cnt := by_stratum[st][v]) < c.hide or sum(by_stratum[st].values()) < c.hide
                                else round(100 * cnt / sum(by_stratum[st].values()), 1))
                           for st in sorted(by_stratum)},
        })
    # não-resposta vai para o fim, sem disputar posição
    items.sort(key=lambda i: (i["nonresponse"], -i["n"]))
    return {"key": key, "text": q["text"], "type": q["type"], "n": n, "items": items,
            "strata": sorted(by_stratum)}
