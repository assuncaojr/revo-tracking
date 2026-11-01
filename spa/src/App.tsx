import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError, type CampaignAccess, type Me, type Role } from "./api";
import { DISCLAIMER, ROLE_LABELS } from "./format";
import { Login } from "./pages/Login";
import { FieldNow } from "./pages/FieldNow";
import { Flags } from "./pages/Flags";
import { Details, Summary } from "./pages/Results";
import { Neighborhoods } from "./pages/Neighborhoods";
import { Questionnaire } from "./pages/Questionnaire";
import { Manage } from "./pages/Manage";

type Tab = "field" | "flags" | "summary" | "hoods" | "details" | "questionnaire" | "manage";

const TABS: { id: Tab; label: string; staffOnly?: boolean; roles?: Role[] }[] = [
  { id: "field", label: "Campo agora", staffOnly: true },
  { id: "flags", label: "Alertas", staffOnly: true },
  { id: "summary", label: "Resumo" },
  { id: "hoods", label: "Bairros" },
  { id: "details", label: "Detalhes" },
  { id: "questionnaire", label: "Questionário" },
  { id: "manage", label: "Cadastros", roles: ["admin", "supervisor"] },
];

export function App() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab | null>(null);

  const loadMe = useCallback(async () => {
    try {
      const m = await api.get<Me>("/api/auth/me");
      setMe(m);
      setCampaignId((cur) => cur ?? m.campaigns[0]?.id ?? null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setMe(null);
      else throw e;
    }
  }, []);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  const campaign = me?.campaigns.find((c) => c.id === campaignId) ?? null;
  const tabs = TABS.filter(
    (t) => (!t.staffOnly || campaign?.staff) && (!t.roles || (campaign && t.roles.includes(campaign.role))),
  );
  const current = tab && tabs.some((t) => t.id === tab) ? tab : tabs[0]?.id;

  if (me === undefined) return <div className="center">Carregando…</div>;
  if (me === null) return <Login onDone={loadMe} />;
  if (!campaign) return <div className="center">Seu usuário não tem acesso a nenhuma campanha.</div>;

  const logout = async () => {
    await api.post("/api/auth/logout");
    setMe(null);
  };

  return (
    <>
      <Watermark me={me} />
      <header className="top">
        <div>
          <strong>{campaign.name}</strong>
          <span className="muted"> · {ROLE_LABELS[campaign.role]}</span>
        </div>
        <div className="row">
          {me.campaigns.length > 1 && (
            <select value={campaign.id} onChange={(e) => setCampaignId(e.target.value)}>
              {me.campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          <span className="muted">{me.name}</span>
          <button className="link" onClick={logout}>
            Sair
          </button>
        </div>
      </header>
      {!campaign.disclaimer_accepted ? (
        <DisclaimerGate campaign={campaign} onAccepted={loadMe} />
      ) : (
        <>
          <nav className="tabs">
            {tabs.map((t) => (
              <button key={t.id} className={t.id === current ? "active" : ""} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </nav>
          <main>
            {current === "field" && <FieldNow campaignId={campaign.id} />}
            {current === "flags" && <Flags campaign={campaign} />}
            {current === "summary" && <Summary campaign={campaign} />}
            {current === "hoods" && <Neighborhoods campaign={campaign} />}
            {current === "details" && <Details campaign={campaign} />}
            {current === "questionnaire" && <Questionnaire campaign={campaign} />}
            {current === "manage" && <Manage campaign={campaign} />}
          </main>
          <footer className="disclaimer">{DISCLAIMER} Uso interno da campanha: não divulgar.</footer>
        </>
      )}
    </>
  );
}

/** Aviso de não garantia, aceito no primeiro acesso e registrado (D16). */
function DisclaimerGate({ campaign, onAccepted }: { campaign: CampaignAccess; onAccepted: () => void }) {
  const [busy, setBusy] = useState(false);
  const accept = async () => {
    setBusy(true);
    await api.post(`/api/campaigns/${campaign.id}/disclaimer/accept`);
    onAccepted();
  };
  return (
    <main className="narrow">
      <h1>Antes de começar</h1>
      <p className="lead">{DISCLAIMER}</p>
      <p>
        Os dados desta campanha são de uso interno. Resultado de pesquisa interna não pode ser divulgado como
        pesquisa eleitoral. Cada tela leva o seu nome, para que um eventual vazamento possa ser rastreado.
      </p>
      <button className="primary" onClick={accept} disabled={busy}>
        Li e entendi
      </button>
    </main>
  );
}

/** Marca d'água com nome, e-mail e horário em toda a tela: se um print vazar, sabemos de onde veio. */
function Watermark({ me }: { me: Me }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  const text = `${me.name} · ${me.email} · ${now.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`;
  const url = useMemo(() => {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='460' height='220'><text x='10' y='140' transform='rotate(-20 230 110)' font-family='sans-serif' font-size='14' fill='rgba(0,0,0,0.07)'>${text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")}</text></svg>`;
    return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
  }, [text]);
  return <div className="watermark" style={{ backgroundImage: url }} aria-hidden />;
}
