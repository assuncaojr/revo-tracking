import { useEffect, useState } from "react";
import { api, type CampaignAccess, type Insights, type Me, type Neighborhoods, type Overview } from "../api";
import { DISCLAIMER } from "../format";
import { Highlights } from "./Insights";
import { Balances, fmt, GridChart, Headlines, IndicatorTiles, TrendChart } from "./Overview";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { ChartCard, ErrorState, LoadingState } from "@/components/page";

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

  if (error) return <ErrorState>{error}</ErrorState>;
  if (!data) return <LoadingState />;
  const { me, ov, ins, hoods } = data;
  const main = ov.indicators[0];
  const now = new Date();
  const since = new Date(`${ov.start}T12:00:00`).toLocaleDateString("pt-BR");
  const hoodMeta = hoods.indicators[0];

  return (
    <div className="report">
      <div className="no-print mb-2 flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={onBack}>
          <ArrowLeft />
          Voltar ao painel
        </Button>
        <Button onClick={print}>
          <Printer />
          Imprimir ou salvar em PDF
        </Button>
      </div>
      <p className="no-print text-sm text-muted-foreground">
        Na janela de impressão, escolha “Salvar como PDF” para ter o arquivo. O boletim leva o seu nome e fica
        registrado.
      </p>

      <header className="mt-5 mb-3 grid gap-1">
        <div className="w-fit rounded border-2 border-[var(--unfav)] px-2 py-0.5 text-xs font-extrabold tracking-widest text-[var(--unfav)]">
          USO INTERNO · NÃO DIVULGAR
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Boletim da pesquisa · {campaign.name}</h1>
        <p>
          {period === "7d" ? `Últimos 7 dias (desde ${since})` : `Todo o período (desde ${since})`} · {ov.n} entrevistas
          · resultado bruto, sem ponderação
        </p>
        <p className="text-sm text-muted-foreground">
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
        <ChartCard
          title={`${hoodMeta.label} por bairro (todo o período)`}
          description={`Cidade: ${fmt(hoods.city[hoodMeta.key]?.value, hoodMeta.mean)}. “Como a cidade” quando a diferença cabe na margem de erro.`}
        >
          <Table>
            <TableBody>
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
                    <TableRow key={h.id} className="hover:bg-transparent">
                      <TableCell className="font-medium">{h.name}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {e?.value != null ? fmt(e.value, hoodMeta.mean) : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{reading}</TableCell>
                      <TableCell className="text-right text-muted-foreground tabular-nums">{h.n} entrevistas</TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </ChartCard>
      )}

      <footer className="mt-5 grid gap-1 border-t pt-3 text-sm text-muted-foreground">
        <p>{DISCLAIMER}</p>
        <p>
          Pesquisa interna da campanha, não registrada no TSE: divulgar é proibido. Este documento identifica quem o
          gerou.
        </p>
      </footer>
    </div>
  );
}
