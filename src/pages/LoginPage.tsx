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

        <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border, #334155)" }}>
          <div style={{ fontWeight: 600, marginBottom: 8, color: "var(--muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Demo Accounts (Click to autofill)
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <button
              type="button"
              className="btn sm secondary"
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}
              onClick={() => {
                setEmail("admin@nexerra.io");
                setPassword("Admin@12345");
              }}
            >
              <span>👑 Master Admin</span>
              <span className="muted" style={{ fontSize: 11 }}>admin@nexerra.io</span>
            </button>
            <button
              type="button"
              className="btn sm secondary"
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}
              onClick={() => {
                setEmail("owner@northwind.dev");
                setPassword("Owner@12345");
              }}
            >
              <span>🏢 Company Owner</span>
              <span className="muted" style={{ fontSize: 11 }}>owner@northwind.dev</span>
            </button>
            <button
              type="button"
              className="btn sm secondary"
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}
              onClick={() => {
                setEmail("recruiter@northwind.dev");
                setPassword("Recruiter@12345");
              }}
            >
              <span>🎯 Recruiter</span>
              <span className="muted" style={{ fontSize: 11 }}>recruiter@northwind.dev</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}