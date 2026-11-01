import { useState } from "react";
import { api, ApiError, type CampaignAccess, type Condition, type QQuestion, type QuestionnaireDef, type QuestionnaireVersion } from "../api";
import { usePoll } from "../usePoll";

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
  if (error) return <p className="error">{error}</p>;
  if (!data) return <p>Carregando…</p>;
  if (data.length === 0)
    return (
      <>
        <p>Nenhum questionário.</p>
        {isAdmin && <Upload campaignId={campaign.id} onDone={(id) => reload().then(() => setSelected(id))} />}
      </>
    );

  const qv = data.find((v) => v.id === selected) ?? data[0];
  const canApprove = (campaign.role === "client_coord" || isAdmin) && !qv.approved_at;
  const canPublish = isAdmin && !!qv.approved_at && !qv.published_at;

  const publish = async () => {
    if (!window.confirm(`Publicar a versão ${qv.version}? Os aparelhos passam a usá-la na próxima vez que abrirem com rede.`))
      return;
    setBusy(true);
    try {
      await api.post(`/api/campaigns/${campaign.id}/questionnaires/${qv.id}/publish`);
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    if (!window.confirm(`Aprovar a versão ${qv.version} do questionário? A aprovação fica registrada com o seu nome.`)) return;
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
      <div className="row between">
        <h2>{qv.title}</h2>
        {data.length > 1 && (
          <select value={qv.id} onChange={(e) => setSelected(e.target.value)}>
            {data.map((v) => (
              <option key={v.id} value={v.id}>
                Versão {v.version}
              </option>
            ))}
          </select>
        )}
      </div>
      <p className="notice">
        Versão {qv.version} ·{" "}
        {qv.published_at
          ? `em campo desde ${new Date(qv.published_at).toLocaleDateString("pt-BR")}`
          : qv.approved_at
            ? "aprovada, aguardando publicação"
            : "aguardando aprovação"}
        {qv.approved_by && ` · aprovada por ${qv.approved_by} em ${new Date(qv.approved_at!).toLocaleDateString("pt-BR")}`}
        {canApprove && (
          <button className="primary" disabled={busy} onClick={approve} style={{ marginLeft: 12 }}>
            Aprovar esta versão
          </button>
        )}
        {canPublish && (
          <button className="primary" disabled={busy} onClick={publish} style={{ marginLeft: 12 }}>
            Publicar esta versão
          </button>
        )}
      </p>
      {isAdmin && <Upload campaignId={campaign.id} onDone={(id) => reload().then(() => setSelected(id))} />}
      <ol className="questions">
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
    <details className="card upload">
      <summary>Carregar nova versão (arquivo JSON)</summary>
      <p className="muted small">
        O arquivo segue o formato de <code>contracts/questionnaire.schema.json</code>. Versões são imutáveis: para
        mudar, aumente o número da versão.
      </p>
      <input
        type="file"
        accept="application/json,.json"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) send(f);
          e.target.value = "";
        }}
      />
      {msg && <pre className={msg.error ? "error small" : "small"}>{msg.text}</pre>}
    </details>
  );
}

function QuestionPreview({ q, def }: { q: QQuestion; def: QuestionnaireDef }) {
  const options = q.options ?? (q.options_list ? def.lists?.[q.options_list] : undefined);
  const rows = q.rows_list ? def.lists?.[q.rows_list] : undefined;
  return (
    <li className="card">
      <div className="row between">
        <strong>
          <span className="key">{q.key}</span> {q.text}
        </strong>
        <span className="muted small">{TYPE_LABELS[q.type] ?? q.type}</span>
      </div>
      {q.read_aloud && <p className="aloud">“{q.read_aloud}”</p>}
      {q.show_if && <p className="cond">Só aparece se {describe(q.show_if, def)}.</p>}
      {rows && <p className="small">Linhas{q.shuffle_rows ? " (ordem sorteada)" : ""}: {rows.map((r) => r.label).join(" · ")}</p>}
      {options && (
        <p className="small">
          Opções{q.shuffle ? " (ordem sorteada)" : ""}: {options.map((o) => o.label).join(" · ")}
          {q.allow_other && " · Outro (qual?)"}
        </p>
      )}
      {q.type === "scale" && <p className="small">De {q.min} a {q.max}</p>}
      {q.terminate_if && (
        <p className="cond">
          Encerra a entrevista ({q.terminate_status === "refused" ? "recusa" : "filtro"}) se {describe(q.terminate_if, def)}.
        </p>
      )}
      {q.nonresponse !== false && def.nonresponse?.length ? (
        <p className="muted small">Aceita: {def.nonresponse.map((n) => n.label).join(", ")} (não lido ao entrevistado)</p>
      ) : null}
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
