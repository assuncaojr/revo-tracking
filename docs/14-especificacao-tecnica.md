# Especificação técnica (MVP do piloto)

Escopo: o que está marcado como "entra" em `13-plano-desenvolvimento.md`. Decisões de produto em `decisoes.md`; este documento decide o **como**.

## 1. Decisões técnicas
| # | Decisão | Por quê |
|---|---|---|
| T1 | **App de coleta nativo em Kotlin** (D2 revista): Jetpack Compose (interface), Room/SQLite (fila), WorkManager (envio), localização do Google Play Services, kotlinx.serialization, OkHttp. `minSdk` 33 (Android 13, frota A14), `targetSdk` atual | Fila fora do navegador, envio em segundo plano confiável, quiosque nativo. Mesmo padrão do player do `revo_tv` |
| T2 | **MDM = Android Management API** do Google (gratuita), com o app publicado como **app privado** pela conta do Google Play do responsável e instalado em **modo quiosque** (lock task). Plano B para 6 aparelhos: APK instalado direto + fixação de tela nativa + PIN de administrador | Custo zero; instalação e atualização remotas. Configuração por script na S1/S6 |
| T3 | **Um domínio:** o núcleo serve a API em `/api` e o painel em `/`; como o painel tem rotas próprias (`/resumo`, `/bairros/<id>`…), qualquer caminho fora de `/api` que não seja arquivo do build devolve o `index.html` | Um certificado; deploy simples no EasyPanel. O app nativo fala só com `/api` |
| T4 | **Painel interno e painel do cliente = mesma aplicação**, com papéis | Menos código; o papel de cliente só lê a própria campanha |
| T5 | **Painel em React 19 + TypeScript + Vite**, visual em Tailwind v4 + shadcn/ui (D30) | Stack web conhecida; o painel não roda em campo, então não tem as exigências do app |
| T6 | **Motor do questionário em Kotlin puro** (módulo `:engine` do app, sem Android SDK): condições, encerramento, derivações, validação, embaralhamento. A prévia do questionário no painel é uma **visualização de leitura** (perguntas, condições e fluxo por extenso), sem motor | Testável na JVM, como o `:scheduler` do `revo_tv`. A lógica do plugin não servia (compara texto, usa IDs de campo) |
| T7 | **Núcleo: Python 3.13, FastAPI, SQLAlchemy 2, Alembic, psycopg 3, PostgreSQL 16**, gerenciado com **uv** | D1; uv como no `revo_tv` (instalar: `brew install uv`) |
| T8 | **Contratos em JSON Schema** (`contracts/`), validados no núcleo (Python); no app, o módulo `:core:model` é testado contra **todos** os exemplos de `contracts/`, e o que o app produz é validado contra o schema nos testes | Contrato primeiro; uma fonte da verdade, três linguagens |
| T9 | **Fila no SQLite privado do app**, sem criptografia própria no MVP. Proteção = criptografia nativa do Android + bloqueio + quiosque + apagamento remoto + fila curta (apagada ao confirmar). Cifrar o banco (SQLCipher + Android Keystore) fica como evolução | O ganho real vem do MDM e do armazenamento privado do app; cifrar o banco é barato de acrescentar depois. Ajusta a linha "fila local criptografada" de `10-seguranca.md` |
| T10 | **Atualização de tela por consulta a cada 60 s**, não SSE, no MVP | Basta para o piloto (`13-plano-desenvolvimento.md`) |
| T11 | **Análise do piloto em scripts Python** (`scripts/analysis/`), lendo do banco | Como no ensaio de 2024; tela de análise vem depois |

## 2. Repositório
Um diretório por projeto, cada um com seu README (o que é, como rodar, como testar). `docs/` documenta o sistema como um todo.

```
apps/tracking/
  CLAUDE.md              guia para agentes
  docs/                  documentação do sistema (planejamento, especificação, decisões)
  contracts/             formatos compartilhados (JSON Schema), exemplos e validador
  api/                   núcleo de dados — Python/FastAPI (serve /api e o build do spa)
  app/                   app de coleta — Android nativo (projeto Gradle)
    core/model/          modelos dos contratos (Kotlin puro)
    engine/              motor do questionário (Kotlin puro)
    app/                 app Android (Compose, Room, WorkManager)
  spa/                   painel interno + painel do cliente — React (/)
  scripts/
    analysis/            análise do piloto
    tse/                 importação dos dados do TSE (Caxias)
    mdm/                 configuração do Android Management API
  infra/                 compose de dev, Dockerfile, notas do EasyPanel
  tracking_reference/    (fora do git) exports de 2024
  tse/                   (fora do git) arquivos brutos do TSE
```
Cada projeto tem sua ferramenta: `api` com uv, `app` com Gradle, `spa` com pnpm.

