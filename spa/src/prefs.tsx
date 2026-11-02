// Margens de erro (D28): por padrão o painel esconde o "± N pts" e diz a leitura em palavras; quem quiser liga.
// A escolha fica na URL (?margens=1, D33), para o link compartilhado abrir igual a quem compartilhou, e acompanha
// a navegação entre telas enquanto estiver ligada.
import { useEffect, useId, useRef } from "react";
import { useLocation, useSearchParams } from "react-router";
import { useQueryState } from "./url";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const PARAM = "margens";

export function useShowMargins(): boolean {
  const [v] = useQueryState(PARAM, "0", ["0", "1"]);
  return v === "1";
}

/** Leva o ?margens=1 para a próxima tela quando a navegação (menu, links) troca de caminho sem ele. Chamado uma vez,
    no App. Desligar na própria tela tira o parâmetro e não volta. */
export function useCarryMargins() {
  const { pathname } = useLocation();
  const [params, setParams] = useSearchParams();
  const on = params.get(PARAM) === "1";
  const prev = useRef({ pathname, on });
  useEffect(() => {
    const was = prev.current;
    prev.current = { pathname, on };
    if (pathname !== was.pathname && was.on && !on) {
      prev.current.on = true;
      setParams(
        (p) => {
          const next = new URLSearchParams(p);
          next.set(PARAM, "1");
          return next;
        },
        { replace: true },
      );
    }
  }, [pathname, on, setParams]);
}

export function MarginsToggle() {
  const [v, set] = useQueryState(PARAM, "0", ["0", "1"]);
  const id = useId();
  return (
    <div className="no-print flex h-8 items-center gap-2 rounded-md border bg-card px-3 shadow-xs">
      <Switch id={id} checked={v === "1"} onCheckedChange={(on) => set(on ? "1" : "0")} />
      <Label htmlFor={id} className="font-normal">
        Margens de erro
      </Label>
    </div>
  );
}
