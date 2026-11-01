"""Confiança e boletim (D29).

- "Como a pesquisa é feita": o método em números do próprio campo (entrevistas, recusas, controle de qualidade,
  bairros cobertos), sem nenhum dado de pessoa: entrevistador entra só como contagem (D18).
- Boletim: a impressão/PDF é feita pelo navegador; aqui só se registra quem gerou e quando (docs/04-legal-lgpd.md:
  registro de acesso para rastrear vazamento).
"""

import statistics
import uuid
from collections import Counter

from fastapi import APIRouter
from sqlalchemy import func, select

from tracking_api import models
from tracking_api.config import settings
from tracking_api.overview import Period, load_context
from tracking_api.panel import ALL, DbSession
from tracking_api.web_auth import AuthUser, audit, membership

router = APIRouter(prefix="/api")


@router.get("/campaigns/{cid}/results/method")
def method(cid: uuid.UUID, user: AuthUser, s: DbSession) -> dict:
    c = load_context(cid, user, s, "all")
    I = models.Interview
    by_status = Counter(dict(s.execute(select(I.status, func.count()).where(I.campaign_id == cid)
                                       .group_by(I.status)).all()))
    excluded = s.scalar(select(func.count()).select_from(I).where(I.campaign_id == cid, I.excluded.is_(True)))
    reviewed = s.scalar(select(func.count(func.distinct(models.QualityFlag.interview_id)))
                        .join(I, I.id == models.QualityFlag.interview_id)
                        .where(I.campaign_id == cid, models.QualityFlag.resolved_at.is_not(None)))
    pending = s.scalar(select(func.count(func.distinct(models.QualityFlag.interview_id)))
                       .join(I, I.id == models.QualityFlag.interview_id)
                       .where(I.campaign_id == cid, models.QualityFlag.resolved_at.is_(None)))
    durations = s.scalars(select(I.duration_s).where(I.campaign_id == cid, I.status == "complete",
                                                     I.excluded.is_(False))).all()
    interviewers = s.scalar(select(func.count(func.distinct(I.interviewer_id))).where(I.campaign_id == cid))
    days = sorted({c.day(r) for r in c.rows})
    hoods = {c.point_hood[r.point_id][0] for r in c.rows if r.point_id in c.point_hood}
    located = sum(1 for r in c.rows if r.lat is not None)
    approached = sum(by_status.values())
    qv = c.qv
    return {
        "first_day": days[0].isoformat() if days else None,
        "last_day": days[-1].isoformat() if days else None,
        "field_days": len(days),
        "approached": approached,
        "complete": len(c.rows),
        "refused": by_status.get("refused", 0),
        "screened_out": by_status.get("screened_out", 0),
        "abandoned": by_status.get("abandoned", 0),
        "excluded": excluded,
        "reviewed": reviewed,
        "pending_review": pending,
        "interviewers": interviewers,
        "neighborhoods": len(hoods),
        "neighborhoods_total": len({nid for nid, _ in c.point_hood.values()}),
        "with_location_pct": round(100 * located / len(c.rows)) if c.rows else None,
        "median_duration_s": int(statistics.median(durations)) if durations else None,
        "min_cell": settings().min_cell,
        "questionnaire": {"title": qv.definition.get("title"), "version": qv.version,
                          "approved_by": qv.approved_by,
                          "approved_at": qv.approved_at.isoformat() if qv.approved_at else None} if qv else None,
        "weighted": False,
    }


@router.post("/campaigns/{cid}/results/report")
def report_generated(cid: uuid.UUID, user: AuthUser, s: DbSession, period: Period = "7d") -> dict:
    """Registra que o boletim foi gerado (para imprimir ou salvar em PDF)."""
    membership(s, user, cid, ALL)
    audit(s, "report_generated", user.id, cid, period=period)
    s.commit()
    return {"ok": True}
