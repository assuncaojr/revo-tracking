// Preferências de leitura do usuário, guardadas no navegador (D28): por padrão o painel esconde o "± N pts"
// e diz a leitura em palavras; quem quiser liga as margens. Vale para todas as telas ao mesmo tempo.
import { useSyncExternalStore } from "react";

const KEY = "trk.showMargins";
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

let current = read();

export function setShowMargins(v: boolean) {
  current = v;
  try {
    localStorage.setItem(KEY, v ? "1" : "0");
  } catch {
    // navegador sem armazenamento: vale só nesta visita
  }
  listeners.forEach((l) => l());
}

export function useShowMargins(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}

export function MarginsToggle() {
  const on = useShowMargins();
  return (
    <label className="row toggle small">
      <input type="checkbox" checked={on} onChange={(e) => setShowMargins(e.target.checked)} />
      Mostrar margens de erro
    </label>
  );
}
