"""Login do painel: senha + TOTP obrigatório para todos (docs/10-seguranca.md), sessão por cookie."""

import hashlib
import hmac
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated

import pyotp
from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from tracking_api import models, security
from tracking_api.config import settings
from tracking_api.db import get_session

COOKIE = "trk_session"
PENDING_MINUTES = 10  # entre senha e código
MAX_TOTP_ATTEMPTS = 5

router = APIRouter(prefix="/api/auth")
DbSession = Annotated[Session, Depends(get_session)]


# --- senha e TOTP ---

def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
    return f"scrypt${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, salt, digest = stored.split("$")
    except ValueError:
        return False
    check = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=2**14, r=8, p=1)
    return hmac.compare_digest(check.hex(), digest)


# Hash de uma senha qualquer, para que e-mail inexistente custe o mesmo tempo que senha errada.
_DUMMY_HASH = hash_password(secrets.token_hex(8))


def new_totp_secret() -> str:
    return pyotp.random_base32()


def totp_uri(secret: str, email: str) -> str:
    return pyotp.TOTP(secret).provisioning_uri(name=email, issuer_name="Tracking")


def audit(s: Session, action: str, user_id: uuid.UUID | None = None, campaign_id: uuid.UUID | None = None, **details):
    s.add(models.AuditLog(user_id=user_id, campaign_id=campaign_id, action=action, details=details))


# --- sessão ---

def _set_cookie(resp: Response, token: str, max_age: int):
    resp.set_cookie(COOKIE, token, max_age=max_age, httponly=True, samesite="strict",
                    secure=settings().cookie_secure, path="/api")


def current_user(s: DbSession, trk_session: Annotated[str | None, Cookie()] = None) -> models.User:
    """Usuário com senha e TOTP conferidos, sessão válida."""
    if not trk_session:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "não autenticado")
    ws = s.get(models.WebSession, security.sha256_hex(trk_session))
    if ws is None or not ws.totp_ok or ws.expires_at < datetime.now(UTC):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "sessão inválida ou expirada")
    user = s.get(models.User, ws.user_id)
    if user is None or not user.active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "usuário inativo")
    return user


AuthUser = Annotated[models.User, Depends(current_user)]


def membership(s: Session, user: models.User, campaign_id: uuid.UUID, roles: tuple[str, ...]) -> models.Membership:
    """Papel do usuário na campanha; 404 se não for membro (não revela que a campanha existe)."""
    m = s.scalar(select(models.Membership).where(
        models.Membership.user_id == user.id, models.Membership.campaign_id == campaign_id))
    if m is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "campanha não encontrada")
    if m.role not in roles:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "sem permissão para esta ação")
    return m


# --- rotas ---

class LoginIn(BaseModel):
    email: str
    password: str


class TotpIn(BaseModel):
    code: str


@router.post("/login")
def login(body: LoginIn, resp: Response, s: DbSession) -> dict:
    user = s.scalar(select(models.User).where(models.User.email == body.email.strip().lower()))
    ok = verify_password(body.password, user.password_hash if user else _DUMMY_HASH)
    if not ok or user is None or not user.active:
        audit(s, "login_failed", user.id if user else None, email=body.email.strip().lower())
        s.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "e-mail ou senha incorretos")
    token = secrets.token_urlsafe(32)
    s.add(models.WebSession(token_hash=security.sha256_hex(token), user_id=user.id,
                            expires_at=datetime.now(UTC) + timedelta(minutes=PENDING_MINUTES)))
    s.commit()
    _set_cookie(resp, token, PENDING_MINUTES * 60)
    return {"totp_required": True}


@router.post("/totp")
def totp(body: TotpIn, resp: Response, s: DbSession, trk_session: Annotated[str | None, Cookie()] = None) -> dict:
    ws = s.get(models.WebSession, security.sha256_hex(trk_session)) if trk_session else None
    if ws is None or ws.totp_ok or ws.expires_at < datetime.now(UTC):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "faça login de novo")
    if ws.totp_attempts >= MAX_TOTP_ATTEMPTS:
        s.delete(ws)
        s.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "tentativas demais: faça login de novo")
    user = s.get(models.User, ws.user_id)
    secret = security.decrypt(user.totp_secret_enc)
    if not pyotp.TOTP(secret).verify(body.code.strip(), valid_window=1):
        ws.totp_attempts += 1
        audit(s, "totp_failed", user.id)
        s.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "código incorreto")
    ws.totp_ok = True
    ws.expires_at = datetime.now(UTC) + timedelta(hours=settings().session_hours)
    audit(s, "login", user.id)
    s.commit()
    _set_cookie(resp, trk_session, settings().session_hours * 3600)
    return {"ok": True}


@router.post("/logout")
def logout(resp: Response, s: DbSession, trk_session: Annotated[str | None, Cookie()] = None) -> dict:
    if trk_session:
        ws = s.get(models.WebSession, security.sha256_hex(trk_session))
        if ws is not None:
            s.delete(ws)
            s.commit()
    resp.delete_cookie(COOKIE, path="/api")
    return {"ok": True}


@router.get("/me")
def me(user: AuthUser, s: DbSession) -> dict:
    rows = s.execute(
        select(models.Membership, models.Campaign)
        .join(models.Campaign, models.Campaign.id == models.Membership.campaign_id)
        .where(models.Membership.user_id == user.id)
    ).all()
    return {
        "id": str(user.id),
        "name": user.name,
        "email": user.email,
        "campaigns": [
            {"id": str(c.id), "name": c.name, "role": m.role,
             "staff": m.role in models.ROLES_STAFF,
             "disclaimer_accepted": m.disclaimer_accepted_at is not None}
            for m, c in rows
        ],
    }
