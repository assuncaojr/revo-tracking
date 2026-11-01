import { useState } from "react";
import { api, type CampaignAccess, type Flag } from "../api";
import { duration, FLAG_LABELS, STATUS_LABELS, timeOf } from "../format";
import { usePoll } from "../usePoll";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { promptDialog } from "@/components/dialogs";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/page";

/** Revisão dos alertas: aceitar (a entrevista fica) ou excluir (sai dos resultados; o dado bruto continua guardado). */
export function Flags({ campaign }: { campaign: CampaignAccess }) {
  const { data, error, reload } = usePoll<Flag[]>(`/api/campaigns/${campaign.id}/flags`);
  const [busy, setBusy] = useState<number | null>(null);
  const canResolve = campaign.role === "admin" || campaign.role === "supervisor";

  const resolve = async (f: Flag, resolution: "accepted" | "excluded") => {
    let note: string | undefined;
    if (resolution === "excluded") {
      const r = await promptDialog({
        title: "Excluir a entrevista dos resultados?",
        description: "O dado bruto continua guardado; a entrevista só deixa de contar nos resultados.",
        label: "Motivo da exclusão (opcional)",
        action: "Excluir",
        optional: true,
        destructive: true,
      });
      if (r === null) return;
      note = r || undefined;
    }
    setBusy(f.id);
    try {
      await api.post(`/api/flags/${f.id}/resolve`, { resolution, note });
      toast.success(resolution === "excluded" ? "Entrevista excluída dos resultados" : "Alerta aceito");
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  if (error) return <ErrorState>{error}</ErrorState>;
  if (!data) return <LoadingState />;

  return (
    <>
      <PageHeader
        title={`Alertas para revisar (${data.length})`}
        meta="Alerta não descarta entrevista. Aceite quando estiver tudo certo; exclua quando a entrevista não deve contar nos resultados."
      />
      {data.length === 0 ? (
        <EmptyState>Nenhum alerta aberto.</EmptyState>
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Alerta</TableHead>
                <TableHead>Detalhe</TableHead>
                <TableHead>Entrevistador</TableHead>
                <TableHead>Ponto</TableHead>
                <TableHead>Início</TableHead>
                <TableHead>Duração</TableHead>
                <TableHead>Situação</TableHead>
                {canResolve && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="pl-4 font-medium">{FLAG_LABELS[f.code] ?? f.code}</TableCell>
                  <TableCell className="text-sm whitespace-normal text-muted-foreground">{detail(f)}</TableCell>
                  <TableCell>{f.interviewer}</TableCell>
                  <TableCell>{f.point}</TableCell>
                  <TableCell className="tabular-nums">
                    {new Date(f.started_at).toLocaleDateString("pt-BR")} {timeOf(f.started_at)}
                  </TableCell>
                  <TableCell className="tabular-nums">{duration(f.duration_s)}</TableCell>
                  <TableCell>{STATUS_LABELS[f.status] ?? f.status}</TableCell>
                  {canResolve && (
                    <TableCell className="pr-4">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" disabled={busy === f.id} onClick={() => resolve(f, "accepted")}>
                          Aceitar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          disabled={busy === f.id}
                          onClick={() => resolve(f, "excluded")}
                        >
                          Excluir
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
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
