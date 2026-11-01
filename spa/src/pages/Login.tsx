import { useState, type FormEvent } from "react";
import { api, ApiError } from "../api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Login em duas etapas: senha, depois o código de 6 dígitos do app autenticador. */
export function Login({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<"password" | "code">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (step === "password") {
        await api.post("/api/auth/login", { email, password });
        setStep("code");
      } else {
        await api.post("/api/auth/totp", { code });
        onDone();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha de conexão");
      if (err instanceof ApiError && step === "code" && err.message.includes("login de novo")) {
        setStep("password");
        setCode("");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Tracking</CardTitle>
          <CardDescription>
            {step === "password" ? "Entre com seu e-mail e senha." : "Digite o código de 6 dígitos do app autenticador."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={submit}>
            {step === "password" ? (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="password">Senha</Label>
                  <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                </div>
              </>
            ) : (
              <div className="grid gap-2">
                <Label htmlFor="code">Código do app autenticador</Label>
                <Input
                  id="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  className="text-center text-lg tracking-[0.5em]"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  autoFocus
                  required
                />
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button size="lg" className="w-full" disabled={busy}>
              {step === "password" ? "Continuar" : "Entrar"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
