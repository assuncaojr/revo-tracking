"""Panorama dos resultados (equipe e cliente): indicadores-chave, evolução diária, estratos e grade de áreas.

Resultado BRUTO (sem ponderação, que vem nos scripts da S7). Todo percentual sai com a margem de erro
(intervalo de Wilson, 95%), e a evolução usa a média móvel de 3 dias somando as entrevistas (D15: não
decidir em cima da oscilação de um dia). Para o cliente, grupos com menos de `min_cell` ficam ocultos.

Quais indicadores aparecem é configuração da campanha (`settings.indicators`), não código:
  {"key": "approval", "label": "Aprova a gestão", "question": "G1", "values": ["aprova"]}   → percentual
  {"key": "score", "label": "Nota média", "question": "G3", "mean": true}                    → média
"""

import math
import uuid
from collections import defaultdict
from datetime import date, timedelta
from typing import Annotated, Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from tracking_api import models
from tracking_api.config import settings
from tracking_api.panel import ALL, DbSession, _strata, _today
from tracking_api.web_auth import AuthUser, membership

router = APIRouter(prefix="/api")

Z = 1.96
WINDOW_DAYS = 7
ROLLING_DAYS = 3


def wilson(hits: int, n: int) -> tuple[float, float, float]:
    """Proporção e intervalo de 95% (Wilson: não estoura 0–100% com n pequeno)."""
    p = hits / n
    denom = 1 + Z**2 / n
    center = (p + Z**2 / (2 * n)) / denom
    half = Z * math.sqrt(p * (1 - p) / n + Z**2 / (4 * n**2)) / denom
    return p, max(0.0, center - half), min(1.0, center + half)


class Estimate:
    """Acumula um indicador (percentual ou média) e devolve valor, faixa e n."""

    def __init__(self, mean: bool):
        self.mean = mean
        self.n = 0
        self.total = 0.0
        self.sq = 0.0

    def add(self, x: float):
        self.n += 1
        self.total += x
        self.sq += x * x

    def merge(self, other: "Estimate"):
        self.n += other.n
        self.total += other.total
        self.sq += other.sq

    def out(self, hide_below: int) -> dict:
        if self.n == 0:
            return {"n": 0, "value": None}
        if self.n < hide_below:
            return {"n": self.n, "value": None, "suppressed": True}
        if not self.mean:
            p, lo, hi = wilson(int(self.total), self.n)
            return {"n": self.n, "value": round(100 * p, 1), "low": round(100 * lo, 1), "high": round(100 * hi, 1)}
        m = self.total / self.n
        sd = math.sqrt(max(0.0, self.sq / self.n - m * m) * self.n / max(1, self.n - 1))
        half = Z * sd / math.sqrt(self.n)
        return {"n": self.n, "value": round(m, 2), "low": round(m - half, 2), "high": round(m + half, 2)}


def _observe(ind: dict, answers: dict) -> float | None:
    """Contribuição de uma entrevista: 1/0 (percentual) ou o número (média); None se a pergunta não entra."""
    a = answers.get(ind["question"])
    if a is None:
        return None  # não foi perguntada (condicional) ou interrompida antes
    if ind.get("mean"):
        v = a.get("value")
        return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else None  # NS/NR fora da média
    return 1.0 if a.get("value") in ind["values"] else 0.0  # NS/NR contam na base do percentual


def _changed(cur: dict, prev: dict, mean: bool) -> dict | None:
    """Variação entre janelas e se ela passa da margem (diferença maior que o erro combinado)."""
    if cur.get("value") is None or prev.get("value") is None:
        return None
    se_cur = (cur["high"] - cur["low"]) / (2 * Z)
    se_prev = (prev["high"] - prev["low"]) / (2 * Z)
    diff = cur["value"] - prev["value"]
    return {"diff": round(diff, 2 if mean else 1), "beyond_margin": abs(diff) > Z * math.hypot(se_cur, se_prev)}


