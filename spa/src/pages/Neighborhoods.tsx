import { useState } from "react";
import type { CampaignAccess, NeighborhoodDetail, Neighborhoods as HoodsData } from "../api";
import { useShowMargins } from "../prefs";
import { usePoll } from "../usePoll";
import { MapView } from "./MapView";
import { Balances, fmt, Headlines, margin } from "./Overview";

const FAV = "var(--fav)";
const UNFAV = "var(--unfav)";
const SAME = "#b9b8b2";

/** Bairros (D28): o político pensa em bairro. Lista comparando com a cidade, ficha de cada um e o mapa. */
export function Neighborhoods({ campaign }: { campaign: CampaignAccess }) {
  const [view, setView] = useState<"list" | "map">("list");
  const [selected, setSelected] = useState<string | null>(null);
  if (selected) return <HoodSheet campaignId={campaign.id} id={selected} onBack={() => setSelected(null)} />;
  return (
    <>
      <div className="row between wrap page-head">
        <h2>Bairros</h2>
        <div className="segmented">
          <button className={view === "list" ? "active" : ""} onClick={() => setView("list")}>
            Lista
          </button>
          <button className={view === "map" ? "active" : ""} onClick={() => setView("map")}>
            Mapa
          </button>
        </div>
      </div>
      {view === "list" ? <HoodList campaignId={campaign.id} onOpen={setSelected} /> : <MapView campaign={campaign} />}
    </>
  );
}

