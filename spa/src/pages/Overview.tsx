import { useEffect, useMemo, useRef, useState } from "react";
import type { Estimate, Indicator, Overview as OverviewData } from "../api";
import { changeColor } from "../tone";

// Cores por entidade, em ordem fixa (paleta validada para daltonismo; ver skill de dataviz): cada estrato mantém
// a sua cor em todos os gráficos. O total vai em grafite: azul e vermelho são reservados para "a favor" e "contra"
// a gestão.
const TOTAL_COLOR = "var(--text)";

/** Cor do sentido do indicador: azul se valor maior é a favor da gestão, vermelho se é contra. */
export function polarityColor(ind: { favorable: boolean }): string {
  return ind.favorable ? "var(--fav)" : "var(--unfav)";
}
const STRATUM_COLORS = ["var(--series-2)", "var(--series-3)"];
const OTHER_STRATUM = "var(--muted)";

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

export function IndicatorTiles({
  data,
  selected,
  onSelect,
}: {
  data: OverviewData;
  selected: string;
  onSelect: (key: string) => void;
}) {
  return (
    <div className="tiles">
      {data.indicators.map((ind) => (
        <button
          key={ind.key}
          className={`tile${ind.key === selected ? " selected" : ""}`}
          onClick={() => onSelect(ind.key)}
          aria-pressed={ind.key === selected}
        >
          <span className="tile-label">{ind.label}</span>
          {ind.current.value == null ? (
            <span className="tile-empty">
              {ind.current.suppressed ? `poucas entrevistas (${ind.current.n})` : "sem entrevistas"}
            </span>
          ) : (
            <>
              <div className="tile-top">
                <span className="tile-value">
                  {fmt(ind.current.value, ind.mean)}
                  {ind.mean && ind.scale && <span className="tile-unit"> de {ind.scale[1]}</span>}
                </span>
                <Sparkline ind={ind} />
              </div>
              <div className="tile-gauge" aria-hidden>
                <div
                  style={{
                    width: `${ind.mean && ind.scale ? (100 * ind.current.value) / ind.scale[1] : ind.current.value}%`,
                    background: polarityColor(ind),
                  }}
                />
              </div>
              <span className="tile-meta">
                {margin(ind.current, ind.mean)} · {ind.current.n} entrevistas
              </span>
              {data.previous && <Change ind={ind} />}
            </>
          )}
        </button>
      ))}
    </div>
  );
}

/** Minilinha da média de 3 dias no período, na cor do sentido do indicador. */
function Sparkline({ ind }: { ind: Indicator }) {
  const vals = ind.series.map((d) => d.rolling.value).filter((v): v is number => v != null);
  if (vals.length < 2) return null;
  const w = 72;
  const h = 28;
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

// --- resumo em balanços ---

/** Cada pergunta como uma barra: a favor da gestão (azul) | meio (cinza) | contra (vermelho), com a marca da metade. */
export function Balances({ data }: { data: OverviewData }) {
  if (!data.balances?.length) return null;
  return (
    <div className="card balances">
      {data.balances.map((b) => (
        <div key={b.question}>
          <div className="balance-head">
            <strong>{b.label}</strong>
            <span className="muted small">{b.n} entrevistas · a linha marca a metade</span>
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
                <span className="muted">
                  {b.labels.other} {Math.round(b.other.value)}%
                </span>
                <span className="r">
                  <strong>{b.labels.unfavorable}</strong> {Math.round(b.unfavorable.value)}%
                </span>
              </div>
              <BalanceVerdict b={b} />
            </>
          ) : (
            <p className="muted small">{b.suppressed ? `Poucas entrevistas (${b.n}) para mostrar.` : "Sem entrevistas."}</p>
          )}
        </div>
      ))}
    </div>
  );
}

