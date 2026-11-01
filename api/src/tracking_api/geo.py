"""Mapas (D26).

- Mapa de opinião (equipe e cliente): a cidade em hexágonos, cada um com o indicador, margem e n. A agregação
  é feita aqui; nenhuma coordenada de entrevista sai para o cliente. Hexágono abaixo de `min_cell` vai sem valor.
- Mapa de cobertura (só equipe): um ponto por entrevista do dia, para supervisão e qualidade.

Hexágonos "pontudos" numa projeção local equirretangular (erro desprezível na escala de uma cidade).
A origem da grade é fixa por campanha (média das coordenadas arredondada a 0,1°), para os hexágonos não
mudarem de lugar conforme chegam entrevistas.
"""

import math
import statistics
import uuid
from datetime import date

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from tracking_api import models
from tracking_api.config import settings
from tracking_api.overview import Estimate, Period, _observe, load_context
from tracking_api.panel import STAFF, DbSession, _day_bounds, _today
from tracking_api.web_auth import AuthUser, membership

router = APIRouter(prefix="/api")

M_PER_DEG_LAT = 110_540
MAX_ACCURACY_M = 150  # GPS pior que isto não entra no mapa (cai em "sem localização")
MAX_KM_FROM_CENTER = 50  # entrevista longe disto do centro da campanha é erro de GPS (ou aparelho de teste)
HEX_SIZES = (300, 500, 800, 1200)


class HexGrid:
    def __init__(self, lat0: float, lng0: float, size_m: float):
        self.lat0, self.lng0, self.size = lat0, lng0, size_m
        self.m_per_deg_lng = 111_320 * math.cos(math.radians(lat0))

    def _xy(self, lat: float, lng: float) -> tuple[float, float]:
        return (lng - self.lng0) * self.m_per_deg_lng, (lat - self.lat0) * M_PER_DEG_LAT

    def _latlng(self, x: float, y: float) -> list[float]:
        return [round(self.lat0 + y / M_PER_DEG_LAT, 6), round(self.lng0 + x / self.m_per_deg_lng, 6)]

    def cell(self, lat: float, lng: float) -> tuple[int, int]:
        x, y = self._xy(lat, lng)
        q = (math.sqrt(3) / 3 * x - y / 3) / self.size
        r = (2 / 3 * y) / self.size
        # arredondamento em coordenadas cúbicas
        cx, cz = q, r
        cy = -cx - cz
        rx, ry, rz = round(cx), round(cy), round(cz)
        dx, dy, dz = abs(rx - cx), abs(ry - cy), abs(rz - cz)
        if dx > dy and dx > dz:
            rx = -ry - rz
        elif dy <= dz:
            rz = -rx - ry
        return rx, rz

    def center(self, q: int, r: int) -> tuple[float, float]:
        return self.size * math.sqrt(3) * (q + r / 2), self.size * 1.5 * r

    def polygon(self, q: int, r: int) -> list[list[float]]:
        cx, cy = self.center(q, r)
        return [self._latlng(cx + self.size * math.cos(math.radians(60 * i - 30)),
                             cy + self.size * math.sin(math.radians(60 * i - 30))) for i in range(6)]


def _km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    dy = (lat1 - lat2) * M_PER_DEG_LAT
    dx = (lng1 - lng2) * 111_320 * math.cos(math.radians(lat2))
    return math.hypot(dx, dy) / 1000


def _usable(r) -> bool:
    return r.lat is not None and r.lng is not None and (r.accuracy_m is None or r.accuracy_m <= MAX_ACCURACY_M)


