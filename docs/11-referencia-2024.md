# Referência: tracking de Caxias 2024

Fonte: export de um dia de campo (06/09/2024, um mês antes da eleição), entregue pelo responsável sem coordenadas, telefone e endereço. **O arquivo original não fica no repositório** (ainda contém nomes de entrevistados). Este documento guarda só a estrutura e os aprendizados.

## Retrato do dia
- ~120 entrevistas, **8 pesquisadores** (numerados de 29 a 36, o que sugere uma equipe total de 36 ou mais).
- Produção por pesquisador: de **8 a 30 por dia**, média **~15**.
- Duração típica: 2 a 5 minutos.
- Cobertura: zona **urbana** (Antenor Viana, Baixinha, Salobro, Teso Duro, Bacuri) e **rural** (povoados Trabalhosa, Baú, Buenos, Caxirumbi).
- Candidatos na estimulada: Gentil Neto (PP), Paulinho (PL), Lycia Waquim (PSDB), Edimilson Sanches (PSOL). Prefeito à época: Fábio Gentil.

## Estrutura do questionário (fornecedor IPPI Pesquisas)
| Bloco | Perguntas |
|---|---|
| Abertura | Texto lido + aceite |
| Filtro | É eleitor em Caxias? |
| Local | Zona residencial (urbana/rural) → **bairro** (se urbana) ou **povoado** (se rural) |
| Perfil | Sexo, faixa etária (16–24, 25–34, 35–44, 45–59, 60+), instrução (3 faixas), renda familiar (faixas de SM), religião |
| P1–P2 | Espontânea vereador, espontânea prefeito (texto livre) |
| P3 | Estimulada prefeito, "Disco 1" |
| P4 | Decidido ou poderia mudar |
| P5 | Estimulada "Disco 2" (outro cenário) |
| P6 | Expectativa de vitória (quem vai ganhar) |
| P7 | Rejeição (em quem não votaria) |
| P8–P9 | Avaliação (ótimo → péssimo) e aprovação da gestão |
| P10 | Lembrança de voto na eleição anterior |
| P11 | Intenção de comparecimento |
| P12 | Principal fonte de informação sobre política |
| Controle | Entrevistador (digitado), bairro/povoado (digitado de novo), nome do entrevistado, ID do pesquisador, nº, início, fim, GPS, endereço |

O questionário-padrão do nosso produto deve partir dessa estrutura, que já é a linguagem do mercado e do cliente.

## Problemas encontrados nos dados (o que o nosso sistema precisa evitar)
| Problema | Exemplos no arquivo | Resposta do sistema |
|---|---|---|
| **Espontânea sem padronização** | "Não sabe", "Ns", "N/s", "N.s", "Nao sabe", "Nenhum", "Não tem", "Indecisa", "Avaliando", "Em branco"; e "Lycia", "Lucia", "Licya waquim" | Botões padrão de NS/Nenhum/Indeciso no app; LLM normaliza os nomes depois, com revisão |
| **Campo redigitado** | Bairro digitado de novo: "Salobro", "Salobra", "Saibro", "Salobo", "Salobre"; "Caxirimbu", "Caxurimbu", "Caxurumbi" | Bairro e povoado vêm de lista; nunca digitados duas vezes |
| **Entrevistador digitado** | O mesmo nome de pesquisador escrito de três jeitos (com acento, sem acento e com espaço no meio) | Identidade vem do login, não de digitação |
| **Erro na definição das opções** | "Não sabe/Não opina (Espontâneo" sem fechar parêntese | Opções-padrão reutilizáveis (biblioteca de respostas) |
| **Entrevista rápida demais** | Uma entrevista de 17 perguntas feita em **23 segundos**; várias de 1 a 1,5 min | Flag `too_fast` (limite proporcional ao nº de perguntas) |
| **Horário redondo** | Início 17:55:00, fim 18:00:00 | Horários gerados pelo app, nunca editáveis |
| **Entrevista "esquecida aberta"** | 29 minutos para um questionário de 3 | Flag de duração anômala; tempo por pergunta |
| **Respostas contraditórias** | Avalia "Péssimo" e "Aprova"; avalia "Bom" e "Não aprova" | Regras de consistência entre perguntas (alerta na hora, para o entrevistador confirmar) |
| **"Não sabe" demais na estimulada** | A grande maioria respondeu NS na estimulada a um mês da eleição, concentrado em alguns pesquisadores | Indício de que o disco não foi apresentado. Mostrar o **disco na tela** para o entrevistado + flag de taxa de NS por entrevistador acima da média do grupo |
| **Nome coletado à toa** | Nome pedido em toda entrevista; vários "Não quis ser identificado" | Nome só no bloco opcional de contato, com consentimento (LGPD) |

