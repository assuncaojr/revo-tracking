import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

/** Busca e atualiza a cada `everyMs` (no MVP, consulta a cada minuto em vez de tempo real: T10). */
export function usePoll<T>(path: string, everyMs = 60_000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api.get<T>(path));
      setError(null);
      setUpdatedAt(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [path]);

  useEffect(() => {
    load();
    if (!everyMs) return;
    const t = setInterval(load, everyMs);
    return () => clearInterval(t);
  }, [load, everyMs]);

  return { data, error, updatedAt, reload: load };
}
