import { useState } from "react";
import { useShowMargins } from "../prefs";
import type { CrossGroup, Insights as InsightsData, RankingItem } from "../api";
import { fmt, margin, stratumColor } from "./Overview";
import { TONE_COLORS, TONE_LABELS, toneOf } from "../tone";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Legend } from "@/components/controls";
import { ChartCard, EmptyState } from "@/components/page";

const BLUE = "var(--series-1)";
const FAV = "var(--fav)";
const UNFAV = "var(--unfav)";

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
  if (!ct) return <EmptyState>Esta campanha ainda não tem indicadores configurados.</EmptyState>;
  const mean = ct.indicator.mean;
  const [lo, hi] = domain(
    ct.dimensions.flatMap((d) => d.groups),
    mean,
  );
  const pos = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`;
  return (
    <ChartCard
      title={`${ct.indicator.label}, por grupo`}
      description={
        all
          ? `Todos os grupos. Linha cinza: total (${fmt(ct.total.value, mean)}). Só ganha cor o grupo que se diferencia do total de verdade.`
          : `Só os grupos que se diferenciam de verdade do total (${fmt(ct.total.value, mean)}): o resto está dentro da margem.`
      }
      action={
        <Button variant="link" size="sm" className="no-print h-auto px-0 whitespace-normal" onClick={() => setAll(!all)}>
          {all ? "mostrar só o que se diferencia" : "ver todos os grupos"}
        </Button>
      }
    >
      <Legend
        items={[
          { color: FAV, label: "mais favorável à gestão que o total" },
          { color: "var(--data-neutral)", label: TONE_LABELS.same },
          { color: UNFAV, label: "menos favorável à gestão que o total" },
        ]}
      />
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
            const color = !tone ? BLUE : tone === "same" ? "var(--data-neutral)" : tone.startsWith("fav") ? FAV : UNFAV;
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
                    {showMargins && <span className="text-muted-foreground">{margin(g, mean)}</span>}
                  </>
                ) : (
                  <span className="text-muted-foreground">{g.suppressed ? "poucas entrevistas" : "—"}</span>
                )}
              </div>
              <div className="xn text-muted-foreground">{g.n}</div>
            </div>
            );
          })}
        </section>
        );
      })}
      {!all && ct.dimensions.every((d) => d.groups.every((g) => {
        const tone = toneOf(g, ct.total.value, ct.indicator.favorable, mean);
        return tone == null || tone === "same";
      })) && <p className="text-sm text-muted-foreground">Nenhum grupo se diferencia do total além da margem de erro.</p>}
      <div className="xrow xaxis text-xs text-muted-foreground">
        <div />
        <div className="xtrack">
          <span style={{ left: 0 }}>{mean ? lo : `${lo}%`}</span>
          <span style={{ right: 0 }}>{mean ? hi : `${hi}%`}</span>
        </div>
        <div>{showMargins ? "valor ± margem" : "valor"}</div>
        <div>n</div>
      </div>
    </ChartCard>
  );
}

/** Matriz de segmentos (ex.: aprovação × continuidade), em % do total, com o nome de cada segmento. */
export function Segments({ data }: { data: InsightsData }) {
  const sg = data.segments;
  if (!sg) return null;
  const max = Math.max(1, ...Object.values(sg.cells).map((c) => c.pct ?? 0));
  return (
    <ChartCard
      title="Segmentos"
      description={
        <>
          Cada célula é a parte dos entrevistados (n = {sg.n}) que deu as duas respostas. Linhas: {sg.rows.text}{" "}
          Colunas: {sg.cols.text}
          {sg.left_out > 0 && ` Fora da matriz: ${sg.left_out} que não souberam ou não responderam uma das duas.`}
        </>
      }
    >
      <Legend
        items={[
          { color: TONE_COLORS.fav2, label: "a favor da gestão" },
          { color: TONE_COLORS.unfav2, label: "contra a gestão" },
          { color: "var(--data-neutral)", label: "dividido" },
          { color: "", label: "· cor mais forte = segmento maior" },
        ]}
      />
      <Table className="segments">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead />
            {sg.cols.values.map((c) => (
              <TableHead key={c.value} className="text-center whitespace-normal">
                {c.label}
              </TableHead>
            ))}
            <TableHead className="text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sg.rows.values.map((r) => (
            <TableRow key={r.value} className="border-0 hover:bg-transparent">
              <TableHead scope="row" className="font-medium whitespace-normal text-foreground">
                {r.label}
              </TableHead>
              {sg.cols.values.map((c) => {
                const cell = sg.cells[`${r.value}|${c.value}`];
                const name = sg.names[`${r.value}|${c.value}`];
                const a = cell?.pct != null ? 0.15 + 0.6 * (cell.pct / max) : 0;
                const tone = sg.tones[`${r.value}|${c.value}`];
                const rgb = tone === "favorable" ? "10, 111, 216" : tone === "unfavorable" ? "217, 45, 58" : "79, 91, 133";
                return (
                  <TableCell
                    key={c.value}
                    className="segcell px-2 py-3 whitespace-normal"
                    style={{ background: `rgba(${rgb}, ${a})`, color: a > 0.5 ? "#fff" : undefined }}
                  >
                    <strong>{cell?.pct != null ? `${Math.round(cell.pct)}%` : cell?.suppressed ? "<30" : "—"}</strong>
                    {name && <span>{name}</span>}
                  </TableCell>
                );
              })}
              <TableCell className="text-right tabular-nums">{pctOf(sg.row_totals[r.value]?.pct)}</TableCell>
            </TableRow>
          ))}
          <TableRow className="hover:bg-transparent">
            <TableHead scope="row" className="font-medium text-foreground">
              Total
            </TableHead>
            {sg.cols.values.map((c) => (
              <TableCell key={c.value} className="text-center tabular-nums">
                {pctOf(sg.col_totals[c.value]?.pct)}
              </TableCell>
            ))}
            <TableCell className="text-right tabular-nums">100%</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </ChartCard>
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
        <ChartCard
          key={rk.key}
          title={rk.text}
          description={`${
            rk.type === "name"
              ? "Resposta espontânea: o entrevistador não lê nomes. Nomes fora da lista entram em “outros nomes”."
              : "Uma escolha por entrevistado."
          } n = ${rk.n}.`}
        >
          {rk.strata.length > 1 && (
            <Legend items={rk.strata.map((st) => ({ color: stratumColor(rk.strata, st), label: st }))} />
          )}
          <div className="ranking">
            {rk.items.map((it) => (
              <RankRow key={it.value} it={it} strata={rk.strata} />
            ))}
          </div>
        </ChartCard>
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
        {it.pct != null ? <strong>{Math.round(it.pct)}%</strong> : <span className="text-muted-foreground">poucas</span>}
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
      <p className="text-sm text-muted-foreground">{empty}</p>
    ) : (
      <ul className="grid gap-1.5">
        {xs.slice(0, 5).map(({ g, d }) => (
          <li key={`${d.key}-${g.group}`} className="grid grid-cols-[10px_1fr_auto] items-baseline gap-2 text-sm">
            <i className="size-2.5 rounded-full" style={{ background: color }} />
            <span>
              <span className="text-muted-foreground">{d.label}:</span> <strong>{g.label}</strong>
            </span>
            <strong className="tabular-nums">{fmt(g.value, mean)}</strong>
          </li>
        ))}
      </ul>
    );
  return (
    <ChartCard
      title={`${ct.indicator.label}: onde a gestão vai melhor e onde vai pior`}
      description={`Comparado com o total (${fmt(ct.total.value, mean)}). Só entram diferenças além da margem de erro.`}
    >
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <h4 className="mb-2 text-sm font-medium text-muted-foreground">Mais favorável à gestão</h4>
          {list(better, FAV, "Nenhum grupo acima do total além da margem.")}
        </div>
        <div>
          <h4 className="mb-2 text-sm font-medium text-muted-foreground">Menos favorável à gestão</h4>
          {list(worse, UNFAV, "Nenhum grupo abaixo do total além da margem.")}
        </div>
      </div>
    </ChartCard>
  );
}
