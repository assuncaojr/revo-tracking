# Aparelhos de campo

## Decisão
A coleta é feita **só em aparelhos fornecidos por nós**, nunca no celular pessoal do entrevistador. Motivo: segurança. Dado sensível (opinião política) não pode ficar no celular de terceiros, nem ser fotografado, encaminhado ou levado para outro app.

## O que isso muda

### Gestão remota (MDM)
Os aparelhos são cadastrados num gerenciador de dispositivos Android (Android Enterprise / MDM). Isso permite:
- **Modo quiosque:** o celular abre só o coletor (e o que mais liberarmos); sem WhatsApp, galeria ou navegador livre.
- **Bloqueio de captura de tela** e de cópia de dados.
- **Apagar remotamente** um aparelho perdido ou roubado.
- **Localização do aparelho** e status (bateria, última conexão, versão do app), sem depender do entrevistador.
- Atualização do app e configuração em todos os aparelhos de uma vez.

### Coletor
- **Um modelo de aparelho padronizado.** Testamos e otimizamos para ele, em vez de "qualquer Android".
- **O aparelho é diferente do entrevistador.** O aparelho é cadastrado com uma identidade própria; o entrevistador faz login no começo do turno. Cada entrevista registra **aparelho + entrevistador**. Um aparelho pode trocar de mão entre turnos.
- **Dados criptografados no aparelho**, e o token do aparelho pode ser revogado pelo painel.
- **App nativo em Kotlin** (D2 revista): publicado como app privado no Google Play e instalado em quiosque pelo MDM. Fila em SQLite do próprio app, fora do navegador.

### Operação
- **Chip de dados** em cada aparelho (plano corporativo), para não depender do Wi-Fi ou do celular do entrevistador.
- **Kit de campo:** aparelho, capa, carregador portátil, crachá. Bateria é o gargalo de um turno de 6 horas com GPS ligado.
- **Inventário:** cada aparelho tem número de série, campanha atual e responsável. Entrega e devolução registradas.
- **Entre campanhas:** reset de fábrica pelo MDM antes de mandar para o próximo cliente. É obrigatório: os dados de uma campanha nunca podem chegar à adversária.

### LGPD do entrevistador
A localização do aparelho durante o turno é dado pessoal do entrevistador. O contrato de trabalho e o treinamento devem informar o rastreamento, para que finalidade e por quanto tempo os dados ficam guardados. Só rastreamos durante o turno.

### Custo e negócio
- Aparelhos são **comprados por nós** e o custo (aparelho, chip, MDM, reposição por perda) é **incluído no preço do serviço**. O cliente usa durante a campanha e devolve.
- **Piloto: 6 Android usados** (4 em uso + 2 reserva), comprados pelo responsável (31/10/2026).

### Escolha para o piloto (31/10/2026): Samsung Galaxy A14 **novo**
- ~R$ 800 cada → **6 aparelhos ≈ R$ 4.800**.
- **Novo em vez de usado:** pela diferença de preço, elimina os riscos do usado (conta Google presa, IMEI irregular, bateria gasta, bloqueio de financiamento) e vem com garantia.
- Exigir a versão **4 GB de RAM** (a de 128 GB é a mais comum). Bateria de 5.000 mAh.
- Atualizações de segurança devem ir até perto de 2027: **serve para o piloto, não para 2028**. A frota da campanha de 2028 é comprada depois, com receita, seguindo a recomendação abaixo. Confirmar o prazo na página de atualizações de segurança da Samsung.
- Com o aparelho mais antigo, quiosque, fila cifrada e MDM deixam de ser "desejáveis" e passam a ser obrigatórios.

### Modelo recomendado para a frota de 2028
**Samsung Galaxy A15** (alternativa: **A25**, um degrau acima). Por quê:
- **Atualizações de segurança** previstas até depois de 2028 (Samsung prometeu 5 anos para essa linha): cobre o piloto e a campanha de 2028. **Confirmar na página de atualizações de segurança da Samsung antes de comprar.**
- **Bateria de 5.000 mAh**, que é o gargalo de um turno de 6 h com GPS.
- **Gerenciamento remoto** bem suportado (Android Enterprise + Knox), inclusive modo quiosque.
- A Samsung é menos agressiva em matar apps em segundo plano do que Xiaomi/Realme, o que importa para o envio da fila offline.
- Muito comum no mercado de usados no Brasil: fácil de achar, de repor e de trocar bateria.

**Requisitos mínimos** (se aparecer outro modelo): Android 14 ou superior; ainda recebendo atualização de segurança em 2028; 4 GB de RAM; 64 GB; bateria de 5.000 mAh; tela de 6,5" (o disco precisa ser legível para o entrevistado).

**Evitar:** Xiaomi/Redmi/Poco e Realme (economia de bateria agressiva derruba envio em segundo plano e atrapalha o quiosque); versões "Go"/de entrada com 2–3 GB; Motorola linha G (atualizações curtas); aparelhos de operadora com bloqueio.

### Aparelhos usados: cuidados
- **Procedência:** nota ou documento de compra e **IMEI regular** (consultar na lista de celulares impedidos da Anatel).
- **Conta Google removida pelo vendedor** (bloqueio FRP). Testar na hora: restaurar de fábrica e ver se liga sem pedir a conta antiga. Sem isso, o aparelho vira peso de papel depois do reset.
- **Sem bloqueio de financiamento** (aparelhos de crediário com app de bloqueio do lojista).
- **Mesmo modelo** para os 6, se possível; se não, no máximo dois modelos. O app é testado em cada um.
- **Versão do Android** recente o bastante para receber atualizações de segurança e para o MDM e o app de coleta. A versão mínima sai da especificação técnica; checar **antes** de comprar.
- **Bateria** é o ponto fraco do usado: testar autonomia num turno de 6 h com GPS ligado; carregador portátil para cada um; trocar bateria se for barato.
- **Reset de fábrica** e cadastro no MDM antes do primeiro uso; nenhuma conta pessoal no aparelho.
- **Armazenamento** livre suficiente para a fila offline (pequena, mas sem áudio; se o experimento de gravação entrar, rever).
- Os aparelhos são reaproveitados de campanha em campanha: é investimento, não custo por cliente.
