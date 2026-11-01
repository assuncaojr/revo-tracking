# Análise conversacional com LLM (D31)

Perguntar sobre os resultados em português e receber a resposta com o gráfico e a fonte. Começa como **protótipo para a nossa equipe**, antes do campo do piloto; o destino é o **cliente** fazer isso sozinho.

## Regras que valem desde o protótipo
1. **O LLM interpreta, não calcula.** Todo número da resposta vem de uma consulta do núcleo. Diferença, "passou da margem" e "empate técnico" já chegam prontos; se faltar uma conta, ela entra na consulta, nunca no LLM.
2. **O LLM não acessa o banco.** Ele chama as mesmas consultas que o painel usa, com a sessão de quem pergunta: isolamento por campanha, papel e supressão de n < 30 continuam valendo sem código novo.
3. **Só agregados (D9).** Nada de nome, telefone, coordenada ou resposta aberta no protótipo.
4. **Sem previsão de eleição (D16).** Recusa com o texto do aviso e oferece a tendência.
5. **Tudo registrado.** Pergunta, consultas feitas, resposta, tokens e custo vão para a auditoria.

## Como funciona

```
Painel ──pergunta──▶ POST /api/campaigns/{cid}/ask  (resposta em fluxo, SSE)
                          │
                          ▼
                 laço de ferramentas no núcleo ──▶ provedor (Claude ou OpenAI)
                          │        ▲
                          ▼        │ resultados (agregados)
                 consultas do painel (overview, insights, bairros…)
                          │
                          ▼
                 verificação de números ──▶ resposta: texto + blocos + fontes
                          │
                          ▼
                 registro na auditoria
```

- **Laço no núcleo, provedor trocável.** O laço de ferramentas, a verificação e o registro são nossos; o provedor fica atrás de uma interface pequena (mensagens + ferramentas → eventos). Primeira implementação: **Claude** (SDK oficial `anthropic`, Claude Opus 5.5, pensamento adaptativo, esforço `medium`, cache do prompt de sistema e das ferramentas). A de **OpenAI** entra se quisermos comparar qualidade e custo com as mesmas perguntas de avaliação.
- **Ferramentas estritas** (esquema validado) e **somente leitura**: o chat não aceita alerta, não cadastra, não publica.

### Ferramentas
Cada uma chama a função do núcleo que já serve a tela correspondente.

| Ferramenta | Consulta do núcleo | Quem pode |
|---|---|---|
| `resumo(periodo)` | `results/overview`: frases, balanços, indicadores, evolução, marcos, grade de áreas | todos |
| `cruzamentos(indicador, periodo)` | `results/insights`: por grupo, segmentos, rankings | todos |
| `bairros(indicador)` | `results/neighborhoods` | todos |
| `ficha_bairro(nome)` | `results/neighborhoods/{id}` | todos |
| `pergunta(chave, dia?)` | `results`: resultado de uma pergunta, total e por estrato | todos |
| `metodo()` | `results/method` | todos |
| `campo_agora(dia?)` | `field/now`: produção por entrevistador, aparelhos | só equipe |
| `alertas_resumo()` | `flags`, agregado por tipo e entrevistador | só equipe |

O cliente não recebe as duas últimas na lista de ferramentas: o LLM nem sabe que existem.

### Verificação de números
Antes de mostrar, o núcleo extrai os números do texto e confere cada um contra os resultados das ferramentas daquela pergunta (percentual arredondado conta). Se algum não bate: uma nova tentativa com o aviso do número errado; se falhar de novo, a resposta é trocada por "não consegui responder com segurança" e a pergunta fica marcada para revisão. Também barra as expressões proibidas pela D16 ("vai ganhar", "vitória garantida").

### Formato da resposta
O LLM termina com uma resposta estruturada:
- **texto**: duas ou três frases, margem dita em palavras ("empate técnico", "à frente");
- **blocos**: gráficos do próprio painel a mostrar (balanço, linhas de cruzamento, evolução com marcos, ficha de bairro), com os parâmetros da consulta;
- **fontes**: a tela e os filtros de onde veio cada afirmação ("Detalhes › Cruzamentos, Aprova a gestão, todo o período").

## Interface
- **Painel lateral "Perguntar"**, aberto de qualquer tela (Sheet do shadcn; tela cheia no celular). Leva o contexto: na ficha do Centro, "por que aqui está pior?" já sabe o bairro e o período.
- **Começa com sugestões**, geradas das frases do Resumo e dos destaques dos cruzamentos ("Por que saúde é a área mais criticada?"). Caixa vazia não serve para leigo.
- **Etapas visíveis** enquanto responde ("consultando cruzamentos por faixa etária…").
- **Resposta com gráfico**: os blocos usam os mesmos componentes das telas; cada fonte é um link que abre a tela com os filtros.
- **Limites com saída**: pergunta que os dados não respondem vira sugestão de pergunta para a próxima versão do questionário.
- **"Ajudou?"** em cada resposta; a equipe revê as marcadas.
- Marca d'água e "uso interno" valem também no painel lateral.

## Segurança e custo
- Chave do provedor só no núcleo (variável de ambiente), **teto de gasto** na conta e **limite de perguntas por usuário por dia**.
- Registro em tabela própria (`ask_log`): usuário, campanha, pergunta, ferramentas chamadas com parâmetros, resposta, verificação, tokens, custo, avaliação.
- Custo estimado com Claude Opus 5.5 (US$ 4 / 20 por milhão de tokens de entrada / saída, leitura de cache US$ 0,20): ~15 mil tokens de entrada e ~2 mil de saída por pergunta ≈ **US$ 0,10**; com cache, menos. Equipe fazendo 30 perguntas por dia ≈ US$ 3/dia. Medir de verdade no protótipo.

## Avaliação antes de abrir para o cliente
Um conjunto de ~30 perguntas reais (as que a equipe e o cliente fariam), com o que a resposta certa precisa conter. Critério, o mesmo do piloto para o boletim: **nenhum número que não esteja nos dados**, nenhuma previsão, recusa correta fora do escopo. Roda a cada mudança de prompt, ferramenta ou modelo, e é onde Claude e OpenAI se comparam.

## Etapas
| # | Etapa | Estimativa |
|---|---|---|
| 1 | Núcleo: interface de provedor + Claude, ferramentas, laço, verificação, `ask_log`, rota com SSE; testes com provedor falso (sem gastar) | 2 dias |
| 2 | Painel: Sheet "Perguntar", sugestões, etapas, blocos e fontes | 1,5 dia |
| 3 | Conjunto de avaliação e ajuste do prompt | 1 dia |
| 4 | Equipe usa no ensaio técnico (S6) e no piloto | — |
| 5 | Cliente: com revisão por amostragem, depois aberto (nova decisão) | depois do piloto |

## Fora do protótipo
Respostas abertas (categorias e trechos precisam de limpeza de dados pessoais e de defesa contra texto malicioso dentro da resposta do entrevistado), boletim automático (usa o mesmo motor depois), acesso do cliente, voz.