## O que três dias juntos mostram (06, 07 e 10/09/2024)
Depois chegaram os exports de 07/09 e 10/09 (mesma origem, mesmos cuidados: fora do repositório).

| Achado | Evidência | Consequência para o produto |
|---|---|---|
| **Efeito entrevistador forte** | Em 10/09, nos mesmos bairros (Cangalheiro, Pequizeiro), um pesquisador registrou "Não sabe" na estimulada em quase todas as entrevistas, enquanto os colegas obtinham respostas. Em 06/09 o padrão aparece em outros pesquisadores. | Taxa de NS por entrevistador comparada aos colegas **no mesmo bairro e dia**, em tempo real. É o alerta mais valioso do painel do supervisor. |
| **A mistura de bairros muda todo dia** | 06/09: Salobro, Antenor Viana, Teso Duro…; 07/09: Mutirão, Vila Alecrim, São Francisco…; 10/09: Cangalheiro, Nova Caxias, Pequizeiro…. Cada dia é uma cidade diferente. | A variação de um dia para o outro mistura opinião com geografia. Sem ponderação por região, a série diária engana. **Isso explica por que a leitura em 2024 precisou ser "no feeling".** |
| **Concentração excessiva** | Em 07/09 um único pesquisador fez cerca de 60 entrevistas, todas no mesmo bairro, numa fração relevante da amostra do dia. | Teto de entrevistas por entrevistador/bairro/dia; alerta de produção atípica (para revisão, não acusação). |
| **Volume diário desigual** | O total de entrevistas variou muito entre os três dias. | Meta diária por estrato; média móvel ponderada, não soma simples. |
| **"Pesquisador N" não é uma pessoa** | O mesmo "Pesquisador 31" aparece com um nome de entrevistador em 06 e 07/09 e com outro, de outra pessoa, em 10/09. | Confirma a decisão de separar **aparelho** de **entrevistador** (login por turno). |
| **Questionário mudou sem versão** | A opção NS da P4 vem "(Espontâneo" em 06 e 07/09 e "Não sabe/Não opina" em 10/09; o enunciado da P9 também mudou. | Versão congelada gravada em cada entrevista. Sem isso, comparar dias é comparar perguntas diferentes. |
| **Pergunta fora de contexto** | "Está decidido" (P4) registrado para quem respondeu NS na estimulada (P3). | P4 só aparece se P3 for um candidato (condicional). |
| **Espontânea x estimulada divergentes** | Espontânea "Gentil", estimulada "Paulinho" na mesma entrevista. | Não é necessariamente erro, mas vale alerta de confirmação e, na análise, taxa de divergência por entrevistador. |

## Números dos três dias (análise de 30/10/2026)
840 entrevistas: 124 (06/09), 500 (07/09), 216 (10/09); 8 pesquisadores (IDs 29 a 36); 24% rurais. Provavelmente é só parte da equipe e dos dias do tracking, não uma amostra da cidade.

**Estimulada (P3), votos válidos, bruto:**
| | Paulinho | Gentil Neto | Lycia | Edimilson | NS na P3 |
|---|---|---|---|---|---|
| 06/09 | 25,0 | 12,5 | 62,5 | 0,0 | **75,8%** |
| 07/09 | 54,0 | 42,2 | 2,7 | 1,1 | 22,4% |
| 10/09 | 52,3 | 33,6 | 12,1 | 1,9 | 41,7% |
| 3 dias | 52,7 | 39,3 | 6,8 | 1,2 | 35,2% |
| Urbana | 58,3 | 32,1 | 7,9 | 1,7 | |
| Rural | 37,6 | 58,6 | 3,8 | 0,0 | |

