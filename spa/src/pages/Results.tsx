import { useState } from "react";
import type { CampaignAccess, ResultQuestion, Results as ResultsData, Tally } from "../api";
import { usePoll } from "../usePoll";

/** Resultado bruto (sem ponderação) das perguntas fechadas, total e por estrato. */
export function Results({ campaign }: { campaign: CampaignAccess }) {
  const [day, setDay] = useState("");
  const { data, error } = usePoll<ResultsData>(
    `/api/campaigns/${campaign.id}/results${day ? `?day=${day}` : ""}`,
    5 * 60_000,
  );
  if (error) return <p className="error">{error}</p>;
  if (!data) return <p>Carregando…</p>;

  return (
    <>
      <div className="row between">
        <h2>Resultados</h2>
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
