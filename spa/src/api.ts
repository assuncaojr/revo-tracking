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
