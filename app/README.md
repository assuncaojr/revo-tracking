# app — app de coleta (Android nativo)

Kotlin · Jetpack Compose · Room · WorkManager · OkHttp · kotlinx.serialization. `minSdk` 33 (frota de Samsung Galaxy A14).

Instalado nos aparelhos como app privado do Google Play e travado em quiosque pelo MDM. Funciona offline: a entrevista é gravada no SQLite a cada resposta e só sai da fila quando a `api` confirma o recebimento.

## Módulos
| Módulo | Conteúdo |
|---|---|
| `:core:model` | Modelos dos contratos (Kotlin puro). Testado contra **todos** os exemplos de `contracts/examples` |
| `:engine` | Motor do questionário (Kotlin puro): próxima pergunta, condições, encerramento, derivações, embaralhamento, validação |
| `:app` | Android: interface, fila, envio, localização, cadastro do aparelho, login do entrevistador |

Especificação: `docs/14-especificacao-tecnica.md` §3, §4 e §7; aparelhos em `docs/08-aparelhos.md`; entrada de dados em `docs/12-entrada-de-dados.md`.

## Build e testes
```bash
cd app
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
./gradlew test     # :core:model (todos os exemplos de contracts/) e :engine (caminhos do piloto + JSON Schema)
```

## Estado
- `:core:model` e `:engine`: prontos e testados (29 testes), incluindo registro de ações (retomada após queda) e PIN offline.
- `:app` (Android): cadastro do aparelho, login com PIN offline, escolha de ponto e abordagem, entrevista com todos os tipos de pergunta, rascunho gravado a cada resposta, fila em SQLite, envio em segundo plano (WorkManager), GPS sem bloquear, token no Keystore. 5 testes JVM (fila e cliente da API).
- **Ensaio no emulador (01/11/2026):** cadastro → login (PIN errado recusado) → entrevista completa → app morto no meio e retomado na mesma pergunta → fim sem rede (fila = 1) → rede religada → entrevista no banco em ~8 s, sem toque, com flag `too_fast` correta.
- A fazer: disco na tela (estimulada; o piloto não usa), quiosque/MDM, ícone e acabamento visual, build de release assinado.

## Rodar no emulador
```bash
docker compose -f ../infra/compose.dev.yaml up -d
cd ../api && uv run uvicorn tracking_api.main:app --host 0.0.0.0 --port 8000   # outra aba
cd ../app && ./gradlew :app:installDebug                                          # emulador ligado
```
O build de debug fala com `http://10.0.2.2:8000/` (a máquina, vista do emulador). Para um aparelho real na mesma rede: `-Ptrk.apiUrl.debug=http://<ip-da-máquina>:8000/`. Gere o código de cadastro com `uv run tracking-admin device-add` (ver `api/README.md`).

## Usando o motor
```kotlin
val engine = InterviewEngine(questionnaire, seed = Random.nextLong(), now = { OffsetDateTime.now().toString() })
engine.current                        // pergunta atual (null = terminou)
engine.shownOrder(q)                  // ordem das opções/linhas (embaralhadas quando o questionário pede)
engine.answer(AnswerInput.Choice("sim"))   // Step.Ask(próxima) | Step.Finished(status) | Step.Invalid(motivo)
engine.back()                         // volta; respostas continuam guardadas
engine.suggestions(q, "gent")         // autocompletar do tipo `name`
engine.toInterview(meta)              // entrevista no formato do contrato
```
