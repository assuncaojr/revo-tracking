import { useEffect, useMemo, useRef, useState } from "react";
import type { Balance, CampaignEventItem, Estimate, Indicator, Overview as OverviewData } from "../api";
import { useShowMargins } from "../prefs";
import { toneOf } from "../tone";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChartCard } from "@/components/page";
import { Legend } from "@/components/controls";
import { ArrowDown, ArrowUp, Equal } from "lucide-react";
import { cn } from "@/lib/utils";

// Cores por entidade, em ordem fixa (paleta validada para daltonismo; ver skill de dataviz): cada estrato mantém
// a sua cor em todos os gráficos. Azul e vermelho são reservados para "a favor" e "contra" a gestão.

/** Cor do sentido do indicador: azul se valor maior é a favor da gestão, vermelho se é contra. */
export function polarityColor(ind: { favorable: boolean }): string {
  return ind.favorable ? "var(--fav)" : "var(--unfav)";
}
const STRATUM_COLORS = ["var(--series-2)", "var(--series-3)"];
const OTHER_STRATUM = "var(--muted-foreground)";

export function stratumColor(strata: string[], name: string): string {
  const i = strata.indexOf(name);
  return STRATUM_COLORS[i] ?? OTHER_STRATUM;
}

const nf1 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });

/** Percentual sem casa decimal (a margem de erro não sustenta mais que isso); média com uma casa. */
export function fmt(v: number | null | undefined, mean: boolean): string {
  if (v == null) return "—";
  return mean ? nf1.format(v) : `${Math.round(v)}%`;
}

export function margin(e: Estimate, mean: boolean): string {
  if (e.value == null || e.low == null || e.high == null) return "";
  const half = (e.high - e.low) / 2;
  return mean ? `± ${nf1.format(half)}` : `± ${Math.round(half)} pts`;
}

