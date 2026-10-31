"""Flags de qualidade na ingestão (docs/03-metodologia.md, docs/14-especificacao-tecnica.md §8).

Flag não descarta entrevista (D7): marca para revisão. Limiares vêm de `campaign.settings`.
As flags em lote (`ns_outlier`, `concentration`) rodam à parte, sobre o dia inteiro.
"""

import math
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from tracking_api import models

DEFAULTS = {
    "min_seconds": 60,
    "min_seconds_per_answer": 4,
    "max_seconds": 1200,
    "far_m": 500,
    "burst_s": 45,
}


def thresholds(campaign: models.Campaign) -> dict:
    return {**DEFAULTS, **(campaign.settings or {}).get("quality", {})}


def ingest_flags(
    s: Session,
    campaign: models.Campaign,
    interview: models.Interview,
    point: models.Point,
    phone_hash: str | None,
) -> list[tuple[str, dict]]:
    """Flags que dependem só desta entrevista e do histórico já gravado."""
    t = thresholds(campaign)
    flags: list[tuple[str, dict]] = []
    complete = interview.status == "complete"
    n_answers = len(interview.answers)

    if complete:
        min_s = max(t["min_seconds"], t["min_seconds_per_answer"] * n_answers)
        if interview.duration_s < min_s:
            flags.append(("too_fast", {"duration_s": interview.duration_s, "min_s": min_s, "answers": n_answers}))
        if interview.lat is None:
            flags.append(("no_gps", {}))
    if interview.duration_s > t["max_seconds"]:
        flags.append(("too_long", {"duration_s": interview.duration_s, "max_s": t["max_seconds"]}))

    if interview.lat is not None and point.lat is not None and point.lng is not None:
        d = haversine_m(interview.lat, interview.lng, point.lat, point.lng)
        if d > t["far_m"]:
            flags.append(("far_from_point", {"distance_m": round(d), "max_m": t["far_m"]}))

    window_start = interview.started_at - timedelta(seconds=t["burst_s"])
    previous = s.scalar(
        select(models.Interview.id).where(
            models.Interview.interviewer_id == interview.interviewer_id,
            models.Interview.id != interview.id,
            models.Interview.finished_at > window_start,
            models.Interview.finished_at <= interview.started_at,
        ).limit(1)
    )
    if previous is not None:
        flags.append(("burst", {"previous_id": str(previous), "window_s": t["burst_s"]}))

    for rule in (campaign.settings or {}).get("inconsistent_rules", []):
        if evaluate(rule["condition"], interview.answers):
            flags.append(("inconsistent", {"rule": rule["code"]}))
            break

    if phone_hash is not None:
        dup = s.scalar(
            select(models.Contact.interview_id)
            .join(models.Interview, models.Interview.id == models.Contact.interview_id)
            .where(
                models.Contact.phone_hash == phone_hash,
                models.Interview.campaign_id == campaign.id,
                models.Interview.id != interview.id,
            )
            .limit(1)
        )
        if dup is not None:
            flags.append(("duplicate_phone", {"other_id": str(dup)}))

    return flags


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6_371_000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def evaluate(cond: dict, answers: dict) -> bool:
    """Mesma semântica de condição do motor do app (app/engine Conditions.kt), sobre as respostas gravadas."""
    if "all" in cond:
        return all(evaluate(c, answers) for c in cond["all"])
    if "any" in cond:
        return any(evaluate(c, answers) for c in cond["any"])
    a = answers.get(cond["key"])
    if "answered" in cond:
        return (a is not None) == cond["answered"]
    if "nonresponse" in cond:
        return (a is not None and "nonresponse" in a) == cond["nonresponse"]
    if a is None or "value" not in a:
        return False
    v = a["value"]
    if "item" in cond:
        if not isinstance(v, dict) or cond["item"] not in v:
            return False
        v = v[cond["item"]]
    scalars = v if isinstance(v, list) else [v]

    def same(x, y) -> bool:
        if isinstance(x, str) or isinstance(y, str):
            return isinstance(x, str) and isinstance(y, str) and x == y
        if isinstance(x, bool) or isinstance(y, bool):
            return x is y
        return float(x) == float(y)

    if "in" in cond:
        return any(same(x, y) for x in scalars for y in cond["in"])
    if "not_in" in cond:
        return bool(scalars) and not any(same(x, y) for x in scalars for y in cond["not_in"])
    num = v if isinstance(v, (int, float)) and not isinstance(v, bool) else None
    if num is None:
        return False
    for op, fn in (("lt", float.__lt__), ("lte", float.__le__), ("gt", float.__gt__), ("gte", float.__ge__)):
        if op in cond:
            return fn(float(num), float(cond[op]))
    return False
