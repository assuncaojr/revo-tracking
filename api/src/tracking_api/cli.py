"""Linha de comando da equipe: `uv run tracking-admin <comando>`."""

import argparse
import getpass
import json
import secrets
import sys
import uuid
from pathlib import Path

from cryptography.fernet import Fernet

from tracking_api import admin, web_auth
from tracking_api.config import settings
from tracking_api.db import session_factory


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="tracking-admin")
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("new-keys", help="gera TRK_CONTACT_KEY e TRK_PHONE_HMAC_KEY")

    sp = sub.add_parser("seed-pilot", help="cria a campanha do piloto de Caxias com o questionário v1")
    sp.add_argument("--questionnaire", type=Path,
                    default=settings().contracts_dir / "examples/questionnaire/caxias-piloto-2027.v1.json")

    sp = sub.add_parser("interviewer-add")
    sp.add_argument("--campaign", type=uuid.UUID, required=True)
    sp.add_argument("--name", required=True)
    sp.add_argument("--pin", required=True)

    sp = sub.add_parser("device-add", help="cria aparelho e mostra o código de cadastro")
    sp.add_argument("--campaign", type=uuid.UUID, required=True)
    sp.add_argument("--label", required=True)
    sp.add_argument("--valid-hours", type=int, default=72)

    sp = sub.add_parser("device-code", help="novo código para aparelho existente (mantém o id e a fila dele)")
    sp.add_argument("--device", type=uuid.UUID, required=True)
    sp.add_argument("--valid-hours", type=int, default=72)

    sp = sub.add_parser("device-revoke")
    sp.add_argument("--device", type=uuid.UUID, required=True)

    sp = sub.add_parser("user-add", help="usuário do painel (senha + app autenticador)")
    sp.add_argument("--campaign", type=uuid.UUID, required=True)
    sp.add_argument("--email", required=True)
    sp.add_argument("--name", required=True)
    sp.add_argument("--role", required=True, help="admin | supervisor | analyst | client_coord | client_reader")

    sp = sub.add_parser("questionnaire-load")
    sp.add_argument("--campaign", type=uuid.UUID, required=True)
    sp.add_argument("--file", type=Path, required=True)

    sp = sub.add_parser("questionnaire-approve")
    sp.add_argument("--id", type=uuid.UUID, required=True)
    sp.add_argument("--by", required=True)

    sp = sub.add_parser("questionnaire-publish")
    sp.add_argument("--id", type=uuid.UUID, required=True)

    a = p.parse_args(argv)

    if a.cmd == "new-keys":
        print(f"TRK_CONTACT_KEY={Fernet.generate_key().decode()}")
        print(f"TRK_PHONE_HMAC_KEY={secrets.token_urlsafe(32)}")
        return 0

    with session_factory()() as s:
        try:
            if a.cmd == "seed-pilot":
                c = admin.seed_pilot(s, a.questionnaire)
                print(f"campanha: {c.id}")
            elif a.cmd == "interviewer-add":
                print(f"entrevistador: {admin.add_interviewer(s, a.campaign, a.name, a.pin).id}")
            elif a.cmd == "device-add":
                d, code = admin.add_device(s, a.campaign, a.label, a.valid_hours)
                print(f"aparelho: {d.id}\ncódigo de cadastro (válido por {a.valid_hours} h): {code}")
            elif a.cmd == "device-code":
                code = admin.reissue_device_code(s, a.device, a.valid_hours)
                print(f"código de cadastro (válido por {a.valid_hours} h): {code}")
            elif a.cmd == "device-revoke":
                admin.revoke_device(s, a.device)
                print("revogado")
            elif a.cmd == "user-add":
                password = getpass.getpass("Senha (mín. 10 caracteres): ")
                user, secret = admin.add_user(s, a.email, a.name, password, a.campaign, a.role)
                print(f"usuário: {user.id} ({a.role})")
                if secret:
                    print("Cadastre no app autenticador (Google Authenticator, Authy…):")
                    print(f"  chave: {secret}")
                    print(f"  ou link: {web_auth.totp_uri(secret, user.email)}")
                else:
                    print("usuário já existia: papel acrescentado, autenticador continua o mesmo")
            elif a.cmd == "questionnaire-load":
                qv = admin.load_questionnaire(s, a.campaign, json.loads(a.file.read_text(encoding="utf-8")))
                print(f"versão: {qv.id} (aguarda aprovação)")
            elif a.cmd == "questionnaire-approve":
                admin.approve_questionnaire(s, a.id, a.by)
                print("aprovado")
            elif a.cmd == "questionnaire-publish":
                admin.publish_questionnaire(s, a.id)
                print("publicado")
            s.commit()
        except admin.AdminError as e:
            print(f"erro: {e}", file=sys.stderr)
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
