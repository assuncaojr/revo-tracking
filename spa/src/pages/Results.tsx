import { useState } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router";
import type {
  CampaignAccess,
  Insights as InsightsData,
  Overview as OverviewData,
  ResultQuestion,
  Results as ResultsData,
  Tally,
} from "../api";
import { MarginsToggle, useShowMargins } from "../prefs";
import { usePoll } from "../usePoll";
import { Crosstab, Highlights, Rankings, Segments } from "./Insights";
import { Method } from "./Method";
import { Report } from "./Report";
import { Balances, GridChart, Headlines, IndicatorTiles, StrataTable, TrendChart } from "./Overview";
import { Progress } from "./Progress";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Segmented, SelectField, type Option } from "@/components/controls";
import { ChartCard, EmptyState, ErrorState, LoadingState, Notice, PageHeader, Toolbar } from "@/components/page";

const PERIODS: Option<"7d" | "all">[] = [
  { value: "7d", label: "Últimos 7 dias" },
  { value: "all", label: "Todo o período" },
];

/** Período lido da URL (`?periodo=tudo`), para o link e o voltar do boletim manterem a escolha. */
function usePeriod(): ["7d" | "all", (p: "7d" | "all") => void] {
  const [params, setParams] = useSearchParams();
  const period = params.get("periodo") === "tudo" ? "all" : "7d";
  return [period, (p) => setParams(p === "all" ? { periodo: "tudo" } : {}, { replace: true })];
}

/** Boletim como rota própria (/resumo/boletim): dá para recarregar, voltar e mandar o link. */
export function SummaryReport({ campaign }: { campaign: CampaignAccess }) {
  const [period] = usePeriod();
  const navigate = useNavigate();
  return (
    <Report
      campaign={campaign}
      period={period}
      onBack={() => navigate(period === "all" ? "/resumo?periodo=tudo" : "/resumo")}
    />
  );
}

/** Resumo (D28): o que mudou em frases, os balanços, os indicadores e a evolução. Sempre bruto, sem ponderação. */
export function Summary({ campaign }: { campaign: CampaignAccess }) {
  const [period, setPeriod] = usePeriod();
  const navigate = useNavigate();
  const [selected, setSelected] = useState("approval");
  const showMargins = useShowMargins();
  const { data, error, updatedAt } = usePoll<OverviewData>(
    `/api/campaigns/${campaign.id}/results/overview?period=${period}`,
    5 * 60_000,
  );
  if (error) return <ErrorState>{error}</ErrorState>;
  if (!data) return <LoadingState />;
  if (data.indicators.length === 0)
    return <EmptyState>Esta campanha ainda não tem indicadores-chave configurados.</EmptyState>;
  const ind = data.indicators.find((i) => i.key === selected) ?? data.indicators[0];
  const since = new Date(`${data.start}T12:00:00`).toLocaleDateString("pt-BR");
  const last = data.last_at ? new Date(data.last_at) : null;

  return (
    <>
      <PageHeader
        title="Resumo"
        meta={
          <>
            {data.n} entrevistas desde {since}
            {period === "7d" && data.previous && ", comparado com a semana anterior"}
            {last && ` · última ${last.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`}
            {` · ${data.today_n} hoje`}
            {updatedAt && ` · atualizado às ${updatedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`}
          </>
        }
      >
        <Segmented value={period} onChange={setPeriod} options={PERIODS} size="sm" />
        <MarginsToggle />
        <Button
          className="max-sm:w-full"
          onClick={() => navigate(period === "all" ? "/resumo/boletim?periodo=tudo" : "/resumo/boletim")}
        >
          <Printer />
          Boletim para reunião
        </Button>
      </PageHeader>
      <Headlines items={data.headlines} title="O que a pesquisa mostra" />
      <IndicatorTiles data={data} selected={ind.key} onSelect={setSelected} />
      <div className="my-4 grid items-start gap-4 xl:grid-cols-2">
        <TrendChart className="my-0 min-w-0" ind={ind} events={data.events} />
        <GridChart className="my-0 min-w-0" data={data} />
      </div>
      <Balances balances={data.balances} />
      <StrataTable data={data} />
      <Notice>
        <strong>Resultado bruto da pesquisa</strong>, ainda sem ajuste pelo perfil do eleitorado: mostra o que os
        entrevistados responderam e não é previsão de resultado.{" "}
        {showMargins
          ? "A margem de erro (95%) vale para uma amostra aleatória e é o mínimo de incerteza."
          : "“Empate técnico” e “estável” querem dizer que a diferença é pequena demais para afirmar com segurança."}
        {data.min_cell != null && ` Grupos com menos de ${data.min_cell} entrevistas ficam ocultos.`}
      </Notice>
    </>
  );
}

type DetailView = "insights" | "questions" | "progress" | "method";

// `path` é o trecho da URL depois de /detalhes
const DETAIL_VIEWS: { id: DetailView; path: string; label: string }[] = [
  { id: "insights", path: "cruzamentos", label: "Cruzamentos" },
  { id: "questions", path: "perguntas", label: "Pergunta a pergunta" },
  { id: "progress", path: "progresso", label: "Progresso do campo" },
  { id: "method", path: "metodo", label: "Como a pesquisa é feita" },
];

