import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import QRCode from "qrcode";
import {
  api,
  ApiError,
  type CampaignAccess,
  type CampaignEventItem,
  type Credentials,
  type ManagedDevice,
  type ManagedInterviewer,
  type Member,
  type Places,
  type Role,
} from "../api";
import { ago, ROLE_LABELS } from "../format";
import { usePoll } from "../usePoll";
import { toast } from "sonner";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Segmented, SelectField } from "@/components/controls";
import { confirmDialog, promptDialog } from "@/components/dialogs";
import { EmptyState, ErrorState, LoadingState, Notice, PageHeader } from "@/components/page";
import { cn } from "@/lib/utils";

type Section = "interviewers" | "devices" | "events" | "places" | "members";

// `path` é o trecho da URL depois de /cadastros
const SECTIONS: { id: Section; path: string; label: string; adminOnly?: boolean }[] = [
  { id: "interviewers", path: "entrevistadores", label: "Entrevistadores" },
  { id: "devices", path: "aparelhos", label: "Aparelhos" },
  { id: "events", path: "marcos", label: "Marcos da campanha" },
  { id: "places", path: "locais", label: "Estratos, bairros e pontos", adminOnly: true },
  { id: "members", path: "usuarios", label: "Usuários do painel", adminOnly: true },
];

/** Cadastros (D25). Admin faz tudo; supervisão cuida só de entrevistadores e aparelhos. Nada se apaga: desativa. */
export function Manage({ campaign }: { campaign: CampaignAccess }) {
  const isAdmin = campaign.role === "admin";
  const sections = SECTIONS.filter((s) => !s.adminOnly || isAdmin);
  const navigate = useNavigate();
  // seção desconhecida ou só de admin para quem não é admin: cai na primeira permitida
  const current = sections.find((s) => s.path === useParams().section);
  if (!current) return <Navigate to={`/cadastros/${sections[0].path}`} replace />;
  const section = current.id;
  const base = `/api/campaigns/${campaign.id}/manage`;
  return (
    <>
      <PageHeader title="Cadastros" />
      <Segmented
        className="mb-4"
        value={current.path}
        onChange={(path) => navigate(`/cadastros/${path}`)}
        size="sm"
        options={sections.map((s) => ({ value: s.path, label: s.label }))}
      />
      {section === "interviewers" && <Interviewers base={base} />}
      {section === "devices" && <Devices base={base} />}
      {section === "events" && <Events base={base} />}
      {section === "places" && isAdmin && <PlacesSection base={base} />}
      {section === "members" && isAdmin && <Members base={base} />}
    </>
  );
}

