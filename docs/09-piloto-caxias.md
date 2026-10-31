# Piloto: Caxias/MA

## Contexto
- **Financiado por nós** (risco do negócio). Por isso, operação mínima: 4 entrevistadores.
- **Tema:** avaliação da gestão municipal atual, comparando **centro** e **bairros afastados**.
- Uso interno, não divulgado (ver `04-legal-lgpd.md`). Mesmo fora do ano eleitoral, a regra é não publicar.

## Objetivos
**1. Operação (o principal).** Provar que o sistema funciona de ponta a ponta:
- Questionário escrito como arquivo versionado → publicado no núcleo → chega nos aparelhos.
- Coleta offline em bairro sem sinal; nenhuma entrevista perdida.
- Dados aparecem no SPA em tempo real quando há sinal.
- Flags de qualidade pegam problemas reais de campo.
- Boletim do LLM é útil e não inventa nada.

**2. Método.** Medir o **viés da amostra contra o resultado oficial de 2024** (pergunta V1, por bairro), e testar se a ponderação por voto passado o corrige. Medir também, na prática: entrevistas por entrevistador/dia, taxa de recusa, duração média, dificuldade de cumprir cotas na periferia.

**3. Produto de demonstração.** Um caso real, com painel e boletim, para mostrar a pré-candidatos em 2027. Uma leitura de centro x periferia sobre a gestão é exatamente o tipo de informação que vende o serviço.

## Desenho amostral
| Item | Proposta |
|---|---|
| Estratos | **Centrais:** Centro, Cangalheiro, Pau d'Água, Ipem, Castelo Branco. **Afastados:** Salobro, Fazendinha, Alto do Ipem, Caldeirões, DNER, Vila Paraíso, Mutirão. Zona rural (povoados) **fora do piloto** (decisão do responsável, 30/10/2026) |
| Comparação com 2024 | Cangalheiro, Salobro, Fazendinha, Caldeirões e Mutirão também foram cobertos em 2024 (`11-referencia-2024.md`). Dá para comparar a avaliação da gestão nesses bairros entre 2024 e o piloto, com a ressalva de que a gestão e o questionário são outros |
| Rotação | Todos os bairros visitados em ciclos fixos, cada entrevistador passando por vários bairros, para que nenhum dia "seja" um bairro só (o problema visto em 2024) |
| Alocação | **Igual** entre estratos (50/50), para comparar os dois com a mesma precisão. Para um número "da cidade", pondera-se pelo eleitorado de cada estrato |
| Bairros | 2–3 no centro, 4–6 afastados, escolhidos para ter variedade (renda, distância, zona urbana x rural se houver) |
| Abordagem | Centro: **pontos de fluxo** (comércio, praças). Bairros afastados: provavelmente **domiciliar com intervalo** (bater a cada N casas), porque há pouco fluxo de rua. Testar os dois é um dos aprendizados do piloto |
| Cotas | Sexo × faixa etária (16–24, 25–34, 35–44, 45–59, 60+), por estrato, a partir do perfil do eleitorado de Caxias (TSE) |
| Volume | Em 2024 a média foi de **~15 entrevistas por pesquisador/dia** (de 8 a 30). Estimativa conservadora: ~60/dia (4 × 15). **12 dias de campo → ~720 entrevistas** (~360 por estrato, margem de ±5,2 p.p. em cada) |
| Rotação | Entrevistadores trocam de bairro entre dias, para não confundir "efeito entrevistador" com "efeito bairro" |

## Questionário v1 (aprovado pelo responsável em 31/10/2026)
Meta: **até 3 minutos**. Opções "Não sabe / Não respondeu" (NS/NR) em todas as fechadas, sem serem lidas para o entrevistado.

### Abertura (lida pelo entrevistador)
> "Bom dia/tarde. Estou fazendo uma pesquisa sobre a cidade de Caxias. São poucas perguntas, leva uns 3 minutos e suas respostas são anônimas. Posso fazer?"

- **A0. Aceita participar?** sim / não → *não: encerra e registra recusa* (a taxa de recusa é dado do piloto)