/** Detalhes: para quem quer ir além do resumo. */
export function Details({ campaign }: { campaign: CampaignAccess }) {
  const navigate = useNavigate();
  const current = DETAIL_VIEWS.find((v) => v.path === useParams().view);
  if (!current) return <Navigate to={`/detalhes/${DETAIL_VIEWS[0].path}`} replace />;
  const view = current.id;
  return (
    <>
      <PageHeader title="Detalhes" />
      <Segmented
        className="mb-4"
        value={current.path}
        onChange={(path) => navigate(`/detalhes/${path}`)}
        size="sm"
        options={DETAIL_VIEWS.map((v) => ({ value: v.path, label: v.label }))}
      />
      {view === "insights" && <InsightsView campaign={campaign} />}
      {view === "questions" && <Questions campaign={campaign} />}
      {view === "progress" && <Progress campaignId={campaign.id} />}
      {view === "method" && <Method campaign={campaign} />}
    </>
  );
}

function InsightsView({ campaign }: { campaign: CampaignAccess }) {
  const [period, setPeriod] = useState<"7d" | "all">("all");
  const [indicator, setIndicator] = useState("approval");
  const { data, error } = usePoll<InsightsData>(
    `/api/campaigns/${campaign.id}/results/insights?period=${period}&indicator=${indicator}`,
    5 * 60_000,
  );
  if (error) return <ErrorState>{error}</ErrorState>;
  if (!data) return <LoadingState />;
  return (
    <>
      <Toolbar>
        <SelectField
          label="Indicador"
          value={indicator}
          onChange={setIndicator}
          options={data.indicators.map((i) => ({ value: i.key, label: i.label }))}
        />
        <SelectField label="Período" value={period} onChange={setPeriod} options={[...PERIODS].reverse()} />
        <span className="text-sm text-muted-foreground">{data.n} entrevistas</span>
        <MarginsToggle />
      </Toolbar>
      <Highlights data={data} />
      <Crosstab data={data} />
      <Segments data={data} />
      <Rankings data={data} />
    </>
  );
}

/** Resultado bruto (sem ponderação) das perguntas fechadas, total e por estrato. */
function Questions({ campaign }: { campaign: CampaignAccess }) {
  const [day, setDay] = useState("");
  const { data, error } = usePoll<ResultsData>(
    `/api/campaigns/${campaign.id}/results${day ? `?day=${day}` : ""}`,
    5 * 60_000,
  );
  if (error) return <ErrorState>{error}</ErrorState>;
  if (!data) return <LoadingState />;

  return (
    <>
      <Toolbar>
        <div className="flex items-center gap-2">
          <Label htmlFor="questions-day" className="text-muted-foreground">
            Dia
          </Label>
          <Input id="questions-day" type="date" className="w-auto bg-card" value={day} onChange={(e) => setDay(e.target.value)} />
          {day && (
            <Button variant="link" size="sm" onClick={() => setDay("")}>
              ver acumulado
            </Button>
          )}
        </div>
      </Toolbar>
      <Notice>
        <strong>Resultado bruto, sem ponderação.</strong> Mostra o que as {data.n} entrevistas completas responderam
        {day ? " neste dia" : " até agora"}; ainda não corrige a amostra pelo perfil do eleitorado nem pelo voto
        passado, então não é previsão de resultado.
        {!campaign.staff && " Grupos com menos de 30 entrevistas ficam ocultos."}
      </Notice>
      {data.questions.map((q) => (
        <QuestionResult key={`${q.key}-${q.item ?? ""}`} q={q} />
      ))}
    </>
  );
}

function QuestionResult({ q }: { q: ResultQuestion }) {
  const strata = Object.entries(q.by_stratum);
  // Ordem das opções: a do questionário (labels), sem as que ninguém escolheu
  const values = Object.keys(q.labels).filter(
    (v) => (q.total.counts?.[v] ?? 0) > 0 || strata.some(([, t]) => (t.counts?.[v] ?? 0) > 0),
  );
  const extra = Object.keys(q.total.counts ?? {}).filter((v) => !(v in q.labels)); // ex.: notas 0–10
  const all = [...values, ...extra.sort((a, b) => Number(a) - Number(b))];
  return (
    <ChartCard
      title={
        <>
          <span className="key">{q.key}</span> {q.text}
        </>
      }
    >
      {q.total.suppressed ? (
        <p className="text-sm text-muted-foreground">Ainda poucas entrevistas ({q.total.n}): resultado oculto até 30.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead />
              <TableHead className="bar-col">Total (n={q.total.n})</TableHead>
              {strata.map(([st, t]) => (
                <TableHead key={st} className="text-right">
                  {st} (n={t.n})
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {all.map((v) => (
              <TableRow key={v} className="hover:bg-transparent">
                <TableCell className="whitespace-normal">{q.labels[v] ?? v}</TableCell>
                <TableCell className="min-w-40">
                  <Bar tally={q.total} value={v} />
                </TableCell>
                {strata.map(([st, t]) => (
                  <TableCell key={st} className="text-right tabular-nums">
                    {t.suppressed ? "—" : `${t.pct?.[v] ?? 0}%`}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </ChartCard>
  );
}

function Bar({ tally, value }: { tally: Tally; value: string }) {
  const p = tally.pct?.[value] ?? 0;
  return (
    <div className="hbar">
      <div style={{ width: `${p}%` }} />
      <span>
        {p}% <span className="text-muted-foreground">({tally.counts?.[value] ?? 0})</span>
      </span>
    </div>
  );
}
