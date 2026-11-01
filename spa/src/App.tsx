import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ApiError, type CampaignAccess, type Me, type Role } from "./api";
import { DISCLAIMER, ROLE_LABELS } from "./format";
import { Login } from "./pages/Login";
import { FieldNow } from "./pages/FieldNow";
import { Flags } from "./pages/Flags";
import { Details, Summary } from "./pages/Results";
import { Neighborhoods } from "./pages/Neighborhoods";
import { Questionnaire } from "./pages/Questionnaire";
import { Manage } from "./pages/Manage";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LogOut } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { DialogHost } from "@/components/dialogs";

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

  if (me === undefined) return <Centered>Carregando…</Centered>;
  if (me === null) return <Login onDone={loadMe} />;
  if (!campaign) return <Centered>Seu usuário não tem acesso a nenhuma campanha.</Centered>;

  const logout = async () => {
    await api.post("/api/auth/logout");
    setMe(null);
  };

  return (
    <>
      <Watermark me={me} />
      <Toaster />
      <DialogHost />
      <header className="no-print sticky top-0 z-20 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
              {campaign.name.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 leading-tight">
              <div className="truncate font-semibold">{campaign.name}</div>
              <div className="text-xs text-muted-foreground">{ROLE_LABELS[campaign.role]}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {me.campaigns.length > 1 && (
              <Select value={campaign.id} onValueChange={setCampaignId}>
                <SelectTrigger size="sm" className="max-w-[46vw] bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {me.campaigns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <span className="hidden text-sm text-muted-foreground sm:inline">{me.name}</span>
            <Button variant="ghost" size="sm" onClick={logout}>
              <LogOut />
              Sair
            </Button>
          </div>
        </div>
        {campaign.disclaimer_accepted && (
          <Tabs value={current} onValueChange={(v) => setTab(v as Tab)}>
            <TabsList
              variant="line"
              className="mx-auto flex h-11! w-full max-w-[1280px] justify-start overflow-x-auto px-2 [scrollbar-width:none] sm:px-4"
            >
              {tabs.map((t) => (
                <TabsTrigger key={t.id} value={t.id} className="flex-none px-3">
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}
      </header>
      {!campaign.disclaimer_accepted ? (
        <DisclaimerGate campaign={campaign} onAccepted={loadMe} />
      ) : (
        <>
          <main className="mx-auto max-w-[1280px] px-4 pt-5 pb-6 sm:px-6 sm:pb-20 print:max-w-none print:p-0">
            {current === "field" && <FieldNow campaignId={campaign.id} />}
            {current === "flags" && <Flags campaign={campaign} />}
            {current === "summary" && <Summary campaign={campaign} />}
            {current === "hoods" && <Neighborhoods campaign={campaign} />}
            {current === "details" && <Details campaign={campaign} />}
            {current === "questionnaire" && <Questionnaire campaign={campaign} />}
            {current === "manage" && <Manage campaign={campaign} />}
          </main>
          <footer className="no-print fixed inset-x-0 bottom-0 border-t bg-card px-4 py-2 text-xs text-muted-foreground max-sm:static max-sm:pb-4 sm:px-6">
            {DISCLAIMER} Uso interno da campanha: não divulgar.
          </footer>
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
    <main className="mx-auto max-w-[640px] px-4 py-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Antes de começar</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 leading-relaxed">
          <p className="text-lg">{DISCLAIMER}</p>
          <p className="text-muted-foreground">
            Os dados desta campanha são de uso interno. Resultado de pesquisa interna não pode ser divulgado como
            pesquisa eleitoral. Cada tela leva o seu nome, para que um eventual vazamento possa ser rastreado.
          </p>
        </CardContent>
        <CardFooter>
          <Button size="lg" onClick={accept} disabled={busy}>
            Li e entendi
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return <div className="grid min-h-screen place-items-center p-4 text-muted-foreground">{children}</div>;
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
