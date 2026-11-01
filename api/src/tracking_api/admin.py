"""Operações da equipe (cadastros, questionário). Usadas pela linha de comando agora e pelo painel depois."""

import json
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from tracking_api import contracts, models, security

# Regras de inconsistência do piloto (docs/03-metodologia.md): avaliação × aprovação.
PILOT_SETTINGS = {
    "quality": {},
    "inconsistent_rules": [
        {"code": "aprova_e_avalia_mal", "condition": {"all": [
            {"key": "G1", "in": ["aprova"]}, {"key": "G2", "in": ["ruim", "pessima"]}]}},
        {"code": "desaprova_e_avalia_bem", "condition": {"all": [
            {"key": "G1", "in": ["desaprova"]}, {"key": "G2", "in": ["otima", "boa"]}]}},
    ],
    # Indicadores-chave do panorama de resultados (overview.py)
    "indicators": [
        {"key": "approval", "label": "Aprova a gestão", "question": "G1", "values": ["aprova"]},
        {"key": "positive", "label": "Avaliação ótima ou boa", "question": "G2", "values": ["otima", "boa"]},
        {"key": "negative", "label": "Avaliação ruim ou péssima", "question": "G2", "values": ["ruim", "pessima"]},
        {"key": "score", "label": "Nota média da gestão", "question": "G3", "mean": True},
        {"key": "continue", "label": "Quer que continue", "question": "E1", "values": ["continuar"]},
        {"key": "change", "label": "Quer mudança", "question": "E1", "values": ["mudar"]},
    ],
    # Cruzamentos, segmentos e rankings (insights.py, D27)
    "segments": {"rows": "G1", "cols": "E1", "names": {
        "aprova|continuar": "Base fiel", "aprova|mudar": "Aprova, mas quer mudança",
        "desaprova|continuar": "Desaprova, mas aceita continuar", "desaprova|mudar": "Oposição"}},
    "rankings": ["G7", "E2"],
    # Mapa agregado (geo.py, D26): lado do hexágono em metros
    "map": {"hex_m": 800},
}

PILOT_STRATA = {
    "Central": ["Centro", "Cangalheiro", "Pau d'Água", "Ipem", "Castelo Branco"],
    "Afastado": ["Salobro", "Fazendinha", "Alto do Ipem", "Caldeirões", "DNER", "Vila Paraíso", "Mutirão"],
}


class AdminError(Exception):
    pass


def create_campaign(s: Session, name: str, municipality_code: str | None = None, settings: dict | None = None):
    c = models.Campaign(name=name, municipality_code=municipality_code, settings=settings or {})
    s.add(c)
    s.flush()
    return c


def add_stratum(s: Session, campaign_id: uuid.UUID, name: str, daily_target: int | None = None):
    st = models.Stratum(campaign_id=campaign_id, name=name, daily_target=daily_target)
    s.add(st)
    s.flush()
    return st


def add_neighborhood(s: Session, campaign_id: uuid.UUID, name: str, stratum_id: uuid.UUID | None = None):
    n = models.Neighborhood(campaign_id=campaign_id, name=name, stratum_id=stratum_id)
    s.add(n)
    s.flush()
    return n


def add_point(s: Session, campaign_id: uuid.UUID, neighborhood_id: uuid.UUID, name: str, kind: str = "flow",
              lat: float | None = None, lng: float | None = None):
    if kind not in ("flow", "door"):
        raise AdminError("kind deve ser flow ou door")
    p = models.Point(campaign_id=campaign_id, neighborhood_id=neighborhood_id, name=name, kind=kind, lat=lat, lng=lng)
    s.add(p)
    s.flush()
    return p


def add_interviewer(s: Session, campaign_id: uuid.UUID, name: str, pin: str):
    i = models.Interviewer(campaign_id=campaign_id, name=name)
    set_interviewer_pin(i, pin)
    s.add(i)
    s.flush()
    return i


def set_interviewer_pin(i: models.Interviewer, pin: str):
    if not (pin.isdigit() and 4 <= len(pin) <= 8):
        raise AdminError("PIN deve ter de 4 a 8 dígitos")
    i.pin_salt, i.pin_hash, i.pin_iterations = security.hash_pin(pin)


def add_device(s: Session, campaign_id: uuid.UUID, label: str, valid_hours: int = 72) -> tuple[models.Device, str]:
    """Cria o aparelho e devolve o código de cadastro (mostrado uma vez; só o hash é guardado)."""
    d = models.Device(campaign_id=campaign_id, label=label)
    s.add(d)
    s.flush()
    return d, new_enrollment_code(s, d, valid_hours)


