"""Dados de demonstração: entrevistas aleatórias passando pela ingestão real (contrato, flags).

Só para ver o painel com volume (modo cliente, células ocultas, alertas). Tudo que é criado aqui
fica marcado: aparelhos `DEMO-NN` e entrevistadores `Demo — ...`; `clear` apaga exatamente isso.
"""

import math
import random
import uuid
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from tracking_api import admin, ingest, models

DEVICE_PREFIX = "DEMO-"
INTERVIEWER_PREFIX = "Demo — "
NAMES = ["Ana", "Bruno", "Carla", "Diego", "Elisa", "Fábio"]
CENTER = (-4.8590, -43.3560)  # Caxias (MA)

# Probabilidade de aprovar por estrato: a diferença entre estratos aparece no painel.
APPROVAL = {"Central": 0.52, "Afastado": 0.38}


def _fake_center(bairro: str, stratum: str) -> tuple[float, float]:
    """Centro FICTÍCIO do bairro, só para os dados de demonstração terem espalhamento no mapa:
    estrato Central perto do centro da cidade, Afastado mais longe. Não é a localização real do bairro."""
    r = random.Random(bairro)
    dist_m = r.uniform(300, 1300) if stratum == "Central" else r.uniform(1800, 3800)
    ang = r.uniform(0, 2 * math.pi)
    return (CENTER[0] + dist_m * math.sin(ang) / 110_540,
            CENTER[1] + dist_m * math.cos(ang) / (111_320 * math.cos(math.radians(CENTER[0]))))


def _pick(rng: random.Random, weights: dict[str, float]) -> str:
    return rng.choices(list(weights), weights=list(weights.values()))[0]


def _maybe_nr(rng: random.Random, q: dict, value: dict, p: float = 0.04) -> dict:
    if q.get("nonresponse") is not False and rng.random() < p:
        return {"nonresponse": rng.choice(["_ns", "_nr"])}
    return value


def _answers(rng: random.Random, qdef: dict, stratum: str, bairro: str, trend: float) -> tuple[str, dict, dict]:
    """Uma entrevista seguindo o fluxo do questionário v1 do piloto. Devolve (status, answers, derived)."""
    by_key = {q["key"]: q for q in qdef["questions"]}
    lists = qdef["lists"]
    areas = [a["value"] for a in lists["areas"]]
    a: dict = {}

    a["A0"] = {"value": "nao" if rng.random() < 0.18 else "sim"}
    if a["A0"]["value"] == "nao":
        return "refused", a, {}
    a["F1"] = {"value": "nao" if rng.random() < 0.04 else "sim"}
    if a["F1"]["value"] == "nao":
        return "screened_out", a, {}
    age = rng.randint(14, 15) if rng.random() < 0.03 else round(rng.triangular(16, 85, 30))
    a["F2"] = {"value": age}
    if age < 16:
        return "screened_out", a, {}
    bins = by_key["F2"]["derive"]["bins"]
    derived = {"faixa_etaria": next(label for lo, hi, label in bins if lo <= age <= hi)}
    a["F3"] = _maybe_nr(rng, by_key["F3"], {"value": "sim" if rng.random() < 0.86 else "nao"})
    a["P1"] = {"value": "feminino" if rng.random() < 0.53 else "masculino"}
    a["P2"] = _maybe_nr(rng, by_key["P2"], {"value": _pick(rng, {
        "ate_fund_incompleto": 0.34, "fund_completo": 0.18, "medio": 0.35, "superior": 0.13})})
    a["P3"] = {"value": bairro if rng.random() < 0.8 else rng.choice(lists["bairros"])["value"]}
    a["P4"] = _maybe_nr(rng, by_key["P4"], {"value": _pick(rng, {
        "ate_1sm": 0.45, "1a2sm": 0.33, "2a5sm": 0.17, "mais_5sm": 0.05})}, p=0.12)

    abandon_at = rng.random() < 0.05

    approves = rng.random() < APPROVAL.get(stratum, 0.45) + trend
    a["G1"] = _maybe_nr(rng, by_key["G1"], {"value": "aprova" if approves else "desaprova"})
    g2 = {"otima": 0.15, "boa": 0.45, "regular": 0.3, "ruim": 0.07, "pessima": 0.03} if approves else \
         {"otima": 0.02, "boa": 0.06, "regular": 0.32, "ruim": 0.3, "pessima": 0.3}
    a["G2"] = _maybe_nr(rng, by_key["G2"], {"value": _pick(rng, g2)})
    if abandon_at:
        return "abandoned", a, derived
    a["G3"] = _maybe_nr(rng, by_key["G3"], {"value": max(0, min(10, round(rng.gauss(7 if approves else 3.5, 1.8))))})
    good = {"melhorou": 0.45, "igual": 0.4, "piorou": 0.15} if approves else {"melhorou": 0.15, "igual": 0.4, "piorou": 0.45}
    order = areas[:]
    rng.shuffle(order)
    grid = {r: _pick(rng, good) for r in areas}
    # Saúde e segurança puxam para baixo em qualquer opinião
    for r in ("saude", "seguranca"):
        if rng.random() < 0.3:
            grid[r] = "piorou"
    a["G4"] = {"value": grid, "shown_order": order}
    a["G5"] = _maybe_nr(rng, by_key["G5"], {"value": "sim" if rng.random() < (0.55 if approves else 0.3) else "nao"})
    if a["G5"].get("value") == "sim":
        a["G5a"] = {"value": rng.choice(["asfalto na rua", "posto de saúde reformado", "iluminação nova",
                                          "praça do bairro", "escola reformada", "coleta de lixo melhorou"])}
    a["G6"] = {"value": rng.choice(["falta de médico no posto", "rua sem calçamento", "insegurança à noite",
                                     "falta de água", "lixo acumulado", "transporte ruim", "desemprego"])}
    order = areas[:]
    rng.shuffle(order)
    a["G7"] = _maybe_nr(rng, by_key["G7"], {"value": _pick(rng, {
        "saude": 0.34, "seguranca": 0.2, "educacao": 0.1, "ruas_pavimentacao": 0.1, "agua_esgoto": 0.09,
        "transporte": 0.06, "iluminacao": 0.05, "lixo_limpeza": 0.06}), "shown_order": order})
    v1_opts = [o["value"] for o in by_key["V1"]["options"]]
    order = v1_opts[:]
    rng.shuffle(order)
    a["V1"] = {"value": _pick(rng, {
        "gentil_neto": 0.4, "paulinho": 0.22, "edmilson_sanches": 0.08, "lycia_waquim": 0.05, "branco_nulo": 0.07,
        "nao_votou": 0.08, "nao_lembra": 0.06, "prefere_nao_dizer": 0.04}), "shown_order": order}
    a["E1"] = _maybe_nr(rng, by_key["E1"], {"value": _pick(rng, {"continuar": 0.7, "mudar": 0.12, "depende": 0.18}
                                                          if approves else {"continuar": 0.12, "mudar": 0.68, "depende": 0.2})})
    r = rng.random()
    if r < 0.35:
        a["E2"] = {"nonresponse": "_ns"}
    elif r < 0.9:
        nome = rng.choice(lists["nomes"])
        a["E2"] = {"value": nome["value"], "raw_text": rng.choice(nome["aliases"])}
    else:
        raw = rng.choice(["Zé do posto", "o vereador do bairro", "Dr. Marcos"])
        a["E2"] = {"value": raw, "raw_text": raw}  # texto livre, como o motor do app grava
    a["C1"] = {"value": "nao"}  # sem contato: nada de dado pessoal fictício no banco
    return "complete", a, derived


