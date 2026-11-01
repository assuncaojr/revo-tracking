"""Rotas do painel (equipe e cliente). docs/02-arquitetura.md: o que cada público vê."""

import statistics
import uuid
from collections import Counter, defaultdict
from datetime import UTC, date, datetime, time, timedelta
from typing import Annotated, Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from tracking_api import admin, models
from tracking_api.config import settings
from tracking_api.db import get_session
from tracking_api.web_auth import AuthUser, audit, membership

router = APIRouter(prefix="/api")
DbSession = Annotated[Session, Depends(get_session)]

STAFF = models.ROLES_STAFF
ALL = models.ROLES_STAFF + models.ROLES_CLIENT
CAN_RESOLVE = ("admin", "supervisor")
CAN_APPROVE = ("admin", "client_coord")


def _day_bounds(campaign: models.Campaign, day: date) -> tuple[datetime, datetime]:
    tz = ZoneInfo(campaign.timezone)
    start = datetime.combine(day, time.min, tz)
    return start, start + timedelta(days=1)


def _today(campaign: models.Campaign) -> date:
    return datetime.now(ZoneInfo(campaign.timezone)).date()


def _strata(s: Session, cid: uuid.UUID) -> tuple[dict, dict]:
    """(ponto → nome do estrato, estrato → meta diária)."""
    rows = s.execute(
        select(models.Point.id, models.Stratum.name, models.Stratum.daily_target)
        .join(models.Neighborhood, models.Neighborhood.id == models.Point.neighborhood_id)
        .join(models.Stratum, models.Stratum.id == models.Neighborhood.stratum_id, isouter=True)
        .where(models.Point.campaign_id == cid)
    ).all()
    return {p: (st or "—") for p, st, _ in rows}, {st: t for _, st, t in rows if st}


# --- equipe: campo agora ---

@router.get("/campaigns/{cid}/field/now")
def field_now(cid: uuid.UUID, user: AuthUser, s: DbSession) -> dict:
    membership(s, user, cid, STAFF)
    campaign = s.get(models.Campaign, cid)
    start, end = _day_bounds(campaign, _today(campaign))
    today = s.scalars(select(models.Interview).where(
        models.Interview.campaign_id == cid, models.Interview.started_at >= start, models.Interview.started_at < end))
    today = list(today)
    names = {i.id: i.name for i in s.scalars(select(models.Interviewer).where(models.Interviewer.campaign_id == cid))}
    open_flags = Counter(s.scalars(
        select(models.Interview.interviewer_id)
        .join(models.QualityFlag, models.QualityFlag.interview_id == models.Interview.id)
        .where(models.Interview.campaign_id == cid, models.QualityFlag.resolved_at.is_(None),
               models.Interview.started_at >= start, models.Interview.started_at < end)))

    by_interviewer: dict[uuid.UUID, list[models.Interview]] = defaultdict(list)
    for i in today:
        by_interviewer[i.interviewer_id].append(i)
    interviewers = []
    for iid, items in sorted(by_interviewer.items(), key=lambda kv: names.get(kv[0], "")):
        st = Counter(i.status for i in items)
        complete = [i for i in items if i.status == "complete"]
        answers = [a for i in complete for a in i.answers.values()]
        interviewers.append({
            "id": str(iid),
            "name": names.get(iid, "?"),
            "total": len(items),
            "complete": st["complete"],
            "refused": st["refused"],
            "screened_out": st["screened_out"],
            "abandoned": st["abandoned"],
            "median_duration_s": int(statistics.median(i.duration_s for i in complete)) if complete else None,
            # "Não sabe"/"Não respondeu" sobre todas as respostas: em 2024, o sinal de entrevistador com problema
            "nonresponse_rate": round(sum("nonresponse" in a for a in answers) / len(answers), 3) if answers else None,
            "last_at": max(i.finished_at for i in items).isoformat(),
            "open_flags": open_flags.get(iid, 0),
        })

    counts_by_device = Counter(i.device_id for i in today)
    devices = [
        {"id": str(d.id), "label": d.label, "last_seen_at": d.last_seen_at.isoformat() if d.last_seen_at else None,
         "pending_count": d.pending_count, "battery_pct": d.battery_pct, "app_version": d.app_version,
         "revoked": d.revoked_at is not None, "today": counts_by_device.get(d.id, 0)}
        for d in s.scalars(select(models.Device).where(models.Device.campaign_id == cid).order_by(models.Device.label))
    ]

    point_stratum, targets = _strata(s, cid)
    done = Counter(point_stratum.get(i.point_id, "—") for i in today if i.status == "complete" and not i.excluded)
    strata = [{"name": st, "complete": done.get(st, 0), "target": t} for st, t in sorted(targets.items())]

    return {"day": _today(campaign).isoformat(), "interviewers": interviewers, "devices": devices, "strata": strata,
            "total": len(today)}


