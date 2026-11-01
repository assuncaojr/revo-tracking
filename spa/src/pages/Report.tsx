import { useEffect, useState } from "react";
import { api, type CampaignAccess, type Insights, type Me, type Neighborhoods, type Overview } from "../api";
import { DISCLAIMER } from "../format";
import { Highlights } from "./Insights";
import { Balances, fmt, GridChart, Headlines, IndicatorTiles, TrendChart } from "./Overview";

/** Boletim para a reunião (D29): uma página pensada para imprimir ou salvar em PDF pelo navegador.
 *  Leva o nome de quem gerou, a data, "uso interno" e a marca d'água; cada geração vai para a auditoria. */
export function Report({ campaign, period, onBack }: { campaign: CampaignAccess; period: "7d" | "all"; onBack: () => void }) {
  const [data, setData] = useState<{ me: Me; ov: Overview; ins: Insights; hoods: Neighborhoods } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const base = `/api/campaigns/${campaign.id}/results`;

  useEffect(() => {
    Promise.all([
      api.get<Me>("/api/auth/me"),
      api.get<Overview>(`${base}/overview?period=${period}`),
      api.get<Insights>(`${base}/insights?period=${period}&indicator=approval`),
      api.get<Neighborhoods>(`${base}/neighborhoods?period=all`),
    ])
      .then(([me, ov, ins, hoods]) => setData({ me, ov, ins, hoods }))
      .catch((e) => setError(String(e.message ?? e)));
  }, [base, period]);

  const print = async () => {
    await api.post(`${base}/report?period=${period}`);
    window.print();
  };

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p>Montando o boletim…</p>;
  const { me, ov, ins, hoods } = data;
  const main = ov.indicators[0];
  const now = new Date();
  const since = new Date(`${ov.start}T12:00:00`).toLocaleDateString("pt-BR");
  const hoodMeta = hoods.indicators[0];

  return (
    <div className="report">
      <div className="toolbar no-print">
        <button className="link" onClick={onBack}>
          ← voltar ao painel
        </button>
        <button className="primary" onClick={print}>
          Imprimir ou salvar em PDF
        </button>
      </div>
      <p className="muted small no-print">
        Na janela de impressão, escolha “Salvar como PDF” para ter o arquivo. O boletim leva o seu nome e fica
        registrado.
      </p>

      <header className="report-head">
        <div className="report-stamp">USO INTERNO · NÃO DIVULGAR</div>
        <h1>Boletim da pesquisa · {campaign.name}</h1>
        <p>
          {period === "7d" ? `Últimos 7 dias (desde ${since})` : `Todo o período (desde ${since})`} · {ov.n} entrevistas
          · resultado bruto, sem ponderação
        </p>
        <p className="muted small">
          Gerado por {me.name} ({me.email}) em {now.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
        </p>
      </header>

      <Headlines items={ov.headlines} title="O que a pesquisa mostra" />
      <Balances balances={ov.balances} />
      <IndicatorTiles data={ov} selected={main?.key ?? ""} onSelect={() => undefined} />
      {main && <TrendChart ind={main} events={ov.events} />}
      <Highlights data={ins} />
      <GridChart data={ov} />

      {hoodMeta && (
        <div className="card chart-card report-hoods">
          <h3>{hoodMeta.label} por bairro (todo o período)</h3>
          <p className="muted small">
            Cidade: {fmt(hoods.city[hoodMeta.key]?.value, hoodMeta.mean)}. “Como a cidade” quando a diferença cabe na
            margem de erro.
          </p>
          <table className="compact">
            <tbody>
              {[...hoods.items]
                .sort((a, b) => (b.indicators[hoodMeta.key]?.value ?? -1) - (a.indicators[hoodMeta.key]?.value ?? -1))
                .map((h) => {
                  const e = h.indicators[hoodMeta.key];
                  const city = hoods.city[hoodMeta.key]?.value;
                  const reading =
                    e?.value == null
                      ? "poucas entrevistas"
                      : !e.differs || city == null
                        ? "como a cidade"
                        : (e.value > city) === hoodMeta.favorable
                          ? "mais favorável à gestão"
                          : "menos favorável à gestão";
                  return (
                    <tr key={h.id}>
                      <td>{h.name}</td>
                      <td className="num">{e?.value != null ? fmt(e.value, hoodMeta.mean) : "—"}</td>
                      <td className="muted">{reading}</td>
                      <td className="num muted">{h.n} entrevistas</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}

      <footer className="report-foot small">
        <p>{DISCLAIMER}</p>
        <p>
          Pesquisa interna da campanha, não registrada no TSE: divulgar é proibido. Este documento identifica quem o
          gerou.
        </p>
      </footer>
    </div>
  );
}
