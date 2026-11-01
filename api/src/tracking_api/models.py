"""Modelo de dados (docs/14-especificacao-tecnica.md §5).

Toda tabela de campanha tem `campaign_id` desde o início (D10), mesmo com um cliente só.
Usuários da equipe/cliente, auditoria e dados do TSE entram na semana do painel.
"""

import uuid
from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


def _uuid() -> Mapped[uuid.UUID]:
    return mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)


def _campaign_fk() -> Mapped[uuid.UUID]:
    return mapped_column(ForeignKey("campaign.id"), index=True)


def _now() -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), server_default=func.now())


class Campaign(Base):
    __tablename__ = "campaign"
    id: Mapped[uuid.UUID] = _uuid()
    name: Mapped[str] = mapped_column(String(200))
    municipality_code: Mapped[str | None] = mapped_column(String(10))  # código TSE
    timezone: Mapped[str] = mapped_column(String(64), default="America/Fortaleza")
    # Limiares de qualidade e regras de inconsistência (docs/03-metodologia.md): configuração, não código.
    settings: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = _now()


class Stratum(Base):
    __tablename__ = "stratum"
    id: Mapped[uuid.UUID] = _uuid()
    campaign_id: Mapped[uuid.UUID] = _campaign_fk()
    name: Mapped[str] = mapped_column(String(100))
    daily_target: Mapped[int | None] = mapped_column(Integer)


class Neighborhood(Base):
    __tablename__ = "neighborhood"
    id: Mapped[uuid.UUID] = _uuid()
    campaign_id: Mapped[uuid.UUID] = _campaign_fk()
    stratum_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("stratum.id"))
    name: Mapped[str] = mapped_column(String(100))


class Point(Base):
    __tablename__ = "point"
    id: Mapped[uuid.UUID] = _uuid()
    campaign_id: Mapped[uuid.UUID] = _campaign_fk()
    neighborhood_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("neighborhood.id"))
    name: Mapped[str] = mapped_column(String(150))
    kind: Mapped[str] = mapped_column(String(10), default="flow")  # flow | door
    lat: Mapped[float | None] = mapped_column(Float)
    lng: Mapped[float | None] = mapped_column(Float)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class QuestionnaireVersion(Base):
    """Versão de questionário. Imutável depois de publicada."""

    __tablename__ = "questionnaire_version"
    __table_args__ = (UniqueConstraint("campaign_id", "qid", "version"),)
    id: Mapped[uuid.UUID] = _uuid()
    campaign_id: Mapped[uuid.UUID] = _campaign_fk()
    qid: Mapped[str] = mapped_column(String(100))
    version: Mapped[int] = mapped_column(Integer)
    definition: Mapped[dict] = mapped_column(JSONB)
    approved_by: Mapped[str | None] = mapped_column(String(200))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = _now()


class Device(Base):
    __tablename__ = "device"
    id: Mapped[uuid.UUID] = _uuid()
    campaign_id: Mapped[uuid.UUID] = _campaign_fk()
    label: Mapped[str] = mapped_column(String(50))  # ex.: "A14-03"
    model: Mapped[str | None] = mapped_column(String(100))
    imei: Mapped[str | None] = mapped_column(String(20))
    token_hash: Mapped[str | None] = mapped_column(String(64), unique=True)
    enrolled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    pending_count: Mapped[int | None] = mapped_column(Integer)
    battery_pct: Mapped[int | None] = mapped_column(Integer)
    app_version: Mapped[str | None] = mapped_column(String(20))


class EnrollmentCode(Base):
    """Código de uso único para cadastrar um aparelho (gerado pela equipe)."""

    __tablename__ = "enrollment_code"
    code_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    device_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("device.id"))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Interviewer(Base):
    __tablename__ = "interviewer"
    id: Mapped[uuid.UUID] = _uuid()
    campaign_id: Mapped[uuid.UUID] = _campaign_fk()
    name: Mapped[str] = mapped_column(String(100))
    # PIN verificado offline no aparelho (PBKDF2-SHA256); o hash vai no bootstrap.
    pin_salt: Mapped[str] = mapped_column(String(64))
    pin_hash: Mapped[str] = mapped_column(String(128))
    pin_iterations: Mapped[int] = mapped_column(Integer)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class FieldSession(Base):
    """Turno de um entrevistador num aparelho. Criado no aparelho (offline); o núcleo registra ao receber."""

    __tablename__ = "field_session"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    device_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("device.id"), index=True)
    interviewer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("interviewer.id"), index=True)
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Interview(Base):
    __tablename__ = "interview"
    __table_args__ = (Index("ix_interview_interviewer_started", "interviewer_id", "started_at"),)
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)  # gerado no aparelho (D3)
    campaign_id: Mapped[uuid.UUID] = _campaign_fk()
    questionnaire_version_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("questionnaire_version.id"))
    device_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("device.id"), index=True)
    interviewer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("interviewer.id"))
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("field_session.id"))
    point_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("point.id"), index=True)
    approach: Mapped[str] = mapped_column(String(10))
    status: Mapped[str] = mapped_column(String(20), index=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    finished_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    duration_s: Mapped[int] = mapped_column(Integer)
    lat: Mapped[float | None] = mapped_column(Float)
    lng: Mapped[float | None] = mapped_column(Float)
    accuracy_m: Mapped[float | None] = mapped_column(Float)
    answers: Mapped[dict] = mapped_column(JSONB)
    derived: Mapped[dict | None] = mapped_column(JSONB)
    client: Mapped[dict] = mapped_column(JSONB)
    received_at: Mapped[datetime] = _now()
    excluded: Mapped[bool] = mapped_column(Boolean, default=False)
    excluded_reason: Mapped[str | None] = mapped_column(Text)


class Answer(Base):
    """Respostas em formato longo (D5): uma linha por valor (por linha de grade, por item de múltipla)."""

    __tablename__ = "answer"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    interview_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("interview.id", ondelete="CASCADE"), index=True)
    question_key: Mapped[str] = mapped_column(String(50), index=True)
    item_key: Mapped[str | None] = mapped_column(String(50))
    value: Mapped[str | None] = mapped_column(Text)
    raw_text: Mapped[str | None] = mapped_column(Text)
    nonresponse: Mapped[str | None] = mapped_column(String(20))
    shown_position: Mapped[int | None] = mapped_column(Integer)


