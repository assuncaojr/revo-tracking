"""Ingestão em lote, idempotente pelo id gerado no aparelho (D3).

Cada entrevista do lote é tratada isoladamente (savepoint): uma inválida não derruba as outras.
O aparelho só apaga da fila o que voltar `accepted` ou `duplicate`.
"""

import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from tracking_api import contracts, models, quality, security


class Rejected(Exception):
    def __init__(self, *errors: str):
        self.errors = list(errors)


def ingest_batch(s: Session, device: models.Device, docs: list) -> list[dict]:
    results = []
    for doc in docs:
        item_id = doc.get("id") if isinstance(doc, dict) else None
        try:
            with s.begin_nested():
                status = _ingest_one(s, device, doc)
            results.append({"id": item_id, "status": status})
        except Rejected as r:
            results.append({"id": item_id, "status": "rejected", "errors": r.errors[:5]})
        except IntegrityError as e:
            # Outro lote gravou o mesmo id entre a checagem e o insert: é a mesma entrevista.
            # Qualquer outra violação de integridade é rejeição, nunca "duplicate" (que apagaria da fila).
            try:
                exists = s.get(models.Interview, uuid.UUID(str(item_id))) is not None
            except ValueError:
                exists = False
            if exists:
                results.append({"id": item_id, "status": "duplicate"})
            else:
                results.append({"id": item_id, "status": "rejected", "errors": [f"integridade: {e.orig}"[:300]]})
    s.commit()
    return results


def _ingest_one(s: Session, device: models.Device, doc) -> str:
    if not isinstance(doc, dict):
        raise Rejected("item não é um objeto JSON")
    try:
        interview_id = uuid.UUID(str(doc.get("id")))
    except ValueError:
        raise Rejected("id não é UUID")

    existing = s.get(models.Interview, interview_id)
    if existing is not None:
        if existing.device_id != device.id:
            raise Rejected("id já usado por outro aparelho")
        return "duplicate"

    qref = doc.get("questionnaire") or {}
    qv = s.scalar(
        select(models.QuestionnaireVersion).where(
            models.QuestionnaireVersion.campaign_id == device.campaign_id,
            models.QuestionnaireVersion.qid == qref.get("id"),
            models.QuestionnaireVersion.version == qref.get("version"),
            models.QuestionnaireVersion.published_at.is_not(None),
        )
    )
    if qv is None:
        raise Rejected(f"questionário {qref.get('id')} v{qref.get('version')} não publicado nesta campanha")

    errors = contracts.interview_errors(doc, qv.definition)
    if errors:
        raise Rejected(*errors)

    if doc["device_id"] != str(device.id):
        raise Rejected("device_id não corresponde ao aparelho autenticado")
    if doc["campaign_id"] != str(device.campaign_id):
        raise Rejected("campaign_id não corresponde à campanha do aparelho")

    interviewer = s.get(models.Interviewer, uuid.UUID(doc["interviewer_id"]))
    if interviewer is None or interviewer.campaign_id != device.campaign_id:
        raise Rejected("entrevistador desconhecido nesta campanha")
    point = s.get(models.Point, uuid.UUID(doc["point_id"]))
    if point is None or point.campaign_id != device.campaign_id:
        raise Rejected("ponto desconhecido nesta campanha")

    started = datetime.fromisoformat(doc["started_at"])
    finished = datetime.fromisoformat(doc["finished_at"])
    if finished < started:
        raise Rejected("finished_at anterior a started_at")

    session_id = uuid.UUID(doc["session_id"])
    fs = s.get(models.FieldSession, session_id)
    if fs is None:
        fs = models.FieldSession(
            id=session_id, device_id=device.id, interviewer_id=interviewer.id,
            first_seen_at=started, last_seen_at=finished,
        )
        s.add(fs)
    elif fs.device_id != device.id or fs.interviewer_id != interviewer.id:
        raise Rejected("session_id pertence a outro aparelho ou entrevistador")
    else:
        fs.first_seen_at = min(fs.first_seen_at, started)
        fs.last_seen_at = max(fs.last_seen_at, finished)

    loc = doc["location"]
    interview = models.Interview(
        id=interview_id,
        campaign_id=device.campaign_id,
        questionnaire_version_id=qv.id,
        device_id=device.id,
        interviewer_id=interviewer.id,
        session_id=session_id,
        point_id=point.id,
        approach=doc["approach"],
        status=doc["status"],
        started_at=started,
        finished_at=finished,
        duration_s=int((finished - started).total_seconds()),
        lat=loc["lat"] if loc else None,
        lng=loc["lng"] if loc else None,
        accuracy_m=loc["accuracy_m"] if loc else None,
        answers=doc["answers"],
        derived=doc.get("derived"),
        client=doc["client"],
    )
    s.add(interview)
    s.flush()  # garante o id antes das tabelas filhas (e dispara a corrida de duplicata aqui)

    s.add_all(long_rows(interview_id, doc["answers"]))

    phone_h = None
    contact = doc.get("contact")
    if contact:
        phone_h = security.phone_hash(contact["phone"])
        s.add(models.Contact(
            interview_id=interview_id,
            name_enc=security.encrypt(contact["name"]),
            phone_enc=security.encrypt(contact["phone"]),
            phone_hash=phone_h,
            consent_text_version=contact["consent_text_version"],
            consented_at=datetime.fromisoformat(contact["consented_at"]),
        ))

    campaign = s.get(models.Campaign, device.campaign_id)
    for code, details in quality.ingest_flags(s, campaign, interview, point, phone_h):
        s.add(models.QualityFlag(interview_id=interview_id, code=code, details=details))
    return "accepted"


def long_rows(interview_id: uuid.UUID, answers: dict) -> list[models.Answer]:
    """Formato longo (D5): uma linha por valor, com a posição em que foi mostrado (se embaralhado)."""
    def pos(order: list, v) -> int | None:
        return order.index(v) if v in order else None

    rows = []
    for key, a in answers.items():
        order = a.get("shown_order") or []
        if "nonresponse" in a:
            rows.append(models.Answer(interview_id=interview_id, question_key=key, nonresponse=a["nonresponse"]))
            continue
        v = a["value"]
        if isinstance(v, dict):  # grade: linha → opção
            for item, val in v.items():
                rows.append(models.Answer(interview_id=interview_id, question_key=key, item_key=item,
                                          value=_text(val), shown_position=pos(order, item)))
        elif isinstance(v, list):  # múltipla escolha
            for val in v:
                rows.append(models.Answer(interview_id=interview_id, question_key=key,
                                          value=_text(val), shown_position=pos(order, val)))
        else:
            rows.append(models.Answer(interview_id=interview_id, question_key=key, value=_text(v),
                                      raw_text=a.get("raw_text"), shown_position=pos(order, v)))
    return rows


def _text(v) -> str:
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v)