function HoodList({ campaignId, onOpen }: { campaignId: string; onOpen: (id: string) => void }) {
  const [indicator, setIndicator] = useState("approval");
  const { data, error } = usePoll<HoodsData>(`/api/campaigns/${campaignId}/results/neighborhoods?period=all`, 5 * 60_000);
  if (error) return <p className="error">{error}</p>;
  if (!data) return <p>Carregando…</p>;
  const meta = data.indicators.find((i) => i.key === indicator) ?? data.indicators[0];
  if (!meta) return <p className="muted">Esta campanha ainda não tem indicadores configurados.</p>;
  const city = data.city[meta.key];
  const max = meta.mean ? 10 : 100;
  const items = [...data.items].sort(
    (a, b) => (b.indicators[meta.key]?.value ?? -1) - (a.indicators[meta.key]?.value ?? -1),
  );
  return (
    <>
      <div className="row filters wrap">
        <label className="row">
          Ver
          <select value={meta.key} onChange={(e) => setIndicator(e.target.value)}>
            {data.indicators.map((i) => (
              <option key={i.key} value={i.key}>
                {i.label}
              </option>
            ))}
          </select>
        </label>
        <span className="muted small">
          Cidade: <strong>{fmt(city?.value, meta.mean)}</strong> · {data.n} entrevistas, todo o período
        </span>
      </div>
      <p className="muted small">
        Bairro onde a entrevista foi feita. A cor só aparece quando o bairro se diferencia da cidade além da margem de
        erro; cinza é “parecido com a cidade”. Toque num bairro para ver a ficha.
      </p>
      <div className="card hood-list">
        {items.map((h) => {
          const e = h.indicators[meta.key];
          const color = !e?.differs
            ? SAME
            : (e.value! > (city?.value ?? 0)) === meta.favorable
              ? FAV
              : UNFAV;
          return (
            <button key={h.id} className="hood-row" onClick={() => onOpen(h.id)}>
              <span className="hood-name">
                <strong>{h.name}</strong>
                <span className="muted small">
                  {h.stratum ?? "—"} · {h.n} entrevistas
                </span>
              </span>
              <span className="hood-track">
                {e?.value != null && <span className="hood-bar" style={{ width: `${(100 * e.value) / max}%`, background: color }} />}
                {city?.value != null && <span className="hood-city" style={{ left: `${(100 * city.value) / max}%` }} />}
              </span>
              <span className="hood-value">
                {e?.value != null ? (
                  <>
                    <strong>{fmt(e.value, meta.mean)}</strong>
                    <span className="muted small">{verdict(e.differs, e.value, city?.value, meta.favorable)}</span>
                  </>
                ) : (
                  <span className="muted small">poucas entrevistas</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      <p className="muted small">A linha fina em cada barra marca a cidade.</p>
    </>
  );
}

function verdict(differs: boolean, v: number | null | undefined, city: number | null | undefined, favorable: boolean) {
  if (!differs || v == null || city == null) return "como a cidade";
  return (v > city) === favorable ? "mais favorável" : "menos favorável";
}

function HoodSheet({ campaignId, id, onBack }: { campaignId: string; id: string; onBack: () => void }) {
  const { data, error } = usePoll<NeighborhoodDetail>(
    `/api/campaigns/${campaignId}/results/neighborhoods/${id}?period=all`,
    5 * 60_000,
  );
  const showMargins = useShowMargins();
  return (
    <>
      <button className="link back" onClick={onBack}>
        ← todos os bairros
      </button>
      {error && <p className="error">{error}</p>}
      {!data ? (
        <p>Carregando…</p>
      ) : (
        <>
          <div className="page-head">
            <h2>{data.name}</h2>
            <p className="muted small">
              {data.stratum ? `Estrato ${data.stratum} · ` : ""}
              {data.n} entrevistas feitas no bairro, todo o período
            </p>
          </div>
          {data.suppressed ? (
            <p className="notice">
              Ainda poucas entrevistas neste bairro ({data.n} de {data.min_cell} necessárias) para mostrar resultado sem
              risco de engano.
            </p>
          ) : (
            <>
              <Headlines items={data.headlines ?? []} title={`O que se destaca em ${data.name}`} />
              <div className="card">
                <h3>Bairro × cidade</h3>
                <table className="compare">
                  <thead>
                    <tr>
                      <th />
                      <th className="num">{data.name}</th>
                      <th className="num">Cidade</th>
                      <th>Leitura</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.indicators!.map((i) => {
                      const good = i.value.value != null && i.city.value != null && (i.value.value > i.city.value) === i.favorable;
                      return (
                        <tr key={i.key}>
                          <td>{i.label}</td>
                          <td className="num">
                            <strong>{fmt(i.value.value, i.mean)}</strong>
                            {showMargins && <span className="muted small"> {margin(i.value, i.mean)}</span>}
                          </td>
                          <td className="num">{fmt(i.city.value, i.mean)}</td>
                          <td>
                            {i.differs ? (
                              <span className="pill" style={{ background: good ? FAV : UNFAV }}>
                                {good ? "mais favorável à gestão" : "menos favorável à gestão"}
                              </span>
                            ) : (
                              <span className="pill same">como a cidade</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Balances balances={data.balances ?? []} />
              <div className="two-up">
                {data.grid && data.grid.rows.length > 0 && (
                  <div className="card">
                    <h3>Áreas: o que mais piorou e o que mais melhorou</h3>
                    <p className="muted small">{data.grid.text}</p>
                    <AreaList title="Mais críticas" rows={data.grid.rows.slice(0, 3)} which="negative" />
                    <AreaList
                      title="Mais bem avaliadas"
                      rows={[...data.grid.rows].reverse().slice(0, 3).filter((r) => r.balance > -100)}
                      which="positive"
                    />
                  </div>
                )}
                {data.rankings?.map((rk) => (
                  <div key={rk.key} className="card">
                    <h3>{rk.text}</h3>
                    <ol className="top3">
                      {rk.items.map((it) => (
                        <li key={it.value}>
                          <span>{it.label}</span>
                          <strong>{it.pct != null ? `${Math.round(it.pct)}%` : "—"}</strong>
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}

function AreaList({
  title,
  rows,
  which,
}: {
  title: string;
  rows: NonNullable<NeighborhoodDetail["grid"]>["rows"];
  which: "positive" | "negative";
}) {
  return (
    <div className="area-list">
      <h4>{title}</h4>
      {rows.map((r) => (
        <div key={r.value} className="area-row">
          <span>{r.label}</span>
          <span className="area-track">
            <span style={{ width: `${r[which]}%`, background: which === "negative" ? UNFAV : FAV }} />
          </span>
          <span className="small">
            <strong>{Math.round(r[which])}%</strong> {which === "negative" ? "piorou" : "melhorou"}
          </span>
        </div>
      ))}
    </div>
  );
}
