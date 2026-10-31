# Metodologia do tracking

O sistema é tão bom quanto a amostra. Este documento fixa o método e o que o software precisa suportar para que os números sejam confiáveis. Revisado em 31/10/2026 com as lições do ensaio de 2024 (`11-referencia-2024.md`).

## O que 2024 ensinou (resumo)
Os dados de setembro de 2024, um mês antes da eleição, davam **Paulinho 53,6 × Gentil Neto 40,3** entre os decididos. A urna deu **Gentil Neto 48,7 × Paulinho 48,1**. O erro na margem foi de ~14 p.p., do mesmo tamanho que o de uma pesquisa registrada da época. O ensaio mostrou que:
- o erro **não** veio do peso da zona rural (a amostra tinha 24%, a urna 21%) nem da mistura de bairros;
- **dentro dos mesmos lugares** o tracking superestimou Paulinho (6 de 7 casos);
- a eleição foi um **plebiscito sobre a gestão** (77% de quem aprovava votava em Gentil Neto; 79% de quem desaprovava, em Paulinho);
- a variação entre dias vinha de **bairro e entrevistador**, não do perfil demográfico;
- a pergunta que teria medido o viés (em quem votou na eleição anterior) existia, mas só registrava "lembra / não lembra".

Consequência: **o viés de quem responde é o inimigo principal.** Cotas demográficas são necessárias, mas não bastam; a correção mais importante é pelo **voto passado**, contra o resultado oficial.

## Desenho amostral
- **Estratos por região** (ex.: bairros centrais, afastados, zona rural), com meta de entrevistas por estrato. A alocação pode ser igual entre estratos (para comparar) ou proporcional ao eleitorado (para estimar a cidade); a ponderação depois corrige para o peso real de cada região.
- **Pontos** dentro de cada estrato: pontos de fluxo onde há movimento; **abordagem domiciliar com intervalo** (a cada N casas) onde não há. A abordagem fica registrada em cada entrevista, porque rua e casa podem dar perfis diferentes.
- **Cotas** por estrato: sexo × faixa etária (e escolaridade quando houver meta confiável), a partir do perfil do eleitorado do TSE.
- **Rotação planejada:** cada entrevistador passa por vários bairros e cada bairro recebe vários entrevistadores ao longo da semana. Nenhum dia "é" um bairro só (em 2024, cada dia cobria uma cidade diferente, e isso confundia a leitura).
- **Teto de concentração:** limite de entrevistas por entrevistador, por bairro e por dia (em 2024, um pesquisador fez 63 entrevistas num bairro só, num dia).
- **Amostra diária** fixa por estrato. Leitura principal em **média móvel** (3 dias com amostra grande; 5–7 dias com amostra pequena, como no piloto).

## Ponderação
Em ordem de importância, a partir do ensaio de 2024:
1. **Voto passado:** a amostra é ajustada para que a distribuição de "em quem votou na última eleição" bata com o **resultado oficial** daquela eleição (TSE). É a correção que ataca o viés de quem responde. Cuidados: quem não lembra ou não diz fica num grupo próprio; o resultado oficial é recalculado sobre quem votou (sem abstenção), e o peso dessa variável é monitorado, porque pessoas tendem a "lembrar" de ter votado no vencedor.
2. **Região:** peso real de cada estrato no eleitorado (TSE, por local de votação).
3. **Perfil:** sexo, faixa etária, escolaridade.

Técnica: **raking** (ajuste iterativo nas marginais), com corte de pesos extremos (ex.: entre 0,3 e 3). Reporta sempre:
- resultado **bruto** e **ponderado**, lado a lado;
- **n** e **n efetivo** (Kish), e a margem calculada sobre o n efetivo;
- quanto cada ajuste mexeu no resultado (se uma única correção mudar muito o número, é sinal de amostra frágil, não de acerto).

## Indecisos e projeção
- **Indecisos não são distribuídos proporcionalmente.** São distribuídos por modelo, a partir de quem tem o mesmo perfil, região e **avaliação da gestão** e já escolheu candidato.
- **Projeção de votos** = votos válidos estimados × comparecimento esperado por região (histórico do TSE por local de votação).
- A projeção é sempre apresentada como **faixa** (ex.: "Gentil Neto entre 46% e 51%"), nunca como placar fechado, junto com o aviso de que não há garantia de resultado (D16).
- Toda projeção mostra também o **cenário alternativo** (ex.: "se os indecisos se dividirem como os que desaprovam a gestão…"), para a campanha ver a sensibilidade.

