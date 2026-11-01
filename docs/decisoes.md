# Decisões

Em 31/10/2026 o responsável leu todos os documentos e concordou com eles. As propostas abaixo passam a valer como decisões, salvo as marcadas como pendentes.

## Tomadas
| # | Decisão | Por quê |
|---|---|---|
| D1 | Núcleo em Python (FastAPI, SQLAlchemy 2, psycopg 3, Alembic) + PostgreSQL 16, deploy no EasyPanel | Mesma stack do `finance_bot`; Python é a melhor casa para estatística e LLM. |
| D2 | ~~PWA em quiosque~~ → **revista em 31/10/2026: app de coleta nativo em Kotlin** (Jetpack Compose, fila em SQLite/Room, envio por WorkManager), distribuído pela conta do responsável no Google Play e instalado em quiosque pelo MDM | Os aparelhos são nossos: a vantagem do PWA (sem loja) some, e o risco dele (fila dentro do Chrome, apagável) bate de frente com "nada se perde no campo". Capacitor descartado: um só stack, sem camada intermediária. Decisão do responsável. |
| D3 | `id` da entrevista é UUID gerado no aparelho; ingestão faz upsert | Reenvio inofensivo. |
| D4 | Questionário é documento JSON versionado; cada entrevista guarda a versão respondida | Mudar perguntas sem novo deploy; em 2024 o questionário mudou entre dias sem controle. |
| D5 | Respostas como documento e em formato longo | Original preservado; SQL simples. |
| D6 | Contato em tabela separada, consentimentos com data/hora | LGPD. |
| D7 | Flags de qualidade não descartam entrevista | Excluir é decisão humana; dado bruto nunca some. |
| D8 | Entrevistador faz login por turno no aparelho | Aparelho ≠ entrevistador (em 2024 o mesmo "Pesquisador 31" foi duas pessoas). |
| D9 | LLM só recebe agregados e textos abertos sem identificação | LGPD e confiabilidade. |
| D10 | Multi-cliente com isolamento forte entre campanhas | Campanhas adversárias no mesmo servidor. |
| D11 | ~~WordPress + RV Form Builder como back-office~~ → **revista em 31/10/2026: sem WordPress.** Questionário em JSON versionado, escrito e publicado por nós; do plugin aproveitamos o código (renderizador no app; editor interno no futuro, se preciso) | Com serviço completo (D17) não há cliente editando; o WordPress só somaria risco (o questionário revela a estratégia), operação e lacunas a construir. Ver `07-questionario-dinamico.md`. |
| D12 | Aparelhos fornecidos por nós, gerenciados por MDM, com chip | Segurança. |
| D13 | Aparelhos comprados e incluídos no preço | — |
| D14 | Respostas vão direto do app para o núcleo | Um só lugar guarda tudo, atrás da menor superfície; tempo real. |
| D15 | Resultados num SPA, em tempo real (SSE), com três camadas: campo agora / dia parcial / cenário | Evita decisão em cima de oscilação de meio de dia. |
| D16 | O sistema não garante eleição: aviso no contrato (obrigação de meio), no primeiro acesso, na projeção, no boletim e na venda; projeção sempre como faixa | Evitar que um usuário desavisado trate projeção como certeza. |
| D17 | **Serviço completo.** Nós operamos sistema, questionário, aparelhos, entrevistadores e análise. O cliente faz o briefing, escolhe o tipo de pesquisa, **aprova** o questionário e consome resultados; **não opera o sistema** | Definido pelo responsável em 31/10/2026. Substitui a discussão de modelos de cobrança "só software / híbrido". |
| D18 | O cliente vê progresso agregado do campo, não detalhe por entrevistador; boletim do LLM revisado por nós antes de ir ao cliente (no início) | Consequência de D17: gestão da equipe é nossa. |
| D19 | Questionário-padrão registra **em quem** a pessoa votou na eleição anterior | Lição do ensaio de 2024: é a principal correção de viés. |
| D20 | Entrada de dados: nada digitado que possa ser escolhido; autocompletar nas abertas de nome; ditado (sem guardar áudio) no MVP; gravação de trecho só como experimento A/B no piloto | `12-entrada-de-dados.md`. |
| D21 | Importador do TSE no núcleo: baixa uma vez por cliente e guarda só o município | Arquivos oficiais são grandes; ninguém da operação lida com eles. |
| D23 | **Questionário do piloto aprovado** (v1, `09-piloto-caxias.md`) | Aprovado pelo responsável em 31/10/2026. |
| D24 | **Piloto: 6 Samsung Galaxy A14 novos, 4 GB** (4 + 2 reserva; ~R$ 4.800; antes eram "usados", trocado em 31/10/2026 pelo preço do novo); entrevistadores por **diária de R$ 80 + R$ 20 de combustível** (moto própria); custo inicial 100% do responsável | Definido em 31/10/2026. Equipe de campo do piloto: R$ 5.600 (14 dias × 4 × R$ 100). |
| D22 | `tracking_reference/` e `tse/` ficam fora do controle de versão (`.gitignore`) | Contêm nomes de entrevistados e arquivos grandes. |
| D25 | **Cadastros no painel antes do ensaio técnico** (01/11/2026): entrevistadores (PIN, desativar), aparelhos (código de cadastro, revogar), estratos/bairros/pontos com meta diária, usuários do painel e envio de nova versão do questionário. Admin faz tudo; supervisão só entrevistadores e aparelhos. Nada se apaga: desativa (entrevistas antigas apontam para os cadastros) | Estava na especificação (§6) mas fora do calendário; o ensaio da S6 já precisa cadastrar aparelhos e equipe sem linha de comando. |
| D26 | **Mapa de opinião só agregado** (01/11/2026): o cliente vê a cidade em hexágonos (~500 m), cada um pintado por um indicador, com margem e n; hexágono com menos de 30 entrevistas não mostra valor. A agregação é feita no núcleo: **nenhuma coordenada individual sai para o navegador do cliente**. Pontos por entrevista só no mapa de cobertura da equipe (supervisão e qualidade). Mapa de calor de pontos descartado | No porta a porta, a coordenada é a casa do entrevistado e opinião política é dado sensível (LGPD art. 5º, II); a densidade de pontos mostra o desenho da amostra, não a opinião. |
| D27 | **Painel do cliente amplia** (01/11/2026): cruzamentos (indicador por voto em 2024, sexo, faixa etária, escolaridade, renda, estrato), segmentos aprovação × continuidade, rankings (prioridade, lembrança espontânea) e o mapa (D26). Mapa da urna de 2024 por local de votação vem com o importador do TSE (S7) | Adiantados porque o núcleo do piloto está à frente do calendário; voto passado é a principal chave de leitura (D19). |
| D28 | **Painel do cliente pensado para leigo e celular** (01/11/2026): navegação curta (Resumo, Bairros, Detalhes, Questionário); resumo em frases geradas por regras ("o que mudou"), sem LLM; ficha por bairro (onde a entrevista foi feita, mínimo de 30); margem de erro escondida por padrão (a leitura vem em palavras: "empate técnico", "à frente"), com opção de mostrar; cruzamentos mostram primeiro só os grupos que se diferenciam | Revisão do painel do ponto de vista do cliente: os números estavam certos, mas não falavam. O cliente abre no celular, entre reuniões. |
| D29 | **Marcos, boletim e método** (01/11/2026): a equipe cadastra marcos da campanha (inauguração, debate, crise), que aparecem para o cliente no gráfico de evolução; boletim para reunião gerado pelo navegador (imprimir ou salvar em PDF), com nome de quem gerou, data, marca d'água e "uso interno", e cada geração registrada na auditoria; página "como a pesquisa é feita" com os números do próprio campo, sem dado de pessoa | O cliente precisa ligar resultado a acontecimento, levar o resultado para a reunião (senão tira print) e confiar no número. PDF no navegador evita gerar arquivo no servidor. |
| D30 | **Painel em shadcn/ui** (01/11/2026): Tailwind v4 + componentes shadcn (Radix), fonte Geist, paleta atual (grafite na interface, cor só nos dados). Migração gradual: páginas novas já nascem em shadcn; as existentes migram uma a uma, começando pela moldura (login, cabeçalho, abas, aviso); o CSS antigo fica congelado numa camada própria até sumir. HeroUI descartado | O piloto será apresentado ao cliente na tela: o impacto visual pesa tanto quanto o dado. shadcn copia o código dos componentes para o projeto (sem dependência travando o visual) e dá acessibilidade pronta em menus, seleções e diálogos. Migração completa estimada em 6 a 9 dias; gradual para não tirar semanas do calendário do piloto. |