## 3. Formato do questionário (`contracts/questionnaire.schema.json`)
Um documento por **versão**. Versão publicada é imutável.

```jsonc
{
  "schema": "tracking.questionnaire/1",
  "id": "caxias-piloto-2027",
  "version": 1,
  "title": "Piloto Caxias — avaliação da gestão",
  "lists": {                       // listas reutilizáveis
    "areas": [{"value": "saude", "label": "Saúde"}, ...],
    "bairros": [...],
    "nomes": [{"value": "gentil_neto", "label": "Gentil Neto", "aliases": ["Gentil"]}]
  },
  "nonresponse": [                 // botões padrão, não lidos ao entrevistado
    {"value": "_ns", "label": "Não sabe"},
    {"value": "_nr", "label": "Não respondeu"}
  ],
  "questions": [
    {
      "key": "A0", "type": "single", "role": "consent",
      "text": "Aceita participar?",
      "read_aloud": "Bom dia/tarde. Estou fazendo uma pesquisa...",
      "options": [{"value": "sim", "label": "Sim"}, {"value": "nao", "label": "Não"}],
      "nonresponse": false,
      "terminate_if": {"key": "A0", "in": ["nao"]}, "terminate_status": "refused"
    },
    {
      "key": "F2", "type": "number", "role": "filter", "text": "Idade", "min": 0, "max": 120,
      "terminate_if": {"key": "F2", "lt": 16}, "terminate_status": "screened_out",
      "derive": {"key": "faixa_etaria", "bins": [[16, 24, "16-24"], [25, 34, "25-34"], ...]}
    },
    {"key": "G4", "type": "grid", "role": "evaluation", "rows_list": "areas", "shuffle_rows": true,
     "options": [{"value": "melhorou", ...}, {"value": "igual", ...}, {"value": "piorou", ...}]},
    {"key": "G5a", "type": "text", "role": "open", "show_if": {"key": "G5", "in": ["sim"]}},
    {"key": "E2", "type": "name", "role": "open", "list": "nomes", "allow_free_text": true}
  ]
}
```

**Tipos de pergunta:** `single`, `multi`, `number`, `scale` (ex.: 0–10), `grid`, `text`, `name` (texto com autocompletar ligado a uma lista; grava o digitado e o escolhido), `contact` (bloco de contato com consentimento).

**Exibição:** `display: "disc"` mostra as opções em círculo, viradas para o entrevistado; `shuffle: true` embaralha opções; `shuffle_rows: true` embaralha linhas de grade. A ordem mostrada é gravada na resposta.

**Condições** (`show_if`, `terminate_if`): `{"key", "in" | "not_in" | "lt" | "lte" | "gt" | "gte" | "answered" | "nonresponse"}` e combinações `{"all": [...]}` / `{"any": [...]}`. Valores comparados com tipo (número é número), não como texto.

**Papéis** (`role`): `consent`, `filter`, `profile`, `quota`, `vote`, `vote_past`, `approval`, `evaluation`, `open`, `contact`. O motor de análise usa o papel para saber o que é cota, voto, voto passado etc.

**Cenários:** perguntas distintas com o mesmo `scenario_group` (ex.: `P3` disco 1 e `P5` disco 2), cada uma com sua lista.

## 4. Formato da entrevista (`contracts/interview.schema.json`)
```jsonc
{
  "schema": "tracking.interview/1",
  "id": "uuid gerado no aparelho",
  "questionnaire": {"id": "caxias-piloto-2027", "version": 1},
  "campaign_id": "...",
  "device_id": "...", "interviewer_id": "...", "session_id": "...",
  "point_id": "...", "approach": "flow" | "door",
  "status": "complete" | "refused" | "screened_out" | "abandoned",
  "started_at": "2027-01-12T09:14:03-03:00", "finished_at": "...",
  "location": {"lat": -4.86, "lng": -43.35, "accuracy_m": 12, "captured_at": "..."} | null,
  "answers": {
    "F2": {"value": 34, "answered_at": "..."},
    "G4": {"value": {"saude": "piorou", ...}, "shown_order": ["educacao", "saude", ...]},
    "E2": {"value": "gentil_neto", "raw_text": "o gentil", "answered_at": "..."},
    "G1": {"nonresponse": "_ns"}
  },
  "derived": {"faixa_etaria": "25-34"},
  "contact": {"name": "...", "phone": "...", "consent_contact": true,
              "consent_text_version": "c1-v1", "consented_at": "..."} | null,
  "client": {"app_version": "0.1.0", "user_agent": "..."}
}
```
- Datas sempre ISO-8601 **com fuso**.
- `contact` viaja junto, mas o núcleo grava em tabela separada (D6) e nunca devolve ao app.
- Recusas e encerramentos são entrevistas com `status` próprio: a taxa de recusa é dado.

