import type { ReactNode } from "react";
import type { FieldNow as FieldNowData } from "../api";
import { ago, duration, pct, timeOf } from "../format";
import { usePoll } from "../usePoll";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/page";
import { StrataProgress } from "@/components/strata";
import { cn } from "@/lib/utils";

// Célula que pede atenção (taxa de NR alta, aparelho sem contato, bateria baixa, alertas abertos)
const WARN = "bg-warn-soft font-semibold text-warn-ink";

/** Painel de operação da equipe: quem está produzindo, como estão os aparelhos, cotas do dia. */
export function FieldNow({ campaignId }: { campaignId: string }) {
  const { data, error, updatedAt, reload } = usePoll<FieldNowData>(`/api/campaigns/${campaignId}/field/now`);
  if (error) return <ErrorState>{error}</ErrorState>;
  if (!data) return <LoadingState />;

  // Taxa de "não sabe/não respondeu" muito acima da média do dia: o sinal que em 2024 apontava problema de campo
  const rates = data.interviewers.map((i) => i.nonresponse_rate).filter((r): r is number => r != null);
  const avg = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null;

  return (
    <>
      <PageHeader
        title={`Campo agora · ${new Date(data.day + "T12:00").toLocaleDateString("pt-BR")}`}
        meta={`${data.total} entrevistas hoje · atualizado ${updatedAt ? timeOf(updatedAt.toISOString()) : "—"}`}
      >
        <Button variant="outline" size="sm" className="bg-card" onClick={reload}>
          <RefreshCw />
          Atualizar
        </Button>
      </PageHeader>

      <Section title="Cotas do dia por estrato">
        <StrataProgress strata={data.strata.map((s) => ({ ...s, done: s.complete }))} />
      </Section>

      <Section title="Entrevistadores">
        {data.interviewers.length === 0 ? (
          <EmptyState>Nenhuma entrevista hoje.</EmptyState>
        ) : (
          <Card className="py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Entrevistador</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Completas</TableHead>
                  <TableHead className="text-right">Recusas</TableHead>
                  <TableHead className="text-right">Filtradas</TableHead>
                  <TableHead className="text-right">Interrompidas</TableHead>
                  <TableHead className="text-right">Duração mediana</TableHead>
                  <TableHead className="text-right">“Não sabe/NR”</TableHead>
                  <TableHead>Última</TableHead>
                  <TableHead className="pr-4 text-right">Alertas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="tabular-nums">
                {data.interviewers.map((i) => {
                  const high = avg != null && i.nonresponse_rate != null && i.nonresponse_rate > avg + 0.15;
                  return (
                    <TableRow key={i.id}>
                      <TableCell className="pl-4 font-medium">{i.name}</TableCell>
                      <TableCell className="text-right">{i.total}</TableCell>
                      <TableCell className="text-right">{i.complete}</TableCell>
                      <TableCell className="text-right">{i.refused}</TableCell>
                      <TableCell className="text-right">{i.screened_out}</TableCell>
                      <TableCell className="text-right">{i.abandoned}</TableCell>
                      <TableCell className="text-right">{duration(i.median_duration_s)}</TableCell>
                      <TableCell className={cn("text-right", high && WARN)} title={high ? "Muito acima da média do dia" : ""}>
                        {pct(i.nonresponse_rate)}
                      </TableCell>
                      <TableCell>{timeOf(i.last_at)}</TableCell>
                      <TableCell className={cn("pr-4 text-right", i.open_flags > 0 && WARN)}>{i.open_flags}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        )}
      </Section>

      <Section title="Aparelhos">
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Aparelho</TableHead>
                <TableHead>Último contato</TableHead>
                <TableHead className="text-right">Aguardando envio</TableHead>
                <TableHead className="text-right">Bateria</TableHead>
                <TableHead>Versão</TableHead>
                <TableHead className="pr-4 text-right">Hoje</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="tabular-nums">
              {data.devices.map((d) => {
                const stale = !d.last_seen_at || Date.now() - new Date(d.last_seen_at).getTime() > 60 * 60_000;
                return (
                  <TableRow key={d.id} className={cn(d.revoked && "text-muted-foreground")}>
                    <TableCell className="pl-4 font-medium">
                      {d.label}
                      {d.revoked && " (revogado)"}
                    </TableCell>
                    <TableCell className={cn(stale && !d.revoked && WARN)}>{ago(d.last_seen_at)}</TableCell>
                    <TableCell className={cn("text-right", d.pending_count ? WARN : "")}>{d.pending_count ?? "—"}</TableCell>
                    <TableCell className={cn("text-right", d.battery_pct != null && d.battery_pct < 20 && WARN)}>
                      {d.battery_pct != null ? `${d.battery_pct}%` : "—"}
                    </TableCell>
                    <TableCell>{d.app_version ?? "—"}</TableCell>
                    <TableCell className="pr-4 text-right">{d.today}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      </Section>
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="my-6">
      <h3 className="mb-3 text-base font-semibold">{title}</h3>
      {children}
    </section>
  );
}
