import type { ReactNode } from "react";
import { AlertCircle, Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Título da tela, com uma linha de contexto (atualização, totais) e ações à direita. */
export function PageHeader({ title, meta, children }: { title: ReactNode; meta?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        {meta && <p className="mt-1 text-sm text-muted-foreground">{meta}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

/** Faixa de filtros e controles logo abaixo do título. */
export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mb-4 flex flex-wrap items-center gap-x-4 gap-y-3", className)}>{children}</div>;
}

/** Card de um bloco de resultado: título, explicação curta, ação opcional e o conteúdo. */
export function ChartCard({
  title,
  description,
  action,
  children,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("chart-card my-4 gap-4 py-5", className)}>
      {(title || description || action) && (
        <CardHeader className="px-5">
          {title && <CardTitle className="text-base">{title}</CardTitle>}
          {description && <CardDescription>{description}</CardDescription>}
          {action && <CardAction>{action}</CardAction>}
        </CardHeader>
      )}
      <CardContent className="px-5">{children}</CardContent>
    </Card>
  );
}

export function LoadingState({ lines = 3 }: { lines?: number }) {
  return (
    <div className="grid gap-3" aria-busy>
      <Skeleton className="h-8 w-48" />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className="h-28 w-full" />
      ))}
    </div>
  );
}

export function ErrorState({ children }: { children: ReactNode }) {
  return (
    <Alert variant="destructive">
      <AlertCircle />
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed bg-card px-6 py-10 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

/** Nota de leitura (resultado bruto, células ocultas…): discreta, mas sempre visível. */
export function Notice({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Alert className={cn("my-4 border-l-4 border-l-muted-foreground/40 bg-secondary/60", className)}>
      <Info />
      <AlertDescription className="text-foreground/80">{children}</AlertDescription>
    </Alert>
  );
}

/** Número em destaque com rótulo (método, campo agora). */
export function Stat({ value, label, className }: { value: ReactNode; label: ReactNode; className?: string }) {
  return (
    <Card className={cn("gap-1 px-4 py-4", className)}>
      <div className="text-2xl font-semibold tabular-nums sm:text-3xl">{value}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </Card>
  );
}
