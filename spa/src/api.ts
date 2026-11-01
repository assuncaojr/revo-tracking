// Acesso à API do núcleo. Sessão em cookie HttpOnly (o JavaScript nunca vê o token).

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  const data = text ? JSON.parse(text) : null;
  if (!r.ok) throw new ApiError(r.status, (data && (data.detail as string)) || `Erro ${r.status}`);
  return data as T;
}

export const api = {
  get: <T>(path: string) => call<T>("GET", path),
  post: <T>(path: string, body: unknown = {}) => call<T>("POST", path, body),
};

export type Role = "admin" | "supervisor" | "analyst" | "client_coord" | "client_reader";

export interface CampaignAccess {
  id: string;
  name: string;
  role: Role;
  staff: boolean;
  disclaimer_accepted: boolean;
}

export interface Me {
  id: string;
  name: string;
  email: string;
  campaigns: CampaignAccess[];
}

export interface FieldNow {
  day: string;
  total: number;
  interviewers: {
    id: string;
    name: string;
    total: number;
    complete: number;
    refused: number;
    screened_out: number;
    abandoned: number;
    median_duration_s: number | null;
    nonresponse_rate: number | null;
    last_at: string;
    open_flags: number;
  }[];
  devices: {
    id: string;
    label: string;
    last_seen_at: string | null;
    pending_count: number | null;
    battery_pct: number | null;
    app_version: string | null;
    revoked: boolean;
    today: number;
  }[];
  strata: { name: string; complete: number; target: number | null }[];
}

export interface Flag {
  id: number;
  code: string;
  details: Record<string, unknown>;
  created_at: string;
  interview_id: string;
  interviewer: string;
  point: string;
  status: string;
  started_at: string;
  duration_s: number;
  excluded: boolean;
}

export interface Tally {
  n: number;
  suppressed?: boolean;
  counts?: Record<string, number>;
  pct?: Record<string, number>;
}

export interface ResultQuestion {
  key: string;
  item: string | null;
  type: string;
  role: string;
  text: string;
  labels: Record<string, string>;
  total: Tally;
  by_stratum: Record<string, Tally>;
}

export interface Results {
  n: number;
  day: string | null;
  weighted: boolean;
  questions: ResultQuestion[];
}

export interface Progress {
  day: string;
  total: number;
  strata: { name: string; today: number; target: number | null; total: number }[];
}

export interface QuestionnaireVersion {
  id: string;
  qid: string;
  version: number;
  title: string;
  approved_by: string | null;
  approved_at: string | null;
  published_at: string | null;
  definition: QuestionnaireDef;
}

export interface QOption {
  value: string;
  label: string;
  fixed?: boolean;
}

export interface QQuestion {
  key: string;
  type: string;
  role: string;
  text: string;
  read_aloud?: string;
  hint?: string;
  options?: QOption[];
  options_list?: string;
  rows_list?: string;
  list?: string;
  shuffle?: boolean;
  shuffle_rows?: boolean;
  min?: number;
  max?: number;
  nonresponse?: boolean | string[];
  show_if?: Condition;
  terminate_if?: Condition;
  terminate_status?: string;
  allow_other?: boolean;
}

type Scalar = string | number | boolean;

export interface Rule {
  key: string;
  item?: string;
  in?: Scalar[];
  not_in?: Scalar[];
  lt?: number;
  lte?: number;
  gt?: number;
  gte?: number;
  answered?: boolean;
  nonresponse?: boolean;
}

/** Mesmo formato de contracts/questionnaire.schema.json ($defs/condition). */
export type Condition = { all: Condition[] } | { any: Condition[] } | Rule;

export interface QuestionnaireDef {
  id: string;
  version: number;
  title: string;
  lists?: Record<string, QOption[]>;
  nonresponse?: QOption[];
  questions: QQuestion[];
}

// --- cadastros (D25) ---

export interface ManagedInterviewer {
  id: string;
  name: string;
  active: boolean;
  complete: number;
  last_at: string | null;
}

