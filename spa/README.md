# spa — painel interno e painel do cliente

React 19 + TypeScript + Vite, sem biblioteca visual. Uma aplicação, dois públicos separados por papel:

| Aba | Equipe (admin, supervisor, analista) | Cliente (coordenação, leitura) |
|---|---|---|
| Campo agora | produção por entrevistador, aparelhos, cotas do dia (atualiza a cada minuto) | — |
| Alertas | revisar: aceitar ou excluir a entrevista (admin e supervisor) | — |
| Resultados | **Panorama**: indicadores-chave com margem de erro e variação na semana, evolução (média de 3 dias), estratos lado a lado, grade de áreas. **Cruzamentos**: indicador por voto em 2024, estrato e perfil; segmentos aprovação × continuidade; rankings. **Mapa**: opinião em hexágonos (D26); a equipe vê também a cobertura do campo, um ponto por entrevista. **Pergunta a pergunta**: bruto, total e por estrato | idem, com grupos de menos de 30 entrevistas ocultos; mapa só em hexágonos |
| Progresso | feitas × meta por estrato | idem |
| Questionário | prévia de leitura; admin carrega nova versão (JSON) e publica | prévia e **aprovação** (coordenação) |
| Cadastros (D25) | entrevistadores e aparelhos (admin e supervisor); estratos, bairros, pontos e usuários do painel (admin) | — |

Em todo acesso: login com senha + código do app autenticador, aviso de que o sistema não garante eleição no primeiro acesso (D16) e marca d'água com nome, e-mail e horário.

## Rodar local
```bash
pnpm install
pnpm dev            # http://localhost:5173 ; /api vai para o núcleo em localhost:8000
pnpm build          # tipos + build de produção em dist/
```
Primeiro usuário do painel (os demais se cadastram na aba Cadastros): `cd ../api && uv run tracking-admin user-add --campaign <id> --email ... --name ... --role admin` (pede a senha e mostra a chave para o app autenticador).