class Contact(Base):
    """Contato separado da opinião (D6), cifrado. Nunca volta ao aparelho nem ao cliente."""

    __tablename__ = "contact"
    interview_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("interview.id", ondelete="CASCADE"), primary_key=True)
    name_enc: Mapped[bytes] = mapped_column(LargeBinary)
    phone_enc: Mapped[bytes] = mapped_column(LargeBinary)
    phone_hash: Mapped[str] = mapped_column(String(64), index=True)
    consent_text_version: Mapped[str] = mapped_column(String(50))
    consented_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    opt_out_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class QualityFlag(Base):
    __tablename__ = "quality_flag"
    __table_args__ = (UniqueConstraint("interview_id", "code"),)
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    interview_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("interview.id", ondelete="CASCADE"), index=True)
    code: Mapped[str] = mapped_column(String(30), index=True)
    details: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = _now()
    resolved_by: Mapped[str | None] = mapped_column(String(200))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolution: Mapped[str | None] = mapped_column(String(20))  # accepted | excluded


# --- Painel: equipe e cliente (docs/10-seguranca.md) ---

ROLES_STAFF = ("admin", "supervisor", "analyst")
ROLES_CLIENT = ("client_coord", "client_reader")


class User(Base):
    """Pessoa que entra no painel (equipe ou cliente). Senha + TOTP obrigatórios."""

    __tablename__ = "app_user"
    id: Mapped[uuid.UUID] = _uuid()
    email: Mapped[str] = mapped_column(String(200), unique=True)
    name: Mapped[str] = mapped_column(String(200))
    password_hash: Mapped[str] = mapped_column(String(300))
    totp_secret_enc: Mapped[bytes] = mapped_column(LargeBinary)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = _now()


class Membership(Base):
    """Papel de um usuário numa campanha. Cliente só enxerga a(s) própria(s) campanha(s) (D10, D18)."""

    __tablename__ = "membership"
    __table_args__ = (UniqueConstraint("user_id", "campaign_id"),)
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("app_user.id"), index=True)
    campaign_id: Mapped[uuid.UUID] = _campaign_fk()
    role: Mapped[str] = mapped_column(String(20))  # admin | supervisor | analyst | client_coord | client_reader
    # Aviso de que o sistema não garante eleição (D16), aceito no primeiro acesso
    disclaimer_accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class WebSession(Base):
    """Sessão do painel (cookie). Só vale depois do TOTP."""

    __tablename__ = "web_session"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("app_user.id"), index=True)
    created_at: Mapped[datetime] = _now()
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    totp_ok: Mapped[bool] = mapped_column(Boolean, default=False)
    totp_attempts: Mapped[int] = mapped_column(Integer, default=0)


class AuditLog(Base):
    """Quem fez o quê, e quando (login, aprovação, exclusão, publicação). Sem rota de apagar."""

    __tablename__ = "audit_log"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("app_user.id"), index=True)
    campaign_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("campaign.id"), index=True)
    action: Mapped[str] = mapped_column(String(50))
    details: Mapped[dict] = mapped_column(JSONB, default=dict)
    at: Mapped[datetime] = _now()


class CampaignEvent(Base):
    """Marco da campanha (inauguração, debate, crise) para ler a evolução dos resultados. Cadastrado pela equipe."""

    __tablename__ = "campaign_event"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    campaign_id: Mapped[uuid.UUID] = _campaign_fk()
    day: Mapped[date] = mapped_column(Date)
    title: Mapped[str] = mapped_column(String(80))
    note: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = _now()
