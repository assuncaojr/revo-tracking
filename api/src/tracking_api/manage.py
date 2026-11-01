"""Cadastros pelo painel (D25): entrevistadores, aparelhos, locais, usuários, nova versão do questionário.

Nada se apaga: entrevistas antigas apontam para estes cadastros. Entrevistador e ponto se desativam;
aparelho se revoga; usuário sai da campanha (a conta continua, pode estar em outra).
Toda alteração vai para a auditoria.
"""

import secrets
import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from tracking_api import admin, models, security
from tracking_api.db import get_session
from tracking_api.web_auth import AuthUser, audit, hash_password, membership, new_totp_secret, totp_uri

router = APIRouter(prefix="/api/campaigns/{cid}/manage")
DbSession = Annotated[Session, Depends(get_session)]

ADMIN = ("admin",)
FIELD = ("admin", "supervisor")  # equipe de campo: entrevistadores e aparelhos


def _get(s: Session, model, obj_id, cid: uuid.UUID, what: str):
    obj = s.get(model, obj_id)
    if obj is None or obj.campaign_id != cid:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"{what} não encontrado")
    return obj


def _admin_error(e: admin.AdminError):
    return HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(e))


# --- entrevistadores ---

class InterviewerIn(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    pin: str


class InterviewerPatch(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=100)
    pin: str | None = None
    active: bool | None = None


@router.get("/interviewers")
def interviewers(cid: uuid.UUID, user: AuthUser, s: DbSession) -> list[dict]:
    membership(s, user, cid, FIELD)
    stats = dict(
        (i, (n, last)) for i, n, last in s.execute(
            select(models.Interview.interviewer_id, func.count(), func.max(models.Interview.finished_at))
            .where(models.Interview.campaign_id == cid, models.Interview.status == "complete")
            .group_by(models.Interview.interviewer_id)))
    return [
        {"id": str(i.id), "name": i.name, "active": i.active, "complete": stats.get(i.id, (0, None))[0],
         "last_at": stats[i.id][1].isoformat() if i.id in stats else None}
        for i in s.scalars(select(models.Interviewer).where(models.Interviewer.campaign_id == cid)
                           .order_by(models.Interviewer.active.desc(), models.Interviewer.name))
    ]


@router.post("/interviewers")
def interviewer_add(cid: uuid.UUID, body: InterviewerIn, user: AuthUser, s: DbSession) -> dict:
    membership(s, user, cid, FIELD)
    try:
        i = admin.add_interviewer(s, cid, body.name.strip(), body.pin)
    except admin.AdminError as e:
        raise _admin_error(e)
    audit(s, "interviewer_added", user.id, cid, interviewer_id=str(i.id), name=i.name)
    s.commit()
    return {"id": str(i.id)}


@router.post("/interviewers/{iid}")
def interviewer_update(cid: uuid.UUID, iid: uuid.UUID, body: InterviewerPatch, user: AuthUser, s: DbSession) -> dict:
    """O aparelho recebe o nome, o PIN novo e a desativação no próximo bootstrap (ao abrir o app com rede)."""
    membership(s, user, cid, FIELD)
    i = _get(s, models.Interviewer, iid, cid, "entrevistador")
    if body.name is not None:
        i.name = body.name.strip()
    if body.pin is not None:
        try:
            admin.set_interviewer_pin(i, body.pin)
        except admin.AdminError as e:
            raise _admin_error(e)
    if body.active is not None:
        i.active = body.active
    audit(s, "interviewer_updated", user.id, cid, interviewer_id=str(iid),
          **body.model_dump(exclude_none=True, exclude={"pin"}), pin_changed=body.pin is not None)
    s.commit()
    return {"ok": True}


# --- aparelhos ---

class DeviceIn(BaseModel):
    label: str = Field(min_length=2, max_length=50)


@router.get("/devices")
def devices(cid: uuid.UUID, user: AuthUser, s: DbSession) -> list[dict]:
    membership(s, user, cid, FIELD)
    pending_code = set(s.scalars(
        select(models.EnrollmentCode.device_id).where(models.EnrollmentCode.used_at.is_(None),
                                                      models.EnrollmentCode.expires_at > func.now())))
    return [
        {"id": str(d.id), "label": d.label, "model": d.model, "app_version": d.app_version,
         "enrolled_at": d.enrolled_at.isoformat() if d.enrolled_at else None,
         "revoked_at": d.revoked_at.isoformat() if d.revoked_at else None,
         "last_seen_at": d.last_seen_at.isoformat() if d.last_seen_at else None,
         "pending_count": d.pending_count, "battery_pct": d.battery_pct,
         "active": d.token_hash is not None and d.revoked_at is None,
         "awaiting_enrollment": d.id in pending_code}
        for d in s.scalars(select(models.Device).where(models.Device.campaign_id == cid).order_by(models.Device.label))
    ]


@router.post("/devices")
def device_add(cid: uuid.UUID, body: DeviceIn, user: AuthUser, s: DbSession) -> dict:
    membership(s, user, cid, FIELD)
    d, code = admin.add_device(s, cid, body.label.strip())
    audit(s, "device_added", user.id, cid, device_id=str(d.id), label=d.label)
    s.commit()
    return {"id": str(d.id), "code": code, "valid_hours": 72}


@router.post("/devices/{did}/code")
def device_code(cid: uuid.UUID, did: uuid.UUID, user: AuthUser, s: DbSession) -> dict:
    """Novo código para o mesmo aparelho: a fila que estiver nele continua valendo."""
    membership(s, user, cid, FIELD)
    _get(s, models.Device, did, cid, "aparelho")
    code = admin.reissue_device_code(s, did)
    audit(s, "device_code_issued", user.id, cid, device_id=str(did))
    s.commit()
    return {"code": code, "valid_hours": 72}


@router.post("/devices/{did}/revoke")
def device_revoke(cid: uuid.UUID, did: uuid.UUID, user: AuthUser, s: DbSession) -> dict:
    membership(s, user, cid, FIELD)
    _get(s, models.Device, did, cid, "aparelho")
    admin.revoke_device(s, did)
    audit(s, "device_revoked", user.id, cid, device_id=str(did))
    s.commit()
    return {"ok": True}


# --- locais: estratos, bairros, pontos ---

class StratumIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    daily_target: int | None = Field(default=None, ge=0)


class NeighborhoodIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    stratum_id: uuid.UUID | None = None


class PointIn(BaseModel):
    neighborhood_id: uuid.UUID
    name: str = Field(min_length=1, max_length=150)
    kind: Literal["flow", "door"] = "flow"
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    active: bool = True


@router.get("/places")
def places(cid: uuid.UUID, user: AuthUser, s: DbSession) -> dict:
    membership(s, user, cid, ADMIN)
    def of(model):
        return s.scalars(select(model).where(model.campaign_id == cid).order_by(model.name))

    return {
        "strata": [{"id": str(x.id), "name": x.name, "daily_target": x.daily_target} for x in of(models.Stratum)],
        "neighborhoods": [{"id": str(x.id), "name": x.name, "stratum_id": str(x.stratum_id) if x.stratum_id else None}
                          for x in of(models.Neighborhood)],
        "points": [{"id": str(x.id), "name": x.name, "neighborhood_id": str(x.neighborhood_id), "kind": x.kind,
                    "lat": x.lat, "lng": x.lng, "active": x.active} for x in of(models.Point)],
    }


@router.post("/strata")
def stratum_add(cid: uuid.UUID, body: StratumIn, user: AuthUser, s: DbSession) -> dict:
    membership(s, user, cid, ADMIN)
    st = admin.add_stratum(s, cid, body.name.strip(), body.daily_target)
    audit(s, "stratum_added", user.id, cid, stratum_id=str(st.id), **body.model_dump())
    s.commit()
    return {"id": str(st.id)}


@router.post("/strata/{sid}")
def stratum_update(cid: uuid.UUID, sid: uuid.UUID, body: StratumIn, user: AuthUser, s: DbSession) -> dict:
    membership(s, user, cid, ADMIN)
    st = _get(s, models.Stratum, sid, cid, "estrato")
    st.name, st.daily_target = body.name.strip(), body.daily_target
    audit(s, "stratum_updated", user.id, cid, stratum_id=str(sid), **body.model_dump())
    s.commit()
    return {"ok": True}


def _check_stratum(s: Session, cid: uuid.UUID, sid: uuid.UUID | None):
    if sid is not None:
        _get(s, models.Stratum, sid, cid, "estrato")


@router.post("/neighborhoods")
def neighborhood_add(cid: uuid.UUID, body: NeighborhoodIn, user: AuthUser, s: DbSession) -> dict:
    membership(s, user, cid, ADMIN)
    _check_stratum(s, cid, body.stratum_id)
    n = admin.add_neighborhood(s, cid, body.name.strip(), body.stratum_id)
    audit(s, "neighborhood_added", user.id, cid, neighborhood_id=str(n.id), **body.model_dump(mode="json"))
    s.commit()
    return {"id": str(n.id)}


@router.post("/neighborhoods/{nid}")
def neighborhood_update(cid: uuid.UUID, nid: uuid.UUID, body: NeighborhoodIn, user: AuthUser, s: DbSession) -> dict:
    """Trocar o bairro de estrato muda também os resultados e o progresso já calculados (são lidos na hora)."""
    membership(s, user, cid, ADMIN)
    n = _get(s, models.Neighborhood, nid, cid, "bairro")
    _check_stratum(s, cid, body.stratum_id)
    n.name, n.stratum_id = body.name.strip(), body.stratum_id
    audit(s, "neighborhood_updated", user.id, cid, neighborhood_id=str(nid), **body.model_dump(mode="json"))
    s.commit()
    return {"ok": True}


@router.post("/points")
def point_add(cid: uuid.UUID, body: PointIn, user: AuthUser, s: DbSession) -> dict:
    membership(s, user, cid, ADMIN)
    _get(s, models.Neighborhood, body.neighborhood_id, cid, "bairro")
    p = admin.add_point(s, cid, body.neighborhood_id, body.name.strip(), body.kind, body.lat, body.lng)
    p.active = body.active
    audit(s, "point_added", user.id, cid, point_id=str(p.id), **body.model_dump(mode="json"))
    s.commit()
    return {"id": str(p.id)}


@router.post("/points/{pid}")
def point_update(cid: uuid.UUID, pid: uuid.UUID, body: PointIn, user: AuthUser, s: DbSession) -> dict:
    membership(s, user, cid, ADMIN)
    p = _get(s, models.Point, pid, cid, "ponto")
    _get(s, models.Neighborhood, body.neighborhood_id, cid, "bairro")
    p.neighborhood_id, p.name, p.kind = body.neighborhood_id, body.name.strip(), body.kind
    p.lat, p.lng, p.active = body.lat, body.lng, body.active
    audit(s, "point_updated", user.id, cid, point_id=str(pid), **body.model_dump(mode="json"))
    s.commit()
    return {"ok": True}


# --- usuários do painel ---

class MemberIn(BaseModel):
    email: str = Field(min_length=3, max_length=200, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    name: str = Field(min_length=2, max_length=200)
    role: Literal["admin", "supervisor", "analyst", "client_coord", "client_reader"]


class RoleIn(BaseModel):
    role: Literal["admin", "supervisor", "analyst", "client_coord", "client_reader"]


def _credentials(user: models.User, password: str, secret: str) -> dict:
    """Mostradas uma única vez, para quem cadastrou entregar à pessoa."""
    return {"email": user.email, "password": password, "totp_secret": secret, "totp_uri": totp_uri(secret, user.email)}


def _admins_left(s: Session, cid: uuid.UUID, without: int) -> int:
    return s.scalar(select(func.count()).select_from(models.Membership).where(
        models.Membership.campaign_id == cid, models.Membership.role == "admin", models.Membership.id != without))


@router.get("/members")
def members(cid: uuid.UUID, user: AuthUser, s: DbSession) -> list[dict]:
    membership(s, user, cid, ADMIN)
    rows = s.execute(select(models.Membership, models.User)
                     .join(models.User, models.User.id == models.Membership.user_id)
                     .where(models.Membership.campaign_id == cid).order_by(models.User.name)).all()
    last_login = dict(s.execute(
        select(models.AuditLog.user_id, func.max(models.AuditLog.at))
        .where(models.AuditLog.action == "login", models.AuditLog.user_id.in_([u.id for _, u in rows]))
        .group_by(models.AuditLog.user_id)).all())
    return [
        {"id": m.id, "user_id": str(u.id), "name": u.name, "email": u.email, "role": m.role,
         "active": u.active, "is_me": u.id == user.id,
         "disclaimer_accepted_at": m.disclaimer_accepted_at.isoformat() if m.disclaimer_accepted_at else None,
         "last_login_at": last_login[u.id].isoformat() if u.id in last_login else None}
        for m, u in rows
    ]


@router.post("/members")
def member_add(cid: uuid.UUID, body: MemberIn, user: AuthUser, s: DbSession) -> dict:
    """Pessoa nova: cria a conta com senha provisória e chave do autenticador (mostradas uma vez).
    Pessoa que já tem conta (outra campanha): só ganha o papel nesta; continua com a senha e o autenticador dela."""
    membership(s, user, cid, ADMIN)
    password = secrets.token_urlsafe(9)
    try:
        u, secret = admin.add_user(s, body.email, body.name.strip(), password, cid, body.role)
    except admin.AdminError as e:
        raise _admin_error(e)
    audit(s, "member_added", user.id, cid, member_user_id=str(u.id), email=u.email, role=body.role,
          new_account=secret is not None)
    s.commit()
    return {"user_id": str(u.id), "credentials": _credentials(u, password, secret) if secret else None}


@router.post("/members/{mid}/role")
def member_role(cid: uuid.UUID, mid: int, body: RoleIn, user: AuthUser, s: DbSession) -> dict:
    membership(s, user, cid, ADMIN)
    m = _get(s, models.Membership, mid, cid, "membro")
    if m.role == "admin" and body.role != "admin" and _admins_left(s, cid, m.id) == 0:
        raise HTTPException(status.HTTP_409_CONFLICT, "a campanha ficaria sem administrador")
    old, m.role = m.role, body.role
    audit(s, "member_role_changed", user.id, cid, member_user_id=str(m.user_id), old=old, new=body.role)
    s.commit()
    return {"ok": True}


@router.post("/members/{mid}/remove")
def member_remove(cid: uuid.UUID, mid: int, user: AuthUser, s: DbSession) -> dict:
    """Tira da campanha e encerra as sessões abertas da pessoa. A conta e a auditoria ficam."""
    membership(s, user, cid, ADMIN)
    m = _get(s, models.Membership, mid, cid, "membro")
    if m.user_id == user.id:
        raise HTTPException(status.HTTP_409_CONFLICT, "você não pode tirar a si mesmo")
    if m.role == "admin" and _admins_left(s, cid, m.id) == 0:
        raise HTTPException(status.HTTP_409_CONFLICT, "a campanha ficaria sem administrador")
    s.query(models.WebSession).filter(models.WebSession.user_id == m.user_id).delete()
    audit(s, "member_removed", user.id, cid, member_user_id=str(m.user_id), role=m.role)
    s.delete(m)
    s.commit()
    return {"ok": True}


@router.post("/members/{mid}/reset")
def member_reset(cid: uuid.UUID, mid: int, user: AuthUser, s: DbSession) -> dict:
    """Senha provisória e autenticador novos (celular perdido, senha esquecida). Derruba as sessões abertas.
    Só para quem não é membro de outra campanha: lá, outro administrador responde pela pessoa."""
    membership(s, user, cid, ADMIN)
    m = _get(s, models.Membership, mid, cid, "membro")
    if m.user_id == user.id:
        raise HTTPException(status.HTTP_409_CONFLICT, "para trocar o seu acesso, peça a outro administrador")
    others = s.scalar(select(func.count()).select_from(models.Membership).where(
        models.Membership.user_id == m.user_id, models.Membership.campaign_id != cid))
    if others:
        raise HTTPException(status.HTTP_409_CONFLICT, "essa pessoa também está em outra campanha; o acesso dela é refeito por linha de comando")
    u = s.get(models.User, m.user_id)
    password, secret = secrets.token_urlsafe(9), new_totp_secret()
    u.password_hash = hash_password(password)
    u.totp_secret_enc = security.encrypt(secret)
    s.query(models.WebSession).filter(models.WebSession.user_id == u.id).delete()
    audit(s, "member_access_reset", user.id, cid, member_user_id=str(u.id))
    s.commit()
    return {"credentials": _credentials(u, password, secret)}


# --- questionário: nova versão ---

@router.post("/questionnaires")
def questionnaire_upload(cid: uuid.UUID, definition: dict, user: AuthUser, s: DbSession) -> dict:
    """Carrega uma versão nova (validada contra o contrato). Ela ainda precisa da aprovação do cliente
    e da publicação pelo admin, na aba Questionário."""
    membership(s, user, cid, ADMIN)
    try:
        qv = admin.load_questionnaire(s, cid, definition)
    except admin.AdminError as e:
        raise _admin_error(e)
    audit(s, "questionnaire_loaded", user.id, cid, qv_id=str(qv.id), qid=qv.qid, version=qv.version)
    s.commit()
    return {"id": str(qv.id), "qid": qv.qid, "version": qv.version}