### Filtros
- **F1. Mora em Caxias?** sim / não → *não: encerra*
- **F2. Idade** (número) → *menor de 16: encerra*; o app calcula a faixa etária para a cota
- **F3. Vota em Caxias** (título aqui)? sim / não → *não encerra*, só registra (a avaliação da gestão vale para morador; a análise eleitoral filtra depois)

### Perfil
- **P1. Sexo**
- **P2. Escolaridade:** até fundamental incompleto / fundamental completo / médio / superior
- **P3. Bairro onde mora:** lista + "outro" (pode ser diferente do bairro da entrevista)
- **P4. Renda familiar:** até 1 SM / 1–2 / 2–5 / mais de 5 / NS/NR

### Avaliação da gestão
- **G1. Aprova ou desaprova** a forma como o prefeito está administrando Caxias? aprova / desaprova
- **G2. Avaliação:** ótima / boa / regular / ruim / péssima
- **G3. Nota de 0 a 10** para a administração
- **G4. Por área**, a situação **melhorou, ficou igual ou piorou** desde o início desta gestão? *(grade com uma linha por área, ordem embaralhada)*: saúde · educação · coleta de lixo e limpeza · ruas e pavimentação · iluminação · água e esgoto · segurança · transporte
- **G5. No seu bairro**, a prefeitura fez alguma obra ou melhoria no último ano? sim / não → *sim: G5a. Qual?* (aberta)
- **G6. Qual o maior problema do seu bairro hoje?** (aberta, categorizada depois pelo LLM)
- **G7. Se o prefeito pudesse resolver só uma coisa na cidade**, o que deveria ser? *(lista das áreas de G4, embaralhada)*

### Voto passado (calibração do método)
- **V1. Em quem você votou para prefeito em 2024?** Gentil Neto / Paulinho / Lycia Waquim / Edmilson Sanches / branco-nulo / não votou / não lembra / prefere não dizer

É a pergunta mais importante do piloto para o produto. O resultado oficial de 2024 é conhecido **por local de votação** (Gentil Neto 48,7 × Paulinho 48,1 na cidade; urbana 47,3 × 49,1; ver `11-referencia-2024.md`). Comparar o que a amostra diz ter votado com o que as urnas mostram, bairro a bairro, **mede o viés do nosso método** em campo, contra uma verdade conhecida. Foi esse viés que fez os dados de 2024 errarem a margem em ~14 p.p. Se ele aparecer (ex.: amostra lembrando bem menos voto em Gentil Neto que as urnas), o piloto testa a correção por ponderação de voto passado e mede quanto ela resolve.

### Clima para 2028 (leve, sem nomes estimulados)
- **E1. Em 2028**, você prefere que o próximo prefeito **continue** o trabalho da gestão atual ou **mude**? continuar / mudar / depende
- **E2. Quem você gostaria que fosse o próximo prefeito?** (espontânea, aberta; o LLM normaliza nomes e apelidos)

### Contato (opcional, ver `04-legal-lgpd.md`)
- **C1. Aceita deixar um WhatsApp** para receber o resultado desta pesquisa sobre o seu bairro? → *sim: nome, WhatsApp, consentimento registrado*
  - Oferecer o resultado ao entrevistado é uma contrapartida honesta e testa a aceitação do opt-in.

### Preenchido pelo app (não é perguntado)
Aparelho, entrevistador, ponto/bairro da entrevista, abordagem (fluxo/domiciliar), GPS, início/fim, versão do questionário.

## O que o questionário exige do formato e do app
Lista levantada quando o plugin ainda era candidato a editor (coluna "Situação" = situação no plugin). Sem o WordPress (D11 revista), ela vira a **lista de requisitos do formato de questionário e do app de coleta**.

