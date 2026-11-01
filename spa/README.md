# spa — painel interno e painel do cliente

React 19 + TypeScript + Vite, visual em Tailwind v4 + shadcn/ui (D30). Uma aplicação, dois públicos separados por papel:

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

## Visual (D30)
Migração gradual para shadcn/ui. Regras:
- **Página nova ou reescrita:** só componentes de `src/components/ui/` e classes do Tailwind. Componente que falta: `pnpm dlx shadcn@latest add <nome>` (confira o diff: o CLI já tentou instalar um pacote npm `cn` no lugar de `src/lib/utils.ts`).
- **Página antiga:** continua em `src/styles.css`, que está congelado (só correção). Ao migrar uma página, apague as regras que ficaram sem uso.
- O CSS antigo fica na camada `legacy` (`src/index.css`): vence o reset do Tailwind e perde para os utilitários. Seletores de elemento dele (`button`, `input`, `table`…) pulam quem tem `data-slot`, a marca dos componentes shadcn.
- Tokens: os do shadcn em `src/index.css` (`--primary`, `--muted`…); os do CSS antigo foram renomeados para não colidir (`--ink`, `--ink-soft`, `--text-muted`). Cor dos dados (`--fav`, `--unfav`, `--div-*`) continua em `styles.css`.
- Sem modo escuro por enquanto. Ícones: `lucide-react`.
- Partes que não podem quebrar ao migrar: boletim impresso (`@media print`, classe `no-print`), marca d'água, celular (390 px).

## Rodar local
```bash
pnpm install
pnpm dev            # http://localhost:5173 ; /api vai para o núcleo em localhost:8000
pnpm build          # tipos + build de produção em dist/
```
Primeiro usuário do painel (os demais se cadastram na aba Cadastros): `cd ../api && uv run tracking-admin user-add --campaign <id> --email ... --name ... --role admin` (pede a senha e mostra a chave para o app autenticador).