# --- equipe: alertas de qualidade ---

@router.get("/campaigns/{cid}/flags")
def flags(cid: uuid.UUID, user: AuthUser, s: DbSession, open_only: bool = True) -> list[dict]:
    membership(s, user, cid, STAFF)
    q = (select(models.QualityFlag, models.Interview, models.Interviewer.name, models.Point.name)
         .join(models.Interview, models.Interview.id == models.QualityFlag.interview_id)
         .join(models.Interviewer, models.Interviewer.id == models.Interview.interviewer_id)
         .join(models.Point, models.Point.id == models.Interview.point_id)
         .where(models.Interview.campaign_id == cid)
         .order_by(models.QualityFlag.created_at.desc()).limit(300))
    if open_only:
        q = q.where(models.QualityFlag.resolved_at.is_(None))
    return [
        {"id": f.id, "code": f.code, "details": f.details, "created_at": f.created_at.isoformat(),
         "resolution": f.resolution, "interview_id": str(i.id), "interviewer": who, "point": point,
         "status": i.status, "started_at": i.started_at.isoformat(), "duration_s": i.duration_s,
         "excluded": i.excluded}
        for f, i, who, point in s.execute(q).all()
    ]


class ResolveIn(BaseModel):
    resolution: Literal["accepted", "excluded"]
    note: str | None = None


@router.post("/flags/{flag_id}/resolve")
def resolve_flag(flag_id: int, body: ResolveIn, user: AuthUser, s: DbSession) -> dict:
    f = s.get(models.QualityFlag, flag_id)
    if f is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "alerta não encontrado")
    interview = s.get(models.Interview, f.interview_id)
    membership(s, user, interview.campaign_id, CAN_RESOLVE)
    f.resolution = body.resolution
    f.resolved_by = user.email
    f.resolved_at = datetime.now(UTC)
    if body.resolution == "excluded":  # sai dos resultados; o dado bruto continua guardado (D7)
        interview.excluded = True
        interview.excluded_reason = f"{f.code}: {body.note or 'excluída na revisão'}"
    audit(s, "flag_resolved", user.id, interview.campaign_id, flag_id=flag_id, code=f.code,
          resolution=body.resolution, interview_id=str(interview.id))
    s.commit()
    return {"ok": True}


# --- equipe e cliente: progresso e resultados ---

@router.get("/campaigns/{cid}/field/progress")
def field_progress(cid: uuid.UUID, user: AuthUser, s: DbSession) -> dict:
    membership(s, user, cid, ALL)
    campaign = s.get(models.Campaign, cid)
    start, end = _day_bounds(campaign, _today(campaign))
    point_stratum, targets = _strata(s, cid)
    base = (select(models.Interview.point_id, func.count())
            .where(models.Interview.campaign_id == cid, models.Interview.status == "complete",
                   models.Interview.excluded.is_(False))
            .group_by(models.Interview.point_id))
    today = Counter()
    total = Counter()
    for p, n in s.execute(base.where(models.Interview.started_at >= start, models.Interview.started_at < end)):
        today[point_stratum.get(p, "—")] += n
    for p, n in s.execute(base):
        total[point_stratum.get(p, "—")] += n
    return {
        "day": _today(campaign).isoformat(),
        "strata": [{"name": st, "today": today.get(st, 0), "target": t, "total": total.get(st, 0)}
                   for st, t in sorted(targets.items())],
        "total": sum(total.values()),
    }


