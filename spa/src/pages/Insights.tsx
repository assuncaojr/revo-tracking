import { useState } from "react";
import { useShowMargins } from "../prefs";
import type { CrossGroup, Insights as InsightsData, RankingItem } from "../api";
import { fmt, margin, stratumColor } from "./Overview";
import { TONE_COLORS, TONE_LABELS, toneOf } from "../tone";

const BLUE = "var(--series-1)";
const FAV = "#2a78d6";
const UNFAV = "#e34948";

/** Régua comum a todos os cruzamentos da tela: arredondada a 10 pontos em volta dos dados (percentual) ou a escala. */
function domain(groups: CrossGroup[], mean: boolean): [number, number] {
  const vals = groups.flatMap((g) => [g.low, g.high]).filter((v): v is number => v != null);
  if (mean) return [0, 10];
  if (!vals.length) return [0, 100];
  return [Math.max(0, Math.floor(Math.min(...vals) / 10) * 10), Math.min(100, Math.ceil(Math.max(...vals) / 10) * 10)];
}

/** Indicador por grupo (voto passado, estrato, sexo…): ponto com a margem, e a linha vertical do total. */
export function Crosstab({ data }: { data: InsightsData }) {
  const [all, setAll] = useState(false);
  const showMargins = useShowMargins();
  const ct = data.crosstab;
  if (!ct) return <p className="muted">Esta campanha ainda não tem indicadores configurados.</p>;
  const mean = ct.indicator.mean;
  const [lo, hi] = domain(
    ct.dimensions.flatMap((d) => d.groups),
    mean,
  );
  const pos = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`;
  return (
    <div className="card chart-card">
      <h3>{ct.indicator.label}, por grupo</h3>
      <div className="row between wrap">
        <p className="muted small">
          {all
            ? `Todos os grupos. Linha cinza: total (${fmt(ct.total.value, mean)}). Só ganha cor o grupo que se diferencia do total de verdade.`
            : `Só os grupos que se diferenciam de verdade do total (${fmt(ct.total.value, mean)}): o resto está dentro da margem.`}
        </p>
        <button className="link" onClick={() => setAll(!all)}>
          {all ? "mostrar só o que se diferencia" : "ver todos os grupos"}
        </button>
      </div>
      <div className="legend">
        <span>
          <i style={{ background: FAV }} /> mais favorável à gestão que o total
        </span>
        <span>
          <i style={{ background: "#9a9a94" }} /> {TONE_LABELS.same}
        </span>
        <span>
          <i style={{ background: UNFAV }} /> menos favorável à gestão que o total
        </span>
      </div>
      {ct.dimensions.map((d) => {
        const shown = all
          ? d.groups
          : d.groups.filter((g) => {
              const tone = toneOf(g, ct.total.value, ct.indicator.favorable, mean);
              return tone != null && tone !== "same";
            });
        if (!all && shown.length === 0) return null;
        return (
        <section key={d.key} className="xdim">
          <h4>{d.label}</h4>
          {shown.map((g) => {
            const tone = toneOf(g, ct.total.value, ct.indicator.favorable, mean);
            // Ponto pequeno no branco: só direção (azul, vermelho, cinza), sempre no tom forte; o tamanho da
            // diferença já está no valor escrito ao lado
            const color = !tone ? BLUE : tone === "same" ? "#9a9a94" : tone.startsWith("fav") ? FAV : UNFAV;
            return (
            <div key={g.group} className="xrow">
              <div className="xlabel">{g.label}</div>
              <div className="xtrack">
                {ct.total.value != null && <span className="xtotal" style={{ left: pos(ct.total.value) }} />}
                {g.value != null && g.low != null && g.high != null && (
                  <>
                    <span
                      className="whisker"
                      style={{ left: pos(g.low), width: `calc(${pos(g.high)} - ${pos(g.low)})`, top: 12, background: color }}
                    />
                    <span
                      className={`dot${tone === "same" ? " dot-same" : ""}`}
                      style={{ left: pos(g.value), top: 9, background: color }}
                    />
                  </>
                )}
              </div>
              <div className="xvalue">
                {g.value != null ? (
                  <>
                    <strong>{fmt(g.value, mean)}</strong>{" "}
                    {showMargins && <span className="muted">{margin(g, mean)}</span>}
                  </>
                ) : (
                  <span className="muted">{g.suppressed ? "poucas entrevistas" : "—"}</span>
                )}
              </div>
              <div className="xn muted">{g.n}</div>
            </div>
            );
          })}
        </section>
        );
      })}
      {!all && ct.dimensions.every((d) => d.groups.every((g) => {
        const tone = toneOf(g, ct.total.value, ct.indicator.favorable, mean);
        return tone == null || tone === "same";
      })) && <p className="muted">Nenhum grupo se diferencia do total além da margem de erro.</p>}
      <div className="xrow xaxis muted small">
        <div />
        <div className="xtrack">
          <span style={{ left: 0 }}>{mean ? lo : `${lo}%`}</span>
          <span style={{ right: 0 }}>{mean ? hi : `${hi}%`}</span>
        </div>
        <div>{showMargins ? "valor ± margem" : "valor"}</div>
        <div>n</div>
      </div>
    </div>
  );
}

/** Matriz de segmentos (ex.: aprovação × continuidade), em % do total, com o nome de cada segmento. */
export function Segments({ data }: { data: InsightsData }) {
  const sg = data.segments;
  if (!sg) return null;
  const max = Math.max(1, ...Object.values(sg.cells).map((c) => c.pct ?? 0));
  return (
    <div className="card chart-card">
      <h3>Segmentos</h3>
      <p className="muted small">
        Cada célula é a parte dos entrevistados (n = {sg.n}) que deu as duas respostas. Linhas: {sg.rows.text}{" "}
        Colunas: {sg.cols.text}
        {sg.left_out > 0 && ` Fora da matriz: ${sg.left_out} que não souberam ou não responderam uma das duas.`}
      </p>
      <div className="legend">
        <span>
          <i style={{ background: TONE_COLORS.fav2 }} /> a favor da gestão
        </span>
        <span>
          <i style={{ background: TONE_COLORS.unfav2 }} /> contra a gestão
        </span>
        <span>
          <i style={{ background: "#9a9a94" }} /> dividido
        </span>
        <span className="muted">· cor mais forte = segmento maior</span>
      </div>
      <table className="segments">
        <thead>
          <tr>
            <th />
            {sg.cols.values.map((c) => (
              <th key={c.value} className="num">
                {c.label}
              </th>
            ))}
            <th className="num">Total</th>
          </tr>
        </thead>
        <tbody>
          {sg.rows.values.map((r) => (
            <tr key={r.value}>
              <th scope="row">{r.label}</th>
              {sg.cols.values.map((c) => {
                const cell = sg.cells[`${r.value}|${c.value}`];
                const name = sg.names[`${r.value}|${c.value}`];
                const a = cell?.pct != null ? 0.15 + 0.6 * (cell.pct / max) : 0;
                const tone = sg.tones[`${r.value}|${c.value}`];
                const rgb = tone === "favorable" ? "28, 92, 171" : tone === "unfavorable" ? "201, 58, 57" : "120, 118, 110";
                return (
                  <td
                    key={c.value}
                    className="segcell"
                    style={{ background: `rgba(${rgb}, ${a})`, color: a > 0.5 ? "#fff" : undefined }}
                  >
                    <strong>{cell?.pct != null ? `${Math.round(cell.pct)}%` : cell?.suppressed ? "<30" : "—"}</strong>
                    {name && <span>{name}</span>}
                  </td>
                );
              })}
              <td className="num">{pctOf(sg.row_totals[r.value]?.pct)}</td>
            </tr>
          ))}
          <tr>
            <th scope="row">Total</th>
            {sg.cols.values.map((c) => (
              <td key={c.value} className="num">
                {pctOf(sg.col_totals[c.value]?.pct)}
              </td>
            ))}
            <td className="num">100%</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function pctOf(v: number | null | undefined): string {
  return v == null ? "—" : `${Math.round(v)}%`;
}

/** Rankings (prioridade, lembrança espontânea): barra com a margem; não-resposta no fim, em cinza. */
export function Rankings({ data }: { data: InsightsData }) {
  if (!data.rankings.length) return null;
  return (
    <>
      {data.rankings.map((rk) => (
        <div key={rk.key} className="card chart-card">
          <h3>{rk.text}</h3>
          <p className="muted small">
            {rk.type === "name"
              ? "Resposta espontânea: o entrevistador não lê nomes. Nomes fora da lista entram em “outros nomes”."
              : "Uma escolha por entrevistado."}{" "}
            n = {rk.n}.
          </p>
          {rk.strata.length > 1 && (
            <div className="legend">
              {rk.strata.map((st) => (
                <span key={st}>
                  <i style={{ background: stratumColor(rk.strata, st) }} /> {st}
                </span>
              ))}
            </div>
          )}
          <div className="ranking">
            {rk.items.map((it) => (
              <RankRow key={it.value} it={it} strata={rk.strata} />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

function RankRow({ it, strata }: { it: RankingItem; strata: string[] }) {
  return (
    <div className={`rrow${it.nonresponse ? " nr" : ""}`}>
      <div className="rlabel">{it.label}</div>
      <div className="rtrack">
        {it.pct != null && (
          <>
            <div className="rbar" style={{ width: `${it.pct}%` }} />
            {it.low != null && it.high != null && (
              <span className="rwhisker" style={{ left: `${it.low}%`, width: `${it.high - it.low}%` }} />
            )}
          </>
        )}
      </div>
      <div className="rvalue">
        {it.pct != null ? <strong>{Math.round(it.pct)}%</strong> : <span className="muted">poucas</span>}
      </div>
      {strata.length > 1 && (
        <div className="rstrata">
          {strata.map((st) => (
            <span key={st} title={st}>
              <i style={{ background: stratumColor(strata, st) }} />
              {it.by_stratum[st] != null ? `${Math.round(it.by_stratum[st]!)}%` : "—"}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Resumo dos cruzamentos: os grupos que se diferenciam do total de verdade, separados por lado (D28, item 6). */
export function Highlights({ data }: { data: InsightsData }) {
  const ct = data.crosstab;
  if (!ct || ct.total.value == null) return null;
  const mean = ct.indicator.mean;
  const items = ct.dimensions.flatMap((d) =>
    d.groups
      .map((g) => ({ g, d, tone: toneOf(g, ct.total.value, ct.indicator.favorable, mean) }))
      .filter((x) => x.tone != null && x.tone !== "same")
      .map((x) => ({ ...x, diff: Math.abs(x.g.value! - ct.total.value!) })),
  );
  const better = items.filter((x) => x.tone!.startsWith("fav")).sort((a, b) => b.diff - a.diff);
  const worse = items.filter((x) => x.tone!.startsWith("unfav")).sort((a, b) => b.diff - a.diff);
  const list = (xs: typeof items, color: string, empty: string) =>
    xs.length === 0 ? (
      <p className="muted small">{empty}</p>
    ) : (
      <ul>
        {xs.slice(0, 5).map(({ g, d }) => (
          <li key={`${d.key}-${g.group}`}>
            <i style={{ background: color }} />
            <span>
              <span className="muted">{d.label}:</span> <strong>{g.label}</strong>
            </span>
            <strong className="hl-value">{fmt(g.value, mean)}</strong>
          </li>
        ))}
      </ul>
    );
  return (
    <div className="card highlights">
      <h3>
        {ct.indicator.label}: onde a gestão vai melhor e onde vai pior
      </h3>
      <p className="muted small">
        Comparado com o total ({fmt(ct.total.value, mean)}). Só entram diferenças além da margem de erro.
      </p>
      <div className="two-up tight">
        <div>
          <h4>Mais favorável à gestão</h4>
          {list(better, FAV, "Nenhum grupo acima do total além da margem.")}
        </div>
        <div>
          <h4>Menos favorável à gestão</h4>
          {list(worse, UNFAV, "Nenhum grupo abaixo do total além da margem.")}
        </div>
      </div>
    </div>
  );
}