@router.get("/campaigns/{cid}/results/overview")
def overview(cid: uuid.UUID, user: AuthUser, s: DbSession,
             period: Annotated[Literal["7d", "all"], Query()] = "7d") -> dict:
    m = membership(s, user, cid, ALL)
    client = m.role in models.ROLES_CLIENT
    if client and m.disclaimer_accepted_at is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "aceite o aviso de que o sistema não garante eleição")
    campaign = s.get(models.Campaign, cid)
    hide = settings().min_cell if client else 1
    tz = ZoneInfo(campaign.timezone)
    today = _today(campaign)
    indicators = (campaign.settings or {}).get("indicators", [])
    qv = s.scalar(select(models.QuestionnaireVersion)
                  .where(models.QuestionnaireVersion.campaign_id == cid,
                         models.QuestionnaireVersion.published_at.is_not(None))
                  .order_by(models.QuestionnaireVersion.published_at.desc()).limit(1))

    rows = s.execute(select(models.Interview.answers, models.Interview.point_id, models.Interview.started_at).where(
        models.Interview.campaign_id == cid, models.Interview.status == "complete",
        models.Interview.excluded.is_(False))).all()
    point_stratum, _ = _strata(s, cid)

    first_day = min((r.started_at.astimezone(tz).date() for r in rows), default=today)
    if period == "7d":
        start = today - timedelta(days=WINDOW_DAYS - 1)
        prev_start, prev_end = start - timedelta(days=WINDOW_DAYS), start
    else:
        start, prev_start, prev_end = first_day, None, None

    # dia × estrato × indicador → estimativa (o resto é soma destas células)
    cells: dict[tuple[date, str, str], Estimate] = {}
    grid_q = next((q for q in (qv.definition["questions"] if qv else []) if q["type"] == "grid"), None)
    grid_counts: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    n_window = 0
    for answers, point_id, started_at in rows:
        day = started_at.astimezone(tz).date()
        stratum = point_stratum.get(point_id, "—")
        in_window = day >= start
        n_window += in_window
        for ind in indicators:
            x = _observe(ind, answers)
            if x is not None:
                cells.setdefault((day, stratum, ind["key"]), Estimate(bool(ind.get("mean")))).add(x)
        if grid_q and in_window and isinstance(grid_v := (answers.get(grid_q["key"]) or {}).get("value"), dict):
            for row, v in grid_v.items():
                grid_counts[row][v] += 1

    def pooled(key: str, mean: bool, days: set[date] | None = None, d0: date | None = None, d1: date | None = None,
               stratum: str | None = None) -> Estimate:
        e = Estimate(mean)
        for (day, st, k), c in cells.items():
            if k != key or (stratum is not None and st != stratum):
                continue
            if (days is not None and day not in days) or (d0 is not None and day < d0) or (d1 is not None and day >= d1):
                continue
            e.merge(c)
        return e

    strata = sorted({st for (_, st, _) in cells})
    all_days = [first_day + timedelta(days=i) for i in range((today - first_day).days + 1)]
    series_days = [d for d in all_days if d >= start]
    out_indicators = []
    for ind in indicators:
        mean = bool(ind.get("mean"))
        cur = pooled(ind["key"], mean, d0=start).out(hide)
        prev = pooled(ind["key"], mean, d0=prev_start, d1=prev_end).out(hide) if prev_start else None
        series = []
        for d in series_days:
            window = {d - timedelta(days=i) for i in range(ROLLING_DAYS)}
            series.append({"day": d.isoformat(), "partial": d == today,
                           "daily": pooled(ind["key"], mean, days={d}).out(hide),
                           "rolling": pooled(ind["key"], mean, days=window).out(hide)})
        out_indicators.append({
            "key": ind["key"], "label": ind["label"], "question": ind["question"], "mean": mean,
            "scale": qv_min_max(qv, ind["question"]) if mean else None,
            "current": cur, "previous": prev, "change": _changed(cur, prev, mean) if prev else None,
            "by_stratum": {st: pooled(ind["key"], mean, d0=start, stratum=st).out(hide) for st in strata},
            "series": series,
        })

    grid = None
    if grid_q:
        lists = qv.definition.get("lists", {})
        row_defs = grid_q.get("rows") or lists.get(grid_q.get("rows_list", ""), [])
        opt_defs = grid_q.get("options") or lists.get(grid_q.get("options_list", ""), [])
        nonresp = {n["value"]: n["label"] for n in qv.definition.get("nonresponse", [])}
        grid_rows = []
        for r in row_defs:
            counts = grid_counts.get(r["value"], {})
            n = sum(counts.values())
            if n < hide:
                grid_rows.append({"value": r["value"], "label": r["label"], "n": n, "suppressed": n > 0})
                continue
            pct = {k: round(100 * v / n, 1) for k, v in counts.items()}
            first, last = opt_defs[0]["value"], opt_defs[-1]["value"]
            grid_rows.append({"value": r["value"], "label": r["label"], "n": n, "pct": pct,
                              "balance": round(pct.get(first, 0) - pct.get(last, 0), 1)})
        grid = {"key": grid_q["key"], "text": grid_q["text"],
                "options": [{"value": o["value"], "label": o["label"]} for o in opt_defs]
                + [{"value": k, "label": v} for k, v in nonresp.items()],
                "rows": sorted(grid_rows, key=lambda r: r.get("balance", -999), reverse=True)}

    return {
        "period": period, "start": start.isoformat(), "today": today.isoformat(),
        "previous": {"start": prev_start.isoformat(), "end": (prev_end - timedelta(days=1)).isoformat()} if prev_start else None,
        "n": n_window, "n_total": len(rows), "weighted": False, "min_cell": settings().min_cell if client else None,
        "strata": strata, "indicators": out_indicators, "grid": grid,
    }


def qv_min_max(qv: models.QuestionnaireVersion | None, key: str) -> list[float] | None:
    q = next((q for q in (qv.definition["questions"] if qv else []) if q["key"] == key), None)
    return [q.get("min", 0), q.get("max", 10)] if q else None