## 5. Modelo de dados (núcleo)
| Tabela | Campos principais |
|---|---|
| `campaign` | id, nome, município (código TSE), fuso, datas |
| `stratum` | id, campaign_id, nome (central/afastado), meta diária |
| `neighborhood` | id, campaign_id, stratum_id, nome, aliases |
| `point` | id, campaign_id, neighborhood_id, nome, tipo (fluxo/domiciliar), lat, lng |
| `questionnaire_version` | id, campaign_id, qid, version, definition (jsonb), approved_by/at, published_at — imutável depois de publicado |
| `device` | id, campaign_id, apelido, modelo, imei, token_hash, revoked_at, last_seen_at, pending_count |
| `interviewer` | id, campaign_id, nome, pin_hash, ativo |
| `field_session` | id, device_id, interviewer_id, point_id, started_at, ended_at |
| `interview` | id (uuid do aparelho), campaign_id, questionnaire_version_id, device_id, interviewer_id, session_id, point_id, approach, status, started_at, finished_at, duration_s, lat, lng, accuracy, answers (jsonb), derived (jsonb), received_at, excluded (bool), excluded_reason |
| `answer` | interview_id, question_key, item_key (linha da grade), value, raw_text, nonresponse, shown_position |
| `contact` | interview_id, name, phone (cifrados), consent_contact, consent_text_version, consented_at, opt_out_at |
| `quality_flag` | interview_id, code, details (jsonb), created_at, resolved_by, resolution |
| `user` / `membership` | equipe e cliente; papel por campanha; senha + TOTP |
| `audit_log` | quem, o quê, quando (login, publicação, exportação, aprovação) |
| `tse_result` | eleição, cargo, município, zona, seção, local, candidato, votos |
| `tse_place` | local de votação, endereço, neighborhood_id (mapeamento manual) |

Todas as tabelas de campanha têm `campaign_id` desde o início (D10), mesmo com um cliente só.

## 6. API (núcleo, prefixo `/api`)
**Aparelho e entrevistador**
- `POST /device/enroll` — código de cadastro (gerado no painel) → token do aparelho
- `GET /device/bootstrap` — questionário publicado, pontos, bairros, entrevistadores ativos (nome + hash do PIN), versão mínima do app
- `POST /interviews/batch` — até 50 entrevistas; upsert por id; resposta por item: `accepted` / `duplicate` / `rejected` (com motivo)
- `POST /device/heartbeat` — pendentes na fila, bateria, versão (a cada envio)

**Equipe (painel)**
- `POST /auth/login`, `POST /auth/totp`
- CRUD de pontos, bairros, entrevistadores, aparelhos (gera código de cadastro, revoga token)
- `POST /questionnaires` (valida contra o schema), `POST /questionnaires/{id}/publish` (exige aprovação)
- `GET /field/now` — produção por entrevistador e aparelho, pendências, flags, cotas por estrato
- `GET /flags`, `POST /flags/{id}/resolve`, `POST /interviews/{id}/exclude`

**Cliente**
- `GET /results/summary` — bruto do dia e acumulado por pergunta (só agregados; células com n < 30 ocultadas)
- `GET /results/overview` — panorama: indicadores-chave (configurados em `campaign.settings.indicators`) com margem de erro (Wilson, 95%) e variação contra os 7 dias anteriores, série diária e média móvel de 3 dias, estratos, grade de áreas
- `GET /results/insights` — cruzamentos do indicador por voto passado, estrato e perfil; segmentos (`settings.segments`); rankings (`settings.rankings`); nome digitado fora da lista nunca sai como texto
- `GET /results/map` — hexágonos (`settings.map.hex_m`, padrão 800 m no piloto) com indicador, margem e n; mínimo de 30 por hexágono para todos; GPS a mais de 50 km do centro da campanha fica fora (D26)
- `GET /results/neighborhoods`, `GET /results/neighborhoods/{id}` — bairros (onde a entrevista foi feita) comparados com a cidade; ficha com frases, balanços, áreas e prioridades; mínimo de 30 por bairro para todos (D28). O panorama traz `headlines`: frases geradas por regras, que só afirmam diferença além da margem
- `GET/POST /manage/events`, `POST /manage/events/{id}/remove` (equipe) — marcos da campanha, que o panorama devolve em `events` (D29)
- `GET /results/method` — método em números do campo (abordagens, recusas, revisão de qualidade, bairros cobertos), sem dado de pessoa; `POST /results/report` registra a geração do boletim na auditoria
- `GET /field/map` (só equipe) — um ponto por entrevista do dia, com alertas abertos, para supervisão
- `GET /field/progress` — feitas × meta por estrato
- `POST /questionnaires/{id}/approve`
- Primeiro acesso exige aceite do aviso de não garantia (D16), registrado

