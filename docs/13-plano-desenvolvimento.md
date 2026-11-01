# Plano de desenvolvimento até o piloto

**Meta:** piloto na rua em **janeiro de 2027**. Hoje: 31/10/2026. São ~7 semanas úteis de trabalho (novembro e metade de dezembro), mais o recesso de fim de ano como folga.

## Princípio: só o que o piloto precisa
O piloto prova a **operação** e mede o **viés do método**. Ele não precisa do produto completo. A análise estatística do piloto pode ser feita em scripts (como fizemos com 2024); a interface dela vem depois.

### Entra (indispensável para o piloto)
| Peça | Escopo |
|---|---|
| **Contratos** | Formato do questionário (condicionais, encerramento, embaralhar, grade, cenários, autocompletar, NS padrão, versões) e da entrevista |
| **Núcleo** | Login de entrevistador por turno, cadastro de aparelho, bootstrap, ingestão em lote idempotente, flags de qualidade básicas, publicação de questionário |
| **App de coleta** | Android nativo em Kotlin (D2 revista): motor do questionário, fila em SQLite e envio, consentimento, GPS, duração, recusa registrada, disco na tela. Interface funcional e simples; acabamento depois do piloto |
| **Painel interno** | "Campo agora": produção por entrevistador e aparelho, envios pendentes, flags, cotas por estrato |
| **SPA do cliente (mínimo)** | Resultado bruto do dia e acumulado, progresso do campo, aviso de não garantia. No piloto, o "cliente" é o próprio responsável |
| **Infra** | Deploy no EasyPanel com HTTPS, backup do banco, aparelhos com MDM |
| **Análise do piloto** | Scripts: ponderação, viés de voto passado × urna 2024 por bairro, relatórios. Importação dos dados do TSE de Caxias também em script |

### Fica para depois do piloto
| Peça | Por quê pode esperar |
|---|---|
| Tempo real por SSE | Atualizar a tela a cada minuto basta no piloto |
| Boletim e categorização por LLM | Com ~700 entrevistas, a leitura é feita por nós; o LLM entra na fase 3. Se sobrar tempo, um boletim simples |
| Multi-cliente completo, marca d'água, papéis finos | Um único cliente (nós). O banco já nasce com `campaign_id` para não precisar refazer |
| Gravação de voz (experimento A/B) | Exige pipeline de áudio e parecer jurídico. **Ditado** sai de graça: o teclado do Android (Gboard) já tem digitação por voz, sem nenhum desenvolvimento |
| Exportação de contatos, opt-out, retenção automática | No piloto, o contato é só para devolver o resultado do bairro; feito à mão, com cuidado |
| Banco do app cifrado (SQLCipher) | A criptografia nativa do Android + quiosque + MDM cobrem o piloto |

## Calendário
| Semana | Datas | Entregas |
|---|---|---|
| **S1** | 03–07/11 | Especificação técnica: contratos, modelo de dados, telas do app e do painel, decisões de MDM e do app. Repositório, ambiente, `.gitignore` (D22). **Start do código** (dado em 31/10). *Adiantado em 31/10: especificação (`14-especificacao-tecnica.md`), repositório, contratos e questionário do piloto validado no formato.* |
| **S2** | 10–14/11 | Núcleo: autenticação, cadastros, bootstrap, ingestão idempotente. App: casca offline (instalação, fila, envio). *Adiantado em 31/10: motor do questionário (Kotlin, 26 testes) e núcleo (cadastro de aparelho, bootstrap, ingestão idempotente, flags na ingestão, 19 testes, incluindo a prova de que o que o app produz a API aceita). Falta a casca Android do app.* |
| **S3** | 17–21/11 | *Adiantado em 01/11: app Android funcionando de ponta a ponta no emulador (cadastro, login offline, entrevista, retomada após queda, fila offline, envio automático ao voltar a rede).* |
| ~~S3 original~~ | 17–21/11 | App: renderizador e tipos de pergunta do questionário do piloto. Questionário v1 escrito no formato e validado |
| **S4** | 24–28/11 | App: condicionais, encerramento, embaralhar, disco, autocompletar, consentimento, recusa. Núcleo: flags de qualidade. **Compra dos 6 aparelhos até aqui** |
| **S5** | 01–05/12 | Painel "campo agora". SPA mínimo do cliente. Deploy com HTTPS. *Adiantado em 01/11: painel pronto (login com 2 fatores, campo agora, alertas, resultados brutos, progresso, aprovação de questionário, aviso de não garantia, marca d'água; 30 testes na API). Falta o deploy.* *Cadastros no painel (D25) adiantados da S6 para 01/11.* |
| **S6** | 08–12/12 | Cadastros no painel (D25), se não adiantados. Aparelhos: reset, MDM, quiosque, instalação. **Ensaio técnico:** modo avião, 200+ entrevistas simuladas, envio ao voltar a rede, teste de bateria de 6 h |
| **S7** | 15–19/12 | Correções do ensaio. Scripts de análise (ponderação, viés × urna 2024). Material de treinamento |
| Recesso | 22/12–02/01 | Congelamento. Folga para imprevistos |
| **S8** | 05–09/01 | Treinamento (1 dia) e pré-teste (1 dia, ~40 entrevistas). Correções finais |
| **Piloto** | a partir de 12/01 | 12 dias de campo |

## Riscos do prazo
| Risco | Mitigação |
|---|---|
| Atraso no app de coleta (é a peça maior) | Começa na S2; tipos de pergunta limitados ao que o questionário v1 usa |
| Aparelhos usados com problema (Android antigo, bateria, bloqueio) | Comprar até a S4, com a versão mínima definida na S1; 2 de reserva |
| MDM mais trabalhoso que o previsto | Decidir na S1; plano B para 6 aparelhos: modo quiosque/fixação de tela nativo do Android + senha de administrador |
| Recrutamento dos entrevistadores | Começar em dezembro, em paralelo ao desenvolvimento |
| Parecer jurídico atrasar | Itens bloqueantes para o piloto: termo de consentimento e contrato do entrevistador. O resto pode vir depois |

## Quem faz o quê
- **Desenvolvimento:** responsável + Claude.
- **Responsável, fora do código:** compra e preparação dos aparelhos, chips, servidor/domínio, recrutamento e contrato dos entrevistadores, jurídico, levantamento de custos.
