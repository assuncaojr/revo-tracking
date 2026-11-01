// Preferências de leitura do usuário, guardadas no navegador (D28): por padrão o painel esconde o "± N pts"
// e diz a leitura em palavras; quem quiser liga as margens. Vale para todas as telas ao mesmo tempo.
import { useId, useSyncExternalStore } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

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
  const id = useId();
  return (
    <div className="no-print flex items-center gap-2">
      <Switch id={id} checked={on} onCheckedChange={setShowMargins} />
      <Label htmlFor={id} className="font-normal text-muted-foreground">
        Mostrar margens de erro
      </Label>
    </div>
  );
}
