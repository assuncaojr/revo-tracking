# Visão do produto

## O problema
Numa campanha majoritária municipal, a coordenação precisa saber **todo dia** como está o cenário, onde está ganhando e perdendo e se as ações da semana passada mexeram nos números. Pesquisa registrada é cara, lenta e pública. O que a campanha passada usou com sucesso foi um **tracking diário interno**: entrevistadores em N pontos da cidade, amostra diária, leitura em média móvel. Com ele, a projeção manual apontou vitória por ~300 votos; o resultado oficial foi Gentil Neto 43.352 × Paulinho 42.787, diferença de **565 votos** (0,63 p.p. dos válidos).

Aquele sistema era de terceiro e os dados viviam em planilhas que se perderam. Este projeto recria a capacidade, sob nosso controle, pronta para a próxima campanha (eleições municipais de **outubro de 2028**).

## O que o sistema faz
1. **Coleta** em campo, em aparelhos Android fornecidos e gerenciados por nós, com um coletor que roda offline, com questionário configurável, GPS, duração da entrevista e consentimento LGPD.
2. **Recebe** os dados numa API que aceita lotes, é idempotente (reenviar não duplica) e marca entrevistas suspeitas.
3. **Processa**: limpeza, ponderação por cotas (sexo, idade, escolaridade, região), série diária e média móvel, cruzamentos, margem de erro.
4. **Analisa**: painel para a coordenação e um motor com LLM que **lê os números calculados** (nunca os calcula) e produz o boletim diário, classifica respostas abertas (espontânea, "maior problema da cidade") e responde perguntas em linguagem natural.
5. **Ativa** (com consentimento): exporta a base de entrevistados que aceitaram contato, segmentada (bairro, indeciso, tema de interesse), para comunicação.

## Usuários
Vendemos o **serviço completo** (D17): toda a operação é nossa; o cliente consome.

| Papel | Quem | O que faz |
|---|---|---|
| Entrevistador | Nossa equipe | Coleta no celular, às vezes sem rede, por horas seguidas. |
| Supervisor de campo | Nossa equipe | Acompanha produção, cotas e qualidade por entrevistador e ponto. |
| Analista / administrador | Nossa equipe | Desenha e publica o questionário, cadastra pontos, entrevistadores e metas; revisa o boletim. |
| Coordenação da campanha | Cliente | Faz o briefing, aprova o questionário, lê o cenário, os cruzamentos e o boletim. **Não opera o sistema.** |

## Escopo do MVP
**Dentro:** um questionário ativo por campanha (versionado), coleta offline com sincronização, cadastro de pontos e entrevistadores, flags automáticas de qualidade, resultados diários brutos e ponderados, média móvel, exportação CSV, painel simples, boletim gerado por LLM.

**Fora:** qualquer operação feita pelo cliente (editor, cadastros, autoatendimento); o sistema nasce multi-cliente, mas só nós operamos (ver `06-produto-negocio.md`). **Fora por ora:** app nativo, disparo de mensagens pelo próprio sistema (só exportação de base consentida), áudio das entrevistas, roteirização de entrevistadores.

## Critério de sucesso
- Entrevistador completa uma entrevista de ~15 perguntas em menos de 3 minutos, sem rede, no modelo de aparelho padrão.
- Nenhuma entrevista coletada é perdida (fica no aparelho até a API confirmar).
- Às 8h a coordenação tem o cenário do dia anterior, ponderado, com margem de erro e boletim.
- Em um "ensaio" com dados da eleição real (resultado por seção do TSE como verdade), o modelo de ponderação erra menos de 2 p.p. no resultado final.
