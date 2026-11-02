// Escolhas de tela guardadas na URL (?indicador=…&periodo=…): quem recebe o link compartilhado vê a mesma coisa.
// O valor padrão não aparece na URL, para os links ficarem curtos. Acesso continua decidido pelo papel de quem
// abre: a URL só escolhe o que mostrar entre o que a pessoa já pode ver.
import { useSearchParams } from "react-router";

/** Valor de `?chave=` com padrão; fora de `allowed` (quando dado) vale o padrão. Trocar não cria entrada no histórico. */
export function useQueryState<T extends string = string>(
  key: string,
  fallback: NoInfer<T>,
  allowed?: readonly T[],
): [T, (v: T) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get(key);
  const value = raw != null && (!allowed || allowed.includes(raw as T)) ? (raw as T) : fallback;
  const set = (v: T) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (v === fallback) next.delete(key);
        else next.set(key, v);
        return next;
      },
      { replace: true },
    );
  return [value, set];
}

export type Period = "7d" | "all";

// Na URL o período vai por extenso: ?periodo=7dias | ?periodo=tudo
const PERIOD_URL: Record<Period, string> = { "7d": "7dias", all: "tudo" };

/** Período da tela na URL. Cada tela tem o seu padrão (Resumo: 7 dias; Detalhes e mapa: todo o período). */
export function usePeriodParam(fallback: Period): [Period, (p: Period) => void] {
  const [raw, setRaw] = useQueryState("periodo", PERIOD_URL[fallback], Object.values(PERIOD_URL));
  const period = raw === PERIOD_URL.all ? "all" : "7d";
  return [period, (p) => setRaw(PERIOD_URL[p])];
}

/** Monta `?periodo=` para um link, omitindo o padrão da tela de destino. */
export function periodQuery(p: Period, fallback: Period): string {
  return p === fallback ? "" : `?periodo=${PERIOD_URL[p]}`;
}
