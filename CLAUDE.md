# Tracking eleitoral: guia para agentes e desenvolvedores

Serviço completo de tracking eleitoral (nós operamos tudo; o cliente só consome). Coleta offline em app Android nativo nos aparelhos nossos, núcleo de dados em Python, painel web.

## Status
Fase 1 (MVP para o piloto de Caxias, campo a partir de ~12/01/2027). Calendário em `docs/13-plano-desenvolvimento.md`; especificação em `docs/14-especificacao-tecnica.md`.

## Leitura obrigatória
- `docs/decisoes.md`: decisões tomadas (D*) e pendentes. Não reabra uma decisão sem registrar a mudança ali.
- `docs/14-especificacao-tecnica.md`: decisões técnicas (T*), formatos, modelo de dados, API.
- `docs/03-metodologia.md`: o porquê das flags de qualidade e da ponderação.

## Regras não negociáveis
- **Contrato primeiro:** questionário e entrevista são definidos em `contracts/` (JSON Schema) antes de qualquer implementação. Mudou o formato? Muda o schema e os exemplos primeiro.
- **Nada se perde no campo:** a entrevista só sai da fila do aparelho quando o núcleo confirma (`accepted`/`duplicate`).
- **Dado pessoal separado da opinião:** contato vai para tabela própria e nunca volta ao aparelho nem ao cliente.
- **Cliente só lê** agregados da própria campanha; células com n < 30 ocultadas.
- **LLM interpreta, não calcula.**
- **Dados brutos fora do git:** `tracking_reference/` e `tse/` contêm nomes de entrevistados e arquivos grandes.

## Convenções
- Documentação, interface e comentários de domínio em **português**; identificadores, tabelas e campos JSON em **inglês**.
- Datas ISO-8601 **com fuso** em todo contrato.
- Commits: Conventional Commits (`feat(app): ...`, `docs: ...`). Escopos = diretórios: `docs`, `contracts`, `api`, `app`, `spa`, `scripts`, `infra`.

## Projetos
| Diretório | O quê |
|---|---|
| `docs/` | Documentação do sistema como um todo |
| `contracts/` | Formatos compartilhados (JSON Schema), exemplos, validador |
| `api/` | Núcleo de dados — Python/FastAPI |
| `app/` | App de coleta — Android nativo em Kotlin (módulos `:core:model`, `:engine`, `:app`) |
| `spa/` | Painel interno + painel do cliente — React |
| `scripts/` | Análise, importação do TSE, MDM |
| `infra/` | Dev local e publicação |

Cada projeto tem seu README; leia o do projeto antes de mexer nele.

## Comandos
| O quê | Comando |
|---|---|
| Preparar ambiente (contratos) | `python3 -m venv .venv && .venv/bin/pip install jsonschema` |
| Validar contratos | `.venv/bin/python contracts/tools/validate.py` |
| App: testes (modelo + motor) | `cd app && JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew test` |
| Postgres local (porta 5435) | `docker compose -f infra/compose.dev.yaml up -d` |
| API: testes | `cd api && uv run pytest` (rode o do app antes para a prova ponta a ponta) |
| API: rodar | ver `api/README.md` |
