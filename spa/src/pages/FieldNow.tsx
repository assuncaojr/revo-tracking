import type { FieldNow as FieldNowData } from "../api";
import { ago, duration, pct, timeOf } from "../format";
import { usePoll } from "../usePoll";

/** Painel de operação da equipe: quem está produzindo, como estão os aparelhos, cotas do dia. */
export function FieldNow({ campaignId }: { campaignId: string }) {
  const { data, error, updatedAt, reload } = usePoll<FieldNowData>(`/api/campaigns/${campaignId}/field/now`);
  if (error) return <p className="error">{error}</p>;
  if (!data) return <p>Carregando…</p>;

  // Taxa de "não sabe/não respondeu" muito acima da média do dia: o sinal que em 2024 apontava problema de campo
  const rates = data.interviewers.map((i) => i.nonresponse_rate).filter((r): r is number => r != null);
  const avg = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null;

  return (
    <>
      <div className="row between">
        <h2>Campo agora · {new Date(data.day + "T12:00").toLocaleDateString("pt-BR")}</h2>
        <span className="muted">
          {data.total} entrevistas hoje · atualizado {updatedAt ? timeOf(updatedAt.toISOString()) : "—"}{" "}
          <button className="link" onClick={reload}>
            atualizar
          </button>
        </span>
      </div>

      <section>
        <h3>Cotas do dia por estrato</h3>
        <div className="strata">
          {data.strata.map((s) => {
            const p = s.target ? Math.min(100, (100 * s.complete) / s.target) : 0;
            return (
              <div key={s.name} className="card">
                <div className="row between">
                  <strong>{s.name}</strong>
                  <span>
                    {s.complete} / {s.target ?? "—"}
                  </span>
                </div>
                <div className="bar">
                  <div style={{ width: `${p}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h3>Entrevistadores</h3>
        {data.interviewers.length === 0 ? (
          <p className="muted">Nenhuma entrevista hoje.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Entrevistador</th>
                <th className="num">Total</th>
                <th className="num">Completas</th>
                <th className="num">Recusas</th>
                <th className="num">Filtradas</th>
                <th className="num">Interrompidas</th>
                <th className="num">Duração mediana</th>
                <th className="num">“Não sabe/NR”</th>
                <th>Última</th>
                <th className="num">Alertas</th>
              </tr>
            </thead>
            <tbody>
              {data.interviewers.map((i) => {
                const high = avg != null && i.nonresponse_rate != null && i.nonresponse_rate > avg + 0.15;
                return (
                  <tr key={i.id}>
                    <td>{i.name}</td>
                    <td className="num">{i.total}</td>
                    <td className="num">{i.complete}</td>
                    <td className="num">{i.refused}</td>
                    <td className="num">{i.screened_out}</td>
                    <td className="num">{i.abandoned}</td>
                    <td className="num">{duration(i.median_duration_s)}</td>
                    <td className={`num ${high ? "warn" : ""}`} title={high ? "Muito acima da média do dia" : ""}>
                      {pct(i.nonresponse_rate)}
                    </td>
                    <td>{timeOf(i.last_at)}</td>
                    <td className={`num ${i.open_flags ? "warn" : ""}`}>{i.open_flags}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h3>Aparelhos</h3>
        <table>
          <thead>
            <tr>
              <th>Aparelho</th>
              <th>Último contato</th>
              <th className="num">Aguardando envio</th>
              <th className="num">Bateria</th>
              <th>Versão</th>
              <th className="num">Hoje</th>
            </tr>
          </thead>
          <tbody>
            {data.devices.map((d) => {
              const stale = !d.last_seen_at || Date.now() - new Date(d.last_seen_at).getTime() > 60 * 60_000;
              return (
                <tr key={d.id} className={d.revoked ? "muted" : ""}>
                  <td>
                    {d.label}
                    {d.revoked && " (revogado)"}
                  </td>
                  <td className={stale && !d.revoked ? "warn" : ""}>{ago(d.last_seen_at)}</td>
                  <td className={`num ${d.pending_count ? "warn" : ""}`}>{d.pending_count ?? "—"}</td>
                  <td className={`num ${d.battery_pct != null && d.battery_pct < 20 ? "warn" : ""}`}>
                    {d.battery_pct != null ? `${d.battery_pct}%` : "—"}
                  </td>
                  <td>{d.app_version ?? "—"}</td>
                  <td className="num">{d.today}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </>
  );
}