/** Frase de leitura: quem está à frente, e se a diferença passa da margem. */
function BalanceVerdict({ b }: { b: OverviewData["balances"][number] }) {
  const f = b.favorable!;
  const u = b.unfavorable!;
  const overlap = f.low <= u.high && u.low <= f.high;
  const text = overlap
    ? `Empate técnico entre “${b.labels.favorable.toLowerCase()}” e “${b.labels.unfavorable.toLowerCase()}”: a diferença cabe na margem.`
    : f.value > u.value
      ? `“${b.labels.favorable}” à frente por ${Math.round(f.value - u.value)} pontos.`
      : `“${b.labels.unfavorable}” à frente por ${Math.round(u.value - f.value)} pontos.`;
  return <p className="small" style={{ margin: "4px 0 0" }}>{text}</p>;
}

function Change({ ind }: { ind: Indicator }) {
  if (!ind.change) return <span className="tile-change muted">sem semana anterior para comparar</span>;
  const { diff, beyond_margin } = ind.change;
  const unit = ind.mean ? "" : " pts";
  const shown = ind.mean ? nf1.format(Math.abs(diff)) : Math.round(Math.abs(diff));
  const arrow = Math.abs(diff) < (ind.mean ? 0.05 : 0.5) ? "→" : diff > 0 ? "↑" : "↓";
  if (!beyond_margin)
    return (
      <span className="tile-change">
        {arrow} {shown}
        {unit} na semana · estável: a variação cabe na margem
      </span>
    );
  const good = ind.favorable ? diff > 0 : diff < 0;
  return (
    <span className="tile-change strong">
      <span className="chip" style={{ background: changeColor(diff, ind.favorable) }}>
        {arrow} {shown}
        {unit}
      </span>{" "}
      na semana · {good ? "melhora real para a gestão" : "piora real para a gestão"}
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
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
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
export function TrendChart({ ind }: { ind: Indicator }) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const [wrapRef, W] = useWidth<HTMLDivElement>(760);
  const color = polarityColor(ind);
  const s = ind.series;
  const [y0, y1, tickStep] = useMemo(() => niceDomain(ind), [ind]);
  const iw = W - PAD.left - PAD.right;
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

  return (
    <div className="chart-card card">
      <div className="row between">
        <div>
          <h3>{ind.label}: evolução</h3>
          <p className="muted small">
            Linha: média dos últimos 3 dias, com a faixa da margem de erro. Pontos: cada dia sozinho (oscilam mais).
          </p>
        </div>
        <button className="link" onClick={() => setTable(!table)}>
          {table ? "ver gráfico" : "ver em tabela"}
        </button>
      </div>
      {pts.length === 0 && !table ? (
        <p className="muted">Ainda não há entrevistas suficientes para mostrar a evolução.</p>
      ) : table ? (
        <table className="compact">
          <thead>
            <tr>
              <th>Dia</th>
              <th className="num">Média de 3 dias</th>
              <th className="num">Margem</th>
              <th className="num">Só o dia</th>
              <th className="num">Entrevistas no dia</th>
            </tr>
          </thead>
          <tbody>
            {s.map((d) => (
              <tr key={d.day}>
                <td>
                  {dayLabel(d.day)} {weekday(d.day)}
                  {d.partial && <span className="muted"> (parcial)</span>}
                </td>
                <td className="num">{fmt(d.rolling.value, ind.mean)}</td>
                <td className="num">{margin(d.rolling, ind.mean)}</td>
                <td className="num">{fmt(d.daily.value, ind.mean)}</td>
                <td className="num">{d.daily.n}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
            {band && <path d={band} fill={color} opacity={0.12} />}
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
              <div className="muted">
                Só o dia: {fmt(h.daily.value, ind.mean)} · {h.daily.n} entrevistas
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- estratos lado a lado ---

/** Ponto com a margem de erro (traço) por indicador: total e cada estrato na mesma régua. */
export function StrataChart({ data }: { data: OverviewData }) {
  const groups: { name: string; color: string; get: (ind: Indicator) => Estimate }[] = [
    { name: "Total", color: TOTAL_COLOR, get: (ind) => ind.current },
    ...data.strata.map((st) => ({
      name: st,
      color: stratumColor(data.strata, st),
      get: (ind: Indicator) => ind.by_stratum[st] ?? { n: 0, value: null },
    })),
  ];
  return (
    <div className="card chart-card">
      <h3>Comparação entre estratos</h3>
      <p className="muted small">
        Cada ponto é o resultado do grupo; o traço é a margem de erro. Traços que se cruzam: a diferença pode ser só
        oscilação da amostra.
      </p>
      <div className="legend">
        {groups.map((g) => (
          <span key={g.name}>
            <i style={{ background: g.color }} /> {g.name}
          </span>
        ))}
      </div>
      <div className="dotplot">
        {data.indicators.map((ind) => {
          const [lo, hi] = ind.mean ? (ind.scale ?? [0, 10]) : [0, 100];
          const pos = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`;
          return (
            <div key={ind.key} className="dot-row">
              <div className="dot-label">{ind.label}</div>
              <div className="dot-track">
                <span className="dot-axis" style={{ left: 0 }}>
                  {ind.mean ? lo : `${lo}%`}
                </span>
                <span className="dot-axis" style={{ right: 0 }}>
                  {ind.mean ? hi : `${hi}%`}
                </span>
                {groups.map((g, k) => {
                  const e = g.get(ind);
                  if (e.value == null || e.low == null || e.high == null) return null;
                  const top = 6 + k * 9;
                  const tip = `${g.name}: ${fmt(e.value, ind.mean)} ${margin(e, ind.mean)} (${e.n} entrevistas)`;
                  return (
                    <span key={g.name} title={tip}>
                      <span
                        className="whisker"
                        style={{ left: pos(e.low), width: `calc(${pos(e.high)} - ${pos(e.low)})`, top: top + 3, background: g.color }}
                      />
                      <span className="dot" style={{ left: pos(e.value), top, background: g.color }} />
                    </span>
                  );
                })}
              </div>
              <div className="dot-values">
                {groups.map((g) => {
                  const e = g.get(ind);
                  return (
                    <span key={g.name} title={g.name}>
                      <i style={{ background: g.color }} />
                      {e.value != null ? fmt(e.value, ind.mean) : e.suppressed ? "oculto" : "—"}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- grade de áreas ---

// Divergente: melhorou (azul) ↔ piorou (vermelho), "igual" no cinza neutro; não-resposta num cinza mais claro.
const GRID_COLORS: Record<number, string> = { 0: "var(--div-pos)", 1: "var(--div-mid)", 2: "var(--div-neg)" };

/** Barra 100% por área (melhorou | igual | piorou | não sabe), ordenada pelo saldo. */
export function GridChart({ data }: { data: OverviewData }) {
  const g = data.grid;
  if (!g) return null;
  const color = (i: number) => GRID_COLORS[i] ?? "var(--div-none)";
  return (
    <div className="card chart-card">
      <h3>{g.text}</h3>
      <p className="muted small">Ordenado pelo saldo: quem disse que melhorou menos quem disse que piorou.</p>
      <div className="legend">
        {g.options.slice(0, 3).map((o, i) => (
          <span key={o.value}>
            <i style={{ background: color(i) }} /> {o.label}
          </span>
        ))}
        {g.options.length > 3 && (
          <span>
            <i style={{ background: color(3) }} /> {g.options.slice(3).map((o) => o.label).join(" / ")}
          </span>
        )}
      </div>
      <table className="gridbars">
        <thead>
          <tr>
            <th>Área</th>
            <th />
            <th className="num">Saldo</th>
          </tr>
        </thead>
        <tbody>
          {g.rows.map((r) => (
            <tr key={r.value}>
              <td>{r.label}</td>
              <td className="stack-cell">
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
                  <span className="muted small">{r.suppressed ? `poucas entrevistas (${r.n})` : "sem respostas"}</span>
                )}
              </td>
              <td className="num">
                {r.balance != null ? `${r.balance > 0 ? "+" : ""}${Math.round(r.balance)}` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
