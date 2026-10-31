# api — núcleo de dados

Python 3.13 · FastAPI · SQLAlchemy 2 · Alembic · psycopg 3 · PostgreSQL 16 · uv.

Recebe as entrevistas dos aparelhos, guarda tudo, aplica as flags de qualidade e serve as APIs da equipe e do cliente. Serve também o build do `spa` (`/`). O `app` (Android) fala só com `/api`.

Especificação: `docs/14-especificacao-tecnica.md` §5 (modelo de dados), §6 (API), §8 (qualidade).

## Rodar local
```bash
docker compose -f infra/compose.dev.yaml up -d      # Postgres na porta 5435 (bancos tracking e tracking_test)
cd api
uv sync
uv run tracking-admin new-keys >> .env              # chaves de cifragem do contato (fora do git)
uv run alembic upgrade head
uv run tracking-admin seed-pilot                    # campanha do piloto + questionário v1 publicado
uv run tracking-admin interviewer-add --campaign <id> --name Ana --pin 1234
uv run tracking-admin device-add --campaign <id> --label A14-01   # mostra o código de cadastro
uv run uvicorn tracking_api.main:app --reload       # http://localhost:8000/api/docs
```

## Testes
```bash
uv run pytest            # usa o banco tracking_test, montado pela própria migração
uv run ruff check src tests
```
`tests/test_app_contract.py` envia à API as entrevistas produzidas pelo motor do app; rode antes `cd app && ./gradlew :engine:test`.

## Estado (semana 2)
| Pronto | Endpoint / peça |
|---|---|
| ✓ | `POST /api/device/enroll` — código de uso único → token do aparelho |
| ✓ | `GET /api/device/bootstrap` — questionário publicado, pontos, entrevistadores (hash do PIN) |
| ✓ | `POST /api/device/heartbeat` — pendências na fila, bateria, versão |
| ✓ | `POST /api/interviews/batch` — idempotente, item a item, até 50 |
| ✓ | Formato longo, contato cifrado (Fernet) + hash do telefone (HMAC) |
| ✓ | Flags na ingestão: `too_fast`, `too_long`, `no_gps`, `far_from_point`, `burst`, `inconsistent`, `duplicate_phone` |
| ✓ | `tracking-admin`: campanha do piloto, entrevistadores, aparelhos, questionário (carregar, aprovar, publicar) |
| a fazer | Flags em lote (`ns_outlier`, `concentration`), login da equipe/cliente, endpoints do painel (semanas 4–5) |