@router.get("/campaigns/{cid}/results/map")
def opinion_map(cid: uuid.UUID, user: AuthUser, s: DbSession, period: Period = "7d",
                indicator: str = Query("approval"), size: int | None = Query(None)) -> dict:
    c = load_context(cid, user, s, period)
    ind = c.indicator(indicator)
    cfg = (c.campaign.settings or {}).get("map", {})
    size_m = size or cfg.get("hex_m", 500)
    if size_m not in HEX_SIZES and size_m != cfg.get("hex_m"):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"tamanho do hexágono: {HEX_SIZES}")
    located = [r for r in c.rows if _usable(r)]
    if located:
        # centro pela mediana (um GPS absurdo não o desloca) e fora do mapa o que estiver longe demais dele
        lat_c = statistics.median(r.lat for r in located)
        lng_c = statistics.median(r.lng for r in located)
        located = [r for r in located if _km(r.lat, r.lng, lat_c, lng_c) <= MAX_KM_FROM_CENTER]
    rows = [r for r in located if c.in_window(r)]
    n_window = sum(1 for r in c.rows if c.in_window(r))
    if not located:
        return {"size_m": size_m, "sizes": list(HEX_SIZES), "n": n_window, "n_located": 0, "cells": [], "bounds": None,
                "indicators": [{"key": i["key"], "label": i["label"]} for i in c.indicators],
                "indicator": {"key": ind["key"], "label": ind["label"], "mean": bool(ind.get("mean"))},
                "min_cell": settings().min_cell}
    # origem sobre todo o histórico (não só o período), arredondada: a grade não "anda"
    lat0, lng0 = round(lat_c, 1), round(lng_c, 1)
    grid = HexGrid(lat0, lng0, size_m)
    mean = bool(ind.get("mean"))
    cells: dict[tuple[int, int], Estimate] = {}
    counts: dict[tuple[int, int], int] = {}
    # No mapa o mínimo vale também para a equipe: hexágono de 1 ou 2 entrevistas só pinta ruído (0% ou 100%)
    hide = settings().min_cell
    for r in rows:
        key = grid.cell(r.lat, r.lng)
        counts[key] = counts.get(key, 0) + 1
        if (x := _observe(ind, r.answers)) is not None:
            cells.setdefault(key, Estimate(mean)).add(x)
    out = []
    for key, n in counts.items():
        est = cells.get(key, Estimate(mean)).out(hide)
        if n < hide:
            est = {"n": n, "value": None, "suppressed": True}
        out.append({"id": f"{key[0]}:{key[1]}", "polygon": grid.polygon(*key), "interviews": n, **est})
    lats = [p[0] for cell in out for p in cell["polygon"]]
    lngs = [p[1] for cell in out for p in cell["polygon"]]
    return {
        "size_m": size_m, "sizes": list(HEX_SIZES), "n": n_window, "n_located": len(rows),
        "indicator": {"key": ind["key"], "label": ind["label"], "mean": mean, "scale": _scale(c, ind)},
        "indicators": [{"key": i["key"], "label": i["label"]} for i in c.indicators],
        "min_cell": hide,
        "bounds": [[min(lats), min(lngs)], [max(lats), max(lngs)]] if out else None,
        "cells": sorted(out, key=lambda x: x["id"]),
    }


def _scale(c, ind: dict) -> list[float]:
    if not ind.get("mean"):
        return [0, 100]
    q = c.question(ind["question"]) or {}
    return [q.get("min", 0), q.get("max", 10)]


@router.get("/campaigns/{cid}/field/map")
def coverage_map(cid: uuid.UUID, user: AuthUser, s: DbSession, day: date | None = None) -> dict:
    """Um ponto por entrevista do dia (todas as situações), com alertas abertos, e os pontos de trabalho. Só equipe."""
    membership(s, user, cid, STAFF)
    campaign = s.get(models.Campaign, cid)
    day = day or _today(campaign)
    start, end = _day_bounds(campaign, day)
    I = models.Interview
    rows = s.execute(
        select(I.id, I.lat, I.lng, I.accuracy_m, I.status, I.started_at, I.duration_s, I.excluded,
               models.Interviewer.name, models.Point.name.label("point"))
        .join(models.Interviewer, models.Interviewer.id == I.interviewer_id)
        .join(models.Point, models.Point.id == I.point_id)
        .where(I.campaign_id == cid, I.started_at >= start, I.started_at < end)
        .order_by(I.started_at)).all()
    flags: dict[uuid.UUID, list[str]] = {}
    for iid, code in s.execute(select(models.QualityFlag.interview_id, models.QualityFlag.code).where(
            models.QualityFlag.interview_id.in_([r.id for r in rows]), models.QualityFlag.resolved_at.is_(None))):
        flags.setdefault(iid, []).append(code)
    located = [r for r in rows if r.lat is not None]
    lat_c = statistics.median(r.lat for r in located) if located else 0
    lng_c = statistics.median(r.lng for r in located) if located else 0
    points = s.scalars(select(models.Point).where(models.Point.campaign_id == cid, models.Point.active.is_(True),
                                                  models.Point.lat.is_not(None)))
    return {
        "day": day.isoformat(),
        "total": len(rows),
        "without_location": sum(1 for r in rows if r.lat is None),
        "interviews": [
            {"id": str(r.id), "lat": r.lat, "lng": r.lng, "accuracy_m": r.accuracy_m, "status": r.status,
             "started_at": r.started_at.isoformat(), "duration_s": r.duration_s, "excluded": r.excluded,
             "interviewer": r.name, "point": r.point, "flags": flags.get(r.id, []),
             "far": _km(r.lat, r.lng, lat_c, lng_c) > MAX_KM_FROM_CENTER}
            for r in located
        ],
        "points": [{"id": str(p.id), "name": p.name, "lat": p.lat, "lng": p.lng, "kind": p.kind} for p in points],
    }
