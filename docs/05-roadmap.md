# Roadmap

Horizonte: eleição municipal de outubro de 2028. Período de venda: 2º semestre de 2027 e 1º de 2028. Meta: **piloto feito e método validado até o fim de 2027**, com o caso de Caxias pronto para mostrar.

O marco que organiza tudo é o **piloto de Caxias** (`09-piloto-caxias.md`): o MVP é o mínimo para rodá-lo bem.

## Fase 0: planejamento ← em andamento
- [x] Visão, arquitetura, metodologia, legal, segurança, aparelhos, entrada de dados
- [x] Análise do tracking de 2024 contra as urnas (`11-referencia-2024.md`)
- [x] Modelo de negócio: serviço completo (D17); WordPress fora (D11 revista)
- [x] Formato e bairros do piloto
- [x] Leitura e concordância do responsável com os documentos (31/10/2026)
- [x] Questionário do piloto aprovado (31/10/2026)
- [x] Equipe de campo: diária R$ 80 + R$ 20 de combustível; 6 Samsung Galaxy A14 novos
- [ ] Levantar os demais custos (aparelhos, chips, carregadores, servidor, MDM, LLM)
- [x] Piloto em janeiro de 2027 (`13-plano-desenvolvimento.md`)
- [ ] Validar a parte legal com o jurídico (LGPD, gravação de voz, aviso de não garantia)
- [x] Especificação técnica (`14-especificacao-tecnica.md`), contratos e app nativo (D2 revista)
- [x] **Start** dado em 31/10/2026

## Fase 1: MVP para o piloto
- Contratos: questionário (com cenários, encerramento, condicionais, versões, autocompletar) e entrevista
- Núcleo: login de entrevistador, bootstrap dos aparelhos, ingestão em lote idempotente, flags de qualidade
- App de coleta: offline, fila e envio, consentimento, entrada de dados sem digitação desnecessária
- Painel interno mínimo: publicar questionário, cadastros, campo agora (por entrevistador e aparelho)
- SPA do cliente mínimo: cenário bruto, progresso do campo, aviso de não garantia
- Importador do TSE para Caxias (resultado de 2024 por local, para a comparação de voto passado)
- Aparelhos comprados, MDM configurado, deploy com HTTPS
- Ensaio técnico: 2–3 aparelhos em modo avião, 200+ entrevistas simuladas

## Fase 2: piloto em Caxias
- Treinamento, pré-teste, ~12 dias de campo
- Medir: operação, custo por entrevista, viés de voto passado × urna 2024, experimento de gravação de voz
- Ajustar o método com os resultados

## Fase 3: estatística e análise
- Ponderação por voto passado, perfil e região; faixa de incerteza; média móvel
- Indecisos distribuídos por modelo; projeção de votos
- LLM: categorização das abertas, boletim diário (revisado por nós), perguntas em linguagem natural sobre consultas pré-definidas
- Recalibrar com o piloto e com o ensaio de 2024

## Fase 4: pronto para vender
- Isolamento multi-cliente completo, papéis, auditoria de acesso, marca d'água
- Exportação da base consentida + opt-out; retenção e anonimização pós-eleição
- Contrato e material de venda com o caso de Caxias (sem prometer resultado, D16)
