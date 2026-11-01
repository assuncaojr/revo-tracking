import { Card } from "@/components/ui/card";

/** Meta do dia por estrato: barra do que já foi feito hoje e, quando houver, o total acumulado. */
export function StrataProgress({
  strata,
}: {
  strata: { name: string; done: number; target: number | null; total?: number }[];
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-[repeat(auto-fill,minmax(260px,1fr))]">
      {strata.map((s) => {
        const p = s.target ? Math.min(100, (100 * s.done) / s.target) : 0;
        return (
          <Card key={s.name} className="gap-2 px-4 py-4">
            <div className="flex items-baseline justify-between gap-2">
              <strong>{s.name}</strong>
              {s.total != null && <span className="text-sm text-muted-foreground tabular-nums">total {s.total}</span>}
            </div>
            <div className="text-sm">
              Hoje: <strong className="tabular-nums">{s.done}</strong> de {s.target ?? "—"}
            </div>
            <div className="bar mt-0">
              <div style={{ width: `${p}%` }} />
            </div>
          </Card>
        );
      })}
    </div>
  );
}
