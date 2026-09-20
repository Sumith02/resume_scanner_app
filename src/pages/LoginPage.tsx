import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { Alert } from "../components/ui";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = await login(email, password);
      if (user.must_change_password) {
        navigate("/set-password", { replace: true });
        return;
      }
      navigate(user.role === "MASTER_ADMIN" ? "/master" : "/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-brand">
          <div className="logo">N</div>
          <strong>Nexerra Talent OS</strong>
        </div>
        <h1>Sign in</h1>
        <div className="sub">Multi-tenant recruitment operating system</div>

        {error && <Alert kind="error">{error}</Alert>}

        <div className="field">
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            required
            autoFocus
          />
        </div>
        <div className="field">
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
        </div>

        <button className="btn primary block" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>

        <div className="mt-2" style={{ textAlign: "center", fontSize: 13 }}>
          <span className="muted">First time? </span>
          <Link to="/setup">Set up the platform</Link>
        </div>
      </form>
    </div>
  );
}