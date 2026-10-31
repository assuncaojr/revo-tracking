# Entrada de dados no campo

Os arquivos de 2024 mostraram que boa parte da sujeira vem da digitação: o mesmo bairro escrito de cinco jeitos, "não sabe" em dez formas, nomes de candidatos com erro (ver `11-referencia-2024.md`). Regra geral: **o entrevistador digita o mínimo possível.**

## 1. O que nunca é digitado
| Dado | Como entra |
|---|---|
| Entrevistador, aparelho, data/hora, GPS | Automático (login e sensores) |
| Bairro / ponto | Lista do cadastro; o app sugere pelo GPS |
| Perfil (sexo, faixa etária, escolaridade, renda) | Botões |
| "Não sabe", "Nenhum", "Indeciso", "Não quis responder" | Botões fixos em toda pergunta aberta e fechada |
| Candidatos na estimulada | Botões (disco na tela) |

## 2. Autocompletar nas respostas abertas de nome
Vale para a espontânea de prefeito/vereador e para "em quem votou em 2024".

- A lista vem do cadastro: candidatos registrados no TSE (a partir de agosto do ano eleitoral) ou lista de pré-candidatos e nomes populares mantida pela campanha antes disso. Apelidos entram como sinônimos ("Paulinho", "Gentil", "Dr. Magno").
- **Cuidado metodológico:** a espontânea só é espontânea se o entrevistado não vê nem ouve nomes. As sugestões aparecem **só para o entrevistador, depois** que a pessoa respondeu, e o entrevistador nunca lê a lista em voz alta. Isso entra no treinamento.
- O app grava **o texto digitado e o nome escolhido**. Se o entrevistador não achar o nome, fica o texto livre, que o LLM normaliza depois (com revisão).
- Alerta na análise: entrevistador que escolhe sempre o primeiro item da lista, ou com distribuição de nomes muito diferente dos colegas no mesmo bairro.

## 3. Voz nas respostas abertas: três níveis

| Nível | Como funciona | Ganho | Risco |
|---|---|---|---|
| **A. Ditado** | Entrevistador toca no microfone e **dita** a resposta; o reconhecimento de voz do aparelho vira texto. Nenhum áudio é guardado. | Rápido, menos erro de digitação | Baixo. Não guarda voz de ninguém |
| **B. Trecho da resposta** | Grava só a fala do entrevistado na pergunta aberta (10–20 s); transcrição e categorização pelo LLM no núcleo | Resposta exata, nas palavras do eleitor; ótimo para "maior problema do bairro" | Médio/alto (ver abaixo) |
| **C. Entrevista inteira, por amostragem** | Uma fração das entrevistas é gravada inteira para auditoria do supervisor | Prova que a entrevista aconteceu e como as perguntas foram lidas | Alto |

### Por que B e C não entram direto
1. **Pode piorar o principal problema encontrado em 2024.** O erro de ~14 p.p. veio de **quem responde e como responde** (o eleitor da continuidade sumindo ou se escondendo no "não sabe"). Saber que está sendo gravado tende a aumentar recusa e respostas "seguras", justamente nesse grupo.
2. **LGPD:** voz é dado pessoal e, junto com opinião política, identifica a pessoa mesmo sem nome. Exige consentimento específico e destacado para a gravação, separado do consentimento da entrevista.
3. **Vazamento:** um áudio de eleitor falando de política, se vazar para o adversário, é o pior incidente possível para o produto.

### Proposta
- **MVP:** nível A (ditado) para as abertas, sem guardar áudio. Se o reconhecimento de voz offline do aparelho padrão não funcionar bem, fica o teclado com autocompletar.
- **Piloto:** testar o nível B como **experimento**: metade dos entrevistadores oferece gravação (com consentimento), metade não; troca no meio do campo. Compara taxa de recusa, de "não sabe" e o viés de voto passado (V1 × urna 2024) entre os dois grupos. Só adota se não piorar.
- Se adotado: o áudio fica cifrado, separado de qualquer contato, é transcrito e **apagado em poucos dias** (ex.: 7); só a transcrição fica. Nunca vai para o SPA.
- Nível C (auditoria) fica para depois, avaliado com o jurídico; para fraude, as flags (duração, GPS, comparação com colegas) já cobrem boa parte.

## Requisitos para o formato do questionário
- Tipo de pergunta **"nome com autocompletar"** ligado a uma lista do cadastro, gravando texto digitado + item escolhido.
- Botões padrão de não-resposta configuráveis por pergunta.
- Em perguntas abertas, modo de entrada: teclado, ditado ou gravação (com consentimento próprio).
