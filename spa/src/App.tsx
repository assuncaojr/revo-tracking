import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router";
import { api, ApiError, type CampaignAccess, type Me, type Role } from "./api";
import { DISCLAIMER, ROLE_LABELS } from "./format";
import { Login } from "./pages/Login";
import { FieldNow } from "./pages/FieldNow";
import { Flags } from "./pages/Flags";
import { Details, Summary, SummaryReport } from "./pages/Results";
import { Neighborhoods } from "./pages/Neighborhoods";
import { Questionnaire } from "./pages/Questionnaire";
import { Manage } from "./pages/Manage";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  Activity,
  ChartColumn,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  TriangleAlert,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { DialogHost } from "@/components/dialogs";
import { cn } from "@/lib/utils";

type Tab = "field" | "flags" | "summary" | "hoods" | "details" | "questionnaire" | "manage";
type Group = "ops" | "results" | "admin";

const GROUPS: { id: Group; label: string }[] = [
  { id: "ops", label: "Operação" },
  { id: "results", label: "Resultados" },
  { id: "admin", label: "Gestão" },
];

// `path` é o primeiro trecho da URL (em português: aparece para o usuário)
const TABS: {
  id: Tab;
  path: string;
  label: string;
  group: Group;
  icon: LucideIcon;
  staffOnly?: boolean;
  roles?: Role[];
}[] = [
  { id: "field", path: "campo", label: "Campo agora", group: "ops", icon: Activity, staffOnly: true },
  { id: "flags", path: "alertas", label: "Alertas", group: "ops", icon: TriangleAlert, staffOnly: true },
  { id: "summary", path: "resumo", label: "Resumo", group: "results", icon: LayoutDashboard },
  { id: "hoods", path: "bairros", label: "Bairros", group: "results", icon: MapPin },
  { id: "details", path: "detalhes", label: "Detalhes", group: "results", icon: ChartColumn },
  { id: "questionnaire", path: "questionario", label: "Questionário", group: "admin", icon: ClipboardList },
  { id: "manage", path: "cadastros", label: "Cadastros", group: "admin", icon: Users, roles: ["admin", "supervisor"] },
];

// No celular, a barra de baixo leva as três seções mais usadas que o papel enxerga; o resto fica em "Mais"
const MOBILE_PRIORITY: Tab[] = ["summary", "hoods", "field", "details"];

type TabDef = (typeof TABS)[number];

export function App() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();

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
  const tabs = campaign?.disclaimer_accepted
    ? TABS.filter((t) => (!t.staffOnly || campaign.staff) && (!t.roles || t.roles.includes(campaign.role)))
    : [];
  const currentTab = tabs.find((t) => pathname === `/${t.path}` || pathname.startsWith(`/${t.path}/`));
  const current = currentTab?.id;
  const allowed = (id: Tab) => tabs.some((t) => t.id === id);

  // Troca de tela: volta ao topo, fecha a gaveta do celular e dá nome à aba do navegador
  useEffect(() => {
    window.scrollTo({ top: 0 });
    setMenuOpen(false);
  }, [pathname]);
  useEffect(() => {
    document.title = currentTab ? `${currentTab.label} — Tracking` : "Tracking — Painel";
  }, [currentTab]);

  if (me === undefined) return <Centered>Carregando…</Centered>;
  if (me === null) return <Login onDone={loadMe} />;
  if (!campaign) return <Centered>Seu usuário não tem acesso a nenhuma campanha.</Centered>;

  const logout = async () => {
    await api.post("/api/auth/logout");
    setMe(null);
  };
  const sidebar = (
    <SidebarBody
      me={me}
      campaign={campaign}
      tabs={tabs}
      current={current}
      onCampaign={setCampaignId}
      onLogout={logout}
    />
  );
  const mobileTabs = MOBILE_PRIORITY.map((id) => tabs.find((t) => t.id === id))
    .filter((t): t is TabDef => !!t)
    .slice(0, 3);

  return (
    <>
      <Watermark me={me} />
      <Toaster />
      <DialogHost />
      <div className="flex min-h-screen">
        <aside className="no-print sticky top-0 hidden h-screen w-60 shrink-0 bg-sidebar text-sidebar-foreground lg:block">
          {sidebar}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col max-lg:pb-[calc(4.25rem+env(safe-area-inset-bottom))]">
          <header className="no-print sticky top-0 z-20 flex items-center gap-3 bg-sidebar px-4 py-3 text-sidebar-foreground lg:hidden">
            <CampaignMark campaign={campaign} />
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate font-semibold text-white">{currentTab?.label ?? campaign.name}</div>
              <div className="truncate text-xs text-sidebar-muted">{campaign.name}</div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Menu"
              className="size-11 text-white hover:bg-sidebar-accent hover:text-white"
              onClick={() => setMenuOpen(true)}
            >
              <Menu className="size-5" />
            </Button>
          </header>

          {!campaign.disclaimer_accepted ? (
            <DisclaimerGate campaign={campaign} onAccepted={loadMe} />
          ) : (
            <main
              key={campaign.id}
              className="mx-auto w-full max-w-[1200px] flex-1 px-4 pt-5 pb-8 sm:px-6 lg:px-10 lg:pt-7 print:max-w-none print:p-0"
            >
              {currentTab && (
                <div className="no-print mb-1 text-sm text-muted-foreground">
                  {GROUPS.find((g) => g.id === currentTab.group)?.label}
                </div>
              )}
              {/* Só existem as rotas que o papel enxerga; o resto (inclusive "/") cai na primeira tela permitida */}
              <Routes>
                {allowed("field") && <Route path="/campo" element={<FieldNow campaignId={campaign.id} />} />}
                {allowed("flags") && <Route path="/alertas" element={<Flags campaign={campaign} />} />}
                {allowed("summary") && <Route path="/resumo" element={<Summary campaign={campaign} />} />}
                {allowed("summary") && <Route path="/resumo/boletim" element={<SummaryReport campaign={campaign} />} />}
                {allowed("hoods") && <Route path="/bairros/*" element={<Neighborhoods campaign={campaign} />} />}
                {allowed("details") && <Route path="/detalhes/:view?" element={<Details campaign={campaign} />} />}
                {allowed("questionnaire") && (
                  <Route path="/questionario" element={<Questionnaire campaign={campaign} />} />
                )}
                {allowed("manage") && <Route path="/cadastros/:section?" element={<Manage campaign={campaign} />} />}
                <Route path="*" element={<Navigate to={tabs[0] ? `/${tabs[0].path}` : "/"} replace />} />
              </Routes>
            </main>
          )}
          <footer className="no-print border-t bg-card/95 px-4 py-2 text-xs text-muted-foreground backdrop-blur sm:px-6 lg:sticky lg:bottom-0 lg:px-10">
            {DISCLAIMER} Uso interno da campanha: não divulgar.
          </footer>
        </div>
      </div>

      {tabs.length > 0 && (
        <nav
          aria-label="Seções"
          className="no-print fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t bg-card px-1 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:hidden"
        >
          {mobileTabs.map((t) => (
            <BottomItem key={t.id} icon={t.icon} label={t.label} active={t.id === current} to={`/${t.path}`} />
          ))}
          <BottomItem
            icon={Menu}
            label="Mais"
            active={!mobileTabs.some((t) => t.id === current)}
            onClick={() => setMenuOpen(true)}
          />
        </nav>
      )}

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent
          side="left"
          aria-describedby={undefined}
          className="w-72 gap-0 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground"
        >
          <SheetTitle className="sr-only">Menu</SheetTitle>
          {sidebar}
        </SheetContent>
      </Sheet>
    </>
  );
}

