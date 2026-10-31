# Segurança

Com o núcleo de dados (D14), a opinião política e o contato dos entrevistados ficam num lugar só. Isso facilita proteger, mas também concentra o risco: o núcleo precisa ser a peça mais bem guardada do sistema.

## De quem estamos protegendo
| Ameaça | Exemplo | Impacto |
|---|---|---|
| Campanha adversária | Tenta obter o tracking do cliente (invasão, funcionário cooptado, aparelho furtado) | Perda do cliente e da reputação; o produto morre |
| Vazamento público | Resultado interno vaza e é divulgado como "pesquisa" | Problema eleitoral para o cliente (pesquisa não registrada) |
| Vazamento de dado pessoal | Lista de entrevistados com telefone e opinião | Incidente LGPD com dado sensível; multa e dano ao titular |
| Fraude de campo | Entrevistador inventa entrevistas | Número errado guiando a campanha |
| Vazamento de estratégia | Questionário vaza (quais nomes, cenários e temas a campanha testa) | Adversário conhece a estratégia antes da hora |
| Ataque oportunista | Robôs explorando servidor ou dependência desatualizada | Porta de entrada para os anteriores |

## Medidas por camada

### Painel interno (nossa equipe)
- Sem WordPress (D11 revista): questionários e cadastros vivem no núcleo, atrás da mesma proteção dos dados.
- Login com 2FA para toda a equipe; papéis (admin, supervisor, analista); acesso de cada membro só às campanhas em que trabalha.
- Publicar questionário exige a versão aprovada pelo cliente; tudo registrado.

### Aparelhos
- Gerenciados (MDM), em modo quiosque, sem captura de tela, com apagamento remoto (ver `08-aparelhos.md`).
- Fila no armazenamento privado do app (SQLite), protegida pela criptografia nativa do Android + bloqueio + quiosque; cifrar o banco é evolução prevista (T9 em `14-especificacao-tecnica.md`). A entrevista sai do aparelho assim que o núcleo confirma.
- Token por aparelho, revogável pelo painel. Aparelho furtado = token revogado + apagamento remoto.
- O aparelho **só envia**, nunca baixa respostas de ninguém.

### Núcleo de dados
- Nenhuma porta aberta além do HTTPS da API. Banco sem acesso pela internet.
- **Isolamento por cliente:** schema (ou banco) separado por campanha; cada credencial só enxerga a sua campanha.
- **Contatos separados das respostas** e cifrados no banco (telefone e nome), com chave fora do banco.
- Backups cifrados, testados (restaurar de verdade, não só gerar).
- **Registro de acesso**: quem viu, consultou ou exportou o quê, e quando. Não pode ser apagado pelo próprio usuário.
- LLM recebe só agregados e textos abertos sem identificação.

### SPA de resultados
- Login com 2FA para todo usuário do cliente; sessão curta.
- **Papéis do cliente:** leitor (só cenário e boletim) e coordenação (cenário, cruzamentos, progresso do campo, aprovação de questionário). O cliente **só lê**; não há papel de cliente que altere dados.
- Só agregados. Exportação de contatos consentidos é feita por nós a pedido do cliente, registrada e com aviso.
- **Marca d'água** com nome do usuário e data/hora nas telas e nos PDFs do boletim: se um print vazar, sabemos de onde veio. Isso dissuade.
- Cruzamentos com n muito pequeno (ex.: < 30) são ocultados, para não permitir identificar alguém por eliminação.

### Pessoas e processo
- Entrevistadores não têm acesso a resultados; só ao app de coleta.
- Termo de confidencialidade para entrevistadores, supervisores e nossa equipe.
- Reset dos aparelhos entre campanhas; acesso da nossa equipe aos dados de um cliente só quando necessário, e registrado.
- Plano de resposta a incidente (quem avisa quem, em quanto tempo; a LGPD exige comunicar à ANPD e aos titulares em caso de incidente relevante).

## Para o piloto
O piloto não precisa de tudo isso, mas precisa já nascer com: HTTPS, banco fechado, contatos separados e cifrados, token por aparelho revogável, MDM nos aparelhos, login com 2FA no SPA e registro de acesso. O restante (papéis completos, marca d'água, plano de incidente) entra antes do primeiro cliente pagante.