Leituras:
- **06/09 não serve como leitura:** 76% de NS na estimulada deixa só ~16 votos válidos. O dia mede o procedimento, não o eleitor.
- **Ajustar por sexo, idade, escolaridade e zona quase não mudou nada** dentro de cada dia. A oscilação entre os dias vem de **bairro e entrevistador**, não do perfil demográfico. Isso confirma que estratificar por região e controlar o entrevistador importa mais que a ponderação demográfica.
- ~~A zona decide a eleição~~ **Hipótese derrubada pelo TSE (ver ensaio abaixo):** a zona rural pesou 21,2% dos válidos, quase o mesmo da amostra (24%). O peso da zona não explica o erro.
- **Pesquisador 32 em 10/09:** 97% de NS na P3, contra 42% no dia, nos mesmos bairros. Excluí-lo não mudou o resultado agregado, mas no painel ele seria o alerta do dia.
- **Pesquisador 33 em 07/09:** 63 entrevistas, todas em Vila Alecrim, com só 3% de NS. Como os colegas daquele dia fizeram cotas idênticas por bairro (21 no Mutirão, 14 na Vila Alecrim…), a concentração parece ser do plano de campo, não fraude. Mas pesa demais num bairro só.
- **130 entrevistas responderam "decidido/poderia mudar" (P4) sem ter escolhido candidato** na P3: condicional ausente no questionário.
- Inconsistências avaliação × aprovação: 11 (1,3%). Duração mediana 2min55s; 20 abaixo de 90 s.
- **"Disco 2" (P5) era o cenário polarizado:** só Paulinho e Gentil Neto aparecem nas respostas, e 85% de quem escolheu candidato na P3 repetiu o voto. Era a simulação de "e se fossem só os dois?".
- Avaliação da gestão (bruto): 60% desaprovam (P9) entre quem respondeu; na P8, "Regular" foi a resposta mais comum (34%) e ruim + péssimo somam 39%.

## Ensaio contra o resultado oficial
**Resultado (06/10/2024, 382 seções):** Gentil Neto 43.352 (48,70%) · Paulinho 42.787 (48,07%) · Lycia 2.342 (2,63%) · Edmilson 531 (0,60%). Diferença: **565 votos**. Abstenção 18,12%.

| Leitura (07 + 10/09, 716 entrevistas) | Paulinho | Gentil | Margem P−G | Erro na margem |
|---|---|---|---|---|
| Só decididos, bruto | 53,6 | 40,3 | +13,3 | 13,9 p.p. |
| + "não sabe" distribuído por zona e aprovação | 53,0 | 40,9 | +12,1 | 12,7 |
| + peso rural **oficial** (21,2%) | 55,0 | 38,6 | +16,4 | 17,0 |
| **Oficial** | **48,07** | **48,70** | **−0,63** | — |
| Pesquisa registrada INOP/O Imparcial (out/24) | 55,14 | 40,83 | +14,3 | 14,9 |

**Oficial por zona** (arquivo de votação por seção do TSE, MA 2024; local classificado como rural quando o endereço cita povoado/rodovia):
| | Peso nos válidos | Paulinho | Gentil |
|---|---|---|---|
| Urbana | 78,8% | 49,1 | 47,3 |
| Rural | 21,2% | 44,2 | 53,7 |
| Tracking urbano (3 dias) | — | 58,3 | 32,1 |

**Mesmo lugar, tracking × urna** (decididos de 07 e 10/09 × válidos da seção; n pequeno por lugar):
| Lugar | n tracking | Margem P−G tracking | Margem P−G urna | Erro |
|---|---|---|---|---|
| Brejinho | 26 | −26,9 | −49,8 | +22,9 |
| Nazaré do Bruno | 32 | −18,8 | −30,4 | +11,7 |
| Engenho D'Água | 14 | 0,0 | −29,2 | +29,2 |
| Descanso | 5 | −20,0 | −36,6 | +16,6 |
| Caldeirões | 5 | +20,0 | −5,1 | +25,1 |
| Pirajá | 13 | +61,5 | +4,6 | +56,9 |
| Barro Vermelho | 10 | −100,0 | −24,9 | −75,1 |

