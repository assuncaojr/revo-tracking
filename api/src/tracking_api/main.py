"""Aplicação FastAPI. Prefixo /api (T3)."""

import uuid
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import Depends, FastAPI, Header, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from tracking_api import geo, hoods, ingest, insights, manage, models, overview, panel, report, security, web_auth
from tracking_api.config import settings
from tracking_api.db import get_session

app = FastAPI(title="Tracking — núcleo de dados", docs_url="/api/docs", openapi_url="/api/openapi.json")
app.include_router(web_auth.router)
app.include_router(panel.router)
app.include_router(manage.router)
app.include_router(overview.router)
app.include_router(insights.router)
app.include_router(geo.router)
app.include_router(hoods.router)
app.include_router(report.router)

DbSession = Annotated[Session, Depends(get_session)]


@app.get("/api/health")
def health() -> dict:
    return {"ok": True}


# --- aparelho ---


def current_device(s: DbSession, authorization: Annotated[str | None, Header()] = None) -> models.Device:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "token do aparelho ausente")
    device = s.scalar(
        select(models.Device).where(models.Device.token_hash == security.sha256_hex(authorization[7:]))
    )
    if device is None or device.revoked_at is not None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "aparelho desconhecido ou revogado")
    device.last_seen_at = datetime.now(UTC)
    return device


AuthDevice = Annotated[models.Device, Depends(current_device)]


class EnrollIn(BaseModel):
    code: str
    model: str | None = None
    imei: str | None = None
    app_version: str | None = None


class EnrollOut(BaseModel):
    device_id: uuid.UUID
    campaign_id: uuid.UUID
    label: str
    token: str


@app.post("/api/device/enroll")
def enroll(body: EnrollIn, s: DbSession) -> EnrollOut:
    ec = s.get(models.EnrollmentCode, security.sha256_hex(body.code.strip().upper()))
    now = datetime.now(UTC)
    if ec is None or ec.used_at is not None or ec.expires_at < now:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "código inválido, usado ou expirado")
    device = s.get(models.Device, ec.device_id)
    if device.revoked_at is not None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "aparelho revogado")
    token = security.new_device_token()
    device.token_hash = security.sha256_hex(token)
    device.enrolled_at = now
    device.model = body.model or device.model
    device.imei = body.imei or device.imei
    device.app_version = body.app_version
    ec.used_at = now
    s.commit()
    return EnrollOut(device_id=device.id, campaign_id=device.campaign_id, label=device.label, token=token)


@app.get("/api/device/bootstrap")
def bootstrap(device: AuthDevice, s: DbSession) -> dict:
    """Tudo que o aparelho precisa para trabalhar offline."""
    cid = device.campaign_id
    campaign = s.get(models.Campaign, cid)
    qv = s.scalar(
        select(models.QuestionnaireVersion)
        .where(models.QuestionnaireVersion.campaign_id == cid, models.QuestionnaireVersion.published_at.is_not(None))
        .order_by(models.QuestionnaireVersion.published_at.desc())
        .limit(1)
    )
    neighborhoods = {n.id: n for n in s.scalars(select(models.Neighborhood).where(models.Neighborhood.campaign_id == cid))}
    strata = {st.id: st for st in s.scalars(select(models.Stratum).where(models.Stratum.campaign_id == cid))}
    points = s.scalars(select(models.Point).where(models.Point.campaign_id == cid, models.Point.active.is_(True)))
    interviewers = s.scalars(
        select(models.Interviewer).where(models.Interviewer.campaign_id == cid, models.Interviewer.active.is_(True))
    )
    s.commit()  # last_seen_at
    return {
        "server_time": datetime.now(UTC).isoformat(),
        "min_app_version": settings().min_app_version,
        "campaign": {"id": str(cid), "name": campaign.name, "timezone": campaign.timezone},
        "device": {"id": str(device.id), "label": device.label},
        "questionnaire": qv.definition if qv else None,
        "points": [
            {
                "id": str(p.id),
                "name": p.name,
                "kind": p.kind,
                "lat": p.lat,
                "lng": p.lng,
                "neighborhood": neighborhoods[p.neighborhood_id].name,
                "stratum": strata[neighborhoods[p.neighborhood_id].stratum_id].name
                if neighborhoods[p.neighborhood_id].stratum_id
                else None,
            }
            for p in points
        ],
        "interviewers": [
            {"id": str(i.id), "name": i.name, "pin_salt": i.pin_salt, "pin_hash": i.pin_hash,
             "pin_iterations": i.pin_iterations}
            for i in interviewers
        ],
    }


class HeartbeatIn(BaseModel):
    pending_count: int = Field(ge=0)
    battery_pct: int | None = Field(default=None, ge=0, le=100)
    app_version: str | None = None


@app.post("/api/device/heartbeat")
def heartbeat(body: HeartbeatIn, device: AuthDevice, s: DbSession) -> dict:
    device.pending_count = body.pending_count
    device.battery_pct = body.battery_pct
    device.app_version = body.app_version or device.app_version
    s.commit()
    return {"ok": True, "server_time": datetime.now(UTC).isoformat()}


class BatchIn(BaseModel):
    # Qualquer valor JSON: cada item é validado sozinho, e um item ruim não pode derrubar o lote.
    interviews: list[Any]


@app.post("/api/interviews/batch")
def batch(body: BatchIn, device: AuthDevice, s: DbSession) -> dict:
    if len(body.interviews) > settings().batch_max:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, f"máximo de {settings().batch_max} por lote")
    return {"results": ingest.ingest_batch(s, device, body.interviews)}
