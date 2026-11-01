// Confirmação e pergunta em diálogo, no lugar de window.confirm/prompt: mesmo uso (await), visual do painel.
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ConfirmOptions = { title: string; description?: ReactNode; action?: string; destructive?: boolean };
type PromptOptions = {
  title: string;
  description?: ReactNode;
  label: string;
  defaultValue?: string;
  action?: string;
  inputMode?: "text" | "numeric";
  validate?: (v: string) => string | null;
};
type Request =
  | { kind: "confirm"; opts: ConfirmOptions; resolve: (ok: boolean) => void }
  | { kind: "prompt"; opts: PromptOptions; resolve: (v: string | null) => void };

let show: ((r: Request) => void) | null = null;

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => (show ? show({ kind: "confirm", opts, resolve }) : resolve(false)));
}

export function promptDialog(opts: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => (show ? show({ kind: "prompt", opts, resolve }) : resolve(null)));
}

/** Montado uma vez, no topo do painel. */
export function DialogHost() {
  const [req, setReq] = useState<Request | null>(null);
  useEffect(() => {
    show = setReq;
    return () => {
      show = null;
    };
  }, []);
  if (!req) return null;
  const close = () => setReq(null);
  if (req.kind === "confirm")
    return (
      <AlertDialog
        open
        onOpenChange={(o) => {
          if (!o) {
            req.resolve(false);
            close();
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{req.opts.title}</AlertDialogTitle>
            {req.opts.description && <AlertDialogDescription>{req.opts.description}</AlertDialogDescription>}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant={req.opts.destructive ? "destructive" : "default"}
              onClick={() => {
                req.resolve(true);
                close();
              }}
            >
              {req.opts.action ?? "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  return <PromptDialog req={req} close={close} />;
}

function PromptDialog({ req, close }: { req: Extract<Request, { kind: "prompt" }>; close: () => void }) {
  const [value, setValue] = useState(req.opts.defaultValue ?? "");
  const [error, setError] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = value.trim();
    const problem = req.opts.validate?.(v) ?? (v ? null : "Preencha o campo.");
    if (problem) return setError(problem);
    req.resolve(v);
    close();
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) {
          req.resolve(null);
          close();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{req.opts.title}</DialogTitle>
            {req.opts.description && <DialogDescription>{req.opts.description}</DialogDescription>}
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="prompt-value">{req.opts.label}</Label>
            <Input
              id="prompt-value"
              autoFocus
              inputMode={req.opts.inputMode}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setError(null);
              }}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => (req.resolve(null), close())}>
              Cancelar
            </Button>
            <Button type="submit">{req.opts.action ?? "Salvar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
