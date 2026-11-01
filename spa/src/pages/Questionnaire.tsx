import { useState } from "react";
import { api, type CampaignAccess, type Condition, type QQuestion, type QuestionnaireDef, type QuestionnaireVersion } from "../api";
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
  if (error) return <p className="error">{error}</p>;
  if (!data) return <p>Carregando…</p>;
  if (data.length === 0) return <p>Nenhum questionário.</p>;

  const qv = data.find((v) => v.id === selected) ?? data[0];
  const canApprove = (campaign.role === "client_coord" || campaign.role === "admin") && !qv.approved_at;

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
      </p>
      <ol className="questions">
        {qv.definition.questions.map((q) => (
          <QuestionPreview key={q.key} q={q} def={qv.definition} />
        ))}
      </ol>
    </>
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