## 7. App de coleta (Android nativo)
**Módulos Gradle** (padrão do player do `revo_tv`):
| Módulo | Conteúdo |
|---|---|
| `:core:model` | Modelos dos contratos (questionário, entrevista), Kotlin puro, kotlinx.serialization. Testado contra **todos** os exemplos de `contracts/examples` |
| `:engine` | Motor do questionário, Kotlin puro: próxima pergunta, `show_if`, `terminate_if`, derivações, embaralhamento (com semente gravada), validação. Testado na JVM com o questionário do piloto |
| `:app` | Android: interface Compose, fila (Room), envio (WorkManager + OkHttp), localização, cadastro do aparelho, login do entrevistador |

**Telas:** cadastro do aparelho (uma vez) → login do entrevistador (nome + PIN, funciona offline) → escolha do ponto e da abordagem → entrevista (uma pergunta por tela, botões grandes, NS/NR em cinza no rodapé) → fim → próxima. Barra fixa com: pendentes de envio, último envio, bateria.

**Offline e envio:** questionário, pontos e entrevistadores guardados localmente após o bootstrap. A entrevista é gravada no Room **a cada resposta** (sobrevive a travamento ou bateria acabando no meio). Envio pelo WorkManager: logo após cada entrevista, periódico com pendências, com rede como restrição e nova tentativa com espera crescente; botão "Enviar agora". A entrevista só sai da fila quando o núcleo responde `accepted` ou `duplicate`.

**Login offline:** o bootstrap traz o hash do PIN (PBKDF2, sal por entrevistador) de cada entrevistador ativo; o núcleo revalida a sessão quando recebe o lote. Risco aceito: o aparelho é nosso, em quiosque, com apagamento remoto.

**Identidade do aparelho:** token emitido no cadastro, guardado no Android Keystore (cifrado pelo hardware).

**GPS:** localização fundida (Play Services) pedida ao iniciar a entrevista, sem bloquear (se não vier em 15 s, segue sem e marca).

**Entrada de dados:** ditado pelo teclado (Gboard) nas abertas; autocompletar no tipo `name` (`12-entrada-de-dados.md`).

**Desempenho:** meta de abrir uma pergunta em menos de 100 ms num A14.

**Distribuição:** app privado na conta do Google Play do responsável, instalado e atualizado pelo MDM (T2). Versão mínima exigida informada no bootstrap; app abaixo dela pede atualização.

## 8. Qualidade (flags)
Na ingestão: `too_fast`, `too_long`, `no_gps`, `far_from_point`, `burst`, `inconsistent`, `duplicate_phone`.
Em lote, a cada 15 min e no fechamento do dia: `ns_outlier` (NS na estimulada × colegas no mesmo bairro e dia), `concentration` (teto por entrevistador/bairro/dia).
Limiares em configuração da campanha, não no código. Regras e origem em `03-metodologia.md`.

## 9. Testes
- **Motor (`:engine`, JUnit 5 na JVM):** cada regra de condição, encerramento, derivação e embaralhamento; o questionário do piloto percorrido por caminhos completos; a entrevista produzida validada contra `interview.schema.json`.
- **Modelos (`:core:model`):** todos os exemplos de `contracts/examples` lidos e regravados sem perda.
- **App (`:app`):** fila e envio com servidor simulado (MockWebServer): sem rede, rede caindo no meio do lote, resposta parcial, duplicata.
- **Contratos:** exemplos válidos e inválidos validados localmente (`contracts/tools/validate.py`).
- **Núcleo (pytest + Postgres de teste):** ingestão idempotente (reenvio, lote parcial, duplicata), flags, isolamento por campanha, permissões do cliente.
- **Ensaio técnico (S6):** 6 aparelhos, modo avião, 200+ entrevistas, volta da rede, troca de entrevistador, aparelho revogado, bateria de 6 h.

## 10. Implantação
- EasyPanel: serviço **Postgres** (backup diário ligado) + serviço **api** (Dockerfile: núcleo + build do painel).
- HTTPS obrigatório (dados sensíveis em trânsito; o app recusa conexão sem TLS).
- App: build de release assinado; chave de assinatura fora do repositório; publicado como app privado no Google Play.
- Segredos só em variáveis de ambiente; nada no repositório.
- Dev local: `docker compose` com Postgres na porta 5435 (5434 já está em uso pelo `finance_bot`).
