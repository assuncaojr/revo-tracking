"""Dados de demonstração: passam pela ingestão real e saem sem levar dado de verdade junto."""

import pytest
from sqlalchemy import func, select

from tracking_api import admin, demo, models
from tracking_api.db import session_factory


def _count(s, model, *where):
    return s.scalar(select(func.count()).select_from(model).where(*where))


def test_demo_gera_entrevistas_validas_e_clear_apaga_so_elas(pilot):
    with session_factory()() as s:
        totals = demo.seed(s, pilot["campaign"], days=3, per_day=40, seed_value=7)
        s.commit()
        assert "rejected" not in totals
        assert totals["accepted"] > 100
        complete = _count(s, models.Interview, models.Interview.status == "complete")
        assert complete >= 80
        assert _count(s, models.Interview, models.Interview.status == "refused") > 0
        assert _count(s, models.Contact) == 0  # nada de dado pessoal fictício

        with pytest.raises(admin.AdminError):
            demo.seed(s, pilot["campaign"], days=1)

        assert demo.clear(s, pilot["campaign"]) == totals["accepted"]
        s.commit()
        assert _count(s, models.Interview) == 0
        assert _count(s, models.Device) == 1  # o aparelho do piloto continua
        assert _count(s, models.Interviewer) == 2
