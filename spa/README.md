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

## Visual (D30, D32)
Tailwind v4 + shadcn/ui, fonte Geist, sem modo escuro. Ícones: `lucide-react`.
- **Moldura (D32):** menu lateral agrupado (Operação, Resultados, Gestão) a partir de 1024 px; abaixo disso, barra de cima, navegação embaixo (três seções + "Mais") e o mesmo menu numa gaveta (`Sheet`). Tudo em `App.tsx`.
- **Interface:** componentes de `src/components/ui/` (do shadcn, copiados para cá: podem ser editados) e as peças do painel em `src/components/`: `page.tsx` (cabeçalho de página, card de gráfico, estados de carregando/erro/vazio, aviso, número em destaque), `controls.tsx` (seleção, segmentado, legenda), `dialogs.tsx` (`confirmDialog`/`promptDialog`, no lugar de `window.confirm`/`prompt`), `strata.tsx`. Aviso de ação feita ou falha: `toast` do `sonner`.
- **Visualizações de dados próprias** (barras de balanço, cruzamentos, rankings, lista de bairros, gráficos em SVG, mapa): `src/charts.css`, que usa os tokens. Não têm equivalente no shadcn.
- **Tokens:** em `src/index.css`. Interface numa família de índigo (`--primary`, `--sidebar-*`, `--muted`…); cor de sentido só nos dados (`--fav`, `--unfav`, `--mid`, `--div-*`, `--series-*`, `--data-neutral`); âmbar (`--warn-*`) só para estado da operação. Nada de hex solto em página: use o token (exceção: cores que o Leaflet precisa literais, em `tone.ts` e `MapView.tsx`).
- Componente que falta: `pnpm dlx shadcn@latest add <nome>` e **confira o diff**: o CLI costuma instalar um pacote npm `cn` (de terceiros) no lugar de usar `src/lib/utils.ts`, e o `sonner` traz `next-themes`. Remova os dois e troque o import para `@/lib/utils`.
- Não podem quebrar: boletim impresso (`@media print` em `index.css`, classe `no-print`), marca d'água, celular (390 px).

## Rotas
Navegação com `react-router` (URLs em português, porque aparecem para o usuário). Cada papel só tem as rotas que enxerga; caminho desconhecido ou sem permissão cai na primeira tela permitida.

| URL | Tela |
|---|---|
| `/campo`, `/alertas`, `/questionario` | as próprias telas |
| `/resumo` (`?periodo=tudo`), `/resumo/boletim` | Resumo e boletim para reunião |
| `/bairros`, `/bairros/mapa`, `/bairros/<id>` | lista, mapa e ficha do bairro |
| `/detalhes/cruzamentos` · `perguntas` · `progresso` · `metodo` | vistas do Detalhes |
| `/cadastros/entrevistadores` · `aparelhos` · `marcos` · `locais` · `usuarios` | seções de Cadastros |

Em produção, o núcleo precisa devolver o `index.html` para qualquer caminho fora de `/api` (T3); o `pnpm dev` já faz isso.

## Rodar local
```bash
pnpm install
pnpm dev            # http://localhost:5173 ; /api vai para o núcleo em localhost:8000
pnpm build          # tipos + build de produção em dist/
```
Primeiro usuário do painel (os demais se cadastram na aba Cadastros): `cd ../api && uv run tracking-admin user-add --campaign <id> --email ... --name ... --role admin` (pede a senha e mostra a chave para o app autenticador).
