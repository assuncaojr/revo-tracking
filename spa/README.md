# spa — painel interno e painel do cliente

React 19 + TypeScript + Vite, sem biblioteca visual. Uma aplicação, dois públicos separados por papel:

| Aba | Equipe (admin, supervisor, analista) | Cliente (coordenação, leitura) |
|---|---|---|
| Campo agora | produção por entrevistador, aparelhos, cotas do dia (atualiza a cada minuto) | — |
| Alertas | revisar: aceitar ou excluir a entrevista (admin e supervisor) | — |
| Resumo (D28) | o que a pesquisa mostra em frases, balanços a favor × contra a gestão, indicadores com tendência, evolução com marcos da campanha (D29), áreas; boletim para reunião (imprimir/PDF) | idem |
| Bairros (D28) | lista comparando com a cidade, ficha do bairro, mapa em hexágonos (D26) e cobertura do campo | idem, sem a cobertura |
| Detalhes | onde a gestão vai melhor e pior, cruzamentos (só o que se diferencia, com opção de ver tudo), segmentos, rankings, pergunta a pergunta, progresso do campo, como a pesquisa é feita | idem, com grupos de menos de 30 entrevistas ocultos |
| Questionário | prévia de leitura; admin carrega nova versão (JSON) e publica | prévia e **aprovação** (coordenação) |
| Cadastros (D25) | entrevistadores, aparelhos e marcos da campanha (admin e supervisor); estratos, bairros, pontos e usuários do painel (admin) | — |

Cor só nos dados: azul = a favor da gestão, vermelho = contra, cinza = dentro da margem. Margens de erro escondidas por padrão ("Mostrar margens de erro"). Pensado também para celular.

Em todo acesso: login com senha + código do app autenticador, aviso de que o sistema não garante eleição no primeiro acesso (D16) e marca d'água com nome, e-mail e horário.

## Rodar local
```bash
pnpm install
pnpm dev            # http://localhost:5173 ; /api vai para o núcleo em localhost:8000
pnpm build          # tipos + build de produção em dist/
```
Primeiro usuário do painel (os demais se cadastram na aba Cadastros): `cd ../api && uv run tracking-admin user-add --campaign <id> --email ... --name ... --role admin` (pede a senha e mostra a chave para o app autenticador).