def new_enrollment_code(s: Session, device: models.Device, valid_hours: int = 72) -> str:
    code = security.new_enrollment_code()
    s.add(models.EnrollmentCode(code_hash=security.sha256_hex(code), device_id=device.id,
                                expires_at=datetime.now(UTC) + timedelta(hours=valid_hours)))
    s.flush()
    return code


def reissue_device_code(s: Session, device_id: uuid.UUID, valid_hours: int = 72) -> str:
    """Novo código para um aparelho existente (token perdido ou revogado por engano).
    Mantém o mesmo device_id, então as entrevistas que ainda estão na fila dele continuam válidas."""
    d = s.get(models.Device, device_id)
    if d is None:
        raise AdminError("aparelho não encontrado")
    d.revoked_at = None
    d.token_hash = None
    return new_enrollment_code(s, d, valid_hours)


def revoke_device(s: Session, device_id: uuid.UUID):
    d = s.get(models.Device, device_id)
    if d is None:
        raise AdminError("aparelho não encontrado")
    d.revoked_at = datetime.now(UTC)
    d.token_hash = None


def load_questionnaire(s: Session, campaign_id: uuid.UUID, definition: dict) -> models.QuestionnaireVersion:
    errors = contracts.questionnaire_errors(definition)
    if errors:
        raise AdminError("questionário inválido:\n- " + "\n- ".join(errors))
    exists = s.scalar(select(models.QuestionnaireVersion).where(
        models.QuestionnaireVersion.campaign_id == campaign_id,
        models.QuestionnaireVersion.qid == definition["id"],
        models.QuestionnaireVersion.version == definition["version"],
    ))
    if exists is not None:
        raise AdminError(f"{definition['id']} v{definition['version']} já existe: versões são imutáveis, crie uma nova")
    qv = models.QuestionnaireVersion(campaign_id=campaign_id, qid=definition["id"], version=definition["version"],
                                     definition=definition)
    s.add(qv)
    s.flush()
    return qv


def approve_questionnaire(s: Session, qv_id: uuid.UUID, approved_by: str):
    qv = s.get(models.QuestionnaireVersion, qv_id)
    if qv is None:
        raise AdminError("versão não encontrada")
    qv.approved_by = approved_by
    qv.approved_at = datetime.now(UTC)


def publish_questionnaire(s: Session, qv_id: uuid.UUID):
    qv = s.get(models.QuestionnaireVersion, qv_id)
    if qv is None:
        raise AdminError("versão não encontrada")
    if qv.approved_at is None:
        raise AdminError("só versão aprovada pelo cliente pode ser publicada (docs/02-arquitetura.md, fluxo 1)")
    qv.published_at = datetime.now(UTC)


def add_user(s: Session, email: str, name: str, password: str, campaign_id: uuid.UUID, role: str) -> tuple[models.User, str]:
    """Usuário do painel com papel numa campanha. Devolve o segredo TOTP (mostrado uma vez, para o app autenticador)."""
    from tracking_api import web_auth  # evita import circular (web_auth usa a configuração do FastAPI)

    if role not in models.ROLES_STAFF + models.ROLES_CLIENT:
        raise AdminError(f"papel inválido; use um de {models.ROLES_STAFF + models.ROLES_CLIENT}")
    if len(password) < 10:
        raise AdminError("senha precisa de ao menos 10 caracteres")
    email = email.strip().lower()
    user = s.scalar(select(models.User).where(models.User.email == email))
    secret = None
    if user is None:
        secret = web_auth.new_totp_secret()
        user = models.User(email=email, name=name, password_hash=web_auth.hash_password(password),
                           totp_secret_enc=security.encrypt(secret))
        s.add(user)
        s.flush()
    if s.scalar(select(models.Membership).where(models.Membership.user_id == user.id,
                                                models.Membership.campaign_id == campaign_id)):
        raise AdminError("usuário já é membro desta campanha")
    s.add(models.Membership(user_id=user.id, campaign_id=campaign_id, role=role))
    s.flush()
    return user, secret


def seed_pilot(s: Session, questionnaire_path: Path) -> models.Campaign:
    """Campanha do piloto de Caxias: estratos, bairros, um ponto por bairro, questionário v1 aprovado e publicado."""
    c = create_campaign(s, "Piloto Caxias 2027", municipality_code="07579", settings=PILOT_SETTINGS)
    for stratum_name, bairros in PILOT_STRATA.items():
        st = add_stratum(s, c.id, stratum_name, daily_target=30)
        for b in bairros:
            n = add_neighborhood(s, c.id, b, st.id)
            add_point(s, c.id, n.id, f"{b} — ponto 1", kind="door")
    qv = load_questionnaire(s, c.id, json.loads(questionnaire_path.read_text(encoding="utf-8")))
    approve_questionnaire(s, qv.id, "responsável (questionário v1 aprovado em 31/10/2026)")
    publish_questionnaire(s, qv.id)
    return c
