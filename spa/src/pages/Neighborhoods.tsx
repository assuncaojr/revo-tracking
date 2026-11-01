import { useState } from "react";
import type { CampaignAccess, NeighborhoodDetail, Neighborhoods as HoodsData } from "../api";
import { useShowMargins } from "../prefs";
import { usePoll } from "../usePoll";
import { MapView } from "./MapView";
import { Balances, fmt, Headlines, margin } from "./Overview";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Segmented, SelectField } from "@/components/controls";
import { ChartCard, EmptyState, ErrorState, LoadingState, Notice, PageHeader, Toolbar } from "@/components/page";

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
      <PageHeader title="Bairros">
        <Segmented
          value={view}
          onChange={setView}
          size="sm"
          options={[
            { value: "list", label: "Lista" },
            { value: "map", label: "Mapa" },
          ]}
        />
      </PageHeader>
      {view === "list" ? <HoodList campaignId={campaign.id} onOpen={setSelected} /> : <MapView campaign={campaign} />}
    </>
  );
}

function HoodList({ campaignId, onOpen }: { campaignId: string; onOpen: (id: string) => void }) {
  const [indicator, setIndicator] = useState("approval");
  const { data, error } = usePoll<HoodsData>(`/api/campaigns/${campaignId}/results/neighborhoods?period=all`, 5 * 60_000);
  if (error) return <ErrorState>{error}</ErrorState>;
  if (!data) return <LoadingState />;
  const meta = data.indicators.find((i) => i.key === indicator) ?? data.indicators[0];
  if (!meta) return <EmptyState>Esta campanha ainda não tem indicadores configurados.</EmptyState>;
  const city = data.city[meta.key];
  const max = meta.mean ? 10 : 100;
  const items = [...data.items].sort(
    (a, b) => (b.indicators[meta.key]?.value ?? -1) - (a.indicators[meta.key]?.value ?? -1),
  );
  return (
    <>
      <Toolbar className="mb-2">
        <SelectField
          label="Ver"
          value={meta.key}
          onChange={setIndicator}
          options={data.indicators.map((i) => ({ value: i.key, label: i.label }))}
        />
        <span className="text-sm text-muted-foreground">
          Cidade: <strong className="text-foreground">{fmt(city?.value, meta.mean)}</strong> · {data.n} entrevistas,
          todo o período
        </span>
      </Toolbar>
      <p className="mb-3 text-sm text-muted-foreground">
        Bairro onde a entrevista foi feita. A cor só aparece quando o bairro se diferencia da cidade além da margem de
        erro; cinza é “parecido com a cidade”. Toque num bairro para ver a ficha.
      </p>
      <Card className="hood-list gap-0 overflow-hidden py-0">
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
                <span className="text-sm text-muted-foreground">
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
                    <span className="text-sm text-muted-foreground">
                      {verdict(e.differs, e.value, city?.value, meta.favorable)}
                    </span>
                  </>
                ) : (
                  <span className="text-sm text-muted-foreground">poucas entrevistas</span>
                )}
              </span>
            </button>
          );
        })}
      </Card>
      <p className="mt-3 text-sm text-muted-foreground">A linha fina em cada barra marca a cidade.</p>
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
      <Button variant="ghost" size="sm" className="-ml-2 mb-2" onClick={onBack}>
        <ArrowLeft />
        Todos os bairros
      </Button>
      {error && <ErrorState>{error}</ErrorState>}
      {!data ? (
        <LoadingState />
      ) : (
        <>
          <PageHeader
            title={data.name}
            meta={
              <>
                {data.stratum ? `Estrato ${data.stratum} · ` : ""}
                {data.n} entrevistas feitas no bairro, todo o período
              </>
            }
          />
          {data.suppressed ? (
            <Notice>
              Ainda poucas entrevistas neste bairro ({data.n} de {data.min_cell} necessárias) para mostrar resultado sem
              risco de engano.
            </Notice>
          ) : (
            <>
              <Headlines items={data.headlines ?? []} title={`O que se destaca em ${data.name}`} />
              <ChartCard title="Bairro × cidade">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead />
                      <TableHead className="text-right">{data.name}</TableHead>
                      <TableHead className="text-right">Cidade</TableHead>
                      <TableHead>Leitura</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.indicators!.map((i) => {
                      const good = i.value.value != null && i.city.value != null && (i.value.value > i.city.value) === i.favorable;
                      return (
                        <TableRow key={i.key} className="hover:bg-transparent">
                          <TableCell className="whitespace-normal">{i.label}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            <strong>{fmt(i.value.value, i.mean)}</strong>
                            {showMargins && <span className="text-xs text-muted-foreground"> {margin(i.value, i.mean)}</span>}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(i.city.value, i.mean)}</TableCell>
                          <TableCell className="whitespace-normal">
                            {i.differs ? (
                              <Badge className="whitespace-normal text-white" style={{ background: good ? FAV : UNFAV }}>
                                {good ? "mais favorável à gestão" : "menos favorável à gestão"}
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-muted-foreground">
                                como a cidade
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </ChartCard>
              <Balances balances={data.balances ?? []} />
              <div className="my-4 grid gap-4 md:grid-cols-2">
                {data.grid && data.grid.rows.length > 0 && (
                  <ChartCard className="my-0" title="Áreas: o que mais piorou e o que mais melhorou" description={data.grid.text}>
                    <AreaList title="Mais críticas" rows={data.grid.rows.slice(0, 3)} which="negative" />
                    <AreaList
                      title="Mais bem avaliadas"
                      rows={[...data.grid.rows].reverse().slice(0, 3).filter((r) => r.balance > -100)}
                      which="positive"
                    />
                  </ChartCard>
                )}
                {data.rankings?.map((rk) => (
                  <ChartCard key={rk.key} className="my-0" title={rk.text}>
                    <ol className="grid list-decimal gap-2 pl-5 text-[15px]">
                      {rk.items.map((it) => (
                        <li key={it.value}>
                          <span className="flex justify-between gap-3">
                            <span>{it.label}</span>
                            <strong className="tabular-nums">{it.pct != null ? `${Math.round(it.pct)}%` : "—"}</strong>
                          </span>
                        </li>
                      ))}
                    </ol>
                  </ChartCard>
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
    <div className="mt-3 first:mt-0">
      <h4 className="mb-1.5 text-sm font-medium text-muted-foreground">{title}</h4>
      {rows.map((r) => (
        <div key={r.value} className="area-row">
          <span>{r.label}</span>
          <span className="area-track">
            <span style={{ width: `${r[which]}%`, background: which === "negative" ? UNFAV : FAV }} />
          </span>
          <span className="text-sm">
            <strong>{Math.round(r[which])}%</strong> {which === "negative" ? "piorou" : "melhorou"}
          </span>
        </div>
      ))}
    </div>
  );
}
