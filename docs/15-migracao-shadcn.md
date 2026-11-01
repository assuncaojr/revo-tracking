# Migração do painel para shadcn/ui (D30)

O piloto será apresentado ao cliente na tela, então o visual pesa tanto quanto o dado. Este plano leva todo o painel (`spa/`) para Tailwind v4 + shadcn/ui sem parar o resto do calendário.

## Onde estamos
**Concluída em 01/11/2026.** Todas as telas em shadcn; `src/styles.css` e a camada de convivência foram apagados. Regras de uso em `spa/README.md` → "Visual (D30)".

Ajustes feitos na execução:
- **Visualizações de dados em `src/charts.css`**, não em classes utilitárias: barras de balanço, cruzamentos, rankings e lista de bairros não têm equivalente no shadcn e ficariam ilegíveis em utilitários. O arquivo usa os tokens e é permanente.
- **Ficha do bairro continua como página**, não em Sheet: mesmo comportamento de antes.
- **Excluir alerta:** cancelar o diálogo do motivo agora desiste da exclusão (antes, cancelar o `prompt` excluía sem motivo).
- **Pendente:** o boletim impresso sai em branco no Chrome do responsável (no Chromium headless o PDF sai completo). Investigar à parte (item 2.2).

## Princípios
1. **Mesmo comportamento, visual novo.** Nada muda na API, nos contratos ou nas regras (n < 30 oculto, margem escondida por padrão, cor só nos dados). Mudança de conteúdo vira item separado em `decisoes.md`.
2. **Uma tela por commit** (`feat(spa): <tela> em shadcn (D30)`). Ao terminar uma tela, as regras de `styles.css` que ficaram sem uso são apagadas no mesmo commit.
3. **Verificação a cada tela:** computador (1366 px), celular (390 px) e, nas telas que entram no boletim, impressão.
4. **Gráficos continuam em SVG próprio.** Só ganham os tokens novos (cores, fonte, grade). O gráfico do shadcn traria o Recharts e um retrabalho que não melhora a leitura.
5. **Cor dos dados não muda:** azul = a favor da gestão, vermelho = contra, cinza = dentro da margem.

## Fase 1 — Peças compartilhadas (≈ 1 dia)
Antes das telas, para que todas saiam iguais. Ficam em `src/components/` (as do shadcn em `src/components/ui/`).

| Peça | Base shadcn | Substitui |
|---|---|---|
| `PageHeader` (título, linha de atualização, ações) | — | `.page-head`, `.row.between` |
| `ChartCard` (título, descrição, ação, conteúdo) | Card | `.chart-card`, `.card` |
| `Segmented` (períodos, indicadores) | ToggleGroup | `.segmented`, `.subnav` |
| Filtros (período, recorte) | Select, Label | `<select>` + `.filters` |
| Alternador "Mostrar margens de erro" | Switch | `.toggle` + checkbox |
| `Legend` (a favor / contra / neutro) | — | `.legend` |
| `Verdict` ("empate técnico", "à frente") | Badge | `.pill`, textos coloridos |
| Estados vazio, carregando e erro | Skeleton, Alert | "Carregando…", `.error`, `.notice` |
| Tabela de dados | Table | `table`, `.num`, `.compact` |
| Confirmação e pergunta | AlertDialog, Dialog | `window.confirm` e `window.prompt` (10 usos) |
| Aviso de ação feita ou falha | Sonner (toast) | mensagens soltas de "salvo"/erro em Cadastros |

Componentes a acrescentar: `toggle-group`, `switch`, `checkbox`, `skeleton`, `alert-dialog`, `sonner`, `textarea`, `scroll-area`, `sheet` (ficha do bairro no celular), `popover`.

## Fase 2 — Telas do cliente (≈ 4 a 5 dias, em ordem de impacto)
| # | Tela | Arquivos | Estimativa | Cuidados |
|---|---|---|---|---|
| 2.1 | **Resumo** | `Results.tsx` (Summary), `Overview.tsx` | 1,5 dia | Frases, balanços a favor × contra, indicadores com tendência, gráfico com marcos (D29). É a primeira tela que o cliente vê |
| 2.2 | **Boletim** | `Report.tsx` + `@media print` | 0,5 a 1 dia | **Primeiro, achar por que a impressão sai em branco:** qual navegador, se acontece também em "Salvar como PDF", se acontecia antes da D30 (testar o commit `5f527bb`). Suspeitos: o cabeçalho fixo com `backdrop-filter`, a marca d'água fixa em tela cheia, as regras `!important` na camada `legacy`. Depois, migrar e testar em Chrome e Safari, A4 |
| 2.3 | **Bairros** | `Neighborhoods.tsx`, `MapView.tsx` | 1 dia | Lista comparando com a cidade, ficha do bairro (Sheet no celular), mapa em hexágonos (D26): o CSS do Leaflet precisa sobreviver ao reset do Tailwind |
| 2.4 | **Detalhes** | `Results.tsx` (Details), `Insights.tsx`, `Method.tsx`, `Progress.tsx` | 1 dia | Onde vai melhor e pior, cruzamentos, segmentos, rankings, pergunta a pergunta, "como a pesquisa é feita" |
| 2.5 | **Questionário** | `Questionnaire.tsx` | 0,5 dia | Prévia de leitura (Accordion no lugar de `<details>`), aprovação com AlertDialog |

## Fase 3 — Telas da equipe (≈ 2 dias)
| # | Tela | Arquivos | Estimativa | Cuidados |
|---|---|---|---|---|
| 3.1 | **Campo agora** | `FieldNow.tsx` | 0,5 dia | Atualiza a cada minuto: não piscar ao recarregar |
| 3.2 | **Alertas** | `Flags.tsx` | 0,25 dia | Aceitar/excluir com AlertDialog |
| 3.3 | **Cadastros** | `Manage.tsx` (755 linhas) | 1,25 dia | Maior tela; trocar os `prompt` por Dialog com formulário; QR do aparelho e chave do autenticador num Dialog |

## Fase 4 — Limpeza (≈ 0,5 dia)
- Apagar `src/styles.css`, a camada `legacy` e os `:not([data-slot])`; levar os tokens de dados (`--fav`, `--unfav`, `--div-*`, `--series-*`) para `src/index.css`.
- Atualizar `spa/README.md` (tirar a seção de convivência).
- Rodada final no celular real (Xiaomi) e impressão do boletim.

## Calendário
Total de **≈ 8 a 9 dias** de trabalho. O painel está adiantado em relação ao calendário (a S5 previa o painel mínimo), então a migração usa essa folga. **Meta: concluída antes do ensaio técnico (S6, 08/12)**, para que o ensaio e o treinamento já usem a versão final e nada visual mude perto do campo (12/01/2027).

Se o prazo apertar, as fases 1 e 2 bastam para a apresentação ao cliente. As telas da equipe podem ficar no visual antigo sem prejuízo.

## Fora do escopo
Modo escuro, mudança de conteúdo ou de navegação, troca dos gráficos por biblioteca, novas telas.
