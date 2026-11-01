import { useEffect, useState, type FormEvent } from "react";
import QRCode from "qrcode";
import {
  api,
  ApiError,
  type CampaignAccess,
  type Credentials,
  type ManagedDevice,
  type ManagedInterviewer,
  type Member,
  type Places,
  type Role,
} from "../api";
import { ago, ROLE_LABELS } from "../format";
import { usePoll } from "../usePoll";

type Section = "interviewers" | "devices" | "places" | "members";

const SECTIONS: { id: Section; label: string; adminOnly?: boolean }[] = [
  { id: "interviewers", label: "Entrevistadores" },
  { id: "devices", label: "Aparelhos" },
  { id: "places", label: "Estratos, bairros e pontos", adminOnly: true },
  { id: "members", label: "Usuários do painel", adminOnly: true },
];

/** Cadastros (D25). Admin faz tudo; supervisão cuida só de entrevistadores e aparelhos. Nada se apaga: desativa. */
export function Manage({ campaign }: { campaign: CampaignAccess }) {
  const isAdmin = campaign.role === "admin";
  const sections = SECTIONS.filter((s) => !s.adminOnly || isAdmin);
  const [section, setSection] = useState<Section>("interviewers");
  const base = `/api/campaigns/${campaign.id}/manage`;
  return (
    <>
      <div className="row subnav">
        {sections.map((s) => (
          <button key={s.id} className={s.id === section ? "active" : ""} onClick={() => setSection(s.id)}>
            {s.label}
          </button>
        ))}
      </div>
      {section === "interviewers" && <Interviewers base={base} />}
      {section === "devices" && <Devices base={base} />}
      {section === "places" && isAdmin && <PlacesSection base={base} />}
      {section === "members" && isAdmin && <Members base={base} />}
    </>
  );
}