function CampaignMark({ campaign }: { campaign: CampaignAccess }) {
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-sidebar-primary text-sm font-semibold text-sidebar-primary-foreground">
      {campaign.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** Conteúdo do menu lateral: campanha, seções agrupadas, usuário. O mesmo no desktop e na gaveta do celular. */
function SidebarBody({
  me,
  campaign,
  tabs,
  current,
  onCampaign,
  onLogout,
}: {
  me: Me;
  campaign: CampaignAccess;
  tabs: TabDef[];
  current: Tab | undefined;
  onCampaign: (id: string) => void;
  onLogout: () => void;
}) {
  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto px-3.5 py-5">
      <div className="flex items-center gap-2.5 px-2">
        <CampaignMark campaign={campaign} />
        <div className="min-w-0 leading-tight">
          <div className="truncate text-sm font-semibold text-white">{campaign.name}</div>
          <div className="text-xs text-sidebar-muted">{ROLE_LABELS[campaign.role]}</div>
        </div>
      </div>
      {me.campaigns.length > 1 && (
        <Select value={campaign.id} onValueChange={onCampaign}>
          <SelectTrigger
            size="sm"
            aria-label="Campanha"
            className="w-full border-sidebar-border bg-sidebar-accent text-white [&_svg]:text-sidebar-muted!"
          >
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
      <nav aria-label="Seções" className="grid gap-5">
        {GROUPS.map((g) => {
          const items = tabs.filter((t) => t.group === g.id);
          if (!items.length) return null;
          return (
            <div key={g.id} className="grid gap-0.5">
              <div className="px-2.5 pb-1.5 text-[11px] font-medium tracking-wider text-sidebar-muted uppercase">
                {g.label}
              </div>
              {items.map((t) => {
                const Icon = t.icon;
                const active = t.id === current;
                return (
                  <Link
                    key={t.id}
                    to={`/${t.path}`}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-10 items-center gap-2.5 rounded-lg px-2.5 text-left text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sidebar-muted",
                      active
                        ? "bg-sidebar-primary font-medium text-sidebar-primary-foreground"
                        : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    {t.label}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>
      <div className="mt-auto flex items-center gap-2.5 border-t border-sidebar-border px-2 pt-3.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-sidebar-accent text-xs font-semibold text-white">
          {initials(me.name)}
        </span>
        <div className="min-w-0 flex-1 truncate text-sm text-white">{me.name}</div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Sair"
          className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-white"
          onClick={onLogout}
        >
          <LogOut />
        </Button>
      </div>
    </div>
  );
}

/** Item da barra de baixo do celular: link para uma tela, ou botão (o "Mais", que abre a gaveta). */
function BottomItem({
  icon: Icon,
  label,
  active,
  to,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  to?: string;
  onClick?: () => void;
}) {
  const className = cn(
    "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-lg text-[11px]",
    active ? "font-semibold text-primary" : "text-muted-foreground",
  );
  const body = (
    <>
      <Icon className="size-5" />
      {label}
    </>
  );
  return to ? (
    <Link to={to} aria-current={active ? "page" : undefined} className={className}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={className}>
      {body}
    </button>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
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