/** Executa uma ação, avisa o resultado (toast), mostra o erro do núcleo e recarrega a lista. */
function useAction(reload: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async <T,>(fn: () => Promise<T>, done?: string): Promise<T | undefined> => {
    setBusy(true);
    setError(null);
    try {
      const r = await fn();
      await reload();
      if (done) toast.success(done);
      return r;
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : String(e);
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

/** Explicação curta no topo de cada seção. */
function Intro({ children }: { children: ReactNode }) {
  return <p className="mb-4 max-w-3xl text-sm text-muted-foreground">{children}</p>;
}

/** Formulário de cadastro em linha: campos e botão, quebrando no celular. */
function AddForm({ onSubmit, children }: { onSubmit: (e: FormEvent) => void; children: ReactNode }) {
  return (
    <Card className="mb-4 px-4 py-4">
      <form className="flex flex-wrap items-center gap-2 [&>input]:w-auto [&>input]:min-w-44 [&>input]:flex-1 sm:[&>input]:w-60 sm:[&>input]:flex-none" onSubmit={onSubmit}>
        {children}
      </form>
    </Card>
  );
}

/** Tabela dentro de um card, com respiro nas bordas. */
function TableCard({ children }: { children: ReactNode }) {
  return (
    <Card className="py-0 [&_td:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:first-child]:pl-4 [&_th:last-child]:pr-4">
      <Table>{children}</Table>
    </Card>
  );
}

const DANGER = "text-destructive hover:text-destructive";

/** Segredo mostrado uma vez só (código do aparelho, senha provisória): destacado e com botão de fechar. */
function SecretCard({ title, onClose, closeLabel, children }: { title: React.ReactNode; onClose: () => void; closeLabel: string; children: ReactNode }) {
  return (
    <Card className="mb-4 gap-3 border-amber-300 bg-amber-50 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span>{title}</span>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X />
          {closeLabel}
        </Button>
      </div>
      {children}
    </Card>
  );
}

// --- entrevistadores ---

function Interviewers({ base }: { base: string }) {
  const { data, error: loadError, reload } = usePoll<ManagedInterviewer[]>(`${base}/interviewers`, 0);
  const { busy, error, run } = useAction(reload);
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await run(() => api.post(`${base}/interviewers`, { name, pin }), "Entrevistador cadastrado");
    if (ok) {
      setName("");
      setPin("");
    }
  };
  const update = (i: ManagedInterviewer, body: object, done: string) =>
    run(() => api.post(`${base}/interviewers/${i.id}`, body), done);
  const rename = async (i: ManagedInterviewer) => {
    const n = await promptDialog({ title: `Renomear ${i.name}`, label: "Nome", defaultValue: i.name });
    if (n && n !== i.name) update(i, { name: n }, "Nome atualizado");
  };
  const newPin = async (i: ManagedInterviewer) => {
    const p = await promptDialog({
      title: `Novo PIN de ${i.name}`,
      description: "O aparelho passa a pedir o PIN novo na próxima vez que abrir com internet.",
      label: "PIN (4 a 8 dígitos)",
      inputMode: "numeric",
      validate: (v) => (/^\d{4,8}$/.test(v) ? null : "Use de 4 a 8 dígitos."),
    });
    if (p) update(i, { pin: p }, "PIN trocado");
  };

  if (loadError) return <ErrorState>{loadError}</ErrorState>;
  if (!data) return <LoadingState />;
  return (
    <>
      <Intro>
        O aparelho recebe novos nomes, PINs e desativações na próxima vez que o app abrir com internet. O PIN é pessoal:
        entregue em particular.
      </Intro>
      <AddForm onSubmit={add}>
        <Input placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
        <Input
          placeholder="PIN (4 a 8 dígitos)"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          inputMode="numeric"
          required
          minLength={4}
          maxLength={8}
        />
        <Button disabled={busy}>Cadastrar entrevistador</Button>
      </AddForm>
      {error && <ErrorState>{error}</ErrorState>}
      <TableCard>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Situação</TableHead>
            <TableHead className="text-right">Completas</TableHead>
            <TableHead>Última entrevista</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((i) => (
            <TableRow key={i.id} className={cn(!i.active && "text-muted-foreground")}>
              <TableCell className="font-medium">{i.name}</TableCell>
              <TableCell>{i.active ? "Ativo" : "Desativado"}</TableCell>
              <TableCell className="text-right tabular-nums">{i.complete}</TableCell>
              <TableCell>{i.last_at ? ago(i.last_at) : "—"}</TableCell>
              <TableCell>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => rename(i)}>
                    Renomear
                  </Button>
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => newPin(i)}>
                    Novo PIN
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(i.active && DANGER)}
                    disabled={busy}
                    onClick={() => update(i, { active: !i.active }, i.active ? "Entrevistador desativado" : "Entrevistador reativado")}
                  >
                    {i.active ? "Desativar" : "Reativar"}
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </TableCard>
    </>
  );
}

// --- aparelhos ---

function Devices({ base }: { base: string }) {
  const { data, error: loadError, reload } = usePoll<ManagedDevice[]>(`${base}/devices`, 60_000);
  const { busy, error, run } = useAction(reload);
  const [label, setLabel] = useState("");
  const [code, setCode] = useState<{ label: string; code: string; hours: number } | null>(null);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const r = await run(() => api.post<{ code: string; valid_hours: number }>(`${base}/devices`, { label }), "Aparelho cadastrado");
    if (r) {
      setCode({ label, code: r.code, hours: r.valid_hours });
      setLabel("");
    }
  };
  const newCode = async (d: ManagedDevice) => {
    const ok = await confirmDialog({
      title: d.active ? `Gerar novo código para ${d.label}?` : `Gerar código de cadastro para ${d.label}?`,
      description: d.active
        ? "O aparelho deixa de enviar até ser cadastrado de novo com ele (a fila dele é mantida)."
        : undefined,
      action: "Gerar código",
    });
    if (!ok) return;
    const r = await run(() => api.post<{ code: string; valid_hours: number }>(`${base}/devices/${d.id}/code`));
    if (r) setCode({ label: d.label, code: r.code, hours: r.valid_hours });
  };
  const revoke = async (d: ManagedDevice) => {
    const ok = await confirmDialog({
      title: `Revogar ${d.label}?`,
      description: "Ele para de receber questionário e de enviar entrevistas na hora.",
      action: "Revogar",
      destructive: true,
    });
    if (ok) run(() => api.post(`${base}/devices/${d.id}/revoke`), "Aparelho revogado");
  };

  if (loadError) return <ErrorState>{loadError}</ErrorState>;
  if (!data) return <LoadingState />;
  return (
    <>
      <Intro>
        Cadastre o aparelho aqui e digite o código no app, na primeira tela. Perdeu ou trocou o aparelho? Revogue. O
        código novo mantém o mesmo aparelho, então as entrevistas que estiverem na fila dele continuam valendo.
      </Intro>
      <AddForm onSubmit={add}>
        <Input placeholder="Etiqueta (ex.: A14-03)" value={label} onChange={(e) => setLabel(e.target.value)} required minLength={2} />
        <Button disabled={busy}>Cadastrar aparelho</Button>
      </AddForm>
      {code && (
        <SecretCard
          title={
            <>
              Código de cadastro de <strong>{code.label}</strong> (vale {code.hours} h, uma vez):
            </>
          }
          closeLabel="Fechar"
          onClose={() => setCode(null)}
        >
          <div className="font-mono text-2xl tracking-widest select-all">{code.code}</div>
          <p className="text-sm text-muted-foreground">Ele não aparece de novo. Se fechar antes de usar, gere outro.</p>
        </SecretCard>
      )}
      {error && <ErrorState>{error}</ErrorState>}
      <TableCard>
        <TableHeader>
          <TableRow>
            <TableHead>Aparelho</TableHead>
            <TableHead>Situação</TableHead>
            <TableHead>Último contato</TableHead>
            <TableHead className="text-right">Na fila</TableHead>
            <TableHead className="text-right">Bateria</TableHead>
            <TableHead>App</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((d) => (
            <TableRow key={d.id} className={cn(d.revoked_at && "text-muted-foreground")}>
              <TableCell>
                <div className="font-medium">{d.label}</div>
                {d.model && <div className="text-xs text-muted-foreground">{d.model}</div>}
              </TableCell>
              <TableCell>{deviceState(d)}</TableCell>
              <TableCell>{ago(d.last_seen_at)}</TableCell>
              <TableCell className="text-right tabular-nums">{d.pending_count ?? "—"}</TableCell>
              <TableCell className="text-right tabular-nums">{d.battery_pct != null ? `${d.battery_pct}%` : "—"}</TableCell>
              <TableCell>{d.app_version ?? "—"}</TableCell>
              <TableCell>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => newCode(d)}>
                    Novo código
                  </Button>
                  {!d.revoked_at && (
                    <Button variant="outline" size="sm" className={DANGER} disabled={busy} onClick={() => revoke(d)}>
                      Revogar
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </TableCard>
    </>
  );
}

function deviceState(d: ManagedDevice): string {
  if (d.active) return "Em uso";
  if (d.awaiting_enrollment) return "Aguardando cadastro no app";
  if (d.revoked_at) return "Revogado";
  return "Sem código válido";
}

// --- marcos da campanha (D29) ---

function Events({ base }: { base: string }) {
  const { data, error: loadError, reload } = usePoll<CampaignEventItem[]>(`${base}/events`, 0);
  const { busy, error, run } = useAction(reload);
  const [form, setForm] = useState({ day: new Date().toLocaleDateString("sv-SE"), title: "", note: "" });

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (await run(() => api.post(`${base}/events`, { ...form, note: form.note || null }), "Marco adicionado"))
      setForm({ ...form, title: "", note: "" });
  };
  const remove = async (ev: CampaignEventItem) => {
    const ok = await confirmDialog({
      title: `Tirar o marco “${ev.title}”?`,
      description: `Do dia ${new Date(`${ev.day}T12:00`).toLocaleDateString("pt-BR")}. Ele sai do gráfico do cliente.`,
      action: "Tirar",
      destructive: true,
    });
    if (ok) run(() => api.post(`${base}/events/${ev.id}/remove`), "Marco retirado");
  };

  if (loadError) return <ErrorState>{loadError}</ErrorState>;
  if (!data) return <LoadingState />;
  return (
    <>
      <Intro>
        Acontecimentos que podem mexer na opinião: inauguração, debate, denúncia, chuva forte. Aparecem numerados no
        gráfico de evolução do cliente, para ligar resultado a acontecimento. Escreva como o cliente vai ler.
      </Intro>
      <AddForm onSubmit={add}>
        <Input type="date" className="w-auto" value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })} required />
        <Input
          placeholder="O que aconteceu (ex.: Inauguração do hospital)"
          className="sm:min-w-80"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          required
          minLength={2}
          maxLength={80}
        />
        <Input
          placeholder="Detalhe (opcional)"
          value={form.note}
          onChange={(e) => setForm({ ...form, note: e.target.value })}
          maxLength={500}
        />
        <Button disabled={busy}>Adicionar marco</Button>
      </AddForm>
      {error && <ErrorState>{error}</ErrorState>}
      {data.length === 0 ? (
        <EmptyState>Nenhum marco ainda.</EmptyState>
      ) : (
        <TableCard>
          <TableHeader>
            <TableRow>
              <TableHead>Dia</TableHead>
              <TableHead>Marco</TableHead>
              <TableHead>Quem registrou</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((ev) => (
              <TableRow key={ev.id}>
                <TableCell className="tabular-nums">{new Date(`${ev.day}T12:00`).toLocaleDateString("pt-BR")}</TableCell>
                <TableCell className="whitespace-normal">
                  <div className="font-medium">{ev.title}</div>
                  {ev.note && <div className="text-xs text-muted-foreground">{ev.note}</div>}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{ev.created_by}</TableCell>
                <TableCell>
                  <div className="flex justify-end">
                    <Button variant="outline" size="sm" className={DANGER} disabled={busy} onClick={() => remove(ev)}>
                      Tirar
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </TableCard>
      )}
    </>
  );
}

// --- estratos, bairros e pontos ---

function PlacesSection({ base }: { base: string }) {
  const { data, error: loadError, reload } = usePoll<Places>(`${base}/places`, 0);
  const { busy, error, run } = useAction(reload);
  const [stratum, setStratum] = useState({ name: "", target: "" });
  const [hood, setHood] = useState({ name: "", stratum_id: "" });

  if (loadError) return <ErrorState>{loadError}</ErrorState>;
  if (!data) return <LoadingState />;

  const target = (v: string) => (v === "" ? null : Number(v));
  const addStratum = async (e: FormEvent) => {
    e.preventDefault();
    if (await run(() => api.post(`${base}/strata`, { name: stratum.name, daily_target: target(stratum.target) }), "Estrato adicionado"))
      setStratum({ name: "", target: "" });
  };
  const addHood = async (e: FormEvent) => {
    e.preventDefault();
    if (await run(() => api.post(`${base}/neighborhoods`, { name: hood.name, stratum_id: hood.stratum_id || null }), "Bairro adicionado"))
      setHood({ name: "", stratum_id: hood.stratum_id });
  };
  const groups = [...data.strata.map((s) => ({ id: s.id as string | null, name: s.name })), { id: null, name: "Sem estrato" }];

  return (
    <>
      <Intro>
        Estrato é o grupo de bairros que tem meta diária e aparece separado nos resultados. Ponto é onde o entrevistador
        trabalha; o app mostra só os ativos. Coordenadas do ponto ligam o alerta “longe do ponto”.
      </Intro>
      {error && <ErrorState>{error}</ErrorState>}

      <h3 className="mb-3 text-base font-semibold">Estratos</h3>
      <TableCard>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Meta diária (entrevistas completas)</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.strata.map((s) => (
            <StratumRow
              key={s.id}
              s={s}
              busy={busy}
              onSave={(body) => run(() => api.post(`${base}/strata/${s.id}`, body), "Estrato salvo")}
            />
          ))}
        </TableBody>
      </TableCard>
      <div className="mt-3">
        <AddForm onSubmit={addStratum}>
          <Input placeholder="Novo estrato" value={stratum.name} onChange={(e) => setStratum({ ...stratum, name: e.target.value })} required />
          <Input
            placeholder="Meta diária"
            type="number"
            min={0}
            value={stratum.target}
            onChange={(e) => setStratum({ ...stratum, target: e.target.value })}
          />
          <Button variant="outline" disabled={busy}>
            Adicionar estrato
          </Button>
        </AddForm>
      </div>

      <h3 className="mt-8 mb-3 text-base font-semibold">Bairros e pontos</h3>
      <AddForm onSubmit={addHood}>
        <Input placeholder="Novo bairro" value={hood.name} onChange={(e) => setHood({ ...hood, name: e.target.value })} required />
        <SelectField
          value={hood.stratum_id}
          onChange={(v) => setHood({ ...hood, stratum_id: v })}
          options={[{ value: "", label: "Sem estrato" }, ...data.strata.map((s) => ({ value: s.id, label: s.name }))]}
        />
        <Button variant="outline" disabled={busy}>
          Adicionar bairro
        </Button>
      </AddForm>
      {groups.map((g) => {
        const hoods = data.neighborhoods.filter((n) => n.stratum_id === g.id);
        if (hoods.length === 0) return null;
        return (
          <section key={g.id ?? "none"} className="my-6">
            <h4 className="mb-2 text-sm font-medium tracking-wide text-muted-foreground uppercase">{g.name}</h4>
            <div className="grid gap-3">
              {hoods.map((n) => (
                <Neighborhood key={n.id} n={n} data={data} base={base} busy={busy} run={run} />
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}

function StratumRow({
  s,
  busy,
  onSave,
}: {
  s: Places["strata"][number];
  busy: boolean;
  onSave: (body: { name: string; daily_target: number | null }) => void;
}) {
  const [name, setName] = useState(s.name);
  const [target, setTarget] = useState(s.daily_target?.toString() ?? "");
  useEffect(() => {
    setName(s.name);
    setTarget(s.daily_target?.toString() ?? "");
  }, [s]);
  const dirty = name !== s.name || target !== (s.daily_target?.toString() ?? "");
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell>
        <Input className="h-8" value={name} onChange={(e) => setName(e.target.value)} />
      </TableCell>
      <TableCell>
        <Input className="h-8 w-32" type="number" min={0} value={target} onChange={(e) => setTarget(e.target.value)} />
      </TableCell>
      <TableCell className="w-24 text-right">
        {dirty && (
          <Button size="sm" disabled={busy || !name.trim()} onClick={() => onSave({ name, daily_target: target === "" ? null : Number(target) })}>
            Salvar
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

type Run = <T>(fn: () => Promise<T>, done?: string) => Promise<T | undefined>;

function Neighborhood({
  n,
  data,
  base,
  busy,
  run,
}: {
  n: Places["neighborhoods"][number];
  data: Places;
  base: string;
  busy: boolean;
  run: Run;
}) {
  const points = data.points.filter((p) => p.neighborhood_id === n.id);
  const [newPoint, setNewPoint] = useState("");
  const rename = async () => {
    const name = await promptDialog({ title: `Renomear ${n.name}`, label: "Nome do bairro", defaultValue: n.name });
    if (name && name !== n.name)
      run(() => api.post(`${base}/neighborhoods/${n.id}`, { name, stratum_id: n.stratum_id }), "Bairro renomeado");
  };
  const move = async (stratum_id: string) => {
    const to = data.strata.find((s) => s.id === stratum_id)?.name ?? "sem estrato";
    const ok = await confirmDialog({
      title: `Passar ${n.name} para ${to}?`,
      description: "Resultados e progresso por estrato são recalculados com isso, inclusive os dias anteriores.",
      action: "Passar",
    });
    if (ok) run(() => api.post(`${base}/neighborhoods/${n.id}`, { name: n.name, stratum_id: stratum_id || null }), "Bairro movido");
  };
  const addPoint = async (e: FormEvent) => {
    e.preventDefault();
    if (await run(() => api.post(`${base}/points`, { neighborhood_id: n.id, name: newPoint, kind: "door" }), "Ponto adicionado"))
      setNewPoint("");
  };
  return (
    <Card className="gap-3 px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong>{n.name}</strong>
        <div className="flex items-center gap-2">
          <SelectField
            value={n.stratum_id ?? ""}
            onChange={move}
            className="h-8"
            options={[{ value: "", label: "Sem estrato" }, ...data.strata.map((s) => ({ value: s.id, label: s.name }))]}
          />
          <Button variant="ghost" size="sm" disabled={busy} onClick={rename}>
            Renomear
          </Button>
        </div>
      </div>
      {points.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ponto</TableHead>
              <TableHead>Abordagem</TableHead>
              <TableHead>Latitude</TableHead>
              <TableHead>Longitude</TableHead>
              <TableHead>Ativo</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {points.map((p) => (
              <PointRow
                key={p.id}
                p={p}
                busy={busy}
                onSave={(body) => run(() => api.post(`${base}/points/${p.id}`, body), "Ponto salvo")}
              />
            ))}
          </TableBody>
        </Table>
      )}
      <form className="flex flex-wrap items-center gap-2" onSubmit={addPoint}>
        <Input
          placeholder="Novo ponto neste bairro"
          className="h-8 max-w-xs"
          value={newPoint}
          onChange={(e) => setNewPoint(e.target.value)}
          required
        />
        <Button variant="outline" size="sm" disabled={busy}>
          Adicionar ponto
        </Button>
      </form>
    </Card>
  );
}

function PointRow({
  p,
  busy,
  onSave,
}: {
  p: Places["points"][number];
  busy: boolean;
  onSave: (body: object) => void;
}) {
  const initial = () => ({ name: p.name, kind: p.kind, lat: p.lat?.toString() ?? "", lng: p.lng?.toString() ?? "", active: p.active });
  const [f, setF] = useState(initial);
  useEffect(() => setF(initial()), [p]);
  const dirty = JSON.stringify(f) !== JSON.stringify(initial());
  const coord = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));
  return (
    <TableRow className={cn("hover:bg-transparent", !f.active && "text-muted-foreground")}>
      <TableCell>
        <Input className="h-8 min-w-40" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      </TableCell>
      <TableCell>
        <SelectField
          value={f.kind}
          onChange={(v) => setF({ ...f, kind: v })}
          className="h-8"
          options={[
            { value: "door", label: "Porta a porta" },
            { value: "flow", label: "Fluxo (rua, feira)" },
          ]}
        />
      </TableCell>
      <TableCell>
        <Input className="h-8 w-28" placeholder="latitude" value={f.lat} onChange={(e) => setF({ ...f, lat: e.target.value })} />
      </TableCell>
      <TableCell>
        <Input className="h-8 w-28" placeholder="longitude" value={f.lng} onChange={(e) => setF({ ...f, lng: e.target.value })} />
      </TableCell>
      <TableCell>
        <Checkbox checked={f.active} onCheckedChange={(v) => setF({ ...f, active: v === true })} aria-label="Ativo" />
      </TableCell>
      <TableCell className="w-24 text-right">
        {dirty && (
          <Button
            size="sm"
            disabled={busy || !f.name.trim()}
            onClick={() => onSave({ neighborhood_id: p.neighborhood_id, name: f.name, kind: f.kind, lat: coord(f.lat), lng: coord(f.lng), active: f.active })}
          >
            Salvar
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

// --- usuários do painel ---

const ROLES: Role[] = ["admin", "supervisor", "analyst", "client_coord", "client_reader"];

const ROLE_HELP: Record<Role, string> = {
  admin: "nossa equipe; faz tudo, inclusive cadastros e publicação do questionário",
  supervisor: "nossa equipe; campo agora, alertas, entrevistadores e aparelhos",
  analyst: "nossa equipe; vê campo e resultados, sem alterar nada",
  client_coord: "pessoa do cliente; vê resultados e progresso e aprova o questionário",
  client_reader: "pessoa do cliente; só vê resultados e progresso",
};

function Members({ base }: { base: string }) {
  const { data, error: loadError, reload } = usePoll<Member[]>(`${base}/members`, 0);
  const { busy, error, run } = useAction(reload);
  const [form, setForm] = useState({ email: "", name: "", role: "client_reader" as Role });
  const [cred, setCred] = useState<{ name: string; c: Credentials } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setNotice(null);
    const r = await run(() => api.post<{ credentials: Credentials | null }>(`${base}/members`, form), "Acesso criado");
    if (!r) return;
    if (r.credentials) setCred({ name: form.name, c: r.credentials });
    else setNotice(`${form.email} já tinha conta: entra com a senha e o autenticador de sempre.`);
    setForm({ email: "", name: "", role: form.role });
  };
  const reset = async (m: Member) => {
    const ok = await confirmDialog({
      title: `Gerar senha e autenticador novos para ${m.name}?`,
      description: "A senha atual e o autenticador antigo deixam de valer agora.",
      action: "Refazer acesso",
      destructive: true,
    });
    if (!ok) return;
    const r = await run(() => api.post<{ credentials: Credentials }>(`${base}/members/${m.id}/reset`), "Acesso refeito");
    if (r) setCred({ name: m.name, c: r.credentials });
  };
  const remove = async (m: Member) => {
    const ok = await confirmDialog({
      title: `Tirar ${m.name} desta campanha?`,
      description: "O acesso é cortado na hora.",
      action: "Tirar da campanha",
      destructive: true,
    });
    if (ok) run(() => api.post(`${base}/members/${m.id}/remove`), "Pessoa retirada da campanha");
  };
  const changeRole = async (m: Member, role: Role) => {
    const ok = await confirmDialog({ title: `Mudar o papel de ${m.name} para ${ROLE_LABELS[role]}?`, description: ROLE_HELP[role], action: "Mudar papel" });
    if (ok) run(() => api.post(`${base}/members/${m.id}/role`, { role }), "Papel alterado");
  };

  if (loadError) return <ErrorState>{loadError}</ErrorState>;
  if (!data) return <LoadingState />;
  return (
    <>
      <Intro>
        Todo acesso pede senha e o código do app autenticador. Pessoa nova recebe uma senha provisória e uma chave para
        o autenticador, mostradas uma vez só: entregue em particular.
      </Intro>
      <AddForm onSubmit={add}>
        <Input placeholder="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={2} />
        <Input placeholder="E-mail" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        <SelectField
          value={form.role}
          onChange={(v) => setForm({ ...form, role: v })}
          options={ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
        />
        <Button disabled={busy}>Dar acesso</Button>
        <p className="basis-full text-sm text-muted-foreground">
          <strong className="text-foreground">{ROLE_LABELS[form.role]}</strong>: {ROLE_HELP[form.role]}.
        </p>
      </AddForm>
      {cred && <CredentialsCard name={cred.name} c={cred.c} onClose={() => setCred(null)} />}
      {notice && <Notice>{notice}</Notice>}
      {error && <ErrorState>{error}</ErrorState>}
      <TableCard>
        <TableHeader>
          <TableRow>
            <TableHead>Pessoa</TableHead>
            <TableHead>Papel</TableHead>
            <TableHead>Último acesso</TableHead>
            <TableHead>Aviso aceito</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((m) => (
            <TableRow key={m.id}>
              <TableCell>
                <div className="font-medium">
                  {m.name} {m.is_me && <span className="font-normal text-muted-foreground">(você)</span>}
                </div>
                <div className="text-xs text-muted-foreground">{m.email}</div>
              </TableCell>
              <TableCell>
                <SelectField
                  value={m.role}
                  onChange={(v) => changeRole(m, v)}
                  className="h-8"
                  options={ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
                />
              </TableCell>
              <TableCell>{m.last_login_at ? ago(m.last_login_at) : "nunca entrou"}</TableCell>
              <TableCell className="tabular-nums">
                {m.disclaimer_accepted_at ? new Date(m.disclaimer_accepted_at).toLocaleDateString("pt-BR") : "—"}
              </TableCell>
              <TableCell>
                <div className="flex justify-end gap-2">
                  {!m.is_me && (
                    <>
                      <Button variant="outline" size="sm" disabled={busy} onClick={() => reset(m)}>
                        Refazer acesso
                      </Button>
                      <Button variant="outline" size="sm" className={DANGER} disabled={busy} onClick={() => remove(m)}>
                        Tirar da campanha
                      </Button>
                    </>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </TableCard>
    </>
  );
}

function CredentialsCard({ name, c, onClose }: { name: string; c: Credentials; onClose: () => void }) {
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL(c.totp_uri, { margin: 1, width: 180 }).then(setQr);
  }, [c.totp_uri]);
  return (
    <SecretCard title={<strong>Acesso de {name}</strong>} closeLabel="Já entreguei, fechar" onClose={onClose}>
      <div className="flex flex-wrap items-start gap-5">
        {qr && <img src={qr} alt="QR code para o app autenticador" width={180} height={180} className="rounded-md bg-white" />}
        <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-2">
          <dt className="text-sm text-muted-foreground">E-mail</dt>
          <dd>{c.email}</dd>
          <dt className="text-sm text-muted-foreground">Senha provisória</dt>
          <dd className="font-mono text-2xl tracking-wider select-all">{c.password}</dd>
          <dt className="text-sm text-muted-foreground">Chave do autenticador</dt>
          <dd className="font-mono text-sm tracking-wide break-all select-all">{c.totp_secret}</dd>
        </dl>
      </div>
      <p className="text-sm text-muted-foreground">
        A pessoa lê o QR code com o Google Authenticator (ou Authy) ou digita a chave. Nada disto aparece de novo.
      </p>
    </SecretCard>
  );
}