| Necessidade | Pergunta que exige | Situação |
|---|---|---|
| Encerrar a entrevista por resposta | A0, F1, F2 | Falta (condicional só esconde) |
| Campo derivado (idade → faixa) | F2 | Falta |
| Grade (várias linhas com as mesmas opções) | G4 | A verificar (`group` pode servir) |
| Embaralhar opções / linhas | G4, G7 | Falta |
| NS/NR padrão, não lido | todas as fechadas | Falta (convenção + estilo diferente) |
| Pergunta condicional | G5a | Existe |
| Papel da pergunta na análise (cota, avaliação, aberta) | todas | Falta |
| Registro de recusa como entrevista | A0 | Falta (hoje só se grava envio completo) |
| Versão congelada | todas | Falta |
| Lista de bairros/povoados condicionada à zona (urbana/rural) | P3 | Parcial (condicional existe; falta lista-mestre reutilizável) |
| Regras de consistência entre perguntas (ex.: avaliação x aprovação) | G1, G2 | Falta |
| Biblioteca de opções-padrão (faixas etárias, NS/NR, renda) | perfil | Falta (em 2024 houve erro de digitação nas opções) |
| "Disco" na tela, virado para o entrevistado | (estimulada, no produto) | Falta |

## Operação
- **Antes do campo:** 1 dia de treinamento (abordagem, leitura neutra, uso do app, LGPD, segurança do aparelho) + 1 dia de **pré-teste** com ~40 entrevistas, que não entram no resultado e servem para ajustar o questionário.
- **Rotina diária:** retirada dos aparelhos carregados → turno de ~6 h → devolução → conferência do supervisor no SPA ("campo agora").
- **Supervisão:** você, no papel de supervisor e de cliente ao mesmo tempo, testando as duas telas.

## Critérios de sucesso do piloto
| Critério | Meta |
|---|---|
| Entrevistas perdidas | 0 |
| Tempo do aparelho até o SPA, com sinal | < 1 min |
| Duração média da entrevista | ≤ 3 min |
| Entrevistas com flag | < 10% (as flagadas, revisadas uma a uma) |
| Cotas por estrato | ≥ 90% cumpridas |
| Boletim do LLM | Nenhum número que não esteja nos dados; revisão sua aprova |
| Custo real por entrevista | Medido (base para o preço de venda) |
| Viés de voto passado (V1 × urna 2024) | Medido por estrato; depois da ponderação, diferença Gentil − Paulinho dentro de ±3 p.p. do oficial |

## Custos
**Financiamento:** 100% do responsável (aparelhos, equipe, servidor, API do LLM).

**Definido em 31/10/2026:**
- **Entrevistadores:** diária de **R$ 80 + R$ 20 de ajuda de custo** (combustível da moto própria) = **R$ 100 por entrevistador por dia**. Sem CLT.
- **Aparelhos:** **6 Samsung Galaxy A14 novos, versão 4 GB** (4 em uso + 2 reserva), ~R$ 800 cada ≈ **R$ 4.800**. Detalhes em `08-aparelhos.md`.

**Conta da equipe de campo** (4 entrevistadores, R$ 100/dia):
| Etapa | Dias | Custo |
|---|---|---|
| Treinamento | 1 | R$ 400 |
| Pré-teste | 1 | R$ 400 |
| Campo | 12 | R$ 4.800 |
| **Total** | **14** | **R$ 5.600** |

**Custo de campo por entrevista:** com ~15 entrevistas por pessoa por dia, R$ 100 ÷ 15 ≈ **R$ 6,70 por entrevista** (só equipe de campo). É o primeiro número da base de preço; o piloto mede o real (se a produção for 20/dia, cai para R$ 5; se for 10/dia, sobe para R$ 10).

**A levantar pelo responsável:** os 6 aparelhos usados, chips de dados (6), carregadores portáteis (6), crachás, servidor (EasyPanel/VPS), MDM (se pago), API do LLM.

**API do LLM:** nessa escala o uso é pequeno (um boletim por dia e a categorização de ~700 respostas abertas). Estimar com a tabela de preços oficial na especificação técnica, com teto de gasto configurado na conta.

**Ponto para o jurídico:** entrevistador usando moto própria a serviço, carregando aparelho nosso (acidente, furto do aparelho no trajeto). Definir no contrato de prestação.
