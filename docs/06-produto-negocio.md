# Produto e negócio

## Tese
Campanhas municipais precisam de tracking diário, mas as opções no mercado são caras, têm suporte lento e falham na comunicação entre o campo e a central (experiência de 2024). Vamos oferecer o mesmo serviço **mais barato, mais confiável e com suporte próximo**, e acrescentar o que faltava: a **projeção de resultado calculada pelo sistema**. Em 2024 essa projeção foi feita manualmente, "no feeling", e mesmo assim acertou o vencedor de uma disputa decidida por 565 votos (0,63 p.p.), quando pesquisas registradas da época davam o adversário com folga.

## Diferenciais (derivados das dores de 2024)
| Dor | Resposta do produto |
|---|---|
| Falhas de comunicação campo ↔ central | Offline-first: a entrevista fica no aparelho até o servidor confirmar o recebimento. Painel mostra, por aparelho, quantas entrevistas ainda faltam enviar e quando foi o último envio. |
| Suporte lento | Somos nós que operamos tudo: não há "suporte" de terceiro entre o cliente e o problema. Canal direto (WhatsApp) com prazo de resposta definido. |
| Preço | Infra enxuta (um servidor serve muitos municípios), preço por campanha. |
| Análise manual | Ponderação, média móvel, margem e projeção automáticas; boletim diário escrito pelo LLM. |
| Questionário fixo | Questionário sob medida para cada pedido do cliente, com versões, alterável no meio da campanha em horas. |

## Cliente
- **Quem compra:** coordenação de campanha a prefeito (e, depois, a vereador, em escala menor), consultorias políticas, institutos pequenos de pesquisa que queiram software.
- **Quando:** pré-campanha (o 2º semestre de 2027 e o 1º de 2028 são o período de venda) e campanha oficial (16/08 a outubro de 2028).
- **Mercado inicial:** Caxias/MA e municípios vizinhos do Maranhão e Piauí, onde já há rede de contatos.

## Modelo: serviço completo (D17)
Vendemos o **tracking pronto**, não o software. Nós cuidamos de tudo: desenho amostral, questionário, aparelhos, entrevistadores, supervisão, análise e boletim. O cliente:
- faz o **briefing** (o que quer saber, tipo de pesquisa, nomes e temas);
- **aprova** o questionário antes de ir a campo (sem editar; pede mudanças e nós fazemos);
- **consome** os resultados no SPA e no boletim, e orienta as próximas rodadas.

Consequências:
- Não há editor nem autoatendimento para o cliente; o acesso dele é só leitura.
- O custo principal é **gente em campo**, não software: entrevistadores, supervisão, transporte. O piloto mede o custo real por entrevista, que é a base do preço.
- Formato de preço a definir depois do piloto (por semana de tracking, por campanha, por porte do município).
- O software é vantagem competitiva interna (qualidade, velocidade, custo), não o que se vende. Vender o sistema para institutos fica como possibilidade futura, não como plano.

## Ferramenta, não garantia
O sistema mede e projeta; **não garante resultado de eleição**. Quem decide a eleição é o eleitor, e quem decide o que fazer com os números é a campanha. Isso precisa estar claro para qualquer usuário, inclusive o desavisado que vê uma projeção favorável e relaxa.

Onde o aviso aparece:
| Lugar | Como |
|---|---|
| **Contrato** | Cláusula explícita: prestação de serviço de pesquisa e análise, **obrigação de meio, não de resultado**; nenhuma projeção constitui promessa ou garantia de vitória. (Redação final com o jurídico.) |
| **Primeiro acesso ao SPA** | Tela de aceite com o aviso, registrada (quem aceitou e quando). |
| **Tela de cenário/projeção** | Aviso fixo junto ao número, e a projeção sempre mostrada como **faixa** ("entre X e Y"), nunca como placar fechado. |
| **Boletim diário (LLM)** | Rodapé fixo com o aviso; o LLM é instruído a nunca usar "vai ganhar", "vitória garantida" ou equivalentes, e a citar a incerteza. |
| **Material de venda** | O caso de 2024 é contado como "ajudou a ler o cenário", nunca como "garantimos a vitória". |

Texto-base (a revisar): *"Este sistema é uma ferramenta de apoio à decisão. Os números são estimativas sujeitas a erro e mudam ao longo da campanha. Nenhuma projeção garante o resultado da eleição."*

## Implicações para a arquitetura
- **Multi-cliente desde o início**: dados de campanhas adversárias no mesmo servidor exigem isolamento rigoroso (cada consulta filtrada por campanha; idealmente um schema ou banco por cliente). É um ponto comercial também: "seus dados não vazam para o adversário".
- Exclusividade: provavelmente o cliente vai querer exclusividade no município. É decisão comercial, mas o sistema deve permitir travar um município por cliente.
- Marca branca (logo do cliente no painel e no boletim) é barato de fazer e ajuda a vender.

## Piloto: Caxias/MA
- **Formato:** 4 entrevistadores, alguns bairros, amostra pequena.
- **Capacidade estimada:** ~15 entrevistas por entrevistador por dia (média observada em 2024) → **~60/dia**. Detalhes e margens em `09-piloto-caxias.md`.
- **O que o piloto prova:** a operação (app offline, sincronização, controle de qualidade, painel, boletim), não o cenário da cidade. Alguns bairros não representam o município; os números do piloto valem para aqueles bairros.
- **Tema:** fora do período eleitoral, o questionário pode medir avaliação da gestão, problemas da cidade e conhecimento/simpatia por possíveis nomes de 2028. É uso interno, não divulgado (ver `04-legal-lgpd.md`).
- Caxias tem menos de 200 mil eleitores (conferir o número exato no TSE), então **não há 2º turno**: o questionário-padrão não precisa da pergunta de segundo turno.
