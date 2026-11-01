// Textos e formatos do painel (português; identificadores continuam em inglês).

export const FLAG_LABELS: Record<string, string> = {
  too_fast: "Rápida demais",
  too_long: "Longa demais",
  no_gps: "Sem GPS",
  far_from_point: "Longe do ponto",
  burst: "Colada na anterior",
  inconsistent: "Respostas contraditórias",
  duplicate_phone: "Telefone repetido",
  ns_outlier: "“Não sabe” muito acima dos colegas",
  concentration: "Concentração no bairro",
};

export const ROLE_LABELS: Record<string, string> = {
  admin: "Administração",
  supervisor: "Supervisão de campo",
  analyst: "Análise",
  client_coord: "Coordenação da campanha",
  client_reader: "Leitura",
};

export const STATUS_LABELS: Record<string, string> = {
  complete: "Completa",
  refused: "Recusa",
  screened_out: "Filtrada",
  abandoned: "Interrompida",
};

export const DISCLAIMER =
  "Este sistema é uma ferramenta de apoio à decisão. Os números são estimativas sujeitas a erro e mudam ao longo da campanha. Nenhuma projeção garante o resultado da eleição.";

export function duration(s: number | null): string {
  if (s == null) return "—";
  const m = Math.floor(s / 60);
  return `${m}min${String(s % 60).padStart(2, "0")}s`;
}

export function timeOf(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function ago(iso: string | null): string {
  if (!iso) return "nunca";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `há ${h} h` : `há ${Math.floor(h / 24)} d`;
}

export function pct(rate: number | null): string {
  return rate == null ? "—" : `${Math.round(rate * 100)}%`;
}