@router.get("/campaigns/{cid}/results")
def results(cid: uuid.UUID, user: AuthUser, s: DbSession,
            day: Annotated[date | None, Query(description="dia (fuso da campanha); vazio = acumulado")] = None) -> dict:
    """Resultado BRUTO (sem ponderação) das perguntas fechadas, total e por estrato.
    Para o cliente, grupos com menos de `min_cell` entrevistas ficam ocultos (docs/10-seguranca.md)."""
    m = membership(s, user, cid, ALL)
    client = m.role in models.ROLES_CLIENT
    if client and m.disclaimer_accepted_at is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "aceite o aviso de que o sistema não garante eleição")
    campaign = s.get(models.Campaign, cid)
    qv = s.scalar(select(models.QuestionnaireVersion)
                  .where(models.QuestionnaireVersion.campaign_id == cid,
                         models.QuestionnaireVersion.published_at.is_not(None))
                  .order_by(models.QuestionnaireVersion.published_at.desc()).limit(1))
    if qv is None:
        return {"n": 0, "questions": []}
    q = select(models.Interview.answers, models.Interview.point_id).where(
        models.Interview.campaign_id == cid, models.Interview.status == "complete",
        models.Interview.excluded.is_(False))
    if day:
        start, end = _day_bounds(campaign, day)
        q = q.where(models.Interview.started_at >= start, models.Interview.started_at < end)
    rows = s.execute(q).all()
    point_stratum, _ = _strata(s, cid)
    min_cell = settings().min_cell
    definition = qv.definition
    lists = definition.get("lists", {})
    nonresp = {n["value"]: n["label"] for n in definition.get("nonresponse", [])}

    def tally(items: list[str | None]) -> dict:
        values = [v for v in items if v is not None]
        n = len(values)
        if client and n < min_cell:
            return {"n": n, "suppressed": True}
        c = Counter(values)
        return {"n": n, "counts": dict(c), "pct": {k: round(100 * v / n, 1) for k, v in c.items()} if n else {}}

    def value_of(a: dict | None, item: str | None = None) -> str | None:
        if a is None:
            return None
        if "nonresponse" in a:
            return a["nonresponse"]
        v = a["value"]
        if item is not None:
            v = v.get(item) if isinstance(v, dict) else None
        return None if v is None or isinstance(v, (list, dict)) else str(v)

    out = []
    for qd in definition["questions"]:
        if qd["type"] not in ("single", "scale", "grid"):
            continue  # abertas, nomes e contato não entram no agregado (abertas: categorização na fase 3)
        opts = qd.get("options") or lists.get(qd.get("options_list", ""), [])
        labels = {o["value"]: o["label"] for o in opts} | nonresp | ({"other": "Outro"} if qd.get("allow_other") else {})
        items = [None]
        if qd["type"] == "grid":
            items = [r["value"] for r in (qd.get("rows") or lists.get(qd.get("rows_list", ""), []))]
            row_labels = {r["value"]: r["label"] for r in (qd.get("rows") or lists.get(qd.get("rows_list", ""), []))}
        for item in items:
            vals = [(value_of(a.get(qd["key"]), item), point_stratum.get(p, "—")) for a, p in rows]
            by_stratum = defaultdict(list)
            for v, st in vals:
                by_stratum[st].append(v)
            out.append({
                "key": qd["key"], "item": item, "type": qd["type"], "role": qd["role"],
                "text": qd["text"] + (f" — {row_labels[item]}" if item else ""),
                "labels": labels,
                "total": tally([v for v, _ in vals]),
                "by_stratum": {st: tally(v) for st, v in sorted(by_stratum.items())},
            })
    return {"n": len(rows), "day": day.isoformat() if day else None, "weighted": False, "questions": out}


# --- questionário: prévia, aprovação, publicação ---

@router.get("/campaigns/{cid}/questionnaires")
def questionnaires(cid: uuid.UUID, user: AuthUser, s: DbSession) -> list[dict]:
    membership(s, user, cid, ALL)
    return [
        {"id": str(qv.id), "qid": qv.qid, "version": qv.version, "title": qv.definition.get("title"),
         "approved_by": qv.approved_by, "approved_at": qv.approved_at.isoformat() if qv.approved_at else None,
         "published_at": qv.published_at.isoformat() if qv.published_at else None, "definition": qv.definition}
        for qv in s.scalars(select(models.QuestionnaireVersion)
                            .where(models.QuestionnaireVersion.campaign_id == cid)
                            .order_by(models.QuestionnaireVersion.created_at.desc()))
    ]


@router.post("/campaigns/{cid}/questionnaires/{qv_id}/approve")
def approve(cid: uuid.UUID, qv_id: uuid.UUID, user: AuthUser, s: DbSession) -> dict:
    membership(s, user, cid, CAN_APPROVE)
    qv = s.get(models.QuestionnaireVersion, qv_id)
    if qv is None or qv.campaign_id != cid:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "versão não encontrada")
    admin.approve_questionnaire(s, qv_id, f"{user.name} <{user.email}>")
    audit(s, "questionnaire_approved", user.id, cid, qv_id=str(qv_id), version=qv.version)
    s.commit()
    return {"ok": True}


@router.post("/campaigns/{cid}/questionnaires/{qv_id}/publish")
def publish(cid: uuid.UUID, qv_id: uuid.UUID, user: AuthUser, s: DbSession) -> dict:
    membership(s, user, cid, ("admin",))
    qv = s.get(models.QuestionnaireVersion, qv_id)
    if qv is None or qv.campaign_id != cid:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "versão não encontrada")
    try:
        admin.publish_questionnaire(s, qv_id)
    except admin.AdminError as e:
        raise HTTPException(status.HTTP_409_CONFLICT, str(e))
    audit(s, "questionnaire_published", user.id, cid, qv_id=str(qv_id), version=qv.version)
    s.commit()
    return {"ok": True}


@router.post("/campaigns/{cid}/disclaimer/accept")
def accept_disclaimer(cid: uuid.UUID, user: AuthUser, s: DbSession) -> dict:
    m = membership(s, user, cid, ALL)
    if m.disclaimer_accepted_at is None:
        m.disclaimer_accepted_at = datetime.now(UTC)
        audit(s, "disclaimer_accepted", user.id, cid)
        s.commit()
    return {"ok": True}