## Histórico (respondidas em 30/10/2026)
| Pergunta | Resposta |
|---|---|
| Dados de 2024 | Projeção feita na mão (~300 votos; real: 565). Três exports de dias encontrados e analisados; ensaio contra as urnas em `11-referencia-2024.md`. |
| Dores do fornecedor anterior | Suporte lento, falhas de comunicação, preço. |
| Negócio | Vender para outros municípios, substituindo o fornecedor anterior. |
| Piloto | Caxias/MA, 4 entrevistadores, financiado por nós, avaliação da gestão em bairros centrais × afastados, sem povoados (`09-piloto-caxias.md`). |
| "Disco 2" de 2024 | Cenário polarizado (só os dois primeiros). O formato precisa suportar cenários. |

## Pendentes
1. **Preço do serviço completo:** por semana de tracking, por campanha, por porte do município? Depende do custo real por entrevista medido no piloto.
2. ~~Quando rodar o piloto~~ → **janeiro de 2027** (campo a partir de ~12/01). Plano em `13-plano-desenvolvimento.md`.
3. ~~Revisão do questionário do piloto~~ → aprovado (D23).
3a. **Levantamento de custos** pelo responsável: aparelhos usados, chips, carregadores, servidor, MDM, API do LLM. Equipe de campo já calculada (D24).
4. **Hospedagem:** EasyPanel na VPS atual? Domínio (HTTPS).
5. **Provedor de LLM:** proposta é Claude via API.
6. **Orçamento por aparelho** (define o modelo padrão) e **MDM** (pago ou API gratuita do Android).
7. **Gravação de voz** (experimento do piloto): validar com o jurídico.
8. **Vínculo dos entrevistadores:** **não será CLT** (definido em 31/10/2026); direção é diária, produção ou combinação. Falta o desenho: só entrevista validada conta para pagamento, parte variável considerando qualidade, teto diário (ver `03-metodologia.md`). Validar o formato do contrato com o jurídico.
9. **Cobertura do campo para o cliente** (levantado em 01/11/2026): hoje só a equipe vê o mapa de cobertura, com um ponto por entrevista (D26). Talvez o cliente queira ver por onde a equipe passou. Qualquer versão para ele tem que respeitar a LGPD: **nenhuma coordenada de entrevista** sai para o navegador do cliente, porque no porta a porta o ponto é a casa da pessoa e opinião política é dado sensível (art. 5º, II). Caminhos possíveis: só os pontos de trabalho cadastrados, contagem de entrevistas por bairro ou por hexágono (como o mapa de opinião, com mínimo de entrevistas), ou trajeto generalizado. Decidir com o jurídico antes de implementar; se aprovado, vira uma decisão D* que complementa a D26.
