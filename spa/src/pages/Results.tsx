import { useState } from "react";
import type { CampaignAccess, Overview as OverviewData, ResultQuestion, Results as ResultsData, Tally } from "../api";
import { usePoll } from "../usePoll";
import { GridChart, IndicatorTiles, StrataChart, TrendChart } from "./Overview";

type View = "overview" | "questions";

/** Resultados: panorama (indicadores, evolução, estratos, áreas) e pergunta a pergunta. Sempre bruto, sem ponderação. */
export function Results({ campaign }: { campaign: CampaignAccess }) {
  const [view, setView] = useState<View>("overview");
  return (
    <>
      <div className="row between">
        <h2>Resultados</h2>
        <div className="segmented" role="tablist">
          <button className={view === "overview" ? "active" : ""} onClick={() => setView("overview")}>
            Panorama
          </button>
          <button className={view === "questions" ? "active" : ""} onClick={() => setView("questions")}>
            Pergunta a pergunta
          </button>
        </div>
      </div>
      {view === "overview" ? <OverviewView campaign={campaign} /> : <Questions campaign={campaign} />}
    </>
  );
}

function OverviewView({ campaign }: { campaign: CampaignAccess }) {
  const [period, setPeriod] = useState<"7d" | "all">("7d");
  const [selected, setSelected] = useState("approval");
  const { data, error } = usePoll<OverviewData>(
    `/api/campaigns/${campaign.id}/results/overview?period=${period}`,
    5 * 60_000,
  );
  if (error) return <p className="error">{error}</p>;
  if (!data) return <p>Carregando…</p>;
  if (data.indicators.length === 0)
    return <p className="muted">Esta campanha ainda não tem indicadores-chave configurados.</p>;
  const ind = data.indicators.find((i) => i.key === selected) ?? data.indicators[0];
  const since = new Date(`${data.start}T12:00:00`).toLocaleDateString("pt-BR");

  return (
    <>
      <div className="row filters">
        <label className="row">
          Período
          <select value={period} onChange={(e) => setPeriod(e.target.value as "7d" | "all")}>
            <option value="7d">Últimos 7 dias</option>
            <option value="all">Todo o período</option>
          </select>
        </label>
        <span className="muted small">
          {data.n} entrevistas completas desde {since}
          {period === "7d" && data.previous && " · comparado com os 7 dias anteriores"}
        </span>
      </div>
      <p className="notice">
        <strong>Resultado bruto, sem ponderação.</strong> Ainda não corrige a amostra pelo perfil do eleitorado nem pelo
        voto passado, então não é previsão de resultado. A margem de erro (95%) vale para uma amostra aleatória e é o
        mínimo de incerteza.
        {data.min_cell != null && ` Grupos com menos de ${data.min_cell} entrevistas ficam ocultos.`}
      </p>
      <IndicatorTiles data={data} selected={ind.key} onSelect={setSelected} />
      <TrendChart ind={ind} />
      <StrataChart data={data} />
      <GridChart data={data} />
    </>
  );
}

/** Resultado bruto (sem ponderação) das perguntas fechadas, total e por estrato. */
function Questions({ campaign }: { campaign: CampaignAccess }) {
  const [day, setDay] = useState("");
  const { data, error } = usePoll<ResultsData>(
    `/api/campaigns/${campaign.id}/results${day ? `?day=${day}` : ""}`,
    5 * 60_000,
  );
  if (error) return <p className="error">{error}</p>;
  if (!data) return <p>Carregando…</p>;

  return (
    <>
      <div className="row filters">
        <label className="row">
          Dia
          <input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
          {day && (
            <button className="link" onClick={() => setDay("")}>
              acumulado
            </button>
          )}
        </label>
      </div>
      <p className="notice">
        <strong>Resultado bruto, sem ponderação.</strong> Mostra o que as {data.n} entrevistas completas responderam
        {day ? " neste dia" : " até agora"}; ainda não corrige a amostra pelo perfil do eleitorado nem pelo voto
        passado, então não é previsão de resultado.
        {!campaign.staff && " Grupos com menos de 30 entrevistas ficam ocultos."}
      </p>
      {data.questions.map((q) => (
        <QuestionResult key={`${q.key}-${q.item ?? ""}`} q={q} />
      ))}
    </>
  );
}

function QuestionResult({ q }: { q: ResultQuestion }) {
  const strata = Object.entries(q.by_stratum);
  // Ordem das opções: a do questionário (labels), sem as que ninguém escolheu
  const values = Object.keys(q.labels).filter(
    (v) => (q.total.counts?.[v] ?? 0) > 0 || strata.some(([, t]) => (t.counts?.[v] ?? 0) > 0),
  );
  const extra = Object.keys(q.total.counts ?? {}).filter((v) => !(v in q.labels)); // ex.: notas 0–10
  const all = [...values, ...extra.sort((a, b) => Number(a) - Number(b))];
  return (
    <section className="card result">
      <h3>
        <span className="key">{q.key}</span> {q.text}
      </h3>
      {q.total.suppressed ? (
        <p className="muted">Ainda poucas entrevistas ({q.total.n}): resultado oculto até 30.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th />
              <th className="bar-col">Total (n={q.total.n})</th>
              {strata.map(([st, t]) => (
                <th key={st} className="num">
                  {st} (n={t.n})
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {all.map((v) => (
              <tr key={v}>
                <td>{q.labels[v] ?? v}</td>
                <td>
                  <Bar tally={q.total} value={v} />
                </td>
                {strata.map(([st, t]) => (
                  <td key={st} className="num">
                    {t.suppressed ? "—" : `${t.pct?.[v] ?? 0}%`}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function Bar({ tally, value }: { tally: Tally; value: string }) {
  const p = tally.pct?.[value] ?? 0;
  return (
    <div className="hbar">
      <div style={{ width: `${p}%` }} />
      <span>
        {p}% <span className="muted">({tally.counts?.[value] ?? 0})</span>
      </span>
    </div>
  );
}
