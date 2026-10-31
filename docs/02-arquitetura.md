# Arquitetura

## Premissa: serviço completo
Nós operamos tudo: sistema, questionário, aparelhos, entrevistadores, análise. O cliente **consome** os resultados, orienta e escolhe o tipo de pesquisa, mas **não opera o sistema** (D17). Por isso não há editor para o cliente, nem autoatendimento, nem WordPress (D11 revista).

```
  Equipe (nós)                      Núcleo de dados (Python)                    Cliente
┌────────────────────────┐       ┌───────────────────────────────┐       ┌─────────────────────┐
│ Painel interno         │       │ API                           │  API  │ SPA de resultados   │
│ - questionário (JSON   ├──────►│ - questionários versionados   ├──────►│ (somente leitura)   │
│   versionado)          │       │ - cadastros                   │  SSE  │ - cenário, séries   │
│ - cadastros: pontos,   │◄──────┤ - bootstrap dos aparelhos     │       │ - cruzamentos       │
│   entrevistadores,     │       │ - ingestão em lote            │       │ - boletim           │
│   aparelhos            │       │ - processamento incremental   │       │ - progresso do campo│
│ - supervisão de campo  │       │ - ponderação, projeção, LLM   │       │ - aprovar questionár│
│ - revisão de flags     │       └──────┬───────────────▲────────┘       └─────────────────────┘
│ - revisão do boletim   │              │               │ lotes de
└────────────────────────┘       ┌──────▼──────┐        │ entrevistas
                                 │ PostgreSQL  │  ┌─────┴──────────────┐
                                 │             │  │ App de coleta      │
                                 └─────────────┘  │ (aparelhos nossos, │
                                                  │  offline)          │
                                                  └────────────────────┘
```

O painel interno e o SPA do cliente podem ser **a mesma aplicação web com papéis diferentes**. O que importa é a regra: papéis de cliente só leem, e só a própria campanha.

## Componentes
| Peça | Quem usa | Papel | Não faz |
|---|---|---|---|
| **Painel interno** | Nossa equipe (admin, supervisor, analista) | Publicar questionário, cadastros, supervisão de campo, revisão de flags e do boletim, exportações | — |
| **App de coleta** | Nossos entrevistadores | Mostra o questionário (reaproveita o renderizador do RV Form Builder), coleta offline, envia em lote | Não mostra resultados |
| **Núcleo de dados** (Python + PostgreSQL) | — | Guarda tudo, valida, processa, serve as APIs e o tempo real, roda o LLM | — |
| **SPA de resultados** | Cliente | Cenário, séries, cruzamentos, boletim, progresso do campo, aprovação do questionário | Não edita nada; não vê dado pessoal nem detalhe de entrevistador |

## Fluxos

### 1. Do pedido do cliente ao questionário no campo
1. **Briefing:** o cliente diz o que quer saber (tipo de pesquisa, temas, nomes a testar).
2. **Desenho:** nós montamos o questionário como **arquivo JSON versionado**, a partir do questionário-padrão (`03-metodologia.md`), validado contra o formato em `contracts/`.
3. **Aprovação:** o cliente vê uma prévia no SPA e **aprova** (registrado: quem, quando, qual versão). Não edita; pede mudanças, e nós fazemos.
4. **Publicação:** nós publicamos a versão aprovada no núcleo. Os aparelhos pegam a nova versão no próximo contato. Entrevistas em andamento terminam na versão em que começaram.

Mudança no meio da campanha (entra ou sai candidato, novo tema) segue o mesmo ciclo, em horas.

### 2. Coleta
1. O entrevistador faz login no aparelho no início do turno e escolhe o ponto.
2. Cada entrevista nasce com UUID gerado no aparelho, versão do questionário, aparelho, entrevistador, início/fim e GPS.
3. Contato do entrevistado é opcional, com consentimentos separados (`04-legal-lgpd.md`).

### 3. Envio
- A entrevista só é apagada da memória do celular depois que o núcleo confirma o recebimento. Sem sinal, ela espera na fila.
- Com sinal, envia logo após cada entrevista e tenta de novo periodicamente o que ficou pendente.
- O núcleo faz upsert pelo UUID: reenviar não duplica.

### 4. Processamento e tempo real
- A cada lote: validação, flags de qualidade, formato longo, atualização incremental dos agregados do dia.
- Painel e SPA recebem atualizações por **SSE**.
- Ponderação e projeção recalculadas a cada poucos minutos e no fechamento do dia.
- Boletim do LLM no fechamento do dia, **revisado por nós antes de ir ao cliente** (no início; depois, se a qualidade se provar, pode sair direto com revisão por amostragem).

## O que o cliente vê
| Camada | Cliente | Equipe |
|---|---|---|
| **Campo agora** | Progresso agregado: entrevistas feitas × meta, por região | Tudo: por entrevistador, aparelho, flags, envios pendentes |
| **Dia em andamento** | Parcial, marcado como "não conclusivo" | Idem, com detalhe |
| **Cenário** | Média dos dias fechados, ponderada, com faixa de incerteza e o aviso de que não há garantia (D16) | Idem, mais diagnósticos do modelo |

Detalhe de entrevistador e qualidade de campo é assunto nosso: o cliente compra o resultado, não a gestão da equipe.

## Princípios
- **Nada se perde no campo.** A entrevista só sai do aparelho depois da confirmação do núcleo.
- **Os aparelhos são nossos** e gerenciados (`08-aparelhos.md`).
- **Contrato primeiro.** O formato do questionário e da entrevista é definido em `contracts/` antes de qualquer implementação.
- **Um único sistema guarda tudo** (o núcleo), atrás da menor superfície possível.
- **Dado pessoal separado da opinião**, com acesso restrito.
- **O cliente só lê agregados** da própria campanha. Exportação de contatos consentidos é feita por nós, registrada.
- **LLM interpreta, não calcula.**
- **Isolamento por cliente:** dados separados por campanha (schema ou banco por cliente); usuários do cliente presos à sua campanha.
