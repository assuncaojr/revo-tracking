import { useState } from "react";
import { api, ApiError, type CampaignAccess, type Condition, type QQuestion, type QuestionnaireDef, type QuestionnaireVersion } from "../api";
import { usePoll } from "../usePoll";
import { CheckCircle2, Upload as UploadIcon } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/controls";
import { confirmDialog } from "@/components/dialogs";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/page";

const TYPE_LABELS: Record<string, string> = {
  single: "Escolha uma",
  multi: "Escolha várias",
  number: "Número",
  scale: "Nota",
  grid: "Grade",
  text: "Aberta",
  name: "Aberta (nome)",
  contact: "Contato",
};

/** Prévia de leitura do questionário (perguntas, condições e fluxo por extenso) e aprovação pelo cliente. */
export function Questionnaire({ campaign }: { campaign: CampaignAccess }) {
  const { data, error, reload } = usePoll<QuestionnaireVersion[]>(`/api/campaigns/${campaign.id}/questionnaires`, 0);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isAdmin = campaign.role === "admin";
  if (error) return <ErrorState>{error}</ErrorState>;
  if (!data) return <LoadingState />;
  if (data.length === 0)
    return (
      <>
        <EmptyState>Nenhum questionário.</EmptyState>
        {isAdmin && <Upload campaignId={campaign.id} onDone={(id) => reload().then(() => setSelected(id))} />}
      </>
    );

  const qv = data.find((v) => v.id === selected) ?? data[0];
  const canApprove = (campaign.role === "client_coord" || isAdmin) && !qv.approved_at;
  const canPublish = isAdmin && !!qv.approved_at && !qv.published_at;

  const publish = async () => {
    const ok = await confirmDialog({
      title: `Publicar a versão ${qv.version}?`,
      description: "Os aparelhos passam a usá-la na próxima vez que abrirem com rede.",
      action: "Publicar",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.post(`/api/campaigns/${campaign.id}/questionnaires/${qv.id}/publish`);
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    const ok = await confirmDialog({
      title: `Aprovar a versão ${qv.version} do questionário?`,
      description: "A aprovação fica registrada com o seu nome.",
      action: "Aprovar",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.post(`/api/campaigns/${campaign.id}/questionnaires/${qv.id}/approve`);
      await reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title={qv.title}>
        {data.length > 1 && (
          <SelectField
            value={qv.id}
            onChange={setSelected}
            options={data.map((v) => ({ value: v.id, label: `Versão ${v.version}` }))}
          />
        )}
      </PageHeader>
      <Card className="mb-4 flex-row flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5">
        <div className="grid gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">Versão {qv.version}</span>
            <Badge variant={qv.published_at ? "default" : "secondary"}>
              {qv.published_at
                ? `em campo desde ${new Date(qv.published_at).toLocaleDateString("pt-BR")}`
                : qv.approved_at
                  ? "aprovada, aguardando publicação"
                  : "aguardando aprovação"}
            </Badge>
          </div>
          {qv.approved_by && (
            <span className="text-sm text-muted-foreground">
              Aprovada por {qv.approved_by} em {new Date(qv.approved_at!).toLocaleDateString("pt-BR")}
            </span>
          )}
        </div>
        {canApprove && (
          <Button disabled={busy} onClick={approve}>
            <CheckCircle2 />
            Aprovar esta versão
          </Button>
        )}
        {canPublish && (
          <Button disabled={busy} onClick={publish}>
            Publicar esta versão
          </Button>
        )}
      </Card>
      {isAdmin && <Upload campaignId={campaign.id} onDone={(id) => reload().then(() => setSelected(id))} />}
      <ol className="grid gap-3">
        {qv.definition.questions.map((q) => (
          <QuestionPreview key={q.key} q={q} def={qv.definition} />
        ))}
      </ol>
    </>
  );
}

/** Nova versão a partir do arquivo JSON (validada no núcleo contra o contrato). Depois: aprovação e publicação. */
function Upload({ campaignId, onDone }: { campaignId: string; onDone: (id: string) => void }) {
  const [msg, setMsg] = useState<{ error: boolean; text: string } | null>(null);
  const send = async (file: File) => {
    setMsg(null);
    let definition: unknown;
    try {
      definition = JSON.parse(await file.text());
    } catch {
      setMsg({ error: true, text: "O arquivo não é um JSON válido." });
      return;
    }
    try {
      const r = await api.post<{ id: string; version: number }>(
        `/api/campaigns/${campaignId}/manage/questionnaires`,
        definition,
      );
      setMsg({ error: false, text: `Versão ${r.version} carregada. Falta a aprovação do cliente e a publicação.` });
      onDone(r.id);
    } catch (e) {
      setMsg({ error: true, text: e instanceof ApiError ? e.message : String(e) });
    }
  };
  return (
    <Accordion type="single" collapsible className="mb-4 rounded-xl border bg-card px-4 shadow-xs sm:px-5">
      <AccordionItem value="upload" className="border-0">
        <AccordionTrigger>
          <span className="flex items-center gap-2">
            <UploadIcon className="size-4 text-muted-foreground" />
            Carregar nova versão (arquivo JSON)
          </span>
        </AccordionTrigger>
        <AccordionContent className="grid gap-3">
          <p className="text-sm text-muted-foreground">
            O arquivo segue o formato de <code>contracts/questionnaire.schema.json</code>. Versões são imutáveis: para
            mudar, aumente o número da versão.
          </p>
          <Input
            type="file"
            accept="application/json,.json"
            className="max-w-md"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) send(f);
              e.target.value = "";
            }}
          />
          {msg && (
            <Alert variant={msg.error ? "destructive" : "default"}>
              <AlertDescription>
                <pre className="font-sans text-sm whitespace-pre-wrap">{msg.text}</pre>
              </AlertDescription>
            </Alert>
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

function QuestionPreview({ q, def }: { q: QQuestion; def: QuestionnaireDef }) {
  const options = q.options ?? (q.options_list ? def.lists?.[q.options_list] : undefined);
  const rows = q.rows_list ? def.lists?.[q.rows_list] : undefined;
  return (
    <li>
      <Card className="gap-2 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
          <strong className="font-medium">
            <span className="key">{q.key}</span> {q.text}
          </strong>
          <Badge variant="outline" className="text-muted-foreground">
            {TYPE_LABELS[q.type] ?? q.type}
          </Badge>
        </div>
        {q.read_aloud && <p className="text-muted-foreground italic">“{q.read_aloud}”</p>}
        {q.show_if && <p className="text-sm text-amber-700">Só aparece se {describe(q.show_if, def)}.</p>}
        {rows && (
          <p className="text-sm">
            Linhas{q.shuffle_rows ? " (ordem sorteada)" : ""}: {rows.map((r) => r.label).join(" · ")}
          </p>
        )}
        {options && (
          <p className="text-sm">
            Opções{q.shuffle ? " (ordem sorteada)" : ""}: {options.map((o) => o.label).join(" · ")}
            {q.allow_other && " · Outro (qual?)"}
          </p>
        )}
        {q.type === "scale" && (
          <p className="text-sm">
            De {q.min} a {q.max}
          </p>
        )}
        {q.terminate_if && (
          <p className="text-sm text-amber-700">
            Encerra a entrevista ({q.terminate_status === "refused" ? "recusa" : "filtro"}) se{" "}
            {describe(q.terminate_if, def)}.
          </p>
        )}
        {q.nonresponse !== false && def.nonresponse?.length ? (
          <p className="text-sm text-muted-foreground">
            Aceita: {def.nonresponse.map((n) => n.label).join(", ")} (não lido ao entrevistado)
          </p>
        ) : null}
      </Card>
    </li>
  );
}

function describe(c: Condition, def: QuestionnaireDef): string {
  if ("all" in c) return c.all.map((x) => describe(x, def)).join(" e ");
  if ("any" in c) return c.any.map((x) => describe(x, def)).join(" ou ");
  const q = def.questions.find((x) => x.key === c.key);
  const opts = q?.options ?? (q?.options_list ? def.lists?.[q.options_list] : []) ?? [];
  const label = (v: unknown) => opts.find((o) => o.value === v)?.label ?? String(v);
  const who = c.key;
  if (Array.isArray(c.in)) return `${who} for ${c.in.map(label).join(" ou ")}`;
  if (Array.isArray(c.not_in)) return `${who} não for ${c.not_in.map(label).join(" nem ")}`;
  if (c.lt !== undefined) return `${who} for menor que ${c.lt}`;
  if (c.lte !== undefined) return `${who} for até ${c.lte}`;
  if (c.gt !== undefined) return `${who} for maior que ${c.gt}`;
  if (c.gte !== undefined) return `${who} for ${c.gte} ou mais`;
  if (c.answered !== undefined) return `${who} ${c.answered ? "tiver" : "não tiver"} resposta`;
  return who;
}