/** Executa uma ação, mostra o erro do núcleo e recarrega a lista. */
function useAction(reload: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    setError(null);
    try {
      const r = await fn();
      await reload();
      return r;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

// --- entrevistadores ---

function Interviewers({ base }: { base: string }) {
  const { data, error: loadError, reload } = usePoll<ManagedInterviewer[]>(`${base}/interviewers`, 0);
  const { busy, error, run } = useAction(reload);
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await run(() => api.post(`${base}/interviewers`, { name, pin }));
    if (ok) {
      setName("");
      setPin("");
    }
  };
  const update = (i: ManagedInterviewer, body: object) => run(() => api.post(`${base}/interviewers/${i.id}`, body));

  if (loadError) return <p className="error">{loadError}</p>;
  if (!data) return <p>Carregando…</p>;
  return (
    <>
      <p className="muted">
        O aparelho recebe novos nomes, PINs e desativações na próxima vez que o app abrir com internet. O PIN é pessoal:
        entregue em particular.
      </p>
      <form className="row card form" onSubmit={add}>
        <input placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
        <input
          placeholder="PIN (4 a 8 dígitos)"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          inputMode="numeric"
          required
          minLength={4}
          maxLength={8}
        />
        <button className="primary" disabled={busy}>
          Cadastrar entrevistador
        </button>
      </form>
      {error && <p className="error">{error}</p>}
      <table>
        <thead>
          <tr>
            <th>Nome</th>
            <th>Situação</th>
            <th className="num">Completas</th>
            <th>Última entrevista</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {data.map((i) => (
            <tr key={i.id} className={i.active ? "" : "inactive"}>
              <td>{i.name}</td>
              <td>{i.active ? "Ativo" : "Desativado"}</td>
              <td className="num">{i.complete}</td>
              <td>{i.last_at ? ago(i.last_at) : "—"}</td>
              <td>
                <div className="row">
                  <button
                    disabled={busy}
                    onClick={() => {
                      const n = window.prompt("Nome:", i.name);
                      if (n && n.trim() !== i.name) update(i, { name: n.trim() });
                    }}
                  >
                    Renomear
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => {
                      const p = window.prompt(`Novo PIN de ${i.name} (4 a 8 dígitos):`);
                      if (p) update(i, { pin: p.trim() });
                    }}
                  >
                    Novo PIN
                  </button>
                  <button
                    className={i.active ? "danger" : ""}
                    disabled={busy}
                    onClick={() => update(i, { active: !i.active })}
                  >
                    {i.active ? "Desativar" : "Reativar"}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
    const r = await run(() => api.post<{ code: string; valid_hours: number }>(`${base}/devices`, { label }));
    if (r) {
      setCode({ label, code: r.code, hours: r.valid_hours });
      setLabel("");
    }
  };
  const newCode = async (d: ManagedDevice) => {
    const msg = d.active
      ? `Gerar novo código para ${d.label}? O aparelho deixa de enviar até ser cadastrado de novo com ele (a fila dele é mantida).`
      : `Gerar código de cadastro para ${d.label}?`;
    if (!window.confirm(msg)) return;
    const r = await run(() => api.post<{ code: string; valid_hours: number }>(`${base}/devices/${d.id}/code`));
    if (r) setCode({ label: d.label, code: r.code, hours: r.valid_hours });
  };
  const revoke = (d: ManagedDevice) => {
    if (!window.confirm(`Revogar ${d.label}? Ele para de receber questionário e de enviar entrevistas na hora.`)) return;
    run(() => api.post(`${base}/devices/${d.id}/revoke`));
  };

  if (loadError) return <p className="error">{loadError}</p>;
  if (!data) return <p>Carregando…</p>;
  return (
    <>
      <p className="muted">
        Cadastre o aparelho aqui e digite o código no app, na primeira tela. Perdeu ou trocou o aparelho? Revogue. O
        código novo mantém o mesmo aparelho, então as entrevistas que estiverem na fila dele continuam valendo.
      </p>
      <form className="row card form" onSubmit={add}>
        <input placeholder="Etiqueta (ex.: A14-03)" value={label} onChange={(e) => setLabel(e.target.value)} required minLength={2} />
        <button className="primary" disabled={busy}>
          Cadastrar aparelho
        </button>
      </form>
      {code && (
        <div className="card secret">
          <div className="row between">
            <span>
              Código de cadastro de <strong>{code.label}</strong> (vale {code.hours} h, uma vez):
            </span>
            <button className="link" onClick={() => setCode(null)}>
              Fechar
            </button>
          </div>
          <div className="code">{code.code}</div>
          <p className="muted small">Ele não aparece de novo. Se fechar antes de usar, gere outro.</p>
        </div>
      )}
      {error && <p className="error">{error}</p>}
      <table>
        <thead>
          <tr>
            <th>Aparelho</th>
            <th>Situação</th>
            <th>Último contato</th>
            <th className="num">Na fila</th>
            <th className="num">Bateria</th>
            <th>App</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.id} className={d.revoked_at ? "inactive" : ""}>
              <td>
                <strong>{d.label}</strong>
                {d.model && <div className="muted small">{d.model}</div>}
              </td>
              <td>{deviceState(d)}</td>
              <td>{ago(d.last_seen_at)}</td>
              <td className="num">{d.pending_count ?? "—"}</td>
              <td className="num">{d.battery_pct != null ? `${d.battery_pct}%` : "—"}</td>
              <td>{d.app_version ?? "—"}</td>
              <td>
                <div className="row">
                  <button disabled={busy} onClick={() => newCode(d)}>
                    Novo código
                  </button>
                  {!d.revoked_at && (
                    <button className="danger" disabled={busy} onClick={() => revoke(d)}>
                      Revogar
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function deviceState(d: ManagedDevice): string {
  if (d.active) return "Em uso";
  if (d.awaiting_enrollment) return "Aguardando cadastro no app";
  if (d.revoked_at) return "Revogado";
  return "Sem código válido";
}

// --- estratos, bairros e pontos ---

function PlacesSection({ base }: { base: string }) {
  const { data, error: loadError, reload } = usePoll<Places>(`${base}/places`, 0);
  const { busy, error, run } = useAction(reload);
  const [stratum, setStratum] = useState({ name: "", target: "" });
  const [hood, setHood] = useState({ name: "", stratum_id: "" });

  if (loadError) return <p className="error">{loadError}</p>;
  if (!data) return <p>Carregando…</p>;

  const target = (v: string) => (v === "" ? null : Number(v));
  const addStratum = async (e: FormEvent) => {
    e.preventDefault();
    if (await run(() => api.post(`${base}/strata`, { name: stratum.name, daily_target: target(stratum.target) })))
      setStratum({ name: "", target: "" });
  };
  const addHood = async (e: FormEvent) => {
    e.preventDefault();
    if (await run(() => api.post(`${base}/neighborhoods`, { name: hood.name, stratum_id: hood.stratum_id || null })))
      setHood({ name: "", stratum_id: hood.stratum_id });
  };
  const groups = [...data.strata.map((s) => ({ id: s.id as string | null, name: s.name })), { id: null, name: "Sem estrato" }];

  return (
    <>
      <p className="muted">
        Estrato é o grupo de bairros que tem meta diária e aparece separado nos resultados. Ponto é onde o entrevistador
        trabalha; o app mostra só os ativos. Coordenadas do ponto ligam o alerta “longe do ponto”.
      </p>
      {error && <p className="error">{error}</p>}

      <h3>Estratos</h3>
      <table className="compact">
        <thead>
          <tr>
            <th>Nome</th>
            <th>Meta diária (entrevistas completas)</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {data.strata.map((s) => (
            <StratumRow key={s.id} s={s} busy={busy} onSave={(body) => run(() => api.post(`${base}/strata/${s.id}`, body))} />
          ))}
        </tbody>
      </table>
      <form className="row card form" onSubmit={addStratum}>
        <input placeholder="Novo estrato" value={stratum.name} onChange={(e) => setStratum({ ...stratum, name: e.target.value })} required />
        <input
          placeholder="Meta diária"
          type="number"
          min={0}
          value={stratum.target}
          onChange={(e) => setStratum({ ...stratum, target: e.target.value })}
        />
        <button disabled={busy}>Adicionar estrato</button>
      </form>

      <h3>Bairros e pontos</h3>
      <form className="row card form" onSubmit={addHood}>
        <input placeholder="Novo bairro" value={hood.name} onChange={(e) => setHood({ ...hood, name: e.target.value })} required />
        <select value={hood.stratum_id} onChange={(e) => setHood({ ...hood, stratum_id: e.target.value })}>
          <option value="">Sem estrato</option>
          {data.strata.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button disabled={busy}>Adicionar bairro</button>
      </form>
      {groups.map((g) => {
        const hoods = data.neighborhoods.filter((n) => n.stratum_id === g.id);
        if (hoods.length === 0) return null;
        return (
          <section key={g.id ?? "none"}>
            <h3 className="muted">{g.name}</h3>
            {hoods.map((n) => (
              <Neighborhood key={n.id} n={n} data={data} base={base} busy={busy} run={run} />
            ))}
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
    <tr>
      <td>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </td>
      <td>
        <input type="number" min={0} value={target} onChange={(e) => setTarget(e.target.value)} />
      </td>
      <td>
        {dirty && (
          <button disabled={busy || !name.trim()} onClick={() => onSave({ name, daily_target: target === "" ? null : Number(target) })}>
            Salvar
          </button>
        )}
      </td>
    </tr>
  );
}

type Run = <T>(fn: () => Promise<T>) => Promise<T | undefined>;

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
  const rename = () => {
    const name = window.prompt("Nome do bairro:", n.name);
    if (name && name.trim() !== n.name) run(() => api.post(`${base}/neighborhoods/${n.id}`, { name: name.trim(), stratum_id: n.stratum_id }));
  };
  const move = (stratum_id: string) => {
    const to = data.strata.find((s) => s.id === stratum_id)?.name ?? "sem estrato";
    if (!window.confirm(`Passar ${n.name} para ${to}? Resultados e progresso por estrato são recalculados com isso, inclusive os dias anteriores.`))
      return;
    run(() => api.post(`${base}/neighborhoods/${n.id}`, { name: n.name, stratum_id: stratum_id || null }));
  };
  const addPoint = async (e: FormEvent) => {
    e.preventDefault();
    if (await run(() => api.post(`${base}/points`, { neighborhood_id: n.id, name: newPoint, kind: "door" }))) setNewPoint("");
  };
  return (
    <div className="card hood">
      <div className="row between">
        <strong>{n.name}</strong>
        <div className="row">
          <select value={n.stratum_id ?? ""} disabled={busy} onChange={(e) => move(e.target.value)}>
            <option value="">Sem estrato</option>
            {data.strata.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button className="link" disabled={busy} onClick={rename}>
            Renomear
          </button>
        </div>
      </div>
      {points.length > 0 && (
        <table className="compact">
          <thead>
            <tr>
              <th>Ponto</th>
              <th>Abordagem</th>
              <th>Latitude</th>
              <th>Longitude</th>
              <th>Ativo</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <PointRow key={p.id} p={p} busy={busy} onSave={(body) => run(() => api.post(`${base}/points/${p.id}`, body))} />
            ))}
          </tbody>
        </table>
      )}
      <form className="row form" onSubmit={addPoint}>
        <input placeholder="Novo ponto neste bairro" value={newPoint} onChange={(e) => setNewPoint(e.target.value)} required />
        <button disabled={busy}>Adicionar ponto</button>
      </form>
    </div>
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
    <tr className={f.active ? "" : "inactive"}>
      <td>
        <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      </td>
      <td>
        <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as "flow" | "door" })}>
          <option value="door">Porta a porta</option>
          <option value="flow">Fluxo (rua, feira)</option>
        </select>
      </td>
      <td>
        <input className="coord" placeholder="latitude" value={f.lat} onChange={(e) => setF({ ...f, lat: e.target.value })} />
      </td>
      <td>
        <input className="coord" placeholder="longitude" value={f.lng} onChange={(e) => setF({ ...f, lng: e.target.value })} />
      </td>
      <td>
        <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />
      </td>
      <td>
        {dirty && (
          <button
            disabled={busy || !f.name.trim()}
            onClick={() => onSave({ neighborhood_id: p.neighborhood_id, name: f.name, kind: f.kind, lat: coord(f.lat), lng: coord(f.lng), active: f.active })}
          >
            Salvar
          </button>
        )}
      </td>
    </tr>
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
    const r = await run(() => api.post<{ credentials: Credentials | null }>(`${base}/members`, form));
    if (!r) return;
    if (r.credentials) setCred({ name: form.name, c: r.credentials });
    else setNotice(`${form.email} já tinha conta: entra com a senha e o autenticador de sempre.`);
    setForm({ email: "", name: "", role: form.role });
  };
  const reset = async (m: Member) => {
    if (!window.confirm(`Gerar senha e autenticador novos para ${m.name}? A senha atual e o autenticador antigo deixam de valer agora.`))
      return;
    const r = await run(() => api.post<{ credentials: Credentials }>(`${base}/members/${m.id}/reset`));
    if (r) setCred({ name: m.name, c: r.credentials });
  };
  const remove = (m: Member) => {
    if (!window.confirm(`Tirar ${m.name} desta campanha? O acesso é cortado na hora.`)) return;
    run(() => api.post(`${base}/members/${m.id}/remove`));
  };
  const changeRole = (m: Member, role: Role) => {
    if (!window.confirm(`Mudar o papel de ${m.name} para ${ROLE_LABELS[role]}?`)) return;
    run(() => api.post(`${base}/members/${m.id}/role`, { role }));
  };

  if (loadError) return <p className="error">{loadError}</p>;
  if (!data) return <p>Carregando…</p>;
  return (
    <>
      <p className="muted">
        Todo acesso pede senha e o código do app autenticador. Pessoa nova recebe uma senha provisória e uma chave para
        o autenticador, mostradas uma vez só: entregue em particular.
      </p>
      <form className="row card form" onSubmit={add}>
        <input placeholder="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={2} />
        <input placeholder="E-mail" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
        <button className="primary" disabled={busy}>
          Dar acesso
        </button>
      </form>
      <p className="muted small">
        <strong>{ROLE_LABELS[form.role]}</strong>: {ROLE_HELP[form.role]}.
      </p>
      {cred && <CredentialsCard name={cred.name} c={cred.c} onClose={() => setCred(null)} />}
      {notice && <p className="notice">{notice}</p>}
      {error && <p className="error">{error}</p>}
      <table>
        <thead>
          <tr>
            <th>Pessoa</th>
            <th>Papel</th>
            <th>Último acesso</th>
            <th>Aviso aceito</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {data.map((m) => (
            <tr key={m.id}>
              <td>
                {m.name} {m.is_me && <span className="muted">(você)</span>}
                <div className="muted small">{m.email}</div>
              </td>
              <td>
                <select value={m.role} disabled={busy} onChange={(e) => changeRole(m, e.target.value as Role)}>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </td>
              <td>{m.last_login_at ? ago(m.last_login_at) : "nunca entrou"}</td>
              <td>{m.disclaimer_accepted_at ? new Date(m.disclaimer_accepted_at).toLocaleDateString("pt-BR") : "—"}</td>
              <td>
                <div className="row">
                  {!m.is_me && (
                    <>
                      <button disabled={busy} onClick={() => reset(m)}>
                        Refazer acesso
                      </button>
                      <button className="danger" disabled={busy} onClick={() => remove(m)}>
                        Tirar da campanha
                      </button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function CredentialsCard({ name, c, onClose }: { name: string; c: Credentials; onClose: () => void }) {
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL(c.totp_uri, { margin: 1, width: 180 }).then(setQr);
  }, [c.totp_uri]);
  return (
    <div className="card secret">
      <div className="row between">
        <strong>Acesso de {name}</strong>
        <button className="link" onClick={onClose}>
          Já entreguei, fechar
        </button>
      </div>
      <div className="row cred">
        {qr && <img src={qr} alt="QR code para o app autenticador" width={180} height={180} />}
        <dl>
          <dt>E-mail</dt>
          <dd>{c.email}</dd>
          <dt>Senha provisória</dt>
          <dd className="code">{c.password}</dd>
          <dt>Chave do autenticador</dt>
          <dd className="code small">{c.totp_secret}</dd>
        </dl>
      </div>
      <p className="muted small">
        A pessoa lê o QR code com o Google Authenticator (ou Authy) ou digita a chave. Nada disto aparece de novo.
      </p>
    </div>
  );
}
