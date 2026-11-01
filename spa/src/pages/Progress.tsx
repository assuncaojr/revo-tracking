import type { Progress as ProgressData } from "../api";
import { usePoll } from "../usePoll";

/** Progresso do campo para o cliente: só agregado por estrato, sem detalhe de entrevistador (D18). */
export function Progress({ campaignId }: { campaignId: string }) {
  const { data, error } = usePoll<ProgressData>(`/api/campaigns/${campaignId}/field/progress`);
  if (error) return <p className="error">{error}</p>;
  if (!data) return <p>Carregando…</p>;
  return (
    <>
      <h2>Progresso do campo</h2>
      <p className="muted">{data.total} entrevistas completas válidas no total.</p>
      <div className="strata">
        {data.strata.map((s) => {
          const p = s.target ? Math.min(100, (100 * s.today) / s.target) : 0;
          return (
            <div key={s.name} className="card">
              <strong>{s.name}</strong>
              <p>
                Hoje: {s.today} de {s.target ?? "—"} · Total: {s.total}
              </p>
              <div className="bar">
                <div style={{ width: `${p}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
