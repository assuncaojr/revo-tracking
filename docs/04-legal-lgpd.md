# Legislação eleitoral e LGPD

> Resumo técnico para orientar o desenho do software. **Validar com o jurídico da campanha** antes do uso em campo; resoluções do TSE são atualizadas a cada eleição (as de 2028 saem até março daquele ano).

## Pesquisa interna x pesquisa registrada
- Pesquisa **divulgada ao público** a partir de 1º de janeiro do ano eleitoral precisa de registro no TSE (Lei 9.504/97, art. 33; resolução de pesquisas do TSE). Divulgar sem registro gera multa pesada.
- Tracking **interno**, para uso estratégico, não exige registro **desde que não seja divulgado**. Consequências para o software:
  - Painel e exportações exigem login; nada público, nada indexável.
  - Boletim e gráficos levam a marca "uso interno, não divulgar".
  - Registro de acesso (quem viu/exportou o quê) para rastrear vazamento.

## LGPD
- **Opinião política é dado pessoal sensível** (LGPD, art. 5º, II). Tratar exige consentimento **específico e destacado** (art. 11, I).
- A entrevista pode ser **anônima**: sem nome e telefone, as respostas não identificam o titular e a estatística não depende de consentimento de contato. O bloco de contato é opcional e vem no fim.
- Consentimentos **separados**, cada um registrado com data/hora e texto exibido:
  1. `consent_research`: aceitar responder (lido pelo entrevistador no início).
  2. `consent_contact`: aceitar receber mensagens da campanha (só se der telefone).
- Contato fica na tabela `contact`, separada das respostas, com acesso restrito e exclusão a pedido (direito do titular, art. 18).
- **Retenção:** apagar contatos de quem não autorizou e anonimizar o restante após a eleição (prazo a definir com o jurídico; proposta: 90 dias após o 2º turno).
- O LLM **nunca** recebe nome, telefone ou coordenada individual. Só agregados e textos abertos sem identificação.

## Mensagens para entrevistados
- A lei eleitoral só permite mensagem eletrônica para endereços **cadastrados gratuitamente** pelo próprio eleitor e exige **descadastramento** atendido em até 48 h (Lei 9.504/97, arts. 57-B e 57-G; resolução de propaganda do TSE). Venda ou cessão de cadastro é proibida (art. 57-E).
- Disparo em massa sem consentimento é vedado pelo TSE e viola as políticas do WhatsApp, que bane números.
- Portanto o sistema:
  - só exporta para comunicação quem tem `consent_contact = true` e `opt_out_at` nulo;
  - registra opt-out e o propaga para todas as exportações seguintes;
  - **não faz disparo** no MVP. A comunicação usa canal oficial (WhatsApp Business API / ferramenta homologada) operado pela campanha.
