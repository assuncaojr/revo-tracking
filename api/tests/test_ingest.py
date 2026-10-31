import uuid

from sqlalchemy import func, select

from tracking_api import admin, models, security
from tracking_api.db import session_factory


def send(client, auth, *docs):
    r = client.post("/api/interviews/batch", headers=auth, json={"interviews": list(docs)})
    assert r.status_code == 200, r.text
    return r.json()["results"]


def flags_of(interview_id) -> set[str]:
    with session_factory()() as s:
        return set(s.scalars(select(models.QualityFlag.code).where(
            models.QualityFlag.interview_id == uuid.UUID(interview_id))))


def test_aceita_e_reenvio_vira_duplicata(client, auth, make_interview):
    doc = make_interview()
    assert send(client, auth, doc)[0]["status"] == "accepted"
    assert send(client, auth, doc)[0]["status"] == "duplicate", "reenviar é inofensivo"
    with session_factory()() as s:
        assert s.scalar(select(func.count()).select_from(models.Interview)) == 1


def test_lote_parcial_nao_derruba_os_validos(client, auth, make_interview):
    bom = make_interview()
    sem_fuso = make_interview(started_at="2027-01-12T09:14:03")
    opcao_inexistente = make_interview()
    opcao_inexistente["answers"]["G1"] = {"value": "talvez"}
    r = send(client, auth, bom, sem_fuso, opcao_inexistente, "lixo")
    assert [x["status"] for x in r] == ["accepted", "rejected", "rejected", "rejected"]
    assert "talvez" in r[2]["errors"][0]


def test_aparelho_nao_envia_em_nome_de_outro(client, auth, make_interview, pilot):
    with session_factory()() as s:
        outro, _ = admin.add_device(s, pilot["campaign"], "A14-02")
        s.commit()
    r = send(client, auth, make_interview(device_id=str(outro.id)))
    assert r[0]["status"] == "rejected"


def test_questionario_nao_publicado_e_recusado(client, auth, make_interview):
    r = send(client, auth, make_interview(questionnaire={"id": "caxias-piloto-2027", "version": 2}))
    assert r[0]["status"] == "rejected"
    assert "não publicado" in r[0]["errors"][0]


def test_lote_grande_demais(client, auth, make_interview):
    r = client.post("/api/interviews/batch", headers=auth, json={"interviews": [make_interview() for _ in range(51)]})
    assert r.status_code == 413


def test_formato_longo(client, auth, make_interview):
    doc = make_interview()
    send(client, auth, doc)
    with session_factory()() as s:
        rows = s.scalars(select(models.Answer).where(models.Answer.interview_id == uuid.UUID(doc["id"]))).all()
    g4 = [r for r in rows if r.question_key == "G4"]
    assert len(g4) == 8, "uma linha por área da grade"
    saude = next(r for r in g4 if r.item_key == "saude")
    assert (saude.value, saude.shown_position) == ("piorou", 1), "posição mostrada vem do shown_order"
    p4 = next(r for r in rows if r.question_key == "P4")
    assert (p4.value, p4.nonresponse) == (None, "_nr")
    f2 = next(r for r in rows if r.question_key == "F2")
    assert f2.value == "34"


def test_contato_cifrado_e_fora_das_respostas(client, auth, make_interview):
    doc = make_interview()
    doc["answers"]["C1"] = {"value": "sim"}
    doc["contact"] = {"name": "Maria", "phone": "99988887777", "consent_contact": True,
                      "consent_text_version": "c1-v1", "consented_at": "2027-01-12T09:17:00-03:00"}
    assert send(client, auth, doc)[0]["status"] == "accepted"
    with session_factory()() as s:
        c = s.get(models.Contact, uuid.UUID(doc["id"]))
        assert b"99988887777" not in c.phone_enc and b"Maria" not in c.name_enc
        assert security.decrypt(c.phone_enc) == "99988887777"
        i = s.get(models.Interview, uuid.UUID(doc["id"]))
        assert "Maria" not in str(i.answers)


def test_flags_too_fast_e_no_gps(client, auth, make_interview):
    doc = make_interview(duration_s=23, location=None)  # 2024: 17 perguntas em 23 s
    send(client, auth, doc)
    assert {"too_fast", "no_gps"} <= flags_of(doc["id"])


def test_flag_far_from_point(client, auth, make_interview, pilot):
    with session_factory()() as s:
        p = s.get(models.Point, pilot["point"])
        p.lat, p.lng = -4.8590, -43.3560
        s.commit()
    perto = make_interview()
    longe = make_interview(start="2027-01-12T11:00:00-03:00",
                           location={"lat": -4.8800, "lng": -43.3560, "accuracy_m": 10,
                                     "captured_at": "2027-01-12T11:00:02-03:00"})
    send(client, auth, perto, longe)
    assert "far_from_point" not in flags_of(perto["id"])
    assert "far_from_point" in flags_of(longe["id"])


def test_flag_burst_entrevistas_coladas(client, auth, make_interview):
    a = make_interview(start="2027-01-12T09:00:00-03:00", duration_s=180)  # termina 09:03:00
    b = make_interview(start="2027-01-12T09:03:20-03:00", duration_s=180)  # começa 20 s depois
    c = make_interview(start="2027-01-12T09:10:00-03:00", duration_s=180)
    send(client, auth, a, b, c)
    assert "burst" in flags_of(b["id"])
    assert "burst" not in flags_of(c["id"])


def test_flag_inconsistencia_aprova_e_avalia_mal(client, auth, make_interview):
    doc = make_interview()
    doc["answers"]["G1"] = {"value": "aprova"}
    doc["answers"]["G2"] = {"value": "pessima"}
    send(client, auth, doc)
    assert "inconsistent" in flags_of(doc["id"])


def test_flag_telefone_repetido(client, auth, make_interview):
    contato = {"name": "Maria", "phone": "99988887777", "consent_contact": True,
               "consent_text_version": "c1-v1", "consented_at": "2027-01-12T09:17:00-03:00"}
    a = make_interview(contact=contato)
    b = make_interview(start="2027-01-12T15:00:00-03:00", contact=contato)
    send(client, auth, a, b)
    assert "duplicate_phone" not in flags_of(a["id"])
    assert "duplicate_phone" in flags_of(b["id"])


def test_recusa_e_aceita_sem_flags_de_entrevista_completa(client, auth, make_interview):
    doc = make_interview(status="refused", duration_s=12, location=None, answers={"A0": {"value": "nao"}})
    doc.pop("derived")
    assert send(client, auth, doc)[0]["status"] == "accepted"
    assert flags_of(doc["id"]) == set()