## Questionário-padrão (núcleo)
1. **Aceite** (recusa é registrada; a taxa de recusa é dado)
2. **Filtros:** mora na cidade? vota aqui? idade
3. **Perfil:** sexo, faixa etária, escolaridade, bairro, renda
4. **Voto passado:** **em quem votou para prefeito na última eleição** (lista de candidatos daquela eleição + branco/nulo, não votou, não lembra, prefere não dizer)
5. **Espontânea** (aberta, com autocompletar só para o entrevistador; ver `12-entrada-de-dados.md`)
6. **Estimulada**, com **disco na tela**, ordem embaralhada; **cenários** quando houver (ex.: só os dois primeiros)
7. **Certeza do voto** (só para quem escolheu candidato)
8. **Rejeição** (múltipla)
9. **Expectativa:** quem vai ganhar
10. **Avaliação da gestão:** aprova/desaprova; ótima → péssima. Quando há candidato de continuidade, é o **indicador-mestre**
11. **Comparecimento:** vai votar?
12. **Abertas temáticas** (ex.: maior problema do bairro)
13. **Segundo turno**, se o município tiver mais de 200 mil eleitores
14. **Contato opcional**, com consentimento próprio

## Indicadores derivados
- Intenção de voto válida, bruta e ponderada, com faixa de incerteza
- **Aprovação da gestão** e a relação aprovação × voto
- **Potencial** (vota com certeza + poderia votar) e **teto** (100% − rejeição)
- Indecisos por perfil e região: onde aplicar esforço
- **Viés de voto passado:** diferença entre o que a amostra diz ter votado e o resultado oficial, por estrato (o termômetro da qualidade da amostra)
- Projeção de votos (faixa)

## Controle de qualidade do campo
Flags automáticas (a entrevista não é descartada; vai para revisão):
| Flag | Regra inicial | Origem |
|---|---|---|
| `too_fast` | duração abaixo do mínimo proporcional ao número de perguntas | 2024: entrevista de 17 perguntas em 23 s |
| `too_long` | duração muito acima da mediana (entrevista "esquecida aberta") | 2024: 29 min |
| `no_gps` / `far_from_point` | sem coordenada / > 500 m do ponto | — |
| `burst` | mesmo entrevistador, intervalo < 45 s da anterior | — |
| `ns_outlier` | taxa de "não sabe" na estimulada muito acima dos colegas **no mesmo bairro e dia** | 2024: 97% contra 42% |
| `concentration` | entrevistador acima do teto por bairro/dia | 2024: 63 num bairro |
| `inconsistent` | contradição entre perguntas (ex.: "péssima" e "aprova") | 2024: 11 casos |
| `duplicate_phone` | telefone já entrevistado na campanha | — |
| `straightlining` | (fase 3) padrão de respostas repetido do mesmo entrevistador | — |

Perguntas condicionais e campos sem digitação (D20) eliminam na origem outros erros vistos em 2024 (certeza do voto sem candidato, bairro escrito de cinco jeitos).

O supervisor vê, por entrevistador: produção, duração, taxa de flags, taxa de "não sabe" comparada aos colegas e desvio das cotas. Entrevistas de entrevistador com flags em excesso saem da ponderação até revisão.

## Entrevistadores: remuneração e qualidade
O vínculo ainda será definido, mas **não será CLT**: a direção é diária, produção ou combinação das duas. Pagar por produção cria incentivo a entrevista rápida ou inventada, então a regra de pagamento precisa conversar com o controle de qualidade:
- só conta para pagamento a entrevista **validada** (sem flag grave, ou revisada e aceita);
- se houver parte variável, ela considera também **qualidade** (taxa de flags, cumprimento de cotas, GPS), não só volume;
- meta diária com teto, para não premiar concentração;
- o contrato de prestação inclui confidencialidade, LGPD e ciência do rastreamento do aparelho durante o turno (`08-aparelhos.md`).

## Validação contra a realidade
- **Antes da eleição:** o viés de voto passado (amostra × urna anterior, por estrato) é medido continuamente. No piloto, contra a urna de 2024 (`09-piloto-caxias.md`).
- **Depois da eleição:** a projeção da véspera é comparada com o resultado oficial por local de votação. Isso recalibra o modelo para a campanha seguinte.
- **Ensaio permanente:** os dados de 2024 e o resultado oficial ficam como caso de teste do motor. Meta: reduzir o erro da margem bem abaixo dos ~14 p.p. do bruto.
