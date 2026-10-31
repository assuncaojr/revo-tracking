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
- `:core:model` e `:engine`: prontos e testados (semana 2).
- `:app` (Android): a fazer (semanas 3–4).

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