def seed(s: Session, campaign_id: uuid.UUID, days: int = 10, per_day: int = 70, seed_value: int | None = None) -> dict:
    campaign = s.get(models.Campaign, campaign_id)
    if campaign is None:
        raise admin.AdminError("campanha não encontrada")
    if s.scalar(select(models.Device.id).where(models.Device.campaign_id == campaign_id,
                                               models.Device.label.startswith(DEVICE_PREFIX)).limit(1)):
        raise admin.AdminError("já há dados de demonstração nesta campanha: rode `seed-demo --clear` antes")
    qv = s.scalar(select(models.QuestionnaireVersion)
                  .where(models.QuestionnaireVersion.campaign_id == campaign_id,
                         models.QuestionnaireVersion.published_at.is_not(None))
                  .order_by(models.QuestionnaireVersion.published_at.desc()).limit(1))
    if qv is None:
        raise admin.AdminError("campanha sem questionário publicado")
    if qv.definition["id"] != "caxias-piloto-2027":
        raise admin.AdminError("o gerador conhece só o questionário do piloto de Caxias")

    rng = random.Random(seed_value)
    tz = ZoneInfo(campaign.timezone)
    points = s.execute(
        select(models.Point, models.Neighborhood.name, models.Stratum.name)
        .join(models.Neighborhood, models.Neighborhood.id == models.Point.neighborhood_id)
        .join(models.Stratum, models.Stratum.id == models.Neighborhood.stratum_id)
        .where(models.Point.campaign_id == campaign_id, models.Point.active.is_(True))).all()
    if not points:
        raise admin.AdminError("campanha sem pontos")
    bairro_by_label = {b["label"]: b["value"] for b in qv.definition["lists"]["bairros"]}

    team = []
    for i, name in enumerate(NAMES, start=1):
        interviewer = admin.add_interviewer(s, campaign_id, INTERVIEWER_PREFIX + name, "1234")
        device = models.Device(campaign_id=campaign_id, label=f"{DEVICE_PREFIX}{i:02d}", model="Demonstração",
                               app_version="0.1.0", battery_pct=rng.randint(35, 100), pending_count=0)
        s.add(device)
        team.append((interviewer, device))
    s.flush()

    now = datetime.now(UTC)
    today = now.astimezone(tz).date()
    totals: dict[str, int] = {}
    for back in range(days - 1, -1, -1):
        day = today - timedelta(days=back)
        trend = 0.03 * (days - 1 - back) / max(days - 1, 1)  # aprovação sobe um pouco ao longo do período
        for interviewer, device in team:
            point, bairro, stratum = rng.choice(points)
            bairro_value = bairro_by_label.get(bairro) or rng.choice(sorted(bairro_by_label.values()))
            lat_c, lng_c = (point.lat, point.lng) if point.lat is not None else _fake_center(bairro, stratum)
            session_id = uuid.uuid4()
            t = datetime.combine(day, time(8, rng.randint(0, 40)), tz)
            end_of_day = datetime.combine(day, time(17, 0), tz)
            target = max(1, round(per_day / len(team) * rng.uniform(0.8, 1.2)))
            done, docs = 0, []
            while done < target and t < end_of_day:
                status, answers, derived = _answers(rng, qv.definition, stratum, bairro_value, trend)
                n = len(answers)
                duration = rng.randint(8, 25) if status == "refused" else int(n * rng.uniform(7, 13))
                if status == "complete" and rng.random() < 0.04:
                    duration = rng.randint(35, 70)  # rápida demais: vira alerta
                finished = t + timedelta(seconds=duration)
                if finished > now:
                    break
                no_gps = rng.random() < 0.03
                docs.append({
                    "schema": "tracking.interview/1",
                    "id": str(uuid.uuid4()),
                    "questionnaire": {"id": qv.qid, "version": qv.version},
                    "campaign_id": str(campaign_id),
                    "device_id": str(device.id),
                    "interviewer_id": str(interviewer.id),
                    "session_id": str(session_id),
                    "point_id": str(point.id),
                    "approach": point.kind,
                    "status": status,
                    "started_at": t.isoformat(timespec="seconds"),
                    "finished_at": finished.isoformat(timespec="seconds"),
                    "location": None if no_gps else {
                        "lat": round(lat_c + rng.gauss(0, 0.0025), 6),
                        "lng": round(lng_c + rng.gauss(0, 0.0025), 6),
                        "accuracy_m": rng.randint(5, 40),
                        "captured_at": (t + timedelta(seconds=2)).isoformat(timespec="seconds")},
                    "answers": answers,
                    "derived": derived,
                    "contact": None,
                    "client": {"app_version": "0.1.0", "user_agent": "demo"},
                })
                if status == "complete":
                    done += 1
                t = finished + timedelta(seconds=rng.randint(90, 600))
            for i in range(0, len(docs), 50):
                for r in ingest.ingest_batch(s, device, docs[i:i + 50]):
                    totals[r["status"]] = totals.get(r["status"], 0) + 1
                    if r["status"] == "rejected":
                        raise admin.AdminError(f"entrevista de demonstração rejeitada: {r['errors']}")
            if docs and back == 0:
                device.last_seen_at = datetime.fromisoformat(docs[-1]["finished_at"])
    for _, device in team:
        device.enrolled_at = datetime.combine(today - timedelta(days=days), time(7), tz)
        device.last_seen_at = device.last_seen_at or now - timedelta(hours=rng.randint(12, 30))
    return totals


