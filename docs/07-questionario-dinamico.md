# Questionário dinâmico e o RV Form Builder

> **Decisão final (31/10/2026, D11 revista):** o WordPress **não** entra no produto. Como o cliente não opera o sistema (serviço completo, D17), não há quem precise de um editor visual de cliente, e o WordPress só traria superfície de ataque (o questionário revela a estratégia da campanha), um sistema a mais para operar e lacunas a construir de qualquer jeito. O questionário passa a ser um **arquivo JSON versionado**, escrito por nós e publicado no núcleo (fluxo em `02-arquitetura.md`). Do plugin aproveitamos o **código**: o renderizador React e a arquitetura de campos vão para o app de coleta; os componentes do editor podem virar, no futuro, um editor **interno** no painel da equipe, se escrever JSON à mão ficar lento. O histórico da avaliação abaixo fica como registro.

## Requisito
O questionário não pode ser fixo. Cada cliente e cada fase da campanha pedem perguntas diferentes, e a coordenação muda perguntas no meio do tracking (entra um candidato, sai outro, surge um tema). Precisamos de um **editor visual de questionários** e de um **formato de questionário** que o coletor offline saiba renderizar.

## O que o plugin já tem (avaliado em `wordpress/wp-content/plugins/wpform-builder`, v1.3.0)
- Editor visual em React, com ~20 tipos de campo: texto, número, telefone, CPF/CNPJ, data, múltipla escolha (radio, checkbox, select), rating, slider, seção, divisor, grupo, id único etc.
- Cada tipo de campo é autocontido (`field.json` como manifesto + componente + template), então dá para criar tipos novos sem mexer no núcleo.
- **Lógica condicional** (mostrar/esconder por regras com E/OU).
- Formulário salvo como **um documento JSON** (`form_data`) e exposto por REST.
- Um **renderizador público em React** (`src/public-renderer`, ~1.000 linhas) separado do PHP, com motor de validação e de condicionais.

## O que falta para pesquisa eleitoral
| Necessidade | Situação no plugin |
|---|---|
| Funcionar offline e enfileirar envios | Não tem: o envio é online, direto ao WordPress |
| Embaralhar opções (evita viés de ordem na estimulada) | Não tem |
| Encerrar a entrevista por filtro ("não vota aqui" → fim) | Parcial (a condicional esconde campos, mas não encerra) |
| Versão do questionário gravada em cada resposta | Tem só a versão do formulário, sem histórico |
| Metadados de campo: entrevistador, ponto, GPS, duração | Não tem |
| Papel da pergunta na análise (perfil/cota, voto, rejeição, aberta) | Não tem |
| Multi-cliente isolado | Não tem: um WordPress = um site |

## Opções
**A. O plugin como editor; o resto é sistema novo.** O cliente monta o questionário no WordPress; o sistema de tracking importa o JSON (via REST), congela uma versão e entrega ao PWA. O PWA reaproveita o renderizador público e os campos do plugin, acrescentando o que falta. Coleta, API, banco e análise ficam no sistema novo.
- Prós: aproveita o editor, que é a parte mais trabalhosa de construir; o pipeline de dados nasce certo (offline, Postgres, multi-cliente).
- Contras: dois sistemas para operar; depende do WordPress no fluxo do cliente.

**B. Tudo dentro do WordPress (plugin de pesquisa).** Estender o plugin com um modo "pesquisa", um PWA servido pelo WP e o endpoint de envio em lote.
- Prós: piloto mais rápido; um sistema só.
- Contras: WordPress não é um bom lugar para multi-cliente, análise estatística e LLM; a migração viria logo depois do piloto.

**C. Extrair o editor do plugin para o sistema novo.** Os componentes já são React; o editor vira parte do painel do tracking, sem WordPress.
- Prós: produto único, sem dependência de WP; o melhor resultado para vender.
- Contras: mais trabalho antes do piloto.

## Revisão (30/10/2026): o WordPress atende como back-office
Uma objeção inicial às opções A e B era que o WordPress não atende vários clientes. Ela não se sustenta: **uma instalação de WordPress por cliente** (fácil de criar no EasyPanel) dá um isolamento até mais forte que um sistema único com vários clientes, porque cada campanha tem banco, usuários e domínio próprios. Volume também não é problema: centenas ou milhares de entrevistas por dia são uma carga trivial para WordPress + MySQL.

O renderizador público (`src/public-renderer`) não depende do WordPress, porque só importa React e os tipos do plugin. Ele pode ser empacotado dentro do app de coleta offline sem modificação estrutural.

**Desenho resultante:**
| Peça | Onde roda |
|---|---|
| Editor de questionário, cadastro de pontos, entrevistadores e aparelhos | **WordPress + plugin** (um por cliente), com um módulo "pesquisa" que publica para o núcleo |
| App de coleta offline | App separado nos aparelhos, reaproveitando o renderizador e os campos do plugin **só para mostrar as perguntas** |
| Recebimento das respostas, ponderação, projeção, boletim com LLM | Núcleo de dados Python + PostgreSQL (atualizado por D14: respostas não passam pelo WordPress) |
| Apresentação dos resultados | SPA isolado, em tempo real (D15) |

**O que precisa ser acrescentado ao plugin:**
1. Atributos de pesquisa nos campos: `shuffle`, `terminate_if`, papel da pergunta (perfil/cota, voto, rejeição, aberta).
2. Versão congelada do questionário a cada publicação, e a versão gravada em cada resposta.
3. ~~Endpoint de envio em lote~~ → fica no núcleo (D14). No plugin: **publicar** questionário e cadastros para o núcleo (webhook).
4. Cadastros: pontos, entrevistadores, aparelhos.
5. Respostas também em formato longo (uma linha por resposta), ou uma etapa no serviço Python que faça essa conversão.
6. Flags de qualidade (podem ficar no serviço Python).

**Ressalvas reais:**
- **Segurança.** WordPress é alvo frequente de ataques, e o dado é sensível. É obrigatório: núcleo e plugins sempre atualizados, nenhum plugin além do necessário, 2FA no admin, painel fora do domínio público, backup diário do banco.
- **Análise fica fora.** Ponderação, projeção e LLM vão para Python de qualquer forma. O WordPress é o back-office, não o motor.
- **Atualizar N instalações.** O plugin já usa um verificador de atualização via GitHub privado, o que resolve a distribuição. Mesmo assim, é preciso um processo para atualizar todos os clientes juntos.

## Recomendação
**Usar o WordPress + plugin como back-office**, no piloto e nos primeiros clientes, com o app de coleta e o motor de análise separados. A migração para um sistema próprio (opção C) só se justifica se a escala ou a operação pedirem; não é pré-requisito do produto.

Recomendação anterior, mantida como registro: **A no piloto, C no produto.** O ponto que liga as duas é o **formato do questionário**: definimos em `contracts/` um formato que é o `form_data` do plugin acrescido dos campos de pesquisa (`shuffle`, `terminate_if`, `role` da pergunta, versão). O plugin passa a exportar nesse formato. Quando o editor migrar para o sistema novo, nada muda para o PWA nem para os dados já coletados.

## Próximo passo de planejamento
Desenhar esse formato (campos, papéis das perguntas, regras de encerramento, versionamento) a partir de um questionário real de exemplo. Proposta: montar juntos o questionário do piloto de Caxias e usá-lo como caso de teste do formato.
