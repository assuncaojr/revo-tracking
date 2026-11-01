import { useState } from "react";
import { api, type CampaignAccess, type Flag } from "../api";
import { duration, FLAG_LABELS, STATUS_LABELS, timeOf } from "../format";
import { usePoll } from "../usePoll";

/** Revisão dos alertas: aceitar (a entrevista fica) ou excluir (sai dos resultados; o dado bruto continua guardado). */
export function Flags({ campaign }: { campaign: CampaignAccess }) {
  const { data, error, reload } = usePoll<Flag[]>(`/api/campaigns/${campaign.id}/flags`);
  const [busy, setBusy] = useState<number | null>(null);
  const canResolve = campaign.role === "admin" || campaign.role === "supervisor";

  const resolve = async (f: Flag, resolution: "accepted" | "excluded") => {
    const note = resolution === "excluded" ? window.prompt("Motivo da exclusão (opcional):") ?? undefined : undefined;
    setBusy(f.id);
    try {
      await api.post(`/api/flags/${f.id}/resolve`, { resolution, note });
      await reload();
    } finally {
      setBusy(null);
    }
  };

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p>Carregando…</p>;

  return (
    <>
      <h2>Alertas para revisar ({data.length})</h2>
      <p className="muted">
        Alerta não descarta entrevista. Aceite quando estiver tudo certo; exclua quando a entrevista não deve contar
        nos resultados.
      </p>
      {data.length === 0 ? (
        <p>Nenhum alerta aberto.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Alerta</th>
              <th>Detalhe</th>
              <th>Entrevistador</th>
              <th>Ponto</th>
              <th>Início</th>
              <th>Duração</th>
              <th>Situação</th>
              {canResolve && <th />}
            </tr>
          </thead>
          <tbody>
            {data.map((f) => (
              <tr key={f.id}>
                <td>
                  <strong>{FLAG_LABELS[f.code] ?? f.code}</strong>
                </td>
                <td className="muted small">{detail(f)}</td>
                <td>{f.interviewer}</td>
                <td>{f.point}</td>
                <td>
                  {new Date(f.started_at).toLocaleDateString("pt-BR")} {timeOf(f.started_at)}
                </td>
                <td>{duration(f.duration_s)}</td>
                <td>{STATUS_LABELS[f.status] ?? f.status}</td>
                {canResolve && (
                  <td className="row">
                    <button disabled={busy === f.id} onClick={() => resolve(f, "accepted")}>
                      Aceitar
                    </button>
                    <button className="danger" disabled={busy === f.id} onClick={() => resolve(f, "excluded")}>
                      Excluir
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function detail(f: Flag): string {
  const d = f.details as Record<string, number | string>;
  switch (f.code) {
    case "too_fast":
      return `${d.duration_s}s para ${d.answers} respostas (mínimo ${d.min_s}s)`;
    case "too_long":
      return `${Math.round(Number(d.duration_s) / 60)} min`;
    case "far_from_point":
      return `${d.distance_m} m do ponto`;
    case "burst":
      return `começou menos de ${d.window_s}s depois da anterior`;
    case "inconsistent":
      return String(d.rule).replaceAll("_", " ");
    default:
      return "";
  }
}