def clear(s: Session, campaign_id: uuid.UUID) -> int:
    """Apaga só o que `seed` criou (aparelhos DEMO-* e o que veio deles)."""
    devices = select(models.Device.id).where(models.Device.campaign_id == campaign_id,
                                             models.Device.label.startswith(DEVICE_PREFIX))
    interviews = select(models.Interview.id).where(models.Interview.device_id.in_(devices))
    n = len(s.scalars(interviews).all())
    s.execute(delete(models.QualityFlag).where(models.QualityFlag.interview_id.in_(interviews)))
    s.execute(delete(models.Answer).where(models.Answer.interview_id.in_(interviews)))
    s.execute(delete(models.Contact).where(models.Contact.interview_id.in_(interviews)))
    s.execute(delete(models.Interview).where(models.Interview.device_id.in_(devices)))
    s.execute(delete(models.FieldSession).where(models.FieldSession.device_id.in_(devices)))
    s.execute(delete(models.EnrollmentCode).where(models.EnrollmentCode.device_id.in_(devices)))
    s.execute(delete(models.Device).where(models.Device.id.in_(devices)))
    s.execute(delete(models.Interviewer).where(models.Interviewer.campaign_id == campaign_id,
                                               models.Interviewer.name.startswith(INTERVIEWER_PREFIX)))
    return n
