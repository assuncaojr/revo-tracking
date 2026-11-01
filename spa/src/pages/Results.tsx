import { useState } from "react";
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
import { Balances, GridChart, Headlines, IndicatorTiles, TrendChart } from "./Overview";
import { Progress } from "./Progress";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Segmented, type Option } from "@/components/controls";
import { EmptyState, ErrorState, LoadingState, Notice, PageHeader, Toolbar } from "@/components/page";

const PERIODS: Option<"7d" | "all">[] = [
  { value: "7d", label: "Últimos 7 dias" },
  { value: "all", label: "Todo o período" },
];

/** Resumo (D28): o que mudou em frases, os balanços, os indicadores e a evolução. Sempre bruto, sem ponderação. */
export function Summary({ campaign }: { campaign: CampaignAccess }) {
  const [period, setPeriod] = useState<"7d" | "all">("7d");
  const [report, setReport] = useState(false);
  const [selected, setSelected] = useState("approval");
  const showMargins = useShowMargins();
  const { data, error, updatedAt } = usePoll<OverviewData>(
    `/api/campaigns/${campaign.id}/results/overview?period=${period}`,
    5 * 60_000,
  );
  if (report) return <Report campaign={campaign} period={period} onBack={() => setReport(false)} />;
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
            {last && `Última entrevista ${last.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} · `}
            {data.today_n} hoje
            {updatedAt && ` · painel atualizado às ${updatedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`}
          </>
        }
      >
        <Button variant="outline" className="bg-card max-sm:w-full" onClick={() => setReport(true)}>
          <FileText />
          Boletim para reunião (PDF)
        </Button>
      </PageHeader>
      <Toolbar>
        <Segmented value={period} onChange={setPeriod} options={PERIODS} size="sm" />
        <span className="text-sm text-muted-foreground">
          {data.n} entrevistas desde {since}
          {period === "7d" && data.previous && ", comparado com a semana anterior"}
        </span>
        <MarginsToggle />
      </Toolbar>
      <Headlines items={data.headlines} title="O que a pesquisa mostra" />
      <Balances balances={data.balances} />
      <IndicatorTiles data={data} selected={ind.key} onSelect={setSelected} />
      <TrendChart ind={ind} events={data.events} />
      <GridChart data={data} />
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

const DETAIL_VIEWS: { id: DetailView; label: string }[] = [
  { id: "insights", label: "Cruzamentos" },
  { id: "questions", label: "Pergunta a pergunta" },
  { id: "progress", label: "Progresso do campo" },
  { id: "method", label: "Como a pesquisa é feita" },
];

/** Detalhes: para quem quer ir além do resumo. */
export function Details({ campaign }: { campaign: CampaignAccess }) {
  const [view, setView] = useState<DetailView>("insights");
  return (
    <>
      <div className="row between wrap page-head">
        <h2>Detalhes</h2>
        <div className="segmented" role="tablist">
          {DETAIL_VIEWS.map((v) => (
            <button key={v.id} className={view === v.id ? "active" : ""} onClick={() => setView(v.id)}>
              {v.label}
            </button>
          ))}
        </div>
      </div>
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
  if (error) return <p className="error">{error}</p>;
  if (!data) return <p>Carregando…</p>;
  return (
    <>
      <div className="row filters">
        <label className="row">
          Indicador
          <select value={indicator} onChange={(e) => setIndicator(e.target.value)}>
            {data.indicators.map((i) => (
              <option key={i.key} value={i.key}>
                {i.label}
              </option>
            ))}
          </select>
        </label>
        <label className="row">
          Período
          <select value={period} onChange={(e) => setPeriod(e.target.value as "7d" | "all")}>
            <option value="all">Todo o período</option>
            <option value="7d">Últimos 7 dias</option>
          </select>
        </label>
        <span className="muted small">{data.n} entrevistas</span>
        <MarginsToggle />
      </div>
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
  if (error) return <p className="error">{error}</p>;
  if (!data) return <p>Carregando…</p>;

  return (
    <>
      <div className="row filters">
        <label className="row">
          Dia
          <input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
          {day && (
            <button className="link" onClick={() => setDay("")}>
              acumulado
            </button>
          )}
        </label>
      </div>
      <p className="notice">
        <strong>Resultado bruto, sem ponderação.</strong> Mostra o que as {data.n} entrevistas completas responderam
        {day ? " neste dia" : " até agora"}; ainda não corrige a amostra pelo perfil do eleitorado nem pelo voto
        passado, então não é previsão de resultado.
        {!campaign.staff && " Grupos com menos de 30 entrevistas ficam ocultos."}
      </p>
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
    <section className="card result">
      <h3>
        <span className="key">{q.key}</span> {q.text}
      </h3>
      {q.total.suppressed ? (
        <p className="muted">Ainda poucas entrevistas ({q.total.n}): resultado oculto até 30.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th />
              <th className="bar-col">Total (n={q.total.n})</th>
              {strata.map(([st, t]) => (
                <th key={st} className="num">
                  {st} (n={t.n})
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {all.map((v) => (
              <tr key={v}>
                <td>{q.labels[v] ?? v}</td>
                <td>
                  <Bar tally={q.total} value={v} />
                </td>
                {strata.map(([st, t]) => (
                  <td key={st} className="num">
                    {t.suppressed ? "—" : `${t.pct?.[v] ?? 0}%`}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function Bar({ tally, value }: { tally: Tally; value: string }) {
  const p = tally.pct?.[value] ?? 0;
  return (
    <div className="hbar">
      <div style={{ width: `${p}%` }} />
      <span>
        {p}% <span className="muted">({tally.counts?.[value] ?? 0})</span>
      </span>
    </div>
  );
}