**Eleição anterior (2020, mesmo arquivo do TSE):** Fábio Gentil 78,2% dos válidos, Adelmo Soares 13,0%, demais 8,8%. Foi uma vitória esmagadora do mesmo grupo político, que em 2024 caiu para 48,7% e mesmo assim venceu.
- Por local de votação (85 locais casados pelo nome, 67% dos válidos de 2024), a força de Fábio em 2020 **prevê pouco** a força de Gentil Neto em 2024 (correlação 0,23; dos 70% aos 90% em 2020, Gentil Neto vai só de 47% a 53%). Em Caxias, o "mapa" da eleição anterior serve pouco como linha de base por bairro.
- O que 2020 oferece de útil é o **total de referência para o voto passado individual**: 78% dos votantes de 2020 escolheram Fábio. Se a P10 de 2024 tivesse registrado em quem a pessoa votou, a fração da amostra que lembrava de ter votado em Fábio, comparada aos 78%, teria **medido o tamanho do viés** visto acima. Como a P10 só registrou Sim/Não, o teste fica para o piloto.

**Conclusões:**
1. **Esses dias, sozinhos, projetariam vitória de Paulinho**, e nenhum ajuste inverte o resultado. A pesquisa registrada de outubro errou do mesmo tamanho.
2. **O erro não veio da mistura de lugares nem do peso da zona.** O peso rural da amostra estava certo, e **dentro dos mesmos lugares** o tracking superestimou Paulinho em 6 de 7 casos (tipicamente +12 a +29 p.p. na margem). O viés estava **em quem respondia, em cada lugar**, ou na **mudança de voto no último mês**. O maior desvio está na zona urbana: urna quase empatada (49 × 47), tracking com 26 p.p. para Paulinho.
3. **A eleição foi um plebiscito sobre a gestão.** Entre quem aprovava, 77,5% votavam em Gentil Neto; entre quem desaprovava, 79,2% em Paulinho. Na amostra, só 40% dos que responderam aprovavam; para o empate, seria preciso perto de 50%. Hipóteses para a distância, a testar no piloto: (a) o eleitor da continuidade (beneficiário, servidor, ligado à gestão) responde menos ou se declara "não sabe" na rua; (b) a abordagem de rua sub-representa quem fica em casa; (c) movimento real no último mês. Com dados só do início de setembro não dá para separar.
3. **A variável que teria corrigido isso foi desperdiçada:** a P10 ("lembra em quem votou na última eleição?") registrava só Sim/Não. Se registrasse **em quem**, daria para ponderar a amostra pelo resultado oficial de 2020, a correção-padrão para esse tipo de viés.
4. **O "feeling" do responsável enxergou o que os números brutos não mostravam** (provavelmente com dias posteriores e conhecimento de campo). O produto precisa transformar essa leitura em regras explícitas:
   - ponderar por **voto passado** (oficial, do TSE), que ataca diretamente o viés "dentro do lugar" encontrado acima; zona por seção continua, mas não basta;
   - comparar cada bairro com o **resultado da urna da eleição anterior naquele local**, para detectar amostra enviesada antes da eleição;
   - acompanhar a **aprovação da gestão** como indicador-mestre quando há candidato de continuidade;
   - distribuir indecisos por modelo (aprovação, zona, perfil), não proporcionalmente;
   - mostrar sempre a **faixa de incerteza** da margem, não só o número.
5. **Ensaio de calibração:** quando o motor existir, ele deve rodar com esses arquivos e com o resultado acima como verdade, e a meta é reduzir o erro da margem bem abaixo dos ~13 p.p. do bruto.

## Funcionalidades que o arquivo revela
- **Disco na tela:** a estimulada mostra os candidatos em formato circular (sem primeiro nem último), em ordem embaralhada, virada para o entrevistado.
- **Pergunta condicional por zona:** urbana → bairro, rural → povoado.
- **Cenários múltiplos** (Disco 1, Disco 2): a mesma pergunta com listas diferentes.
- **Painel de produção por entrevistador**: a diferença de 8 para 30 entrevistas por dia, junto com as durações, é exatamente o que o supervisor precisa ver em tempo real.
- **Comparecimento (P11) e lembrança de voto (P10)** alimentam o modelo de projeção: votos válidos estimados × probabilidade de comparecer.