export interface ManagedDevice {
  id: string;
  label: string;
  model: string | null;
  app_version: string | null;
  enrolled_at: string | null;
  revoked_at: string | null;
  last_seen_at: string | null;
  pending_count: number | null;
  battery_pct: number | null;
  active: boolean;
  awaiting_enrollment: boolean;
}

export interface Places {
  strata: { id: string; name: string; daily_target: number | null }[];
  neighborhoods: { id: string; name: string; stratum_id: string | null }[];
  points: {
    id: string;
    name: string;
    neighborhood_id: string;
    kind: "flow" | "door";
    lat: number | null;
    lng: number | null;
    active: boolean;
  }[];
}

export interface Member {
  id: number;
  user_id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  is_me: boolean;
  disclaimer_accepted_at: string | null;
  last_login_at: string | null;
}

/** Mostradas uma única vez, para entregar à pessoa. */
export interface Credentials {
  email: string;
  password: string;
  totp_secret: string;
  totp_uri: string;
}

// --- panorama dos resultados ---

export interface Estimate {
  n: number;
  value: number | null;
  low?: number;
  high?: number;
  suppressed?: boolean;
}

export interface Indicator {
  key: string;
  label: string;
  question: string;
  mean: boolean;
  scale: [number, number] | null;
  current: Estimate;
  previous: Estimate | null;
  change: { diff: number; beyond_margin: boolean } | null;
  by_stratum: Record<string, Estimate>;
  series: { day: string; partial: boolean; daily: Estimate; rolling: Estimate }[];
}

export interface GridRow {
  value: string;
  label: string;
  n: number;
  suppressed?: boolean;
  pct?: Record<string, number>;
  balance?: number;
}

export interface Overview {
  period: "7d" | "all";
  start: string;
  today: string;
  previous: { start: string; end: string } | null;
  n: number;
  n_total: number;
  weighted: boolean;
  min_cell: number | null;
  strata: string[];
  indicators: Indicator[];
  grid: { key: string; text: string; options: QOption[]; rows: GridRow[] } | null;
}

// --- cruzamentos, segmentos, rankings e mapas (D26, D27) ---

export interface CrossGroup extends Estimate {
  group: string;
  label: string;
}

export interface SegmentCell {
  n: number;
  pct: number | null;
  suppressed?: boolean;
}

export interface RankingItem {
  value: string;
  label: string;
  n: number;
  nonresponse: boolean;
  pct: number | null;
  low?: number;
  high?: number;
  suppressed?: boolean;
  by_stratum: Record<string, number | null>;
}

export interface Insights {
  period: "7d" | "all";
  start: string;
  n: number;
  weighted: boolean;
  min_cell: number | null;
  indicators: { key: string; label: string }[];
  crosstab: {
    indicator: { key: string; label: string; mean: boolean };
    total: Estimate;
    dimensions: { key: string; label: string; groups: CrossGroup[] }[];
  } | null;
  segments: {
    n: number;
    names: Record<string, string>;
    left_out: number;
    rows: { key: string; text: string; values: QOption[] };
    cols: { key: string; text: string; values: QOption[] };
    cells: Record<string, SegmentCell>;
    row_totals: Record<string, SegmentCell>;
    col_totals: Record<string, SegmentCell>;
  } | null;
  rankings: { key: string; text: string; type: string; n: number; items: RankingItem[]; strata: string[] }[];
}

export interface MapCell extends Estimate {
  id: string;
  polygon: [number, number][];
  interviews: number;
}

export interface OpinionMap {
  size_m: number;
  sizes: number[];
  n: number;
  n_located: number;
  indicator: { key: string; label: string; mean: boolean; scale: [number, number] };
  indicators: { key: string; label: string }[];
  min_cell: number;
  bounds: [[number, number], [number, number]] | null;
  cells: MapCell[];
}

export interface CoverageMap {
  day: string;
  total: number;
  without_location: number;
  interviews: {
    id: string;
    lat: number;
    lng: number;
    accuracy_m: number | null;
    status: string;
    started_at: string;
    duration_s: number;
    excluded: boolean;
    interviewer: string;
    point: string;
    flags: string[];
    far: boolean;
  }[];
  points: { id: string; name: string; lat: number; lng: number; kind: string }[];
}