function dayLabel(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

function weekday(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
}

// --- blocos de indicadores ---

/** Indicadores-chave: número grande, minilinha, régua e a variação na semana. Clicar troca o gráfico de evolução. */
export function IndicatorTiles({
  data,
  selected,
  onSelect,
}: {
  data: OverviewData;
  selected: string;
  onSelect: (key: string) => void;
}) {
  const showMargins = useShowMargins();
  return (
    <div
      className={cn(
        "my-4 grid grid-cols-2 gap-2 sm:gap-3",
        data.indicators.length <= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3",
      )}
    >
      {data.indicators.map((ind) => {
        const v = ind.current.value;
        return (
          <button
            key={ind.key}
            className={cn(
              "tile grid content-start gap-2.5 rounded-xl border bg-card p-3 text-left shadow-(--shadow-card) transition-colors hover:border-primary/40 sm:px-5 sm:py-4",
              ind.key === selected &&
                "selected border-primary ring-[3px] ring-selection hover:border-primary print:border-border print:ring-0",
            )}
            onClick={() => onSelect(ind.key)}
            aria-pressed={ind.key === selected}
          >
            <span className="text-sm text-muted-foreground">{ind.label}</span>
            {v == null ? (
              <span className="py-2 text-sm text-muted-foreground">
                {ind.current.suppressed ? `poucas entrevistas (${ind.current.n})` : "sem entrevistas"}
              </span>
            ) : (
              <>
                <span className="flex items-end justify-between gap-3">
                  <span className="text-[1.75rem] leading-none font-semibold tracking-tight whitespace-nowrap tabular-nums sm:text-[2rem]">
                    {ind.mean ? nf1.format(v) : Math.round(v)}
                    <span className="ml-0.5 text-sm font-normal tracking-normal text-muted-foreground">
                      {ind.mean ? ` de ${ind.scale?.[1] ?? 10}` : "%"}
                    </span>
                  </span>
                  <Sparkline ind={ind} />
                </span>
                <span className="tile-gauge" aria-hidden>
                  <span
                    style={{
                      width: `${ind.mean && ind.scale ? (100 * v) / ind.scale[1] : v}%`,
                      background: polarityColor(ind),
                    }}
                  />
                </span>
                {data.previous && <Change ind={ind} />}
                {showMargins && (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {margin(ind.current, ind.mean)} · {ind.current.n} entrevistas
                  </span>
                )}
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Minilinha da média de 3 dias no período, na cor do sentido do indicador. */
function Sparkline({ ind }: { ind: Indicator }) {
  const vals = ind.series.map((d) => d.rolling.value).filter((v): v is number => v != null);
  if (vals.length < 2) return null;
  const w = 84;
  const h = 30;
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = Math.max(hi - lo, ind.mean ? 0.5 : 4); // achata oscilação mínima
  const mid = (lo + hi) / 2;
  const y = (v: number) => h - 3 - ((v - (mid - span / 2)) / span) * (h - 6);
  const d = vals.map((v, i) => `${i ? "L" : "M"}${(i * (w - 4)) / (vals.length - 1) + 2},${y(v)}`).join("");
  const last = vals[vals.length - 1];
  return (
    <svg className="tile-spark" width={w} height={h} aria-hidden>
      <path d={d} fill="none" stroke={polarityColor(ind)} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={w - 2} cy={y(last)} r={3} fill={polarityColor(ind)} />
    </svg>
  );
}

/** Variação na semana: chip colorido só quando passa da margem; senão "estável" em cinza (não pinta ruído). */
function Change({ ind }: { ind: Indicator }) {
  if (!ind.change) return <span className="text-xs text-muted-foreground">sem semana anterior para comparar</span>;
  const { diff, beyond_margin } = ind.change;
  const shown = ind.mean ? nf1.format(Math.abs(diff)) : `${Math.round(Math.abs(diff))} pts`;
  const arrow = Math.abs(diff) < (ind.mean ? 0.05 : 0.5) ? "→" : diff > 0 ? "↑" : "↓";
  const good = ind.favorable ? diff > 0 : diff < 0;
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {beyond_margin ? (
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
            good ? "bg-fav-soft text-fav" : "bg-unfav-soft text-unfav",
          )}
          title={good ? "melhora real para a gestão" : "piora real para a gestão"}
        >
          {arrow} {shown}
        </span>
      ) : (
        <span
          className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground"
          title={`${arrow} ${shown}: a variação cabe na margem de erro`}
        >
          estável
        </span>
      )}
      <span className="text-xs text-muted-foreground">vs. semana anterior</span>
    </span>
  );
}

// --- resumo em balanços ---

/** Cada pergunta como uma barra: a favor da gestão (azul) | meio (cinza) | contra (vermelho), com a marca da metade. */
export function Balances({ balances }: { balances: Balance[] }) {
  const showMargins = useShowMargins();
  if (!balances?.length) return null;
  return (
    <ChartCard
      className="balances"
      title="A favor × contra a gestão"
      description="Cada pergunta dividida entre quem apoia e quem rejeita a gestão. O traço marca a metade."
    >
      <div className="grid gap-x-8 gap-y-6 xl:grid-cols-3">
        {balances.map((b) => (
          <div key={b.question} className="grid content-start gap-2 break-inside-avoid">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <strong className="text-[15px]">{b.label}</strong>
              {b.favorable && b.unfavorable && <BalanceVerdict b={b} />}
            </div>
            {b.favorable && b.unfavorable && b.other ? (
              <>
                <div className="balance-bar">
                  <div className="fav" style={{ width: `${b.favorable.value}%` }} title={`${b.labels.favorable}: ${Math.round(b.favorable.value)}% ± ${Math.round((b.favorable.high - b.favorable.low) / 2)} pts`}>
                    {b.favorable.value >= 8 && `${Math.round(b.favorable.value)}%`}
                  </div>
                  <div className="mid" style={{ width: `${b.other.value}%` }} title={`${b.labels.other}: ${Math.round(b.other.value)}%`}>
                    {b.other.value >= 10 && `${Math.round(b.other.value)}%`}
                  </div>
                  <div className="unfav" style={{ width: `${b.unfavorable.value}%` }} title={`${b.labels.unfavorable}: ${Math.round(b.unfavorable.value)}% ± ${Math.round((b.unfavorable.high - b.unfavorable.low) / 2)} pts`}>
                    {b.unfavorable.value >= 8 && `${Math.round(b.unfavorable.value)}%`}
                  </div>
                  <span className="balance-half" />
                </div>
                <div className="balance-legend">
                  <span>
                    <strong>{b.labels.favorable}</strong> {Math.round(b.favorable.value)}%
                  </span>
                  <span className="text-muted-foreground">
                    {b.labels.other} {Math.round(b.other.value)}%
                  </span>
                  <span className="r">
                    <strong>{b.labels.unfavorable}</strong> {Math.round(b.unfavorable.value)}%
                  </span>
                </div>
                {showMargins && <span className="text-xs text-muted-foreground tabular-nums">{b.n} entrevistas</span>}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                {b.suppressed ? `Poucas entrevistas (${b.n}) para mostrar.` : "Sem entrevistas."}
              </p>
            )}
          </div>
        ))}
      </div>
    </ChartCard>
  );
}

/** Leitura em chip: quem está à frente, ou empate técnico quando a diferença cabe na margem. */
function BalanceVerdict({ b }: { b: Balance }) {
  const f = b.favorable!;
  const u = b.unfavorable!;
  const overlap = f.low <= u.high && u.low <= f.high;
  if (overlap)
    return (
      <span
        className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground"
        title={`Empate técnico entre “${b.labels.favorable.toLowerCase()}” e “${b.labels.unfavorable.toLowerCase()}”: a diferença cabe na margem.`}
      >
        empate técnico
      </span>
    );
  const favAhead = f.value > u.value;
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
        favAhead ? "bg-fav-soft text-fav" : "bg-unfav-soft text-unfav",
      )}
    >
      {favAhead ? b.labels.favorable : b.labels.unfavorable} à frente por {Math.round(Math.abs(f.value - u.value))} pts
    </span>
  );
}

// --- evolução no tempo ---

const H = 260;
const PAD = { top: 16, right: 56, bottom: 30, left: 44 };

/** Largura real do contêiner: o SVG é desenhado em pixels, sem esticar as letras. */
function useWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    if (!ref.current) return;
    // largura 0 (contêiner ainda escondido, troca para impressão): mantém a última medida
    const ro = new ResizeObserver(([e]) => e.contentRect.width > 0 && setW(Math.round(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** Passo "redondo" das marcas do eixo: 1, 2, 5 ou 10 vezes uma potência de 10. */
function niceStep(range: number, target = 4): number {
  const raw = range / target;
  const pow = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow;
}

/** Domínio do eixo y alinhado às marcas: [início, fim, passo]. Nunca sai da escala (0–100%, 0–10). */
function niceDomain(ind: Indicator): [number, number, number] {
  const vals = ind.series.flatMap((d) => [d.rolling.low, d.rolling.high, d.daily.value]).filter(
    (v): v is number => v != null,
  );
  const [lo0, hi0] = ind.mean ? (ind.scale ?? [0, 10]) : [0, 100];
  if (vals.length === 0) return [lo0, hi0, niceStep(hi0 - lo0)];
  const minSpan = ind.mean ? 2 : 10;
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  if (hi - lo < minSpan) [lo, hi] = [(lo + hi) / 2 - minSpan / 2, (lo + hi) / 2 + minSpan / 2];
  const step = niceStep(hi - lo);
  return [Math.max(lo0, Math.floor(lo / step) * step), Math.min(hi0, Math.ceil(hi / step) * step), step];
}

/** Média móvel de 3 dias (linha) com a faixa da margem de erro; cada dia sozinho em pontos cinza. */
export function TrendChart({
  ind,
  events = [],
  className,
}: {
  ind: Indicator;
  events?: CampaignEventItem[];
  className?: string;
}) {
  const showMargins = useShowMargins();
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const [wrapRef, W] = useWidth<HTMLDivElement>(760);
  const color = polarityColor(ind);
  const s = ind.series;
  const [y0, y1, tickStep] = useMemo(() => niceDomain(ind), [ind]);
  const iw = Math.max(1, W - PAD.left - PAD.right);
  const ih = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (s.length === 1 ? iw / 2 : (i * iw) / (s.length - 1));
  const y = (v: number) => PAD.top + ih - ((v - y0) / (y1 - y0)) * ih;
  const ticks = Array.from({ length: Math.floor((y1 - y0) / tickStep + 1e-9) + 1 }, (_, i) => y0 + i * tickStep);
  const labelEvery = Math.max(1, Math.ceil((s.length * 56) / Math.max(1, W - PAD.left - PAD.right)));
  const pts = s.map((d, i) => ({ i, d })).filter((p) => p.d.rolling.value != null);
  const line = pts.map((p, k) => `${k ? "L" : "M"}${x(p.i)},${y(p.d.rolling.value!)}`).join("");
  const band =
    pts.length > 1
      ? pts.map((p, k) => `${k ? "L" : "M"}${x(p.i)},${y(p.d.rolling.high!)}`).join("") +
        [...pts]
          .reverse()
          .map((p) => `L${x(p.i)},${y(p.d.rolling.low!)}`)
          .join("") +
        "Z"
      : "";
  const last = pts[pts.length - 1];
  const h = hover != null ? s[hover] : null;
  // Marcos da campanha (D29): numerados na ordem, no dia em que aconteceram
  const marks = events
    .map((e, k) => ({ ...e, n: k + 1, i: s.findIndex((d) => d.day === e.day) }))
    .filter((e) => e.i >= 0);
  const hoverMarks = hover != null ? marks.filter((m) => m.i === hover) : [];

  return (
    <ChartCard
      className={className}
      title={`${ind.label}, dia a dia`}
      description={
        <>
          Linha: média dos últimos 3 dias{showMargins && ", com a faixa da margem de erro"}. Pontos: cada dia sozinho
          (oscilam mais).
          {marks.length > 0 && " Números: marcos da campanha."}
        </>
      }
      action={
        <Button variant="link" size="sm" className="no-print px-0" onClick={() => setTable(!table)}>
          {table ? "ver gráfico" : "ver em tabela"}
        </Button>
      }
    >
      {pts.length === 0 && !table ? (
        <p className="text-sm text-muted-foreground">Ainda não há entrevistas suficientes para mostrar a evolução.</p>
      ) : table ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Dia</TableHead>
              <TableHead className="text-right">Média de 3 dias</TableHead>
              <TableHead className="text-right">Margem</TableHead>
              <TableHead className="text-right">Só o dia</TableHead>
              <TableHead className="text-right">Entrevistas no dia</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {s.map((d) => (
              <TableRow key={d.day}>
                <TableCell>
                  {dayLabel(d.day)} {weekday(d.day)}
                  {d.partial && <span className="text-muted-foreground"> (parcial)</span>}
                </TableCell>
                <TableCell className="text-right tabular-nums">{fmt(d.rolling.value, ind.mean)}</TableCell>
                <TableCell className="text-right tabular-nums">{margin(d.rolling, ind.mean)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(d.daily.value, ind.mean)}</TableCell>
                <TableCell className="text-right tabular-nums">{d.daily.n}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <div className="chart-wrap" ref={wrapRef}>
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${ind.label}: evolução diária`}>
            {ticks.map((t) => (
              <g key={t}>
                <line className="grid" x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
                <text className="axis" x={PAD.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle">
                  {ind.mean ? (Number.isInteger(t) ? t : nf1.format(t)) : `${Math.round(t)}%`}
                </text>
              </g>
            ))}
            {s.map((d, i) =>
              i % labelEvery === 0 || i === s.length - 1 ? (
                <text key={d.day} className="axis" x={x(i)} y={H - 8} textAnchor="middle">
                  {dayLabel(d.day)}
                </text>
              ) : null,
            )}
            {!ind.mean && y0 < 50 && y1 > 50 && (
              <g>
                <line className="half" x1={PAD.left} x2={W - PAD.right} y1={y(50)} y2={y(50)} />
                <text className="half-label" x={W - PAD.right + 6} y={y(50) - 8}>
                  metade
                </text>
              </g>
            )}
            {showMargins && band && <path d={band} fill={color} opacity={0.12} />}
            {marks.map((m) => (
              <g key={`${m.day}-${m.n}`} className="mark">
                <line x1={x(m.i)} x2={x(m.i)} y1={PAD.top + 9} y2={PAD.top + ih} />
                <circle cx={x(m.i)} cy={PAD.top} r={9} />
                <text x={x(m.i)} y={PAD.top} textAnchor="middle" dominantBaseline="central">
                  {m.n}
                </text>
              </g>
            ))}
            {s.map((d, i) =>
              d.daily.value != null ? (
                <circle
                  key={d.day}
                  cx={x(i)}
                  cy={y(d.daily.value)}
                  r={3}
                  className={d.partial ? "daily partial" : "daily"}
                />
              ) : null,
            )}
            <path d={line} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
            {last && (
              <>
                <circle cx={x(last.i)} cy={y(last.d.rolling.value!)} r={4.5} fill={color} className="ring" />
                <text className="end-label" x={x(last.i) + 10} y={y(last.d.rolling.value!)} dominantBaseline="middle">
                  {fmt(last.d.rolling.value, ind.mean)}
                </text>
              </>
            )}
            {h && hover != null && (
              <line className="crosshair" x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + ih} />
            )}
            {s.map((d, i) => {
              const half = s.length === 1 ? iw / 2 : iw / (s.length - 1) / 2;
              return (
                <rect
                  key={d.day}
                  x={x(i) - half}
                  y={PAD.top}
                  width={half * 2}
                  height={ih}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                />
              );
            })}
          </svg>
          {h && hover != null && (
            <div
              className="tooltip"
              style={{ left: x(hover), transform: hover > s.length / 2 ? "translateX(-105%)" : "translateX(5%)" }}
            >
              <strong>
                {dayLabel(h.day)} {weekday(h.day)}
                {h.partial && " (parcial)"}
              </strong>
              <div>
                Média de 3 dias: {fmt(h.rolling.value, ind.mean)} {margin(h.rolling, ind.mean)}
              </div>
              <div className="text-muted-foreground">
                Só o dia: {fmt(h.daily.value, ind.mean)} · {h.daily.n} entrevistas
              </div>
              {hoverMarks.map((m) => (
                <div key={m.n}>
                  <strong>
                    {m.n}. {m.title}
                  </strong>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {marks.length > 0 && !table && (
        <ol className="marks">
          {marks.map((m) => (
            <li key={`${m.day}-${m.n}`}>
              <span className="mark-n">{m.n}</span>
              <span>
                <strong>{dayLabel(m.day)}</strong> {m.title}
                {m.note && <span className="text-muted-foreground"> · {m.note}</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
    </ChartCard>
  );
}

// --- grade de áreas ---

// Divergente: melhorou (azul) ↔ piorou (vermelho), "igual" no cinza neutro; não-resposta num cinza mais claro.
const GRID_COLORS: Record<number, string> = { 0: "var(--div-pos)", 1: "var(--div-mid)", 2: "var(--div-neg)" };

/** Balanço por área: barra 100% (melhorou | igual | piorou | não sabe), ordenada pelo saldo. O saldo só ganha cor
    quando passa da margem de erro (calculada no núcleo). */
export function GridChart({ data, className }: { data: OverviewData; className?: string }) {
  const showMargins = useShowMargins();
  const g = data.grid;
  if (!g) return null;
  const color = (i: number) => GRID_COLORS[i] ?? "var(--div-none)";
  return (
    <ChartCard className={className} title="Balanço por área" description={`${g.text} Ordenado pelo saldo: melhorou menos piorou.`}>
      <Legend
        items={[
          ...g.options.slice(0, 3).map((o, i) => ({ color: color(i), label: o.label })),
          ...(g.options.length > 3
            ? [{ color: color(3), label: g.options.slice(3).map((o) => o.label).join(" / ") }]
            : []),
        ]}
      />
      <div className="grid gap-3">
        {g.rows.map((r) => (
          <div key={r.value} className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_3rem] items-center gap-3 text-sm sm:text-[15px]">
            <span className="leading-tight">{r.label}</span>
            {r.pct ? (
              <div className="stack">
                {g.options.map((o, i) => {
                  const p = r.pct![o.value] ?? 0;
                  if (p <= 0) return null;
                  return (
                    <div
                      key={o.value}
                      style={{ width: `${p}%`, background: color(i) }}
                      title={`${o.label}: ${Math.round(p)}% (${r.n} entrevistas)`}
                      className={i === 0 ? "pos" : i === 2 ? "neg" : ""}
                    >
                      {p >= 9 && i < 3 && <span>{Math.round(p)}%</span>}
                    </div>
                  );
                })}
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">
                {r.suppressed ? `poucas entrevistas (${r.n})` : "sem respostas"}
              </span>
            )}
            <span
              className={cn(
                "text-right font-semibold tabular-nums",
                r.balance == null || !r.balance_beyond ? "text-muted-foreground" : r.balance > 0 ? "text-fav" : "text-unfav",
              )}
              title={r.balance_margin != null ? `margem do saldo: ± ${Math.round(r.balance_margin)} pts` : undefined}
            >
              {r.balance != null ? `${r.balance > 0 ? "+" : r.balance < 0 ? "−" : ""}${Math.abs(Math.round(r.balance))}` : "—"}
              {showMargins && r.balance_margin != null && (
                <span className="block text-[11px] font-normal text-muted-foreground">± {Math.round(r.balance_margin)}</span>
              )}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
        Saldo em cinza: a diferença entre melhorou e piorou cabe na margem de erro.
      </p>
    </ChartCard>
  );
}

// --- por estrato ---

/** Indicadores por estrato, ao lado da cidade. A diferença só ganha cor quando a cidade fica fora da faixa do estrato. */
export function StrataTable({ data }: { data: OverviewData }) {
  const strata = data.strata;
  if (strata.length < 2 || !data.indicators.length) return null;
  return (
    <ChartCard title="Por estrato" description="Diferença em relação à cidade; destacada só quando passa da margem de erro.">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Indicador</TableHead>
            <TableHead className="text-right">Cidade</TableHead>
            {strata.map((st) => (
              <TableHead key={st} className="text-right">
                <span className="inline-flex items-center gap-1.5">
                  <i className="size-2 rounded-full" style={{ background: stratumColor(strata, st) }} aria-hidden />
                  {st}
                </span>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.indicators.map((ind) => (
            <TableRow key={ind.key} className="hover:bg-transparent">
              <TableCell className="font-medium">{ind.label}</TableCell>
              <TableCell className="text-right font-semibold tabular-nums">{fmt(ind.current.value, ind.mean)}</TableCell>
              {strata.map((st) => (
                <StratumCell key={st} ind={ind} e={ind.by_stratum[st]} />
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ChartCard>
  );
}

function StratumCell({ ind, e }: { ind: Indicator; e: Estimate | undefined }) {
  if (!e || e.value == null)
    return (
      <TableCell className="text-right text-xs text-muted-foreground">
        {e?.suppressed ? `poucas entrevistas (${e.n})` : "—"}
      </TableCell>
    );
  const ref = ind.current.value;
  const tone = toneOf(e, ref, ind.favorable, ind.mean);
  const diff = ref == null ? 0 : e.value - ref;
  const size = ind.mean ? nf1.format(Math.abs(diff)) : String(Math.round(Math.abs(diff)));
  const sign = Number(size.replace(",", ".")) === 0 ? "±" : diff > 0 ? "+" : "−";
  return (
    <TableCell className="text-right tabular-nums">
      <span className="font-medium">{fmt(e.value, ind.mean)}</span>
      <span
        className={cn(
          "ml-2 inline-block min-w-11 rounded-md px-1.5 py-0.5 text-center text-xs font-semibold",
          !tone || tone === "same"
            ? "text-muted-foreground"
            : tone.startsWith("fav")
              ? "bg-fav-soft text-fav"
              : "bg-unfav-soft text-unfav",
        )}
        title={tone === "same" ? "dentro da margem de erro" : undefined}
      >
        {sign}
        {size}
      </span>
    </TableCell>
  );
}

// --- resumo em frases ---

const TONE_STYLE: Record<string, { Icon: typeof ArrowUp; cls: string; label: string }> = {
  favorable: { Icon: ArrowUp, cls: "bg-fav-soft text-fav", label: "a favor da gestão" },
  unfavorable: { Icon: ArrowDown, cls: "bg-unfav-soft text-unfav", label: "contra a gestão" },
  neutral: { Icon: Equal, cls: "bg-muted text-muted-foreground", label: "neutro" },
};

/** Percentuais e pontos da frase em negrito, para o olho achar o número rápido. */
function emphasize(text: string) {
  return text
    .split(/(\d+(?:[.,]\d+)?%|[+−-]?\d+(?:[.,]\d+)? pontos?)/)
    .map((part, i) => (i % 2 ? <strong key={i} className="font-semibold">{part}</strong> : part));
}

/** "O que mudou" em frases curtas, cada uma com o selo do sentido (azul a favor, vermelho contra, cinza neutro). */
export function Headlines({ items, title }: { items: { tone: string; text: string }[]; title: string }) {
  if (!items.length) return null;
  return (
    <Card className="headlines my-4 gap-5 p-4 break-inside-avoid sm:p-6">
      <h3 className="text-[15px] font-semibold">{title}</h3>
      <ul className="grid gap-x-8 gap-y-4 sm:grid-cols-[repeat(auto-fit,minmax(260px,1fr))]">
        {items.map((h) => {
          const t = TONE_STYLE[h.tone] ?? TONE_STYLE.neutral;
          return (
            <li key={h.text} className="flex items-start gap-3 text-[15px] leading-relaxed">
              <span className={cn("grid size-7 shrink-0 place-items-center rounded-lg", t.cls)}>
                <t.Icon className="size-4" strokeWidth={2.4} aria-hidden />
                <span className="sr-only">{t.label}:</span>
              </span>
              <span>{emphasize(h.text)}</span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
