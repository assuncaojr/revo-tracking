import type { Progress as ProgressData } from "../api";
import { usePoll } from "../usePoll";
import { ErrorState, LoadingState } from "@/components/page";
import { StrataProgress } from "@/components/strata";

/** Progresso do campo para o cliente: só agregado por estrato, sem detalhe de entrevistador (D18). */
export function Progress({ campaignId }: { campaignId: string }) {
  const { data, error } = usePoll<ProgressData>(`/api/campaigns/${campaignId}/field/progress`);
  if (error) return <ErrorState>{error}</ErrorState>;
  if (!data) return <LoadingState />;
  return (
    <>
      <p className="mb-3 text-sm text-muted-foreground">{data.total} entrevistas completas válidas no total.</p>
      <StrataProgress strata={data.strata.map((s) => ({ ...s, done: s.today }))} />
    </>
  );
}
