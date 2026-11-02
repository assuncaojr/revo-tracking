// Leitura em cores para quem não é técnico (docs/annotations.md): azul = mais favorável à gestão, vermelho = menos,
// cinza = igual à referência dentro da margem. Neutro quanto ao cliente: vale para a gestão e para a oposição.
// Só ganha cor a diferença que passa da margem de erro; oscilação fica cinza (não pinta ruído).
// Par azul/vermelho validado para daltonismo; o significado também vai sempre escrito (legenda, rótulo).
import type { Estimate } from "./api";

export type Tone = "fav2" | "fav1" | "same" | "unfav1" | "unfav2";

export const TONE_COLORS: Record<Tone, string> = {
  fav2: "#0a6fd8",
  fav1: "#8cbdf5",
  same: "#c3cae0",
  unfav1: "#f4a3a9",
  unfav2: "#d92d3a",
};

export const TONE_LABELS: Record<Tone, string> = {
  fav2: "bem mais favorável à gestão",
  fav1: "mais favorável à gestão",
  same: "igual à média (diferença dentro da margem)",
  unfav1: "menos favorável à gestão",
  unfav2: "bem menos favorável à gestão",
};

export const TONE_ORDER: Tone[] = ["fav2", "fav1", "same", "unfav1", "unfav2"];

/** Tom de um resultado comparado a uma referência (o total). Forte quando a diferença passa de 10 pts (ou 1 ponto de nota). */
export function toneOf(e: Estimate, ref: number | null | undefined, favorable: boolean, mean: boolean): Tone | null {
  if (e.value == null || e.low == null || e.high == null || ref == null) return null;
  if (e.low <= ref && ref <= e.high) return "same";
  const diff = e.value - ref;
  const good = favorable ? diff > 0 : diff < 0;
  const strong = Math.abs(diff) >= (mean ? 1 : 10);
  return good ? (strong ? "fav2" : "fav1") : strong ? "unfav2" : "unfav1";
}

/** Cor de uma variação no tempo que passou da margem: só a direção (favorável ou não à gestão). */
export function changeColor(diff: number, favorable: boolean): string {
  return (favorable ? diff > 0 : diff < 0) ? TONE_COLORS.fav2 : TONE_COLORS.unfav2;
}
