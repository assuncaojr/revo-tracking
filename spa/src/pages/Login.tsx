import { useState, type FormEvent } from "react";
import { api, ApiError } from "../api";

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
    <div className="center">
      <form className="card login" onSubmit={submit}>
        <h1>Tracking</h1>
        {step === "password" ? (
          <>
            <label>
              E-mail
              <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required />
            </label>
            <label>
              Senha
              <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
          </>
        ) : (
          <label>
            Código do app autenticador
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              autoFocus
              required
            />
          </label>
        )}
        {error && <p className="error">{error}</p>}
        <button className="primary" disabled={busy}>
          {step === "password" ? "Continuar" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
